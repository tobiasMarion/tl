import type { InferShape, Shape } from '../features/infer.ts'

// One brand for all roles, with the role as its value. Passing a test block
// where a training block is expected then reports
// `Type '"test"' is not assignable to type '"train"'`. The symbol isn't
// exported, so only the library can create a block.
declare const role: unique symbol

// Type aliases, not interfaces: see Type quality in docs/principles.md.
export type Train<S extends Shape> = {
  readonly rows: readonly InferShape<S>[]
  readonly [role]: 'train'
}

export type Test<S extends Shape> = {
  readonly rows: readonly InferShape<S>[]
  readonly [role]: 'test'
}

export type Validation<S extends Shape> = {
  readonly rows: readonly InferShape<S>[]
  readonly [role]: 'validation'
}

// The roles are type-only brands, so a frozen { rows } is all a block needs at
// runtime. These casts are the one place where blocks are created; the splits
// pass in a new array of rows in the order the block should keep.
const block = <S extends Shape>(rows: InferShape<S>[]) =>
  Object.freeze({ rows: Object.freeze(rows) })

export const trainBlock = <S extends Shape>(rows: InferShape<S>[]) =>
  block(rows) as Train<S>

export const validationBlock = <S extends Shape>(rows: InferShape<S>[]) =>
  block(rows) as Validation<S>

export const testBlock = <S extends Shape>(rows: InferShape<S>[]) =>
  block(rows) as Test<S>
