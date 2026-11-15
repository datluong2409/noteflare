import { describe, expect, it } from 'vitest'
import { applyEdit, continueList, indentLines, removeMarker, toggleBullets, toggleChecklist, type Edit } from '../src/lib/editing'

/** Runs an edit on text with "|" marking the cursor (or two "|" a selection) and returns the result with markers. */
function run(marked: string, fn: (v: string, s: number, e: number) => Edit | null) {
  const s = marked.indexOf('|')
  const e = marked.lastIndexOf('|') - (marked.indexOf('|') === marked.lastIndexOf('|') ? 0 : 1)
  const value = marked.replace(/\|/g, '')
  const edit = fn(value, s, e)
  if (!edit) return null
  const out = applyEdit(value, edit)
  return edit.selStart === edit.selEnd
    ? out.slice(0, edit.selStart) + '|' + out.slice(edit.selStart)
    : out.slice(0, edit.selStart) + '|' + out.slice(edit.selStart, edit.selEnd) + '|' + out.slice(edit.selEnd)
}

describe('continueList', () => {
  it('continues bullets, checklists and numbered lists', () => {
    expect(run('- milk|', continueList)).toBe('- milk\n- |')
    expect(run('- [x] milk|', continueList)).toBe('- [x] milk\n- [ ] |')
    expect(run('  * a|', continueList)).toBe('  * a\n  * |')
    expect(run('9. nine|', continueList)).toBe('9. nine\n10. |')
    expect(run('1) one|', continueList)).toBe('1) one\n2) |')
  })
  it('splits an item when the cursor is in the middle', () => {
    expect(run('- [ ] buy| milk', continueList)).toBe('- [ ] buy\n- [ ] | milk')
  })
  it('ends the list on an empty item', () => {
    expect(run('- a\n- [ ] |', continueList)).toBe('- a\n|')
    expect(run('- a\n- |\nafter', continueList)).toBe('- a\n|\nafter')
  })
  it('leaves plain lines and the marker itself alone', () => {
    expect(run('hello|', continueList)).toBeNull()
    expect(run('-| a', continueList)).toBeNull()
    expect(run('|- a|', continueList)).toBeNull()
  })
})

describe('indentLines', () => {
  it('indents and outdents the current line', () => {
    expect(run('- a|', (v, s, e) => indentLines(v, s, e, false))).toBe('  - a|')
    expect(run('  - a|', (v, s, e) => indentLines(v, s, e, true))).toBe('- a|')
    expect(run('|- a', (v, s, e) => indentLines(v, s, e, true))).toBe('|- a')
  })
  it('indents every selected line', () => {
    expect(run('|a\nb|\nc', (v, s, e) => indentLines(v, s, e, false))).toBe('  |a\n  b|\nc')
  })
})

describe('toggleChecklist', () => {
  it('turns a plain line into a checklist item and back', () => {
    expect(run('buy milk|', toggleChecklist)).toBe('- [ ] buy milk|')
    expect(run('- [ ] buy milk|', toggleChecklist)).toBe('buy milk|')
  })
  it('converts bullets and numbers, keeping indentation', () => {
    expect(run('  - eggs|', toggleChecklist)).toBe('  - [ ] eggs|')
    expect(run('3. eggs|', toggleChecklist)).toBe('- [ ] eggs|')
  })
  it('starts a checklist on an empty line', () => {
    expect(run('|', toggleChecklist)).toBe('- [ ] |')
  })
  it('handles a selection over several lines, skipping blank ones', () => {
    expect(run('|a\n\nb|', toggleChecklist)).toBe('|- [ ] a\n\n- [ ] b|')
    expect(run('|- [ ] a\n- [x] b|', toggleChecklist)).toBe('|a\nb|')
  })
  it('mixed selections become all checklist items', () => {
    expect(run('|- [ ] a\nb|', toggleChecklist)).toBe('|- [ ] a\n- [ ] b|')
  })
})

describe('toggleBullets', () => {
  it('turns a plain line into a bullet, keeping the cursor on its text', () => {
    expect(run('buy milk|', toggleBullets)).toBe('- buy milk|')
    expect(run('  indented|', toggleBullets)).toBe('  - indented|')
  })
  it('turns checklist and numbered items into bullets', () => {
    expect(run('- [ ] a|', toggleBullets)).toBe('- a|')
    expect(run('3. three|', toggleBullets)).toBe('- three|')
  })
  it('removes bullets when every selected line has one', () => {
    expect(run('|- a\n- b|', toggleBullets)).toBe('|a\nb|')
    expect(run('|- a\nb|', toggleBullets)).toBe('|- a\n- b|')
  })
  it('starts an empty bullet on an empty line', () => {
    expect(run('|', toggleBullets)).toBe('- |')
  })
})

describe('removeMarker', () => {
  it('deletes a whole checkbox when backspacing right after it', () => {
    expect(run('a\n- [ ] |', removeMarker)).toBe('a\n|')
    expect(run('- [x] |done', removeMarker)).toBe('|done')
    expect(run('  - [ ] |b', removeMarker)).toBe('  |b')
  })
  it('handles a checkbox with no space after it yet', () => {
    expect(run('- [ ]|', removeMarker)).toBe('|')
  })
  it('deletes bullets and numbers the same way', () => {
    expect(run('- |x', removeMarker)).toBe('|x')
    expect(run('12. |x', removeMarker)).toBe('|x')
  })
  it('deletes the marker when the cursor is inside it', () => {
    expect(run('- [| ] a', removeMarker)).toBe('|a')
  })
  it('leaves normal backspacing alone', () => {
    expect(run('- [ ] ab|', removeMarker)).toBeNull()
    expect(run('|- [ ] a', removeMarker)).toBeNull()
    expect(run('plain|', removeMarker)).toBeNull()
    expect(run('|- a|', removeMarker)).toBeNull()
  })
})
