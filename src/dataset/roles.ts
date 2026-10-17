import type { InferShape, Shape } from '../features/infer.ts'

declare const trainRole: unique symbol

export interface Train<S extends Shape> {
  readonly rows: readonly InferShape<S>[]
  readonly [trainRole]: true
}

declare const testRole: unique symbol

export interface Test<S extends Shape> {
  readonly rows: readonly InferShape<S>[]
  readonly [testRole]: true
}

declare const validationRole: unique symbol

export interface Validation<S extends Shape> {
  readonly rows: readonly InferShape<S>[]
  readonly [validationRole]: true
}
