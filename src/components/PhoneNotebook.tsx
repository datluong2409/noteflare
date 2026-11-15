import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Folder, Pin, PinOff, RotateCcw, Search, SquarePen, Tag, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Note, NotePatch } from '@/lib/notes'
import { groupByDate, rowDate, type DateGroup } from '@/lib/dateGroups'
import { countImages, previewLines } from '@/lib/liveText'
import { dateLocale, useI18n } from '@/i18n'
import { colorVar } from './noteColors'

export type PhoneView = { kind: 'notes' } | { kind: 'archive' } | { kind: 'trash' } | { kind: 'label'; label: string }

interface Props {
  view: PhoneView
  /** Large title of the current list ("Notes", "Archive", a label). */
  title: string
  showFolders: boolean
  onShowFolders: (show: boolean) => void
  /** Sync state, theme and account buttons, shared with the desktop header. */
  actions: ReactNode
  query: string
  onQuery: (q: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  loading: boolean
  pinned: Note[]
  others: Note[]
  /** Shown instead of the list when it is empty. */
  empty: ReactNode
  /** Shown above the list in the trash. */
  trashBar?: ReactNode
  counts: { notes: number; archive: number; trash: number }
  labels: { label: string; count: number }[]
  onPick: (view: PhoneView) => void
  onNew: () => void
  onOpen: (id: string) => void
  onChange: (id: string, patch: NotePatch, immediate?: boolean) => void
  onDeleteForever: (id: string) => void
}

/**
 * The phone layout, modelled on iPhone Notes: a "Folders" page (notes, labels, archive,
 * trash), and lists grouped by when each note was last edited, with a compose button
 * in the bottom bar. Rows swipe left for archive and trash, right to pin.
 */
export function PhoneNotebook(props: Props) {
  const { t } = useI18n()
  const { view, showFolders, onShowFolders, actions, query, onQuery, searchRef, loading, pinned, others } = props
  const total = pinned.length + others.length

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md" style={{ viewTransitionName: 'site-header' }}>
        <div className="flex h-12 items-center gap-0.5 px-1">
          {showFolders ? (
            <span className="flex items-center gap-2 pl-2">
              <img src="/favicon.svg" alt="" className="size-7" />
              <span className="text-[17px] font-semibold tracking-tight">NoteFlare</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onShowFolders(true)}
              className="flex h-11 items-center rounded-lg pr-2 text-[17px] text-link active:opacity-50"
            >
              <ChevronLeft className="size-7 stroke-[2.25]" />
              {t('nb.folders')}
            </button>
          )}
          <span className="flex-1" />
          {actions}
        </div>
      </header>

      <main className="px-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <h1 className="truncate pt-1 pb-2 text-[2.125rem] leading-tight font-bold tracking-tight">{showFolders ? t('nb.folders') : props.title}</h1>

