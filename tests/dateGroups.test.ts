import { describe, expect, it } from 'vitest'
import { dateGroupOf, groupByDate } from '../src/lib/dateGroups'

// Local time, so the tests don't depend on the machine's time zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const NOW = at(2026, 11, 16, 0)

describe('dateGroupOf', () => {
  it('sorts recent edits into the iPhone Notes buckets', () => {
    expect(dateGroupOf(at(2026, 11, 16, 0), NOW).key).toBe('today')
    expect(dateGroupOf(at(2026, 11, 15, 23), NOW).key).toBe('yesterday')
    expect(dateGroupOf(at(2026, 11, 14), NOW).key).toBe('week')
    expect(dateGroupOf(at(2026, 11, 9), NOW).key).toBe('week')
    expect(dateGroupOf(at(2026, 11, 8), NOW).key).toBe('month30')
    expect(dateGroupOf(at(2026, 10, 17), NOW).key).toBe('month30')
  })
  it('groups older notes by month this year, then by year', () => {
    expect(dateGroupOf(at(2026, 10, 1), NOW)).toEqual({ key: 'm-2026-9', year: 2026, month: 9 })
    expect(dateGroupOf(at(2026, 1, 3), NOW)).toEqual({ key: 'm-2026-0', year: 2026, month: 0 })
    expect(dateGroupOf(at(2025, 12, 31), NOW)).toEqual({ key: 'y-2025', year: 2025 })
  })
  it('counts a clock slightly ahead as today', () => {
    expect(dateGroupOf(NOW + 60_000, NOW).key).toBe('today')
  })
})

describe('groupByDate', () => {
  it('keeps order and starts a new group when the bucket changes', () => {
    const notes = [at(2026, 11, 16, 0), at(2026, 11, 14), at(2026, 11, 13), at(2025, 6, 1)]
    const groups = groupByDate(notes, (n) => n, NOW)
    expect(groups.map((g) => [g.group.key, g.items.length])).toEqual([
      ['today', 1],
      ['week', 2],
      ['y-2025', 1],
    ])
  })
})
