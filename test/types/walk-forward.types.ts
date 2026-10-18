import { type Fold, ml, type Train, type WalkForward } from '../../src/index.ts'
import type { Equal, Expect } from './helpers.ts'

const prices = ml.features({ date: ml.timestamp(), close: ml.number() })
type P = typeof prices.fields
const { train, validation, test } = ml
  .series(prices, [], { time: 'date' })
  .split({
    validationFrom: '2024-07-01',
    testFrom: '2025-01-01',
    gap: { steps: 1 }
  })

const cv = ml.walkForward({
  validationFrom: '2024-04-01',
  validation: { months: 1 },
  train: { months: 3 },
  gap: { days: 5 }
})
type _cv = Expect<Equal<typeof cv, WalkForward>>

// Each fold is a training block cut from a series and a validation block
const folds = cv.folds(train)
type _folds = Expect<Equal<typeof folds, readonly Fold<P, 'series'>[]>>
type _foldTrain = Expect<Equal<Fold<P, 'series'>['train'], Train<P, 'series'>>>

// Every period takes the units of gap
ml.walkForward({
  validationFrom: new Date('2024-04-01'),
  validation: { steps: 21 },
  train: 'expanding',
  gap: { steps: 0 }
})

// A fold's training block can be cross-validated again
const [fold] = folds
if (fold !== undefined) cv.folds(fold.train)

// @ts-expect-error — the gap is required, even { steps: 0 }
ml.walkForward({
  validationFrom: 0,
  validation: { months: 1 },
  train: 'expanding'
})

ml.walkForward({
  validationFrom: 0,
  // @ts-expect-error — one unit per period
  validation: { months: 1, days: 15 },
  train: 'expanding',
  gap: { steps: 0 }
})

ml.walkForward({
  validationFrom: 0,
  validation: { months: 1 },
  // @ts-expect-error — the window is 'expanding' or a period
  train: 'rolling',
  gap: { steps: 0 }
})

// @ts-expect-error — only training data is cross-validated
cv.folds(validation)

// @ts-expect-error — only training data is cross-validated
cv.folds(test)

const { train: tabular } = ml.dataset(prices, []).split({ test: 0.2, seed: 42 })

// @ts-expect-error — walk-forward needs time order: a dataset has none
cv.folds(tabular)
