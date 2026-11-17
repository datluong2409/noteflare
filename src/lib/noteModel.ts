import type { EncryptedNote } from '../../shared/types'
import type { NotePayload } from './crypto'

export interface Note extends NotePayload {
  id: string
  pinned: boolean
  archived: boolean
  trashedAt: number | null
  position: number
  /** Server version (0 = never saved). */
  version: number
  createdAt: number
  updatedAt: number
}

export type NotePatch = Partial<Omit<Note, 'id' | 'version' | 'createdAt' | 'updatedAt'>>

export function emptyNote(): Note {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: '',
    body: '',
    color: 'default',
    labels: [],
    pinned: false,
    archived: false,
    trashedAt: null,
    position: now,
    version: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function isEmptyNote(n: Pick<Note, 'title' | 'body'>) {
  return !n.title.trim() && !n.body.trim()
}

/** The part of a note that is encrypted. */
export function toPayload(n: Note): NotePayload {
  return { title: n.title, body: n.body, color: n.color, labels: n.labels }
}

/** True when two notes would look identical to the user. */
export function sameContent(a: Note, b: Note) {
  return (
    a.title === b.title &&
    a.body === b.body &&
    a.color === b.color &&
    a.labels.join('\u0000') === b.labels.join('\u0000') &&
    a.pinned === b.pinned &&
    a.archived === b.archived &&
    !!a.trashedAt === !!b.trashedAt
  )
}

/** Cache row for a note whose ciphertext has just been produced locally. */
export function localRow(n: Note, ciphertext: string, iv: string): EncryptedNote {
  return {
    id: n.id,
    ciphertext,
    iv,
    pinned: n.pinned,
    archived: n.archived,
    trashedAt: n.trashedAt,
    position: n.position,
    version: n.version,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }
}

/**
 * A checklist line: "- [ ]", "* [x]", "1. [ ]", also inside "> " quotes. The box must be followed
 * by a space or the end of the line, the same rule the editor uses to draw a checkbox.
 */
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

/** Calls `fn` with each checklist line's index and match, in order, skipping fenced code. */
function eachTaskLine(lines: string[], fn: (i: number, m: RegExpMatchArray) => boolean | void) {
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(FENCE)
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0]
      else if (fenceMatch[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const m = lines[i].match(TASK_LINE)
    if (m && fn(i, m) === false) return
  }
}

/** Toggle the `index`-th task checkbox in Markdown (ignoring fenced code). */
export function toggleTask(body: string, index: number): string {
  const lines = body.split('\n')
  let seen = 0
  let changed = false
  eachTaskLine(lines, (i, m) => {
    if (seen++ !== index) return
    const mark = m[2] === ' ' ? 'x' : ' '
    lines[i] = `${m[1]}[${mark}]${lines[i].slice(m[0].length)}`
    changed = true
    return false
  })
  return changed ? lines.join('\n') : body
}

/**
 * The Markdown to render for a note, so the card shows a checkbox for every line the editor
 * does (and `toggleTask` counts): an empty item ("- [ ]" with nothing after it) needs a
 * trailing space for the Markdown renderer to treat it as a task.
 */
export function withRenderableTasks(body: string): string {
  const lines = body.split('\n')
  let changed = false
  eachTaskLine(lines, (i, m) => {
    if (lines[i].length !== m[0].length) return
    lines[i] += ' '
    changed = true
  })
  return changed ? lines.join('\n') : body
}
