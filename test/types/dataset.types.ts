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
type _split = Expect<Equal<typeof split, TrainTest<P>>>
type _trainBlock = Expect<Equal<typeof split.train, Train<P>>>
type _testBlock = Expect<Equal<typeof split.test, Test<P>>>

// @ts-expect-error — the test block can't be used for training
const _testAsTrain: Train<P> = split.test

// @ts-expect-error — test size and seed are required decisions
data.split({ test: 0.2 })

// @ts-expect-error — test size and seed are required decisions
data.split({ seed: 42 })

// Asking for a validation fraction adds a validation block
const threeWay = data.split({ validation: 0.15, test: 0.15, seed: 42 })
type _threeWay = Expect<Equal<typeof threeWay, TrainValidationTest<P>>>
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
