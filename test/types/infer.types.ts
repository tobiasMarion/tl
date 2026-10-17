import {
  boolean,
  category,
  number,
  orderedCategory,
  timestamp
} from '../../src/features/fields.ts'
import type {
  FieldValue,
  InferShape,
  OptionalKeys,
  RequiredKeys
} from '../../src/features/infer.ts'
import type { Equal, Expect } from './helpers.ts'

const shape = {
  species: category(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: number().optional(),
  isAdult: boolean(),
  observedAt: timestamp(),
  sex: category(['male', 'female']).optional(),
  condition: orderedCategory(['poor', 'fair', 'good']).optional()
}

type S = typeof shape

type _fieldValue = Expect<
  [
    Equal<FieldValue<S['billLengthMm']>, number>,
    Equal<FieldValue<S['isAdult']>, boolean>,
    Equal<FieldValue<S['observedAt']>, number>,
    Equal<FieldValue<S['species']>, 'Adelie' | 'Chinstrap' | 'Gentoo'>
  ] extends [true, true, true, true]
    ? true
    : false
>

type _orderedValue = Expect<
  Equal<FieldValue<S['condition']>, 'poor' | 'fair' | 'good'>
>

type _optionalKeys = Expect<
  Equal<OptionalKeys<S>, 'billLengthMm' | 'sex' | 'condition'>
>

type _requiredKeys = Expect<
  Equal<RequiredKeys<S>, 'species' | 'isAdult' | 'observedAt'>
>

type _inferShape = Expect<
  Equal<
    InferShape<S>,
    {
      species: 'Adelie' | 'Chinstrap' | 'Gentoo'
      isAdult: boolean
      observedAt: number
      billLengthMm?: number | undefined
      sex?: 'male' | 'female' | undefined
      condition?: 'poor' | 'fair' | 'good' | undefined
    }
  >
>

type Penguin = InferShape<S>

export const minimal: Penguin = {
  species: 'Gentoo',
  isAdult: true,
  observedAt: 1194652800000
}

export const wrongType: Penguin = {
  ...minimal,
  // @ts-expect-error — billLengthMm is a number
  billLengthMm: '28'
}

export const unknownCategory: Penguin = {
  ...minimal,
  // @ts-expect-error — 'Emperor' is not a declared species
  species: 'Emperor'
}

// @ts-expect-error — species is required
export const missingRequired: Penguin = {
  isAdult: true,
  observedAt: 1194652800000
}

export const dateTimestamp: Penguin = {
  ...minimal,
  // @ts-expect-error — timestamps are milliseconds since 1970, not Date objects
  observedAt: new Date()
}