        {showFolders ? (
          <Folders {...props} />
        ) : (
          <>
            <label className="relative mb-4 flex items-center">
              <span className="sr-only">{t('nb.searchLabel')}</span>
              <Search className="pointer-events-none absolute left-2.5 size-[18px] text-muted-foreground" />
              <input
                ref={searchRef}
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (onQuery(''), e.currentTarget.blur())}
                placeholder={t('nb.searchPlaceholder')}
                className="h-10 w-full rounded-xl bg-muted pr-9 pl-9 text-[17px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button type="button" aria-label={t('nb.clearSearch')} className="absolute right-1 grid size-9 place-items-center text-muted-foreground" onClick={() => onQuery('')}>
                  <X className="size-4 rounded-full bg-muted-foreground/30 p-0.5 text-background" />
                </button>
              )}
            </label>
            {props.trashBar}
            {loading ? <ListSkeleton label={t('nb.decryptingNotes')} /> : total === 0 ? props.empty : <NoteList {...props} />}
          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md transition-opacity [html[data-keyboard=open]_&]:pointer-events-none [html[data-keyboard=open]_&]:opacity-0">
        <div className="relative flex h-12 items-center justify-center px-2">
          {!showFolders && !loading && (
            <span className="text-xs text-foreground/80" aria-live="polite">
              {total === 1 ? t('nb.noteCountOne') : t('nb.noteCount', { n: total })}
            </span>
          )}
          {(showFolders || view.kind !== 'trash') && (
            <button
              type="button"
              aria-label={t('nb.newNote')}
              title={t('nb.newNote')}
              onClick={props.onNew}
              className="absolute right-1 grid size-11 place-items-center rounded-full text-link active:opacity-50"
            >
              <SquarePen className="size-6" />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

function Folders({ view, counts, labels, onPick, onShowFolders }: Props) {
  const { t } = useI18n()
  const pick = (v: PhoneView) => {
    onPick(v)
    onShowFolders(false)
  }
  const active = (v: PhoneView) => v.kind === view.kind && (v.kind !== 'label' || (view.kind === 'label' && view.label === v.label))
  return (
    <nav aria-label={t('nb.filters')} className="space-y-6">
      <ul className="ios-group">
        <FolderRow icon={<Folder />} label={t('nb.notes')} count={counts.notes} active={active({ kind: 'notes' })} onClick={() => pick({ kind: 'notes' })} />
      </ul>
      {labels.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xl font-bold">{t('nb.labels')}</h2>
          <ul className="ios-group">
            {labels.map(({ label, count }) => (
              <FolderRow
                key={label}
                icon={<Tag />}
                label={label}
                count={count}
                active={active({ kind: 'label', label })}
                onClick={() => pick({ kind: 'label', label })}
              />
            ))}
          </ul>
        </section>
      )}
      <ul className="ios-group">
        <FolderRow icon={<Archive />} label={t('nb.archive')} count={counts.archive} active={active({ kind: 'archive' })} onClick={() => pick({ kind: 'archive' })} />
        <FolderRow icon={<Trash2 />} label={t('nb.trash')} count={counts.trash} active={active({ kind: 'trash' })} onClick={() => pick({ kind: 'trash' })} />
      </ul>
    </nav>
  )
}

function FolderRow({ icon, label, count, active, onClick }: { icon: ReactNode; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <li className="ios-row">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className="ios-row-body relative flex h-12 w-full items-center gap-3 px-4 text-left text-[17px] active:bg-accent"
      >
        <span className="text-link [&_svg]:size-[22px]">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-muted-foreground tabular-nums">{count}</span>
        <ChevronRight className="size-5 text-muted-foreground/60" />
      </button>
    </li>
  )
}

function NoteList({ view, pinned, others, onOpen, onChange, onDeleteForever }: Props) {
  const { t } = useI18n()
  const [openId, setOpenId] = useState<string | null>(null)
  const groups = groupByDate(others, (n) => n.updatedAt)
  const row = (n: Note) => (
    <SwipeRow
      key={n.id}
      note={n}
      trash={view.kind === 'trash'}
      open={openId === n.id}
      onOpenChange={(o) => setOpenId(o ? n.id : null)}
      onOpen={() => onOpen(n.id)}
      onChange={(p) => onChange(n.id, p, true)}
      onDeleteForever={() => onDeleteForever(n.id)}
    />
  )
  return (
    <div className="space-y-6">
      {pinned.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xl font-bold">
            <Pin className="size-4 fill-current text-link" /> {t('nb.pinned')}
          </h2>
          <ul className="ios-group">{pinned.map(row)}</ul>
        </section>
      )}
      {groups.map(({ group, items }) => (
        <section key={group.key}>
          <h2 className="mb-2 px-1 text-xl font-bold">{groupLabel(group, t)}</h2>
          <ul className="ios-group">{items.map(row)}</ul>
        </section>
      ))}
    </div>
  )
}

function groupLabel(g: DateGroup, t: ReturnType<typeof useI18n>['t']) {
  switch (g.key) {
    case 'today':
      return t('grp.today')
    case 'yesterday':
      return t('grp.yesterday')
    case 'week':
      return t('grp.week')
    case 'month30':
      return t('grp.month30')
  }
  if ('month' in g) {
    const name = new Date(g.year, g.month, 1).toLocaleDateString(dateLocale(), { month: 'long' })
    return name.charAt(0).toLocaleUpperCase() + name.slice(1)
  }
  return String(g.year)
}

interface RowProps {
  note: Note
  trash: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: () => void
  onChange: (patch: NotePatch) => void
  onDeleteForever: () => void
}

const ACTION_W = 76

/**
 * A note in the list. Swipe left to show Archive and Trash (Restore and Delete in the
 * trash), swipe right to show Pin. Vertical drags scroll the page as usual.
 */
