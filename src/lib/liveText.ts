/**
 * Line-by-line reading of a note's Markdown for the live editor: which lines are
 * checklist items, bullets, headings… and where their markers sit, so the editor can
 * draw a round checkbox over "- [ ] " while the text itself stays plain Markdown.
 *
 * Only decorations that keep every character's width may be drawn from this
 * (colour, strike-through, a glyph over hidden marker text): the visible layer has
 * to wrap exactly like the textarea underneath it.
 */

export type LineKind = 'plain' | 'task' | 'bullet' | 'ordered' | 'heading' | 'quote' | 'fence' | 'image'

export interface LiveLine {
  text: string
  /** Offset of the line's first character in the note. */
  start: number
  kind: LineKind
  /** Leading whitespace before the marker. */
  indent: number
  /** Length of the marker after the indent ("- [ ] " is 6, "- " is 2, "## " is 3). */
  marker: number
  /** Checklist items: done or not. */
  checked?: boolean
  /** Checklist items: offset in the note of the character inside "[ ]". */
  box?: number
}

const TASK_RE = /^(\s*)((?:[-*+]|\d+[.)])\s+\[)([ xX])\](?:\s+|$)/
const BULLET_RE = /^(\s*)[-*+](\s+)(?=\S)/
const ORDERED_RE = /^(\s*)\d+[.)]\s+/
const HEADING_RE = /^#{1,6}(?:\s+|$)/
const IMAGE_RE = /^\s*!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)\s*$/
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/

export function parseLines(body: string): LiveLine[] {
  const out: LiveLine[] = []
  let start = 0
  let fence: string | null = null
  for (const text of body.split('\n')) {
    const line: LiveLine = { text, start, kind: 'plain', indent: 0, marker: 0 }
    const fenceMatch = FENCE_RE.exec(text)
    if (fence || fenceMatch) {
      line.kind = 'fence'
      if (fenceMatch) {
        const ch = fenceMatch[1][0]
        if (!fence) fence = ch
        else if (ch === fence) fence = null
      }
    } else {
      let m: RegExpExecArray | null
      if ((m = TASK_RE.exec(text))) {
        line.kind = 'task'
        line.indent = m[1].length
        line.marker = m[0].length - m[1].length
        line.checked = m[3] !== ' '
        line.box = start + m[1].length + m[2].length
      } else if ((m = BULLET_RE.exec(text))) {
        line.kind = 'bullet'
        line.indent = m[1].length
        line.marker = m[0].length - m[1].length
      } else if ((m = ORDERED_RE.exec(text))) {
        line.kind = 'ordered'
        line.indent = m[1].length
        line.marker = m[0].length - m[1].length
      } else if ((m = HEADING_RE.exec(text))) {
        line.kind = 'heading'
        line.marker = m[0].length
      } else if (text.startsWith('>')) {
        line.kind = 'quote'
      } else if (IMAGE_RE.test(text)) {
        line.kind = 'image'
      }
    }
    out.push(line)
    start += text.length + 1
  }
  return out
}

/** Ticks or unticks the checklist item whose box is at `box` (from parseLines). */
export function toggleBox(body: string, box: number): string {
  const ch = body[box]
  if (ch !== ' ' && ch !== 'x' && ch !== 'X') return body
  return body.slice(0, box) + (ch === ' ' ? 'x' : ' ') + body.slice(box + 1)
}

/**
 * What a list row shows under the title: the first line with words in it, without
 * Markdown markers. The title itself is skipped when the note has none and the body's
 * first line stands in for it.
 */
export function previewLines(title: string, body: string): { title: string; snippet: string } {
  const lines = parseLines(body)
    // Images and code fences' ``` lines have no words to show; the code inside does.
    .filter((l) => l.kind !== 'image' && !(l.kind === 'fence' && FENCE_RE.test(l.text)))
    .map((l) => plain(l))
    .filter((s) => s.trim())
  if (title.trim()) return { title: title.trim(), snippet: lines[0] ?? '' }
  return { title: lines[0] ?? '', snippet: lines[1] ?? '' }
}

function plain(l: LiveLine) {
  const rest = l.text.slice(l.indent + l.marker)
  const text = l.kind === 'quote' ? rest.replace(/^>\s?/, '') : rest
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*)[*_](?=\s|$)/g, '$1$2')
    .trim()
}

/** Number of images a note carries (Markdown image syntax). */
export const countImages = (body: string) => (body.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length
