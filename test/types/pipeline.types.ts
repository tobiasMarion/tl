import { ml, type Prepared } from '../../src/index.ts'
import type { Equal, Expect } from './helpers.ts'

const penguinSchema = ml
  .features({
    species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
    island: ml.category(['Biscoe', 'Dream']),
    billLengthMm: ml.number(),
    bodyCondition: ml.orderedCategory(['poor', 'good']),
    isAdult: ml.boolean(),
    observedAt: ml.timestamp(),
    bodyMassG: ml.number().optional()
  })
  .target('species')
type S = typeof penguinSchema.fields

const penguins = ml.dataset(penguinSchema, [])
const { train, validation, test } = penguins.split({
  validation: 0.2,
  test: 0.2,
  seed: 42
})

const fitted = ml.pipeline(penguinSchema).fit(train)

// ── roles ────────────────────────────────────────────────────────────────────

// A prepared block keeps the role of the block it came from
const preparedTrain = fitted.transform(train)
const preparedValidation = fitted.transform(validation)
const preparedTest = fitted.transform(test)

type _train = Expect<
  Equal<typeof preparedTrain, Prepared<S, 'species', 'bodyMassG', 'train'>>
>
type _validation = Expect<
  Equal<
    typeof preparedValidation,
    Prepared<S, 'species', 'bodyMassG', 'validation'>
  >
>
type _test = Expect<
  Equal<typeof preparedTest, Prepared<S, 'species', 'bodyMassG', 'test'>>
>

// @ts-expect-error — a prepared test block isn't a prepared training block
export const testAsTrain: Prepared<S, 'species', 'bodyMassG', 'train'> =
  preparedTest

// @ts-expect-error — preprocessing learns only from training data
ml.pipeline(penguinSchema).fit(test)

// @ts-expect-error — preprocessing learns only from training data
ml.pipeline(penguinSchema).fit(validation)

// @ts-expect-error — the pipeline starts from a schema, not from data
ml.pipeline(penguins)

// @ts-expect-error — the training block must come from the same schema
ml.pipeline(ml.features({ x: ml.number() })).fit(train)

// ── rows ─────────────────────────────────────────────────────────────────────

type _rows = Expect<
  Equal<
    (typeof preparedTest.rows)[number],
    {
      species: 'Adelie' | 'Chinstrap' | 'Gentoo'
      island: 'Biscoe' | 'Dream'
      billLengthMm: number
      bodyCondition: 'poor' | 'good'
      isAdult: boolean
      observedAt: number
      bodyMassG?: number | undefined
    }
  >
>

// ── matrix ───────────────────────────────────────────────────────────────────

// @ts-expect-error — 'bodyMassG' still needs a missing-value policy
preparedTest.matrix()

const complete = ml
  .features({
    species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
    island: ml.category(['Biscoe', 'Dream']),
    billLengthMm: ml.number(),
    bodyCondition: ml.orderedCategory(['poor', 'good']),
    isAdult: ml.boolean(),
    observedAt: ml.timestamp()
  })
  .target('species')
const completeTrain = ml
  .dataset(complete, [])
  .split({ test: 0.5, seed: 1 }).train
const matrix = ml
  .pipeline(complete)
  .fit(completeTrain)
  .transform(completeTrain)
  .matrix()

// One-hot columns come from the declared categories; the target and
// timestamps aren't columns
type _columns = Expect<
  Equal<
    (typeof matrix.columns)[number],
    | 'island=Biscoe'
    | 'island=Dream'
    | 'billLengthMm'
    | 'bodyCondition'
    | 'isAdult'
  >
>
type _y = Expect<
  Equal<typeof matrix.y, readonly ('Adelie' | 'Chinstrap' | 'Gentoo')[]>
>

// Without a target, there is no y
const pointSchema = ml.features({ x: ml.number() })
const points = ml.dataset(pointSchema, []).split({ test: 0.5, seed: 1 }).train
const unlabeled = ml
  .pipeline(pointSchema)
  .fit(points)
  .transform(points)
  .matrix()
type _noY = Expect<Equal<typeof unlabeled.y, undefined>>