function SwipeRow({ note, trash, open, onOpenChange, onOpen, onChange, onDeleteForever }: RowProps) {
  const { t } = useI18n()
  const bodyRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; base: number; mode: 'pending' | 'drag' | 'scroll'; moved: boolean } | null>(null)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const trailing = 2
  const leading = trash ? 0 : 1
  const minX = -trailing * ACTION_W
  const maxX = leading * ACTION_W

  // Another row opened (or the list changed): close this one.
  useEffect(() => {
    if (!open) setOffset(0)
  }, [open])

  const clampX = (x: number) => {
    // Rubber band beyond the buttons.
    if (x < minX) return minX + (x - minX) / 4
    if (x > maxX) return maxX + (x - maxX) / 4
    return x
  }

  const { title, snippet } = previewLines(note.title, note.body)
  const images = countImages(note.body)
  const detail = snippet || (images ? (images === 1 ? t('row.attachmentOne') : t('row.attachments', { n: images })) : t('row.noText'))

  const act = (fn: () => void) => () => {
    onOpenChange(false)
    setOffset(0)
    fn()
  }

  return (
    <li className="ios-row relative overflow-hidden">
      {leading > 0 && (
        <div className="absolute inset-y-0 left-0 flex" style={{ width: Math.max(0, offset) }} aria-hidden={offset <= 0}>
          <SwipeAction className="bg-primary text-primary-foreground" label={note.pinned ? t('act.unpin') : t('act.pin')} onClick={act(() => onChange({ pinned: !note.pinned }))}>
            {note.pinned ? <PinOff /> : <Pin />}
          </SwipeAction>
        </div>
      )}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(0, -offset) }} aria-hidden={offset >= 0}>
        {trash ? (
          <>
            <SwipeAction className="bg-muted-foreground text-background" label={t('act.restore')} onClick={act(() => onChange({ trashedAt: null }))}>
              <RotateCcw />
            </SwipeAction>
            <SwipeAction className="bg-destructive text-background" label={t('act.deleteForever')} onClick={act(onDeleteForever)}>
              <Trash2 />
            </SwipeAction>
          </>
        ) : (
          <>
            <SwipeAction
              className="bg-link text-background"
              label={note.archived ? t('act.unarchive') : t('act.archive')}
              onClick={act(() => onChange({ archived: !note.archived, pinned: false }))}
            >
              {note.archived ? <ArchiveRestore /> : <Archive />}
            </SwipeAction>
            <SwipeAction className="bg-destructive text-background" label={t('act.trash')} text={t('nb.trash')} onClick={act(() => onChange({ trashedAt: Date.now(), pinned: false }))}>
              <Trash2 />
            </SwipeAction>
          </>
        )}
      </div>

      <div
        ref={bodyRef}
        role="button"
        tabIndex={0}
        aria-label={title || t('row.untitled')}
        className={cn(
          'ios-row-body relative bg-surface px-4 py-2.5 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent',
          !dragging && 'transition-transform duration-300 ease-[var(--ease-out)]',
        )}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined, touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          gesture.current = { x: e.clientX, y: e.clientY, base: offset, mode: 'pending', moved: false }
        }}
        onPointerMove={(e) => {
          const g = gesture.current
          if (!g || g.mode === 'scroll') return
          const dx = e.clientX - g.x
          const dy = e.clientY - g.y
          if (g.mode === 'pending') {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (g.mode = 'scroll')
            if (Math.abs(dx) < 10) return
            g.mode = 'drag'
            g.moved = true
            setDragging(true)
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          setOffset(clampX(g.base + dx))
        }}
        onPointerUp={() => {
          const g = gesture.current
          if (!g || g.mode !== 'drag') return
          setDragging(false)
          const x = offset
          const next = x < minX / 2 ? minX : x > maxX / 2 && maxX > 0 ? maxX : 0
          setOffset(next)
          onOpenChange(next !== 0)
        }}
        onPointerCancel={() => {
          gesture.current = null
          setDragging(false)
          setOffset(open ? offset : 0)
        }}
        onClick={() => {
          const g = gesture.current
          gesture.current = null
          if (g?.moved) return // the end of a swipe, not a tap
          if (offset !== 0) return act(() => {})()
          onOpen()
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), onOpen())
        }}
      >
        <div className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-[17px] leading-snug font-semibold', !title && 'text-muted-foreground')}>
            {title || t('row.untitled')}
          </span>
          {note.color !== 'default' && (
            <span aria-hidden className="size-3 shrink-0 rounded-full ring-1 ring-foreground/15" style={{ background: colorVar(note.color) }} />
          )}
        </div>
        <div className="flex min-w-0 gap-2 text-[15px] leading-snug text-muted-foreground">
          <span className="shrink-0 text-foreground/70">{rowDate(note.updatedAt, dateLocale())}</span>
          <span className="truncate">{detail}</span>
        </div>
        {note.labels.length > 0 && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
            <Tag className="size-3 shrink-0" />
            <span className="truncate">{note.labels.join(', ')}</span>
          </div>
        )}
      </div>
    </li>
  )
}

/** `text` is the short word under the icon when the full label is too long for the button. */
function SwipeAction({ label, text, className, onClick, children }: { label: string; text?: string; className: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn('flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden text-xs font-medium [&_svg]:size-5', className)}
    >
      {children}
      <span className="max-w-full truncate px-1">{text ?? label}</span>
    </button>
  )
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="ios-group">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="ios-row">
            <div className="ios-row-body relative space-y-2 px-4 py-3">
              <div className="skeleton h-4 w-2/5 rounded" style={{ animationDelay: `${i * 90}ms`, marginBottom: 0 }} />
              <div className="skeleton h-3.5 w-4/5 rounded" style={{ animationDelay: `${i * 90}ms`, marginBottom: 0 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
