import type { Features } from '../features/features.ts'
import type {
  AnyField,
  CategoryField,
  TimestampField
} from '../features/fields.ts'
import type { InferShape, Shape } from '../features/infer.ts'
import {
  FeatureValidationError,
  type RepeatedTime,
  repeatedTimesIssue,
  validateRows
} from '../features/validate.ts'
import {
  type ChronologicalSplitOptions,
  type ChronologicalSplitWithValidationOptions,
  chronologicalSplit,
  type TimestampInput
} from './chronological.ts'
import type { TrainTest, TrainValidationTest } from './split.ts'

export type SeriesOptions<Time extends string, Group extends string> = {
  /** Required timestamp field that orders the rows. */
  readonly time: Time
  /**
   * Required category field that identifies independent series in panel
   * data, such as one series per ticker.
   */
  readonly group?: Group
}

// A type alias, not an interface: see Type quality in docs/principles.md.
// Its split cuts by time; a random split never exists on a series, since
// shuffling time-ordered data leaks the future into training.
export type Series<S extends Shape> = {
  readonly features: Features<S>
  /** Ordered by time; rows at the same time follow the group's category order. */
  readonly rows: readonly InferShape<S>[]
  // Spelled out like the options of ml.series below, for the same reason
  /** The timestamp field that orders the rows. */
  readonly time: {
    [K in keyof S]: S[K] extends TimestampField ? K : never
  }[keyof S] &
    string
  /** The category field that identifies each series, if any. */
  readonly group:
    | ({
        [K in keyof S]: S[K] extends CategoryField ? K : never
      }[keyof S] &
        string)
    | undefined
  /**
   * Cuts by time: train, then validation from `validationFrom`, then test from
   * `testFrom`, dropping `gap` before each held-out block.
   */
  split(
    options: ChronologicalSplitWithValidationOptions
  ): TrainValidationTest<S>
  /**
   * Cuts by time: train, then test from `testFrom`, dropping `gap` before the
   * test block.
   */
  split(options: ChronologicalSplitOptions): TrainTest<S>
}

const isRequired = (field: AnyField | undefined, kind: AnyField['kind']) =>
  field !== undefined && field.kind === kind && !field.isOptional

const show = (value: unknown) =>
  typeof value === 'string' ? `'${value}'` : String(value)

// The types already reject a wrong field; this covers JavaScript callers and
// casts.
const checkKey = (
  fields: Readonly<Record<string, AnyField>>,
  option: 'time' | 'group',
  kind: 'timestamp' | 'category',
  key: unknown
) => {
  if (typeof key === 'string' && isRequired(fields[key], kind)) return
  const valid = Object.keys(fields).filter(name =>
    isRequired(fields[name], kind)
  )
  const what = kind === 'timestamp' ? 'timestamp' : 'category'
  throw new TypeError(
    valid.length === 0
      ? `ml.series(): ${option} needs a required ${what} field, and the schema has none, received ${show(key)}`
      : `ml.series(): ${option} must be a required ${what} field, one of ${valid.map(show).join(', ')}, received ${show(key)}`
  )
}

export const series = <S extends Shape>(
  features: Features<S>,
  rows: readonly unknown[],
  // The keys are spelled out instead of written as named aliases: TypeScript
  // keeps an alias name in hovers and errors, so a wrong field would report
  // the alias with the whole schema instead of the valid fields.
  options: SeriesOptions<
    {
      [K in keyof S]: S[K] extends TimestampField ? K : never
    }[keyof S] &
      string,
    {
      [K in keyof S]: S[K] extends CategoryField ? K : never
    }[keyof S] &
      string
  >
): Series<S> => {
  const fields: Readonly<Record<string, AnyField>> = features.fields
  checkKey(fields, 'time', 'timestamp', options.time)
  if (options.group !== undefined) {
    checkKey(fields, 'group', 'category', options.group)
  }

  // Same as ml.dataset: the error stack starts at the series() call
  const { values, issues } = validateRows(features.fields, rows, {
    indexed: true
  })
  if (issues.length > 0) throw new FeatureValidationError(issues, series)

  const { time, group } = options
  const categories =
    group === undefined ? [] : (fields[group] as CategoryField).categories
  const rank = new Map(categories.map((category, i) => [category, i]))

  // checkKey made sure time is a required timestamp (milliseconds) and group
  // a required category, so every record has both.
  const records = values as Record<string, unknown>[]
  const timeOf = (i: number) => records[i]?.[time] as number
  const rankOf = (i: number) =>
    group === undefined
      ? 0
      : (rank.get(records[i]?.[group] as string) as number)

  // Sorting by time doesn't change any result: in a series, the input order
  // carries no information beyond the timestamps. Ties between groups follow
  // the category order, so the result doesn't depend on the input order
  // either. Indices are sorted instead of records, so a repeated time can be
  // reported with the caller's row indexes.
  const order = records
    .map((_, i) => i)
    .sort((a, b) => timeOf(a) - timeOf(b) || rankOf(a) - rankOf(b))

  // After sorting, rows with the same time and group are next to each other
  const repeats: RepeatedTime[] = []
  for (let start = 0; start < order.length; ) {
    let end = start + 1
    const first = order[start] as number
    while (
      end < order.length &&
      timeOf(order[end] as number) === timeOf(first) &&
      rankOf(order[end] as number) === rankOf(first)
    ) {
      end++
    }
    if (end - start > 1) {
      repeats.push({
        time: timeOf(first),
        group:
          group === undefined ? undefined : (records[first]?.[group] as string),
        rows: order.slice(start, end).toSorted((a, b) => a - b)
      })
    }
    start = end
  }
  if (repeats.length > 0) {
    throw new FeatureValidationError(
      [repeatedTimesIssue(time, group, repeats)],
      series
    )
  }

  // validateRows builds new records and every value is a primitive, so
  // freezing them makes the series fully immutable and leaves the caller's
  // rows untouched. The cast is safe: values are only returned when every
  // field passed its check.
  const parsed = Object.freeze(
    order.map(i => Object.freeze(records[i] as InferShape<S>))
  )

  // chronologicalSplit returns the union of both results; the cast hands the
  // narrowing to the overloads on Series.split, as in ml.dataset.
  const split = ((
    options: ChronologicalSplitOptions & {
      readonly validationFrom?: TimestampInput
    }
  ) => chronologicalSplit<S>(parsed, time, options)) as Series<S>['split']

  return Object.freeze({ features, rows: parsed, time, group, split })
}
