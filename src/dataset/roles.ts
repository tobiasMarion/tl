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
