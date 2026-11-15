import { describe, expect, it } from 'vitest'
import { countImages, parseLines, previewLines, toggleBox } from '../src/lib/liveText'

describe('parseLines', () => {
  it('finds checklist items and the offset of their box', () => {
    const body = 'Shopping\n- [ ] milk\n  * [x] eggs'
    const lines = parseLines(body)
    expect(lines.map((l) => l.kind)).toEqual(['plain', 'task', 'task'])
    expect(lines[1]).toMatchObject({ start: 9, indent: 0, marker: 6, checked: false })
    expect(body[lines[1].box!]).toBe(' ')
    expect(lines[2]).toMatchObject({ indent: 2, marker: 6, checked: true })
    expect(body[lines[2].box!]).toBe('x')
  })
  it('keeps marker widths exact so the mirror lines up', () => {
    const [task, bullet, ordered, heading] = parseLines('1. [ ] call\n-   spaced\n12) twelve\n## Title')
    expect(task.text.slice(task.indent, task.indent + task.marker)).toBe('1. [ ] ')
    expect(bullet).toMatchObject({ kind: 'bullet', marker: 4 })
    expect(ordered).toMatchObject({ kind: 'ordered', marker: 4 })
    expect(heading).toMatchObject({ kind: 'heading', marker: 3 })
  })
  it('accepts an empty checklist item without text yet', () => {
    expect(parseLines('- [ ]')[0]).toMatchObject({ kind: 'task', marker: 5 })
  })
  it('ignores Markdown inside code fences', () => {
    const kinds = parseLines('```\n- [ ] not a task\n```\n- [ ] task').map((l) => l.kind)
    expect(kinds).toEqual(['fence', 'fence', 'fence', 'task'])
  })
  it('does not treat a horizontal rule or a lone dash as a bullet', () => {
    expect(parseLines('---')[0].kind).toBe('plain')
    expect(parseLines('- ')[0].kind).toBe('plain')
  })
  it('marks image lines', () => {
    expect(parseLines('![photo](nf-blob:abc)')[0].kind).toBe('image')
  })
})

describe('toggleBox', () => {
  it('ticks and unticks', () => {
    const body = '- [ ] a\n- [x] b'
    const [a, b] = parseLines(body)
    expect(toggleBox(body, a.box!)).toBe('- [x] a\n- [x] b')
    expect(toggleBox(body, b.box!)).toBe('- [ ] a\n- [ ] b')
  })
  it('leaves the note alone when the offset is not a box', () => {
    expect(toggleBox('hello', 1)).toBe('hello')
  })
})

describe('previewLines', () => {
  it('uses the title and the first line with words', () => {
    expect(previewLines('Gg', '\n- [ ] **Gggg**\n- [ ] Ggg')).toEqual({ title: 'Gg', snippet: 'Gggg' })
  })
  it('uses the first line as the title when there is none', () => {
    expect(previewLines('', '# Trip\nPack [bags](https://x.y) today')).toEqual({ title: 'Trip', snippet: 'Pack bags today' })
  })
  it('skips images and fence markers', () => {
    expect(previewLines('', '![](nf-blob:a)\n```js\nlet x\n```')).toEqual({ title: 'let x', snippet: '' })
  })
})

describe('countImages', () => {
  it('counts Markdown images', () => {
    expect(countImages('a ![x](nf-blob:1)\n![](https://e/p.png)')).toBe(2)
    expect(countImages('no images [link](https://e)')).toBe(0)
  })
})
