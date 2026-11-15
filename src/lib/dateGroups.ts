/**
 * Groups for the phone note list, newest first, the way iPhone Notes does it:
 * Today, Yesterday, Previous 7 Days, Previous 30 Days, then each earlier month of
 * this year, then whole years.
 */

export type DateGroup =
  | { key: 'today' | 'yesterday' | 'week' | 'month30' }
  | { key: `m-${number}-${number}`; year: number; month: number }
  | { key: `y-${number}`; year: number }

function startOfDay(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Midnight `days` calendar days before `today` (safe across daylight-saving changes). */
function daysBefore(today: number, days: number) {
  const d = new Date(today)
  d.setDate(d.getDate() - days)
  return d.getTime()
}

export function dateGroupOf(ms: number, now = Date.now()): DateGroup {
  const today = startOfDay(now)
  if (ms >= today) return { key: 'today' } // also a clock a little ahead of ours
  if (ms >= daysBefore(today, 1)) return { key: 'yesterday' }
  if (ms >= daysBefore(today, 7)) return { key: 'week' }
  if (ms >= daysBefore(today, 30)) return { key: 'month30' }
  const d = new Date(ms)
  const year = d.getFullYear()
  if (year === new Date(now).getFullYear()) {
    const month = d.getMonth()
    return { key: `m-${year}-${month}`, year, month }
  }
  return { key: `y-${year}`, year }
}

/** Splits notes (already sorted newest first) into consecutive date groups. */
export function groupByDate<T>(items: T[], timeOf: (item: T) => number, now = Date.now()) {
  const out: { group: DateGroup; items: T[] }[] = []
  for (const item of items) {
    const group = dateGroupOf(timeOf(item), now)
    const last = out[out.length - 1]
    if (last && last.group.key === group.key) last.items.push(item)
    else out.push({ group, items: [item] })
  }
  return out
}

/** The date beside a row: a time today, a weekday this week, a short date before that. */
export function rowDate(ms: number, locale: string, now = Date.now()) {
  const today = startOfDay(now)
  if (ms >= today) return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (ms >= daysBefore(today, 6)) return new Date(ms).toLocaleDateString(locale, { weekday: 'long' })
  return new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'numeric', year: '2-digit' })
}
