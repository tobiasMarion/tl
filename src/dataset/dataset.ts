import type { Features } from '../features/features.ts'
import type { InferShape, Shape } from '../features/infer.ts'

export interface Dataset<S extends Shape> {
  readonly features: Features<S>
  readonly rows: readonly InferShape<S>[]
}

export const dataset = <S extends Shape>(
  features: Features<S>,
  rows: readonly unknown[]
): Dataset<S> => {
  // parseRows builds new records, so freezing them leaves the caller's rows
  // untouched. Dates inside them stay mutable: freeze can't reach their value.
  const parsed = Object.freeze(
    features.parseRows(rows).map(record => Object.freeze(record))
  )

  return Object.freeze({ features, rows: parsed })
}
