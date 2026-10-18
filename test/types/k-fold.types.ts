import {
  type Fold,
  type KFold,
  ml,
  type Train,
  type Validation
} from '../../src/index.ts'
import type { Equal, Expect } from './helpers.ts'

const animals = ml.features({
  species: ml.category(['a', 'b']),
  size: ml.orderedCategory(['small', 'large']),
  island: ml.category(['x', 'y']).optional(),
  weight: ml.number()
})
type A = typeof animals.fields
const { train, validation, test } = ml
  .dataset(animals, [])
  .split({ validation: 0.1, test: 0.2, seed: 42 })

// The stratify key is kept as a literal, and no stratify gives never
type _plain = Expect<Equal<ReturnType<typeof ml.kFold<never>>, KFold<never>>>
const byClass = ml.kFold({ k: 5, seed: 42, stratify: 'species' })
type _byClass = Expect<Equal<typeof byClass, KFold<'species'>>>

// Each fold is a training block cut from a dataset and a validation block
const folds = ml.kFold({ k: 5, seed: 42 }).folds(train)
type _folds = Expect<Equal<typeof folds, readonly Fold<A, 'dataset'>[]>>
type _foldTrain = Expect<
  Equal<Fold<A, 'dataset'>['train'], Train<A, 'dataset'>>
>
type _foldValidation = Expect<
  Equal<Fold<A, 'dataset'>['validation'], Validation<A>>
>

byClass.folds(train)
ml.kFold({ k: 5, seed: 42, stratify: 'size' }).folds(train)

// A fold's training block can be cross-validated again
const [fold] = folds
if (fold !== undefined) ml.kFold({ k: 3, seed: 42 }).folds(fold.train)

// @ts-expect-error — k and seed are required decisions
ml.kFold({ k: 5 })

// @ts-expect-error — k and seed are required decisions
ml.kFold({ seed: 42 })

// @ts-expect-error — stratify only accepts category fields
ml.kFold({ k: 5, seed: 42, stratify: 'weight' }).folds(train)

// @ts-expect-error — an optional category would need a decision about missing values
ml.kFold({ k: 5, seed: 42, stratify: 'island' }).folds(train)

// @ts-expect-error — stratify only accepts fields of the schema
ml.kFold({ k: 5, seed: 42, stratify: 'specie' }).folds(train)

// @ts-expect-error — only training data is cross-validated
ml.kFold({ k: 5, seed: 42 }).folds(validation)

// @ts-expect-error — only training data is cross-validated
ml.kFold({ k: 5, seed: 42 }).folds(test)

// @ts-expect-error — the original data has to be split first
ml.kFold({ k: 5, seed: 42 }).folds(ml.dataset(animals, []))

const prices = ml.features({ date: ml.timestamp(), close: ml.number() })
const series = ml
  .series(prices, [], { time: 'date' })
  .split({ testFrom: '2025-01-01', gap: { steps: 1 } })

// @ts-expect-error — k-fold on a series' training block trains on the future
ml.kFold({ k: 5, seed: 42 }).folds(series.train)
