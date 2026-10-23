import { ml, type Prepared } from '../../src/index.ts'
import type { Equal, Expect } from './helpers.ts'

const penguinSchema = ml
  .features({
    species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
    billLengthMm: ml.number(),
    bodyMassG: ml.number().optional()
  })
  .target('species')

const penguins = ml.dataset(penguinSchema, [])
const { train, validation, test } = penguins.split({
  validation: 0.2,
  test: 0.2,
  seed: 42
})

const fitted = ml.pipeline(penguinSchema).fit(train)

type PreparedPenguin = {
  species: 'Adelie' | 'Chinstrap' | 'Gentoo'
  billLengthMm: number
  bodyMassG?: number | undefined
}

// A prepared block keeps the role of the block it came from
const preparedTrain = fitted.transform(train)
const preparedValidation = fitted.transform(validation)
const preparedTest = fitted.transform(test)

type _train = Expect<
  Equal<typeof preparedTrain, Prepared<PreparedPenguin, 'train'>>
>
type _validation = Expect<
  Equal<typeof preparedValidation, Prepared<PreparedPenguin, 'validation'>>
>
type _test = Expect<
  Equal<typeof preparedTest, Prepared<PreparedPenguin, 'test'>>
>

// @ts-expect-error — a prepared test block isn't a prepared training block
export const testAsTrain: Prepared<PreparedPenguin, 'train'> =
  fitted.transform(test)

// @ts-expect-error — preprocessing learns only from training data
ml.pipeline(penguinSchema).fit(test)

// @ts-expect-error — preprocessing learns only from training data
ml.pipeline(penguinSchema).fit(validation)

// A pipeline built without a target works too
ml.pipeline(ml.features({ x: ml.number() }))

// @ts-expect-error — the pipeline starts from a schema, not from data
ml.pipeline(penguins)

// @ts-expect-error — the training block must come from the same schema
ml.pipeline(ml.features({ x: ml.number() })).fit(train)
