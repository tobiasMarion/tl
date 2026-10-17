import type { InferShape, Shape } from '../features/infer.ts'
import { parseTimestamp } from '../features/timestamp.ts'
import { testBlock, trainBlock, validationBlock } from './roles.ts'
import type { TrainTest, TrainValidationTest } from './split.ts'

/** A `Date`, milliseconds since 1970, or an ISO 8601 string, like `ml.timestamp()`. */
export type TimestampInput = Date | number | string

type GapUnit =
  | 'steps'
  | 'weeks'
  | 'days'
  | 'hours'
  | 'minutes'
  | 'seconds'
  | 'milliseconds'

export type ChronologicalSplitOptions = {
  /** Rows at or after this time go to the test block. */
  readonly testFrom: TimestampInput
  // Written inline instead of as the Gap alias, so `gap: 1` reports the valid
  // shapes instead of 'Gap'. Each shape has one unit and marks the others as
  // never, so { days: 1, hours: 12 } doesn't compile. The unit names follow
  // Temporal.Duration.
  /**
   * Rows dropped before each held-out block, so no training label reaches into
   * it. It has to cover at least the target's horizon. One unit:
   * - `{ steps: n }`: the last n distinct times before the cut, for targets
   *   defined in observations ("the next 5 trading days").
   * - `{ days: 5 }`, `{ hours: 36 }`, ...: every row less than that before the
   *   cut, for targets defined in calendar time or for irregular series.
   *   Months and years have no fixed length, so they aren't accepted.
   *
   * `{ steps: 0 }` means no gap; it has to be written down.
   */
  readonly gap: {
    [U in GapUnit]: {
      readonly [K in GapUnit]?: K extends U ? number : never
    } & { readonly [K in U]: number } extends infer Shape
      ? { [K in keyof Shape]: Shape[K] }
      : never
  }[GapUnit]
}

/** The `gap` of a chronological split: `{ steps: n }` or a duration such as `{ days: 5 }`, in one unit. */
export type Gap = ChronologicalSplitOptions['gap']

export type ChronologicalSplitWithValidationOptions =
  ChronologicalSplitOptions & {
    /** Rows from this time until `testFrom` go to the validation block. */
    readonly validationFrom: TimestampInput
  }

const show = (value: unknown) =>
  typeof value === 'string'
    ? `'${value}'`
    : typeof value === 'object' && value !== null && !(value instanceof Date)
      ? JSON.stringify(value)
      : String(value)

const iso = (time: number) => new Date(time).toISOString()

const toTime = (name: string, value: unknown): number => {
  const check = parseTimestamp(value)
  if (check.ok) return check.value
  throw new (check.code === 'invalid_type' ? TypeError : RangeError)(
    `series.split(): ${name} expected a Date, milliseconds since 1970 or an ISO 8601 date such as '2025-01-31', received ${show(value)}`
  )
}

const DAY = 86_400_000

// Fixed lengths: timestamps are UTC instants, so a day is always 24 hours.
const UNITS = {
  weeks: 7 * DAY,
  days: DAY,
  hours: 3_600_000,
  minutes: 60_000,
  seconds: 1000,
  milliseconds: 1
} as const

type Unit = keyof typeof UNITS

/** A checked gap: a number of steps, or a duration in milliseconds. */
type GapWindow =
  | { readonly steps: number; readonly label: string }
  | { readonly steps?: undefined; readonly ms: number; readonly label: string }

const isUnit = (key: string): key is Unit => Object.hasOwn(UNITS, key)

const plural = (value: number, unit: string) =>
  `${value} ${value === 1 ? unit.replace(/s$/, '') : unit}`

