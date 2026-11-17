import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '@tanstack/markdown'
import { toggleTask, withRenderableTasks } from '../src/lib/noteModel'

type Node = { type?: string; checked?: boolean; children?: Node[]; items?: Node[] }

/** The checkboxes the card draws, in render order: true for ticked. */
function renderedBoxes(body: string) {
  const out: boolean[] = []
  const walk = (n: Node) => {
    if (n.type === 'listItem' && n.checked !== undefined) out.push(n.checked)
    for (const c of [...(n.items ?? []), ...(n.children ?? [])]) walk(c)
  }
  walk(parseMarkdown(withRenderableTasks(body)) as Node)
  return out
}

/** The tasks `toggleTask` counts, in order: true for ticked. */
function toggledBoxes(body: string) {
  const before = body.split('\n')
  const out: boolean[] = []
  for (let i = 0; ; i++) {
    const after = toggleTask(body, i).split('\n')
    const line = before.findIndex((l, j) => l !== after[j])
    if (line < 0) return out
    out.push(/\[[xX]\]/.test(before[line]))
  }
}

describe('toggleTask', () => {
  it('toggles the nth task and skips fenced code', () => {
    const src = '- [ ] a\n```\n- [ ] not a task\n```\n* [x] b\n1. [ ] c'
    expect(toggleTask(src, 0)).toBe(src.replace('- [ ] a', '- [x] a'))
    expect(toggleTask(src, 1)).toBe(src.replace('* [x] b', '* [ ] b'))
    expect(toggleTask(src, 2)).toBe(src.replace('1. [ ] c', '1. [x] c'))
    expect(toggleTask(src, 9)).toBe(src)
  })

  it('does not count "[x]" glued to its text, which is not a checkbox anywhere', () => {
    const src = '- [x]glued\n- [ ] real'
    expect(toggleTask(src, 0)).toBe('- [x]glued\n- [x] real')
  })

  it('toggles an empty item', () => {
    expect(toggleTask('- [ ]\n- [ ] b', 0)).toBe('- [x]\n- [ ] b')
  })
})

describe('withRenderableTasks', () => {
  it('lets the renderer draw a box for an empty item, so later boxes keep their index', () => {
    expect(withRenderableTasks('- [ ]\n- [x] b')).toBe('- [ ] \n- [x] b')
    expect(withRenderableTasks('- [ ] a')).toBe('- [ ] a')
    expect(withRenderableTasks('```\n- [ ]\n```')).toBe('```\n- [ ]\n```')
  })

  it('draws exactly the checkboxes toggleTask counts, in the same order', () => {
    const bodies = [
      'intro\n- [ ] one\n- [x] two\n- [ ] three',
      '- [ ]\n- [ ] after an empty item\n- [x]',
      '- [x]glued\n- [ ] real',
      '> - [ ] quoted\n\n1. [x] numbered\n   - [ ] nested',
      '- [ ] a\n```\n- [ ] in code\n```\n- [x] b',
    ]
    for (const body of bodies) {
      expect(renderedBoxes(body), body).toEqual(toggledBoxes(body))
    }
  })
})
