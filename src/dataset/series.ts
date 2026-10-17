import type { Features } from '../features/features.ts'
import type {
  AnyField,
  CategoryField,
  TimestampField
} from '../features/fields.ts'
import type { InferShape, Shape } from '../features/infer.ts'
import { FeatureValidationError, validateRows } from '../features/validate.ts'

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
// It has no split yet: the chronological split comes with its own PR, and a
// random split never exists on a series.
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

  // Sorting by time doesn't change any result: in a series, the input order
  // carries no information beyond the timestamps. Array.prototype.sort is
  // stable, and ties between groups follow the category order, so the result
  // doesn't depend on the input order either. checkKey made sure time is a
  // required timestamp (milliseconds) and group a required category.
  const sorted = (values as Record<string, unknown>[]).toSorted(
    (a, b) =>
      (a[time] as number) - (b[time] as number) ||
      (group === undefined
        ? 0
        : (rank.get(a[group] as string) as number) -
          (rank.get(b[group] as string) as number))
  )
  // validateRows builds new records and every value is a primitive, so
  // freezing them makes the series fully immutable and leaves the caller's
  // rows untouched. The cast is safe: values are only returned when every
  // field passed its check.
  const parsed = Object.freeze(
    (sorted as InferShape<S>[]).map(record => Object.freeze(record))
  )

  return Object.freeze({ features, rows: parsed, time, group })
}