const checkGap = (gap: unknown): GapWindow => {
  const fail = (reason: string) =>
    new TypeError(`series.split(): ${reason}, received ${show(gap)}`)
  const shapes =
    'gap takes one unit: { steps: n } or a duration such as { days: 5 } (weeks, days, hours, minutes, seconds, milliseconds)'
  if (typeof gap !== 'object' || gap === null || Array.isArray(gap)) {
    throw fail(shapes)
  }
  const entries = Object.entries(gap as Record<string, unknown>)
  const [entry] = entries
  if (entry === undefined || entries.length > 1) throw fail(shapes)

  const [unit, value] = entry
  if (unit === 'months' || unit === 'years') {
    throw fail(
      "gap can't use months or years, which have no fixed length; use days or weeks"
    )
  }
  if (unit !== 'steps' && !isUnit(unit)) throw fail(shapes)
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    (unit === 'steps' && !Number.isInteger(value))
  ) {
    throw fail(
      unit === 'steps'
        ? 'gap steps must be a whole number >= 0'
        : `gap ${unit} must be a number >= 0`
    )
  }

  const label = plural(value, unit)
  return unit === 'steps'
    ? { steps: value, label }
    : { steps: undefined, ms: value * UNITS[unit], label }
}

/** Index of the first value >= target in an ascending array. */
const firstAtOrAfter = (sorted: readonly number[], target: number): number => {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if ((sorted[mid] as number) < target) low = mid + 1
    else high = mid
  }
  return low
}

// `rows` are sorted by `time` (ml.series sorts them), and every row has a
// timestamp in milliseconds there. Validates the options at the entry point.
export const chronologicalSplit = <S extends Shape>(
  rows: readonly InferShape<S>[],
  time: string,
  options: ChronologicalSplitOptions & {
    readonly validationFrom?: TimestampInput
  }
): TrainTest<S> | TrainValidationTest<S> => {
  const testFrom = toTime('testFrom', options.testFrom)
  const validationFrom =
    options.validationFrom === undefined
      ? undefined
      : toTime('validationFrom', options.validationFrom)
  const gap = checkGap(options.gap)
  if (validationFrom !== undefined && validationFrom >= testFrom) {
    throw new RangeError(
      `series.split(): validationFrom must be before testFrom, received ${iso(validationFrom)} and ${iso(testFrom)}`
    )
  }

  const times = rows.map(row => (row as Record<string, number>)[time] as number)
  // Steps count distinct times across the whole series, so with a group every
  // series loses the same times and they all share the same cut.
  const instants = [...new Set(times)]

  // Times in [gapStart(cut), cut) are dropped from the block before the cut
  const gapStart = (cut: number): number => {
    if (gap.steps === undefined) return cut - gap.ms
    if (gap.steps === 0) return cut
    const firstHeldOut = firstAtOrAfter(instants, cut)
    return instants[firstHeldOut - gap.steps] ?? Number.NEGATIVE_INFINITY
  }
  // The gap applies before every cut and to every earlier row: when the
  // validation block is shorter than the gap, training rows inside the gap
  // before the test block are dropped too.
  const cuts =
    validationFrom === undefined ? [testFrom] : [validationFrom, testFrom]
  const windows = cuts.map(cut => ({ start: gapStart(cut), end: cut }))
  const inGap = (t: number) => windows.some(w => t >= w.start && t < w.end)

  const train: InferShape<S>[] = []
  const validation: InferShape<S>[] = []
  const test: InferShape<S>[] = []
  rows.forEach((row, i) => {
    const t = times[i] as number
    if (t >= testFrom) test.push(row)
    else if (inGap(t)) return
    else if (validationFrom !== undefined && t >= validationFrom) {
      validation.push(row)
    } else train.push(row)
  })

  const first = times[0]
  const last = times.at(-1)
  const span =
    first === undefined || last === undefined
      ? 'the series has no rows'
      : `the series runs from ${iso(first)} to ${iso(last)}`
  if (test.length === 0) {
    throw new RangeError(
      `series.split(): no rows at or after testFrom ${iso(testFrom)}; ${span}`
    )
  }
  if (validationFrom !== undefined && validation.length === 0) {
    throw new RangeError(
      `series.split(): no rows for validation from ${iso(validationFrom)} to ${iso(testFrom)} after a gap of ${gap.label}; ${span}`
    )
  }
  if (train.length === 0) {
    throw new RangeError(
      `series.split(): no rows left for training before ${iso(cuts[0] as number)} after a gap of ${gap.label}; ${span}`
    )
  }

  const blocks = { train: trainBlock<S>(train), test: testBlock<S>(test) }
  return validationFrom === undefined
    ? Object.freeze(blocks)
    : Object.freeze({ ...blocks, validation: validationBlock<S>(validation) })
}
