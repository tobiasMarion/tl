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

const penguinSchema = ml.fromSchema(Penguin)

type _record = Expect<
  Equal<
    typeof penguinSchema.infer,
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
    typeof penguinSchema.fields.species,
    CategoryField<'Adelie' | 'Chinstrap' | 'Gentoo'>
  >
>

type _optional = Expect<
  Equal<typeof penguinSchema.fields.billLengthMm, Optional<NumberField>>
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

const observationSchema = ml.fromSchema(Observation, {
  notes: ml.category(['calm', 'agitated']),
  observedAt: ml.timestamp()
})

type _overrides = Expect<
  Equal<
    typeof observationSchema.infer,
    {
      species: 'Adelie' | 'Gentoo'
      notes: 'calm' | 'agitated'
      observedAt: number
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
