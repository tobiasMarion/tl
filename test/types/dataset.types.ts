import {
  type Dataset,
  type Infer,
  ml,
  type Test,
  type Train,
  type TrainTest,
  type TrainValidationTest,
  type Validation
} from '../../src/index.ts'
import type { Equal, Expect } from './helpers.ts'

const penguins = ml.features({
  species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: ml.number().optional()
})
type Penguin = Infer<typeof penguins>
type P = typeof penguins.fields

const data = ml.dataset(penguins, [])

// Rows come out typed by the schema
type _dataset = Expect<Equal<typeof data, Dataset<P>>>
type _rows = Expect<Equal<typeof data.rows, readonly Penguin[]>>

// @ts-expect-error — the original data has to be split before training
const _train: Train<P> = data

// A random split of the original data gives a train and a test block
const split = data.split({ test: 0.2, seed: 42 })
type _split = Expect<Equal<typeof split, TrainTest<P, 'dataset'>>>
type _trainBlock = Expect<Equal<typeof split.train, Train<P, 'dataset'>>>
type _testBlock = Expect<Equal<typeof split.test, Test<P>>>

// A training block of either origin is still a training block
const _anyTrain: Train<P> = split.train

// @ts-expect-error — it was cut from a dataset, not a series
const _seriesTrain: Train<P, 'series'> = split.train

// @ts-expect-error — the test block can't be used for training
const _testAsTrain: Train<P> = split.test

// @ts-expect-error — test size and seed are required decisions
data.split({ test: 0.2 })

// @ts-expect-error — test size and seed are required decisions
data.split({ seed: 42 })

// Asking for a validation fraction adds a validation block
const threeWay = data.split({ validation: 0.15, test: 0.15, seed: 42 })
type _threeWay = Expect<
  Equal<typeof threeWay, TrainValidationTest<P, 'dataset'>>
>
type _validationBlock = Expect<Equal<typeof threeWay.validation, Validation<P>>>

// @ts-expect-error — validation only exists when it was asked for
split.validation

// @ts-expect-error — a typo in an option doesn't compile
data.split({ valdation: 0.15, test: 0.15, seed: 42 })

// @ts-expect-error — validation and test aren't interchangeable
const _validationAsTest: Test<P> = threeWay.validation

// @ts-expect-error — roles are assigned once: a block can't be split again
split.train.split({ test: 0.2, seed: 42 })

// @ts-expect-error — roles are assigned once: a block can't be split again
split.test.split({ test: 0.2, seed: 42 })

// stratify accepts required category and ordered category fields
const animals = ml.features({
  species: ml.category(['a', 'b']),
  size: ml.orderedCategory(['small', 'large']),
  island: ml.category(['x', 'y']).optional(),
  weight: ml.number()
})
const zoo = ml.dataset(animals, [])
zoo.split({ test: 0.2, seed: 42, stratify: 'species' })
zoo.split({ test: 0.2, seed: 42, stratify: 'size' })
zoo.split({ validation: 0.1, test: 0.2, seed: 42, stratify: 'species' })

// @ts-expect-error — stratify only accepts category fields
zoo.split({ test: 0.2, seed: 42, stratify: 'weight' })

// @ts-expect-error — an optional category would need a decision about missing values
zoo.split({ test: 0.2, seed: 42, stratify: 'island' })

// @ts-expect-error — stratify only accepts fields of the schema
zoo.split({ test: 0.2, seed: 42, stratify: 'specie' })
