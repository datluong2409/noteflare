import { memo, useMemo, type ComponentProps, type Ref } from 'react'
import { cn } from '@/lib/utils'
import { parseLines, type LiveLine } from '@/lib/liveText'
import { useI18n } from '@/i18n'

interface Props extends Omit<ComponentProps<'textarea'>, 'value' | 'onChange' | 'ref'> {
  value: string
  onValueChange: (value: string) => void
  textareaRef?: Ref<HTMLTextAreaElement>
  /** Tick or untick the checklist item whose "[ ]" box is at this offset. Omitted: circles are read-only. */
  onToggleBox?: (box: number) => void
}

/**
 * A Markdown textarea that looks like iPhone Notes while you type: "- [ ] " shows as a
 * round checkbox you can tap, done items are struck through, "- " shows as a bullet.
 *
 * Typing happens in a real, transparent textarea, so Vietnamese keyboards (Telex, VNI,
 * Laban Key), autocorrect, dictation and undo behave exactly as in any text field, and
 * the note is saved as the same plain Markdown as before. A mirror on top draws the
 * text; it only recolours characters or draws over hidden ones, so it wraps exactly
 * like the textarea and the caret lines up.
 */
export function LiveTextarea({ value, onValueChange, textareaRef, onToggleBox, placeholder, className, ...rest }: Props) {
  return (
    <div className={cn('live-text', className)}>
      <textarea
        {...rest}
        ref={textareaRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-label={rest['aria-label'] ?? placeholder}
        className="live-input"
      />
      <Mirror value={value} placeholder={placeholder} onToggleBox={onToggleBox} />
    </div>
  )
}

const Mirror = memo(function Mirror({ value, placeholder, onToggleBox }: { value: string; placeholder?: string; onToggleBox?: (box: number) => void }) {
  const lines = useMemo(() => parseLines(value), [value])
  if (!value)
    return (
      <div aria-hidden className="live-mirror text-muted-foreground">
        {placeholder}
      </div>
    )
  return (
    <div aria-hidden className="live-mirror">
      {lines.map((l, i) => (
        <Line key={i} line={l} onToggleBox={onToggleBox} />
      ))}
    </div>
  )
})

function Line({ line, onToggleBox }: { line: LiveLine; onToggleBox?: (box: number) => void }) {
  const { t } = useI18n()
  const { text, kind, indent, marker } = line
  // An empty line still needs its height, like the textarea's.
  if (!text) return <div>{'​'}</div>
  const lead = text.slice(0, indent)
  const mark = text.slice(indent, indent + marker)
  const rest = text.slice(indent + marker)

  switch (kind) {
    case 'task':
      return (
        <div>
          {lead}
          <span className="live-marker">
            {mark}
            <button
              type="button"
              tabIndex={-1}
              className="live-box"
              data-checked={line.checked}
              disabled={!onToggleBox}
              aria-label={line.checked ? t('card.markUndone') : t('card.markDone')}
              // Keep the caret (and the phone keyboard) where it is.
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToggleBox?.(line.box!)}
            />
          </span>
          <span className={line.checked ? 'live-done' : undefined}>{rest}</span>
        </div>
      )
    case 'bullet':
      return (
        <div>
          {lead}
          <span className="live-marker">
            {mark}
            <span className="live-dot">•</span>
          </span>
          {rest}
        </div>
      )
    case 'heading':
      return (
        <div>
          <span className="text-muted-foreground/70">{mark}</span>
          {rest}
        </div>
      )
    case 'quote':
    case 'fence':
    case 'image':
      return <div className="text-muted-foreground">{text}</div>
    default:
      return <div>{text}</div>
  }
}
