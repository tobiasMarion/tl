import type { AnyField } from './fields.ts'

export type Shape = Readonly<Record<string, AnyField>>

interface ValueByKind {
  number: number
  boolean: boolean
  /** Milliseconds since 1970-01-01T00:00:00Z, like Date.getTime(). */
  timestamp: number
}

export type FieldValue<Field extends AnyField> = Field extends {
  readonly categories: readonly (infer Category)[]
}
  ? Category
  : Field['kind'] extends keyof ValueByKind
    ? ValueByKind[Field['kind']]
    : never

export type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K]['isOptional'] extends true ? K : never
}[keyof S]

export type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type InferShape<S extends Shape> = Simplify<
  { [K in RequiredKeys<S>]: FieldValue<S[K]> } & {
    [K in OptionalKeys<S>]?: FieldValue<S[K]> | undefined
  }
>
