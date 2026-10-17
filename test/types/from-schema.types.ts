import { z } from 'zod'
import {
  type CategoryField,
  ml,
  type NumberField,
  type Optional
} from '../../src/index.ts'
import type { Equal, Expect } from './helpers.ts'

const Penguin = z.object({
  species: z.enum(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: z.number().optional(),
  flipperLengthMm: z.number().nullable(),
  isAdult: z.boolean()
})

const penguins = ml.fromSchema(Penguin)

type _record = Expect<
  Equal<
    typeof penguins.infer,
    {
      species: 'Adelie' | 'Chinstrap' | 'Gentoo'
      isAdult: boolean
      billLengthMm?: number | undefined
      flipperLengthMm?: number | undefined
    }
  >
>

type _species = Expect<
  Equal<
    typeof penguins.fields.species,
    CategoryField<'Adelie' | 'Chinstrap' | 'Gentoo'>
  >
>

type _optional = Expect<
  Equal<typeof penguins.fields.billLengthMm, Optional<NumberField>>
>

const Observation = z.object({
  species: z.enum(['Adelie', 'Gentoo']),
  notes: z.string(),
  observedAt: z.date()
})

// @ts-expect-error — notes and observedAt need overrides
ml.fromSchema(Observation)

// @ts-expect-error — observedAt still needs an override
ml.fromSchema(Observation, { notes: ml.category(['calm']) })

const observations = ml.fromSchema(Observation, {
  notes: ml.category(['calm', 'agitated']),
  observedAt: ml.timestamp()
})

type _overrides = Expect<
  Equal<
    typeof observations.infer,
    {
      species: 'Adelie' | 'Gentoo'
      notes: 'calm' | 'agitated'
      observedAt: Date
    }
  >
>

// @ts-expect-error — weight is not a field of the schema
ml.fromSchema(Penguin, { weight: ml.number() })

ml.fromSchema(Observation, {
  notes: ml.category(['calm']),
  observedAt: ml.timestamp(),
  // @ts-expect-error — weight is not a field of the schema
  weight: ml.number()
})

// Overriding a field that maps automatically is still allowed
ml.fromSchema(Penguin, { isAdult: ml.category(['yes', 'no']) })
