import { createContext, memo, useContext, useMemo, type ComponentProps } from 'react'
import { Markdown, type MarkdownComponents } from '@tanstack/markdown/react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import { highlightCode } from '@/lib/highlight'
import { AttachmentImage, attachmentIdOf } from '@/lib/attachments'
import { withRenderableTasks } from '@/lib/noteModel'

interface Props {
  source: string
  /** When set, checkboxes are clickable and report their index. */
  onToggleTask?: (index: number) => void
  className?: string
  /**
   * False for text that comes from outside the user's own notes (release notes from GitHub):
   * images are shown as their alt text, so rendering never contacts a third-party server.
   */
  images?: boolean
}

interface Options {
  onToggleTask?: (index: number) => void
  images: boolean
}

const OptionsContext = createContext<Options>({ images: true })

/**
 * A task checkbox. Which task it is comes from its place among the note's checkboxes at click
 * time (the renderer draws them in source order), not from a counter kept while rendering.
 */
function TaskBox(props: ComponentProps<'input'>) {
  const { t } = useI18n()
  const { onToggleTask } = useContext(OptionsContext)
  if (props.type !== 'checkbox') return <input {...props} />
  return (
    <input
      type="checkbox"
      checked={!!props.checked}
      disabled={!onToggleTask}
      aria-label={props.checked ? t('card.markUndone') : t('card.markDone')}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const box = e.currentTarget
        const boxes = box.closest('.md')?.querySelectorAll('input[type="checkbox"]')
        const index = boxes ? Array.prototype.indexOf.call(boxes, box) : -1
        if (index >= 0) onToggleTask?.(index)
      }}
    />
  )
}

function Link(props: ComponentProps<'a'>) {
  return <a {...props} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()} />
}

function Image(props: ComponentProps<'img'>) {
  const { images } = useContext(OptionsContext)
  const id = attachmentIdOf(props.src)
  if (images && id) return <AttachmentImage id={id} alt={props.alt} />
  if (images) return <img {...props} loading="lazy" referrerPolicy="no-referrer" draggable={false} />
  return props.alt ? <span className="text-muted-foreground">[{props.alt}]</span> : null
}

/**
 * Defined once: a component made inside render would be a new type each time, so React would
 * rebuild every checkbox, link and image on each re-render (a click landing mid-rebuild hits the
 * card behind it and opens the note instead of ticking the box).
 */
const components: MarkdownComponents = { input: TaskBox, a: Link, img: Image }

/**
 * Renders Markdown with TanStack Markdown. The library escapes raw HTML and drops
 * executable URLs (javascript:…) by default, so no extra sanitizing step is needed.
 */
export const NoteMarkdown = memo(function NoteMarkdown({ source, onToggleTask, className, images = true }: Props) {
  const options = useMemo(() => ({ onToggleTask, images }), [onToggleTask, images])
  return (
    <OptionsContext.Provider value={options}>
      <div className={cn('md', className)}>
        <Markdown components={components} highlighter={highlightCode}>
          {withRenderableTasks(source)}
        </Markdown>
      </div>
    </OptionsContext.Provider>
  )
})
