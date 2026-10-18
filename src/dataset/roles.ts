import type { Features } from '../features/features.ts'
import type { InferShape, Shape } from '../features/infer.ts'

// One brand for all roles, with the role as its value. Passing a test block
// where a training block is expected then reports
// `Type '"test"' is not assignable to type '"train"'`. The symbol isn't
// exported, so only the library can create a block.
declare const role: unique symbol

// Where a training block was cut from, so cross-validation can tell ordered
// data from unordered data: k-fold on a series' training block would train on
// the future. Reports `Type '"series"' is not assignable to type '"dataset"'`.
declare const origin: unique symbol

/** What a block was cut from: a `Dataset` has no order, a `Series` is ordered by time. */
export type Origin = 'dataset' | 'series'

// Type aliases, not interfaces: see Type quality in docs/principles.md.
/** Rows to fit on. `O` is what it was cut from; `Train<S>` accepts both. */
export type Train<S extends Shape, O extends Origin = Origin> = {
  readonly features: Features<S>
  readonly rows: readonly InferShape<S>[]
  readonly [role]: 'train'
  readonly [origin]: O
}

export type Test<S extends Shape> = {
  readonly features: Features<S>
  readonly rows: readonly InferShape<S>[]
  readonly [role]: 'test'
}

export type Validation<S extends Shape> = {
  readonly features: Features<S>
  readonly rows: readonly InferShape<S>[]
  readonly [role]: 'validation'
}

// The roles and origins are type-only brands, so a frozen { features, rows }
// is all a block needs at runtime. These casts are the one place where blocks
// are created; the splits pass in a new array of rows in the order the block
// should keep.
const block = <S extends Shape>(features: Features<S>, rows: InferShape<S>[]) =>
  Object.freeze({ features, rows: Object.freeze(rows) })

export const trainBlock = <S extends Shape, O extends Origin>(
  features: Features<S>,
  rows: InferShape<S>[]
) => block(features, rows) as Train<S, O>

export const validationBlock = <S extends Shape>(
  features: Features<S>,
  rows: InferShape<S>[]
) => block(features, rows) as Validation<S>

export const testBlock = <S extends Shape>(
  features: Features<S>,
  rows: InferShape<S>[]
) => block(features, rows) as Test<S>
