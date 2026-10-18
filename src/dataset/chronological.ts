import type { Features } from '../features/features.ts'
import type { InferShape, Shape } from '../features/infer.ts'
import { checkPeriod, type PeriodUnit, startBefore, toTime } from './period.ts'
import { seriesTrainBlock, testBlock, validationBlock } from './roles.ts'
import type { TrainTest, TrainValidationTest } from './split.ts'

/** A `Date`, milliseconds since 1970, or an ISO 8601 string, like `ml.timestamp()`. */
export type TimestampInput = Date | number | string

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
   * - `{ days: 5 }`, `{ months: 1 }`, ...: every row less than that before
   *   the cut, for targets defined in calendar time or for irregular series.
   *   Months and years follow the calendar in UTC.
   *
   * `{ steps: 0 }` means no gap; it has to be written down.
   */
  readonly gap: {
    [U in PeriodUnit]: {
      readonly [K in PeriodUnit]?: K extends U ? number : never
    } & { readonly [K in U]: number } extends infer Shape
      ? { [K in keyof Shape]: Shape[K] }
      : never
  }[PeriodUnit]
}

/** The `gap` of a chronological split: `{ steps: n }` or a duration such as `{ days: 5 }`, in one unit. */
export type Gap = ChronologicalSplitOptions['gap']

export type ChronologicalSplitWithValidationOptions =
  ChronologicalSplitOptions & {
    /** Rows from this time until `testFrom` go to the validation block. */
    readonly validationFrom: TimestampInput
  }

const iso = (time: number) => new Date(time).toISOString()

// `rows` are sorted by `time` (ml.series sorts them), and every row has a
// timestamp in milliseconds there. Validates the options at the entry point.
export const chronologicalSplit = <S extends Shape>(
  features: Features<S>,
  rows: readonly InferShape<S>[],
  time: string,
  options: ChronologicalSplitOptions & {
    readonly validationFrom?: TimestampInput
  }
): TrainTest<S, 'series'> | TrainValidationTest<S, 'series'> => {
  const testFrom = toTime('series.split()', 'testFrom', options.testFrom)
  const validationFrom =
    options.validationFrom === undefined
      ? undefined
      : toTime('series.split()', 'validationFrom', options.validationFrom)
  const gap = checkPeriod('series.split()', 'gap', options.gap, { zero: true })
  if (validationFrom !== undefined && validationFrom >= testFrom) {
    throw new RangeError(
      `series.split(): validationFrom must be before testFrom, received ${iso(validationFrom)} and ${iso(testFrom)}`
    )
  }

  const times = rows.map(row => (row as Record<string, number>)[time] as number)
  // Steps count distinct times across the whole series, so with a group every
  // series loses the same times and they all share the same cut.
  const instants = [...new Set(times)]

  // The gap applies before every cut and to every earlier row: when the
  // validation block is shorter than the gap, training rows inside the gap
  // before the test block are dropped too.
  const cuts =
    validationFrom === undefined ? [testFrom] : [validationFrom, testFrom]
  // Times in [start, cut) are dropped from the block before the cut
  const windows = cuts.map(cut => ({
    start: startBefore(gap, instants, cut),
    end: cut
  }))
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

  const blocks = {
    train: seriesTrainBlock(features, train, time),
    test: testBlock(features, test)
  }
  return validationFrom === undefined
    ? Object.freeze(blocks)
    : Object.freeze({
        ...blocks,
        validation: validationBlock(features, validation)
      })
}
