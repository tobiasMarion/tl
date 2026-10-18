import { daysInMonth } from '../features/timestamp.ts'

// A length of time in a series, shared by the gap of the chronological split
// and the blocks of walk-forward. `steps` count distinct times, the other
// units are calendar time in UTC. The unit names follow Temporal.Duration.
export type PeriodUnit =
  | 'steps'
  | 'years'
  | 'months'
  | 'weeks'
  | 'days'
  | 'hours'
  | 'minutes'
  | 'seconds'
  | 'milliseconds'

const DAY = 86_400_000

// Fixed lengths: timestamps are UTC instants, so a day is always 24 hours.
const FIXED = {
  weeks: 7 * DAY,
  days: DAY,
  hours: 3_600_000,
  minutes: 60_000,
  seconds: 1000,
  milliseconds: 1
} as const

const CALENDAR = { years: 12, months: 1 } as const

/** A checked period: a number of distinct times, or a move along the calendar. */
export type Period =
  | { readonly steps: number; readonly label: string }
  | {
      readonly steps?: undefined
      /** Moves `time` by `count` periods, backwards when `count` is negative. */
      readonly shift: (time: number, count: number) => number
      readonly label: string
    }

// Months have different lengths, so the day is clamped to the end of the
// target month: Jan 31 plus one month is Feb 28 (or 29). The time of day is
// kept. Callers shift from a fixed anchor (anchor + 2 months, not anchor +
// 1 month + 1 month), so a clamped day doesn't carry over to later months.
export const addMonths = (time: number, months: number): number => {
  const date = new Date(time)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const last = daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)
  date.setUTCDate(Math.min(day, last))
  return date.getTime()
}

const show = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : typeof value === 'string'
      ? `'${value}'`
      : String(value)

const plural = (value: number, unit: string) =>
  `${value} ${value === 1 ? unit.replace(/s$/, '') : unit}`

const isFixed = (key: string): key is keyof typeof FIXED =>
  Object.hasOwn(FIXED, key)
const isCalendar = (key: string): key is keyof typeof CALENDAR =>
  Object.hasOwn(CALENDAR, key)

/**
 * Validates a period at an entry point. `caller` and `name` start the
 * messages, as in `series.split(): gap ...`. A gap can be 0; the blocks of
 * walk-forward can't.
 */
export const checkPeriod = (
  caller: string,
  name: string,
  period: unknown,
  { zero }: { readonly zero: boolean }
): Period => {
  const fail = (reason: string) =>
    new TypeError(`${caller}: ${reason}, received ${show(period)}`)
  const shapes = `${name} takes one unit: { steps: n } or a duration such as { days: 5 } (years, months, weeks, days, hours, minutes, seconds, milliseconds)`
  if (typeof period !== 'object' || period === null || Array.isArray(period)) {
    throw fail(shapes)
  }
  const entries = Object.entries(period as Record<string, unknown>)
  const [entry] = entries
  if (entry === undefined || entries.length > 1) throw fail(shapes)

  const [unit, value] = entry
  if (unit !== 'steps' && !isFixed(unit) && !isCalendar(unit)) {
    throw fail(shapes)
  }
  // Steps, months and years can't be split: half a month has no length
  const whole = unit === 'steps' || isCalendar(unit)
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (zero ? value < 0 : value <= 0) ||
    (whole && !Number.isInteger(value))
  ) {
    throw fail(
      whole
        ? `${name} ${unit} must be a whole number >= ${zero ? 0 : 1}`
        : `${name} ${unit} must be a number ${zero ? '>= 0' : '> 0'}`
    )
  }

  const label = plural(value, unit)
  if (unit === 'steps') return { steps: value, label }
  if (isCalendar(unit)) {
    const months = value * CALENDAR[unit]
    return {
      shift: (time, count) => addMonths(time, count * months),
      label
    }
  }
  const ms = value * FIXED[unit]
  return { shift: (time, count) => time + count * ms, label }
}

/** Index of the first value >= target in an ascending array. */
export const firstAtOrAfter = (
  sorted: readonly number[],
  target: number
): number => {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if ((sorted[mid] as number) < target) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * Start of the window of one period that ends at `end`: the window is
 * [start, end). Steps count back over `instants`, the distinct times of the
 * series in ascending order; with fewer times than steps, the window reaches
 * back past the first time.
 */
export const startBefore = (
  period: Period,
  instants: readonly number[],
  end: number
): number => {
  if (period.steps === undefined) return period.shift(end, -1)
  if (period.steps === 0) return end
  const first = firstAtOrAfter(instants, end)
  return instants[first - period.steps] ?? Number.NEGATIVE_INFINITY
}
