import {
  type AnyField,
  type BooleanField,
  boolean,
  type CategoryField,
  category,
  type NumberField,
  number,
  type TimestampField,
  timestamp
} from '../../src/features/fields.ts'
import type { Equal, Expect } from './helpers.ts'

// Constructors start required
type _number = Expect<Equal<ReturnType<typeof number>, NumberField<false>>>
type _boolean = Expect<Equal<ReturnType<typeof boolean>, BooleanField<false>>>
type _timestamp = Expect<
  Equal<ReturnType<typeof timestamp>, TimestampField<false>>
>

// optional() flips the flag in the type
const optionalNumber = number().optional()
type _optional = Expect<Equal<typeof optionalNumber, NumberField<true>>>

// category() keeps the literals, without `as const`
const sex = category(['male', 'female'])
type _category = Expect<Equal<typeof sex, CategoryField<'male' | 'female'>>>

// optional() keeps the categories
const optionalSex = sex.optional()
type _optionalCategory = Expect<
  Equal<typeof optionalSex, CategoryField<'male' | 'female', true>>
>

// AnyField accepts required and optional fields of every kind
export const fields: AnyField[] = [
  number(),
  number().optional(),
  boolean(),
  timestamp().optional(),
  sex,
  optionalSex
]

// @ts-expect-error — at least one category is required
category([])

// @ts-expect-error — categories are strings
category([1, 2])

// @ts-expect-error — kind is readonly
sex.kind = 'number'

// @ts-expect-error — categories can't be changed in place
sex.categories.push('other')
