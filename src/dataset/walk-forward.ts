import type { InferShape, Shape } from '../features/infer.ts'
import type {
  ChronologicalSplitOptions,
  TimestampInput
} from './chronological.ts'
import { describeWalkForward, printable } from './describe.ts'
import {
  checkPeriod,
  firstAtOrAfter,
  type Period,
  startBefore,
  toTime
} from './period.ts'
import {
  type Fold,
  fold,
  seriesTrainBlock,
  type Train,
  timeFieldOf,
  type Validation,
  validationBlock
} from './roles.ts'

// Type aliases, not interfaces: see Type quality in docs/principles.md. The
// periods reuse the gap's type through an indexed access, which TypeScript
// prints as the list of shapes, like the gap itself.
export type WalkForwardOptions = {
  /** Start of the first validation block. */
  readonly validationFrom: TimestampInput
  /**
   * Length of each validation block, in the units of `gap`. The blocks follow
   * each other from `validationFrom` until the end of the training block; the
   * last one can be shorter.
   */
  readonly validation: ChronologicalSplitOptions['gap']
  /**
   * History each fold trains on: `'expanding'` keeps everything before its
   * validation block; a period such as `{ months: 3 }` keeps only that much
   * (a rolling window). `gap` comes out of the end of the window.
   */
  readonly train: 'expanding' | ChronologicalSplitOptions['gap']
  /**
   * Rows dropped before each validation block, so no training label reaches
   * into it. It has to cover at least the target's horizon. `{ steps: 0 }`
   * means no gap; it has to be written down.
   */
  readonly gap: ChronologicalSplitOptions['gap']
}

export type WalkForward = {
  /** Start of the first validation block, in milliseconds since 1970. */
  readonly validationFrom: number
  readonly validation: WalkForwardOptions['validation']
  readonly train: WalkForwardOptions['train']
  readonly gap: WalkForwardOptions['gap']
  /**
   * Cuts the training block of a series into folds: each validation block
   * comes after the history it trains on.
   */
  folds<S extends Shape>(
    train: Train<S, 'series'>
  ): readonly Fold<S, 'series'>[]
}

const iso = (time: number) => new Date(time).toISOString()

const show = (value: unknown) =>
  typeof value === 'string' ? `'${value}'` : String(value)

/**
 * Walk-forward cross-validation of a training block cut from a series. Each
 * fold validates on a block of time and trains on the history before it,
 * minus the gap.
 */
export const walkForward = (options: WalkForwardOptions): WalkForward => {
  const caller = 'ml.walkForward()'
  const validationFrom = toTime(
    caller,
    'validationFrom',
    options.validationFrom
  )
  const validation = checkPeriod(caller, 'validation', options.validation, {
    zero: false
  })
  if (typeof options.train === 'string' && options.train !== 'expanding') {
    throw new TypeError(
      `${caller}: train takes 'expanding' or one unit such as { months: 3 }, received ${show(options.train)}`
    )
  }
  const window: Period | undefined =
    options.train === 'expanding'
      ? undefined
      : checkPeriod(caller, 'train', options.train, { zero: false })
  const gap = checkPeriod(caller, 'gap', options.gap, { zero: true })

  const folds = <S extends Shape>(train: Train<S, 'series'>) => {
    // The types already reject other blocks; this covers JavaScript callers
    // and casts, which would leave walk-forward without a time to cut by.
    const time = timeFieldOf(train)
    if (time === undefined) {
      throw new TypeError(
        'walkForward.folds(): expected the training block of a series, from series.split() or another walk-forward fold'
      )
    }
    // Rows of a series' training block are sorted by time
    const rows = train.rows
    const times = rows.map(
      row => (row as Record<string, number>)[time] as number
    )
    const instants = [...new Set(times)]
    const first = instants[0]
    const last = instants.at(-1)
    if (first === undefined || last === undefined) {
      throw new RangeError(
        'walkForward.folds(): the training block has no rows'
      )
    }
    const span = `the training block runs from ${iso(first)} to ${iso(last)}`
    if (validationFrom > last) {
      throw new RangeError(
        `walkForward.folds(): no rows at or after validationFrom ${iso(validationFrom)}; ${span}`
      )
    }

    // Starts of the validation blocks. Steps advance over distinct times;
    // durations shift from validationFrom itself, so a clamped day (Jan 31
    // plus one month is Feb 28) doesn't carry over to later blocks.
    const starts: number[] = []
    if (validation.steps === undefined) {
      for (let i = 0; ; i++) {
        const start = validation.shift(validationFrom, i)
        if (start > last) break
        starts.push(start)
      }
    } else {
      const from = firstAtOrAfter(instants, validationFrom)
      for (let i = from; i < instants.length; i += validation.steps) {
        starts.push(i === from ? validationFrom : (instants[i] as number))
      }
    }

    // A rolling window that reaches back past the first time would train the
    // first folds on less history than asked for
    const firstStart = starts[0] as number
    if (
      window !== undefined &&
      startBefore(window, instants, firstStart) < first
    ) {
      throw new RangeError(
        `walkForward.folds(): the first fold needs ${window.label} of training before ${iso(firstStart)}; ${span}. Use a later validationFrom`
      )
    }

    const blocks: [Train<S, 'series'>, Validation<S>][] = []
    starts.forEach((start, i) => {
      const end = starts[i + 1] ?? Number.POSITIVE_INFINITY
      const from =
        window === undefined
          ? Number.NEGATIVE_INFINITY
          : startBefore(window, instants, start)
      const until = startBefore(gap, instants, start)
      const fit: InferShape<S>[] = []
      const held: InferShape<S>[] = []
      rows.forEach((row, r) => {
        const t = times[r] as number
        if (t >= start && t < end) held.push(row)
        else if (t >= from && t < until) fit.push(row)
      })
      // A calendar block can fall where the series has no rows, such as a
      // month without data; there is nothing to score on it
      if (held.length === 0) return
      if (fit.length === 0) {
        throw new RangeError(
          `walkForward.folds(): no rows left for training before ${iso(start)} after a gap of ${gap.label}; ${span}`
        )
      }
      blocks.push([
        seriesTrainBlock(train.features, fit, time),
        validationBlock(train.features, held)
      ])
    })
    // Skipped blocks leave the number of folds known only at the end
    const result = blocks.map(([fit, held], f) =>
      fold(fit, held, f, blocks.length)
    )
    const distinct = (block: { readonly rows: readonly unknown[] }) => [
      ...new Set(
        block.rows.map(row => (row as Record<string, number>)[time] as number)
      )
    ]
    return printable(result, () =>
      describeWalkForward({
        train: window === undefined ? 'expanding' : window.label,
        validation: validation.label,
        gap: gap.label,
        times: instants,
        folds: result.map(each => ({
          train: distinct(each.train),
          validation: distinct(each.validation)
        }))
      })
    )
  }

  return Object.freeze({
    validationFrom,
    validation: options.validation,
    train: options.train,
    gap: options.gap,
    folds
  })
}
