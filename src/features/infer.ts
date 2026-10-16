import type { AnyField, CategoryField } from './fields.ts'

export type Shape = Readonly<Record<string, AnyField>>

interface ValueByKind {
  number: number
  boolean: boolean
  timestamp: Date
}

export type FieldValue<Field extends AnyField> =
  Field extends CategoryField<infer Category, boolean>
    ? Category
    : Field['kind'] extends keyof ValueByKind
      ? ValueByKind[Field['kind']]
      : never

export type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K]['isOptional'] extends true ? K : never
}[keyof S]

export type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>

type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type InferShape<S extends Shape> = Simplify<
  { [K in RequiredKeys<S>]: FieldValue<S[K]> } & {
    [K in OptionalKeys<S>]?: FieldValue<S[K]> | undefined
  }
>
