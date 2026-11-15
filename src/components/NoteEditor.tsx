import { useRef, useState, type ComponentProps, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Ellipsis,
  ImagePlus,
  KeyboardOff,
  List,
  ListChecks,
  Pin,
  PinOff,
  Redo2,
  RotateCcw,
  Share,
  SquarePen,
  Trash2,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { continueList, indentLines, toggleBullets, toggleChecklist, type Edit } from '@/lib/editing'
import { isEmptyNote, type Note, type NotePatch } from '@/lib/notes'
import { toggleBox } from '@/lib/liveText'
import { supportsViewTransitions, VT_CLASS } from '@/lib/motion'
import { useIsPhone } from '@/hooks/useIsPhone'
import { dateLocale, useI18n } from '@/i18n'
import { NoteActions, PinButton } from './NoteActions'
import { LabelMenu } from './LabelMenu'
import { ColorPicker } from './ColorPicker'
import { LiveTextarea } from './LiveTextarea'
import { colorVar } from './noteColors'
import { AttachmentError, uploadImage, useAttachments } from '@/lib/attachments'

interface Props {
  note: Note | null
  /** View-transition name shared with the card/button that opened the editor, so it grows out of it. */
  transitionName?: string
  allLabels: string[]
  /** Phones: the list the back button returns to ("Notes", "Archive", "#work"). */
  backLabel: string
  /** 'saving' while a change is being encrypted/pushed; 'local' when offline and saved only on this device. */
  saveState: 'saving' | 'local' | 'idle'
  onSave: (note: Note) => void
  onClose: (note: Note) => void
  onDeleteForever: (id: string) => void
  /** Phones: leave this note and start a new one, like the compose button in iPhone Notes. */
  onNew?: (current: Note) => void
}

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/** Focus stays in the text while these are pressed, so the phone keyboard stays up. */
const keepFocus = {
  onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(),
  onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
}

export function NoteEditor({ note, transitionName, allLabels, backLabel, saveState, onSave, onClose, onDeleteForever, onNew }: Props) {
  const { t } = useI18n()
  const phone = useIsPhone()
  const [draft, setDraft] = useState<Note | null>(note)
  // True while the title or text has focus (the phone keyboard is up): the bars change.
  const [typing, setTyping] = useState(false)
  // Take the opened note during render, not in an effect: the dialog must be in the
  // DOM when the view transition captures the new state, or the backdrop isn't its
  // own layer and the header and cards show through it while the editor opens.
  const [draftId, setDraftId] = useState(note?.id)
  if (note?.id !== draftId) {
    setDraftId(note?.id)
    setDraft(note)
  }
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const attachments = useAttachments()
  // The newest draft, for work that finishes after an await (image uploads).
  const draftRef = useRef<Note | null>(note)
  draftRef.current = draft

  /** Enter in the title moves to the end of the text. Runs inside the key event, so the keyboard stays up. */
  const focusBody = () => {
    const el = bodyRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }

  /**
   * Checklist / bullet buttons. While typing they act on the lines at the caret;
   * otherwise they start a new item below the existing text.
   */
  const listCommand = (make: (value: string, start: number, end: number) => Edit) => {
    const appendItem = (el: HTMLTextAreaElement) => {
      el.focus()
      const v = el.value
      el.setSelectionRange(v.length, v.length)
      if (v && !v.endsWith('\n')) applyTo(el, { from: v.length, to: v.length, text: '\n', selStart: v.length + 1, selEnd: v.length + 1 })
      applyTo(el, make(el.value, el.selectionStart, el.selectionEnd))
    }
    const el = bodyRef.current
    if (!el) return
    if (document.activeElement === el) return applyTo(el, make(el.value, el.selectionStart, el.selectionEnd))
    appendItem(el) // focus() runs inside the tap, so iOS raises the keyboard
  }
  const checklist = () => listCommand(toggleChecklist)

  const onBodyKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    if (e.nativeEvent.isComposing) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key === 'Enter') {
      e.preventDefault()
      if (draft) onClose(draft)
      return
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault()
      return applyTo(el, toggleChecklist(el.value, el.selectionStart, el.selectionEnd))
    }
    if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey) {
      const ed = continueList(el.value, el.selectionStart, el.selectionEnd)
      if (ed) (e.preventDefault(), applyTo(el, ed))
      return
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      // Indent only inside lists or multi-line selections, so Tab still moves focus elsewhere.
      const { value, selectionStart: a, selectionEnd: b } = el
      const multi = value.slice(a, b).includes('\n')
      const ls = value.lastIndexOf('\n', a - 1) + 1
      const inList = /^\s*([-*+]|\d+[.)])\s/.test(value.slice(ls))
      if (multi || inList) (e.preventDefault(), applyTo(el, indentLines(value, a, b, e.shiftKey)))
    }
  }

  if (!draft) return null
  const isNew = draft.version === 0
  const morph = !!transitionName && supportsViewTransitions()
  const trashed = !!draft.trashedAt

  const change = (patch: NotePatch, closeAfter = false) => {
    const next = { ...(draftRef.current ?? draft), ...patch, updatedAt: Date.now() }
    draftRef.current = next
    setDraft(next)
    if (!isNew || !isEmptyNote(next)) onSave(next)
    if (closeAfter) onClose(next)
  }
  // Archiving or trashing from inside the editor also closes it.
  const changeNote = (p: NotePatch) => change(p, 'trashedAt' in p || 'archived' in p)

  /** A tap on a round checkbox. While typing it is a native edit, so undo covers it. */
  const toggleAt = (box: number) => {
    const el = bodyRef.current
    if (el && document.activeElement === el) {
      const mark = el.value[box] === ' ' ? 'x' : ' '
      return applyTo(el, { from: box, to: box + 1, text: mark, selStart: el.selectionStart, selEnd: el.selectionEnd })
    }
    change({ body: toggleBox(draftRef.current?.body ?? draft.body, box) })
  }

  const canAttach = !!attachments?.enabled && !trashed

  /** Encrypt and upload images, then put their Markdown at the cursor (or at the end, in reading mode). */
  const addImages = async (files: File[]) => {
    if (!attachments || !files.length) return
    for (const file of files) {
      const id = toast.loading(t('att.uploading'))
      try {
        const markdown = await uploadImage(attachments.dek, file)
        const el = bodyRef.current
        if (el) {
          const at = el.selectionStart
          const before = at > 0 && el.value[at - 1] !== '\n' ? '\n' : ''
          const text = `${before}${markdown}\n`
          applyTo(el, { from: at, to: el.selectionEnd, text, selStart: at + text.length, selEnd: at + text.length })
        } else {
          const body = draftRef.current?.body ?? ''
          change({ body: body.trim() ? `${body.replace(/\s+$/, '')}\n\n${markdown}\n` : `${markdown}\n` })
        }
        toast.success(t('att.added'), { id })
      } catch (err) {
        const reason = err instanceof AttachmentError ? err.reason : null
        toast.error(reason === 'size' ? t('att.tooLarge') : reason === 'type' ? t('att.badType') : t('att.failed'), { id })
      }
    }
  }
  const imagesOf = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

  const share = () => {
    const text = [draft.title.trim(), draft.body.trim()].filter(Boolean).join('\n\n')
    navigator.share({ title: draft.title || undefined, text }).catch(() => {
      /* the user closed the share sheet */
    })
  }
  const stopTyping = () => (document.activeElement as HTMLElement | null)?.blur()

  const edited = new Date(draft.updatedAt).toLocaleString(dateLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  })
  const status =
    saveState === 'local' ? t('ed.savedLocally') : saveState === 'saving' ? t('ed.saving') : isNew ? '' : t('ed.edited', { time: edited })

  const titleInput = (
    <input
      data-note-field
      value={draft.title}
      onChange={(e) => change({ title: e.target.value })}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
        e.preventDefault()
        if (e.metaKey || e.ctrlKey) onClose(draft)
        else focusBody()
      }}
      placeholder={t('ed.title')}
      maxLength={300}
      enterKeyHint="next"
      className={cn(
        'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
        // Phones: size comes from the wrapper (touch screens force inputs to max(16px, 1em)).
        phone ? 'w-full py-1 leading-tight font-bold tracking-tight' : 'py-1 text-lg font-semibold',
      )}
    />
  )

  const body = (
    <LiveTextarea
      key={`edit-${draft.id}`}
      data-note-field
      textareaRef={bodyRef}
      onKeyDown={onBodyKey}
      onPaste={(e) => {
        const images = imagesOf(e.clipboardData.files)
        if (!canAttach || !images.length) return
        e.preventDefault()
        void addImages(images)
      }}
      aria-keyshortcuts="Control+Enter Meta+Enter Control+Shift+L Meta+Shift+L"
      aria-label={t('ed.srBody')}
      autoFocus={isNew}
      value={draft.body}
      onValueChange={(body) => change({ body })}
      onToggleBox={trashed ? undefined : toggleAt}
      placeholder={phone ? t('ed.bodyPhone') : t('ed.body')}
      spellCheck
      className={cn(
        'animate-in fade-in-0 duration-200',
        // Phones: the empty space below the text is part of the field, so a tap there types at the end.
        phone ? 'min-h-[calc(var(--vvh,100dvh)-16rem)] text-[17px] leading-[1.5]' : 'min-h-36 leading-relaxed',
      )}
    />
  )

  const labelChips = draft.labels.length > 0 && (
    <ul className={cn('flex flex-wrap gap-1.5', phone ? 'pt-3 pb-4' : 'px-5 pb-2')}>
      {draft.labels.map((l) => (
        <li key={l} className="max-w-full">
          <button
            type="button"
            className="block max-w-full truncate rounded-full bg-foreground/[0.07] px-2 py-0.5 text-xs hover:line-through [@media(pointer:coarse)]:px-2.5 [@media(pointer:coarse)]:py-1"
            title={t('ed.removeLabel', { l })}
            onClick={() => change({ labels: draft.labels.filter((x) => x !== l) })}
          >
            {l}
          </button>
        </li>
      ))}
    </ul>
  )

  const imagePicker = canAttach && (
    <input
      ref={imageInput}
      type="file"
      hidden
      multiple
      accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
      onChange={(e) => {
        const images = imagesOf(e.target.files)
        e.target.value = ''
        void addImages(images)
      }}
    />
  )

  const dropImages = {
    onDragOver: (e: DragEvent) => {
      if (canAttach && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault()
    },
    onDrop: (e: DragEvent) => {
      const images = imagesOf(e.dataTransfer.files)
      if (!canAttach || !images.length) return
      e.preventDefault()
      void addImages(images)
    },
  }

  const isField = (el: EventTarget | null) => el instanceof HTMLElement && !!el.closest('[data-note-field]')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(draft)}>
      <DialogContent
        showClose={false}
        aria-describedby={undefined}
        className={cn(
          'paper max-w-2xl gap-0 rounded-2xl border-0 p-0 shadow-2xl',
          'max-sm:top-[var(--vvt,0px)] max-sm:flex max-sm:h-[var(--vvh,100dvh)] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-y-0 max-sm:flex-col max-sm:overflow-hidden max-sm:rounded-none max-sm:p-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:shadow-none',
        )}
        overlayStyle={morph && !phone ? { viewTransitionName: 'editor-backdrop' } : undefined}
        style={{
          background: colorVar(draft.color),
          ...(morph
            ? {
                viewTransitionName: phone ? 'editor-sheet' : transitionName,
                viewTransitionClass: phone ? VT_CLASS.sheet : VT_CLASS.editor,
                // The view transition already animates the dialog; drop the default zoom so they don't stack.
                animation: 'none',
              }
            : null),
        }}
        onOpenAutoFocus={(e) => {
          if (!isNew) e.preventDefault()
        }}
        onFocus={(e) => isField(e.target) && setTyping(true)}
        onBlur={(e) => !isField(e.relatedTarget) && setTyping(false)}
      >
        <DialogTitle className="sr-only">{draft.title || t('ed.srTitle')}</DialogTitle>
        <DialogDescription className="sr-only">{t('ed.srDescription')}</DialogDescription>

        {phone ? (
          <>
            {/* Top bar: back on the left; undo/redo and Done while typing, share and more otherwise. */}
            <div className="flex h-12 shrink-0 items-center gap-0.5 px-1">
              <button
                type="button"
                onClick={() => onClose(draft)}
                className="flex h-11 min-w-0 items-center rounded-lg pr-2 text-[17px] text-link active:opacity-50"
              >
                <ChevronLeft className="size-7 shrink-0 stroke-[2.25]" />
                <span className="truncate">{backLabel}</span>
              </button>
              <span className="flex-1" />
              {typing ? (
                <>
                  <BarButton label={t('ed.undo')} {...keepFocus} onClick={() => document.execCommand('undo')}>
                    <Undo2 />
                  </BarButton>
                  <BarButton label={t('ed.redo')} {...keepFocus} onClick={() => document.execCommand('redo')}>
                    <Redo2 />
                  </BarButton>
                </>
              ) : (
                canShare() &&
                !isEmptyNote(draft) && (
                  <BarButton label={t('ed.share')} onClick={share}>
                    <Share />
                  </BarButton>
                )
              )}
              <EditorMenu
                note={draft}
                onChange={changeNote}
                onDeleteForever={() => onDeleteForever(draft.id)}
              />
              {typing && (
                <button type="button" onClick={stopTyping} className="h-11 rounded-lg px-2.5 text-[17px] font-semibold text-link active:opacity-50">
                  {t('ed.done')}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6" {...dropImages}>
              <p className="pb-1 text-center text-[13px] text-muted-foreground" aria-live="polite">
                {fullDate(draft.updatedAt)}
                {saveState !== 'idle' && ` · ${status}`}
              </p>
              <div className="text-[2rem]">{titleInput}</div>
              <div className="pt-1">{body}</div>
              {labelChips}
            </div>

            {/* Bottom bar: sits right above the keyboard while typing (the dialog follows the visible viewport). */}
            <div
              className="flex shrink-0 items-center justify-between gap-1 border-t border-foreground/10 px-2 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] [html[data-keyboard=open]_&]:pb-1"
            >
              {trashed ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">{t('ed.inTrash')}</p>
              ) : (
                <>
                  <BarButton label={t('ed.checklist')} {...keepFocus} onClick={checklist}>
                    <ListChecks />
                  </BarButton>
                  <BarButton label={t('ed.bullets')} {...keepFocus} onClick={() => listCommand(toggleBullets)}>
                    <List />
                  </BarButton>
                  {canAttach && (
                    <BarButton label={t('ed.addImage')} onClick={() => imageInput.current?.click()}>
                      <ImagePlus />
                    </BarButton>
                  )}
                  <LabelMenu value={draft.labels} allLabels={allLabels} onChange={(labels) => change({ labels })} className={barClass} />
                  <ColorPicker value={draft.color} onChange={(color) => change({ color })} className={barClass} />
                  {typing ? (
                    <BarButton label={t('ed.hideKeyboard')} onClick={stopTyping}>
                      <KeyboardOff />
                    </BarButton>
                  ) : (
                    onNew && (
                      <BarButton label={t('nb.newNote')} onClick={() => onNew(draft)}>
                        <SquarePen />
                      </BarButton>
                    )
                  )}
                </>
              )}
              {imagePicker}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 px-5 pt-4">
              {titleInput}
              <PinButton note={draft} onChange={(p) => change(p)} />
            </div>

            <div className="min-h-40 overflow-y-auto overscroll-contain px-5 py-2 sm:max-h-[60vh]" {...dropImages}>
              {body}
            </div>

            {labelChips}

            <div className="flex flex-wrap items-center gap-0.5 px-3 pb-3">
              {!trashed && <LabelMenu value={draft.labels} allLabels={allLabels} onChange={(labels) => change({ labels })} />}
              <NoteActions note={draft} onChange={changeNote} onDeleteForever={() => onDeleteForever(draft.id)} />
              {!trashed && (
                <Tooltip label={t('ed.checklist')}>
                  <Button variant="ghost" size="icon-sm" aria-label={t('ed.checklist')} aria-keyshortcuts="Control+Shift+L" onClick={checklist}>
                    <ListChecks />
                  </Button>
                </Tooltip>
              )}
              {canAttach && (
                <Tooltip label={t('ed.addImage')}>
                  <Button variant="ghost" size="icon-sm" aria-label={t('ed.addImage')} onClick={() => imageInput.current?.click()}>
                    <ImagePlus />
                  </Button>
                </Tooltip>
              )}
              {imagePicker}
              <span className="ml-auto px-2 text-xs text-muted-foreground" aria-live="polite">
                {status}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onClose(draft)}>
                {t('common.close')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** "16 November 2026 at 00:09" above the title, as in iPhone Notes. */
function fullDate(ms: number) {
  return new Date(ms).toLocaleString(dateLocale(), { dateStyle: 'long', timeStyle: 'short' })
}

const barClass = 'size-11 rounded-full text-link hover:bg-transparent active:opacity-50 [&_svg]:size-[22px] [@media(pointer:coarse)]:size-11'

function BarButton({ label, className, children, ...props }: ComponentProps<'button'> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cn('grid size-11 shrink-0 place-items-center rounded-full text-link outline-none active:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-30 [&_svg]:size-[22px]', className)}
    >
      {children}
    </button>
  )
}

interface MenuProps {
  note: Note
  onChange: (patch: NotePatch) => void
  onDeleteForever: () => void
}

/** The "⋯" menu of the phone editor: everything that isn't typing. */
function EditorMenu({ note, onChange, onDeleteForever }: MenuProps) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BarButton label={t('ed.more')}>
          <Ellipsis />
        </BarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {note.trashedAt ? (
          <>
            <DropdownMenuItem onSelect={() => onChange({ trashedAt: null })}>
              <RotateCcw /> {t('act.restore')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDeleteForever}>
              <Trash2 /> {t('act.deleteForever')}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => onChange({ pinned: !note.pinned })}>
              {note.pinned ? <PinOff /> : <Pin />} {note.pinned ? t('act.unpin') : t('act.pin')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange({ archived: !note.archived, pinned: false })}>
              {note.archived ? <ArchiveRestore /> : <Archive />} {note.archived ? t('act.unarchive') : t('act.archive')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onChange({ trashedAt: Date.now(), pinned: false })}>
              <Trash2 /> {t('act.trash')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Applies an edit as one native change, so Ctrl+Z undoes it like typing. */
function applyTo(el: HTMLTextAreaElement, e: Edit) {
  el.focus()
  el.setSelectionRange(e.from, e.to)
  const native = e.text ? document.execCommand('insertText', false, e.text) : e.from === e.to || document.execCommand('delete')
  if (!native) {
    el.setRangeText(e.text, e.from, e.to, 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  el.setSelectionRange(e.selStart, e.selEnd)
}
