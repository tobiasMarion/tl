import type { InferShape, Shape } from './infer.ts'
import { FeatureValidationError, validateRows } from './validate.ts'

const FIELD_KINDS: ReadonlySet<unknown> = new Set([
  'number',
  'boolean',
  'category',
  'timestamp'
])

export interface Features<S extends Shape> {
  readonly fields: S
  /** Field names, in declaration order. */
  readonly keys: readonly Extract<keyof S, string>[]
  /** Type-only: use `typeof features.infer`. Reading it at runtime throws. */
  readonly infer: InferShape<S>
  /** Validates one record. Throws `FeatureValidationError`. */
  parse(record: unknown): InferShape<S>
  /** Validates many records, grouping issues by field. Throws `FeatureValidationError`. */
  parseRows(rows: readonly unknown[]): InferShape<S>[]
}

const assertShape = (shape: unknown): void => {
  if (typeof shape !== 'object' || shape === null) {
    throw new TypeError('ml.features() expects an object of fields')
  }
  const entries = Object.entries(shape as Record<string, unknown>)
  if (entries.length === 0) {
    throw new TypeError('ml.features() needs at least one field')
  }
  for (const [name, field] of entries) {
    const kind =
      typeof field === 'object' && field !== null && 'kind' in field
        ? field.kind
        : undefined
    if (!FIELD_KINDS.has(kind)) {
      throw new TypeError(
        `ml.features(): '${name}' is not a field. Use ml.number(), ml.boolean(), ml.category([...]) or ml.timestamp()`
      )
    }
  }
}

export const features = <const S extends Shape>(shape: S): Features<S> => {
  assertShape(shape)
  const keys = Object.freeze(Object.keys(shape)) as readonly Extract<
    keyof S,
    string
  >[]

  // The casts to InferShape<S> below are safe: values are only returned when
  // every declared field passed its check, which is exactly InferShape<S>.
  const parseRows = (rows: readonly unknown[]): InferShape<S>[] => {
    const { values, issues } = validateRows(shape, rows, { indexed: true })
    if (issues.length > 0) throw new FeatureValidationError(issues)
    return values as InferShape<S>[]
  }

  const parse = (record: unknown): InferShape<S> => {
    const { values, issues } = validateRows(shape, [record], {
      indexed: false
    })
    if (issues.length > 0) throw new FeatureValidationError(issues)
    return values[0] as InferShape<S>
  }

  return Object.freeze({
    fields: shape,
    keys,
    get infer(): never {
      throw new Error(
        '`infer` is type-only: use `typeof features.infer` instead of reading it'
      )
    },
    parse,
    parseRows
  })
}
