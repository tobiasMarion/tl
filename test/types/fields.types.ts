import {
  type AnyField,
  type BooleanField,
  boolean,
  type CategoryField,
  category,
  type NumberField,
  number,
  type Optional,
  type OrderedCategoryField,
  orderedCategory,
  type TimestampField,
  timestamp
} from '../../src/features/fields.ts'
import type { Equal, Expect } from './helpers.ts'

// Constructors start required
type _number = Expect<Equal<ReturnType<typeof number>, NumberField>>
type _boolean = Expect<Equal<ReturnType<typeof boolean>, BooleanField>>
type _timestamp = Expect<Equal<ReturnType<typeof timestamp>, TimestampField>>

// optional() wraps the field
const optionalNumber = number().optional()
type _optional = Expect<Equal<typeof optionalNumber, Optional<NumberField>>>
type _optionalFlag = Expect<Equal<typeof optionalNumber.isOptional, true>>

// @ts-expect-error — a field is made optional only once
number().optional().optional()

// category() keeps the literals, without `as const`
const sex = category(['male', 'female'])
type _category = Expect<Equal<typeof sex, CategoryField<'male' | 'female'>>>

// optional() keeps the categories
const optionalSex = sex.optional()
type _optionalCategory = Expect<
  Equal<typeof optionalSex, Optional<CategoryField<'male' | 'female'>>>
>
type _optionalCategories = Expect<
  Equal<typeof optionalSex.categories, readonly ('male' | 'female')[]>
>

// orderedCategory() keeps the literals and wraps like any field
const temperature = orderedCategory(['cold', 'warm', 'hot'])
type _ordered = Expect<
  Equal<typeof temperature, OrderedCategoryField<'cold' | 'warm' | 'hot'>>
>
const optionalTemperature = temperature.optional()
type _optionalOrdered = Expect<
  Equal<
    typeof optionalTemperature,
    Optional<OrderedCategoryField<'cold' | 'warm' | 'hot'>>
  >
>

// AnyField accepts required and optional fields of every kind
export const fields: AnyField[] = [
  number(),
  number().optional(),
  boolean(),
  timestamp().optional(),
  sex,
  optionalSex,
  temperature,
  optionalTemperature
]

// @ts-expect-error — at least one category is required
category([])

// @ts-expect-error — categories are strings
category([1, 2])

// @ts-expect-error — kind is readonly
sex.kind = 'number'

// @ts-expect-error — categories can't be changed in place
sex.categories.push('other')
