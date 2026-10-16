import { type Infer, ml } from '../../src/index.ts'
import type { Equal, Expect } from './helpers.ts'

const penguins = ml.features({
  species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: ml.number().optional(),
  isAdult: ml.boolean(),
  observedAt: ml.timestamp(),
  sex: ml.category(['male', 'female']).optional()
})

type Penguin = typeof penguins.infer

type _infersRecord = Expect<
  Equal<
    Penguin,
    {
      species: 'Adelie' | 'Chinstrap' | 'Gentoo'
      isAdult: boolean
      observedAt: Date
      billLengthMm?: number | undefined
      sex?: 'male' | 'female' | undefined
    }
  >
>

type _inferHelper = Expect<Equal<Infer<typeof penguins>, Penguin>>

type _keys = Expect<
  Equal<
    (typeof penguins.keys)[number],
    'species' | 'billLengthMm' | 'isAdult' | 'observedAt' | 'sex'
  >
>

type _categoriesKeepLiterals = Expect<
  Equal<
    (typeof penguins.fields.species.categories)[number],
    'Adelie' | 'Chinstrap' | 'Gentoo'
  >
>

type _parseReturnsRecord = Expect<
  Equal<ReturnType<typeof penguins.parse>, Penguin>
>

export const valid: Penguin = {
  species: 'Gentoo',
  isAdult: true,
  observedAt: new Date()
}

export const wrongType: Penguin = {
  species: 'Gentoo',
  isAdult: true,
  observedAt: new Date(),
  // @ts-expect-error — billLengthMm is a number
  billLengthMm: '28'
}

export const unknownCategory: Penguin = {
  // @ts-expect-error — 'Emperor' is not a declared category
  species: 'Emperor',
  isAdult: true,
  observedAt: new Date()
}

// @ts-expect-error — species is required
export const missingRequired: Penguin = {
  isAdult: true,
  observedAt: new Date()
}

// @ts-expect-error — at least one category is required
ml.category([])

// @ts-expect-error — categories are strings
ml.category([1, 2])

// @ts-expect-error — fields must be built with ml.number(), ml.category(), …
ml.features({ age: 3 })
