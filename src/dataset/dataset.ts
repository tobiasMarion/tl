import type { Features } from '../features/features.ts'
import type { InferShape, Shape } from '../features/infer.ts'
import { FeatureValidationError, validateRows } from '../features/validate.ts'

export interface Dataset<S extends Shape> {
  readonly features: Features<S>
  readonly rows: readonly InferShape<S>[]
}

export const dataset = <S extends Shape>(
  features: Features<S>,
  rows: readonly unknown[]
): Dataset<S> => {
  // Same as features.parseRows, but the error stack starts at the dataset()
  // call instead of inside it.
  const { values, issues } = validateRows(features.fields, rows, {
    indexed: true
  })
  if (issues.length > 0) throw new FeatureValidationError(issues, dataset)

  // validateRows builds new records, so freezing them leaves the caller's rows
  // untouched. Dates inside them stay mutable: freeze can't reach their value.
  // The cast is safe for the same reason as in parseRows: values are only
  // returned when every field passed its check.
  const parsed = Object.freeze(
    (values as InferShape<S>[]).map(record => Object.freeze(record))
  )

  return Object.freeze({ features, rows: parsed })
}
