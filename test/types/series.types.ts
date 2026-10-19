import {
  type Infer,
  ml,
  type Series,
  type Train,
  type TrainTest,
  type TrainValidationTest
} from '../../src/index.ts'
import type { Equal, Expect } from './helpers.ts'

const priceSchema = ml.features({
  date: ml.timestamp(),
  ticker: ml.category(['AAPL', 'MSFT']),
  sector: ml.orderedCategory(['low', 'high']),
  close: ml.number(),
  seen: ml.timestamp().optional()
})
type P = typeof priceSchema.fields

const prices = ml.series(priceSchema, [], { time: 'date', group: 'ticker' })

// Rows come out typed by the schema, timestamps as milliseconds
type _series = Expect<Equal<typeof prices, Series<P>>>
type _rows = Expect<
  Equal<typeof prices.rows, readonly Infer<typeof priceSchema>[]>
>
type _date = Expect<Equal<(typeof prices.rows)[number]['date'], number>>

// The time and group keys are typed by kind
type _time = Expect<Equal<typeof prices.time, 'date'>>
type _group = Expect<Equal<typeof prices.group, 'ticker' | undefined>>

ml.series(priceSchema, [], { time: 'date' })

// @ts-expect-error — time must be a timestamp field
ml.series(priceSchema, [], { time: 'close' })

// @ts-expect-error — an optional timestamp would leave rows without a place
ml.series(priceSchema, [], { time: 'seen' })

// @ts-expect-error — group must be a category field
ml.series(priceSchema, [], { time: 'date', group: 'sector' })

// @ts-expect-error — time is required
ml.series(priceSchema, [], { group: 'ticker' })

// @ts-expect-error — a random split leaks the future into training
prices.split({ test: 0.2, seed: 42 })

// @ts-expect-error — a series isn't a dataset
const _dataset: ReturnType<typeof ml.dataset<P>> = prices

// A chronological split gives the same blocks as a random one, with the
// training block marked as cut from a series
const twoWay = prices.split({ testFrom: '2025-01-01', gap: { steps: 1 } })
type _twoWay = Expect<Equal<typeof twoWay, TrainTest<P, 'series'>>>
const threeWay = prices.split({
  validationFrom: new Date('2024-07-01'),
  testFrom: Date.parse('2025-01-01'),
  gap: { hours: 36 }
})
type _threeWay = Expect<
  Equal<typeof threeWay, TrainValidationTest<P, 'series'>>
>

// @ts-expect-error — the gap has to be written down, even when it is 0
prices.split({ testFrom: '2025-01-01' })

// @ts-expect-error — the gap needs a unit: { steps } or { duration }
prices.split({ testFrom: '2025-01-01', gap: 1 })

// @ts-expect-error — the gap needs a unit
prices.split({ testFrom: '2025-01-01', gap: {} })

// @ts-expect-error — one unit at a time: { hours: 36 }
prices.split({ testFrom: '2025-01-01', gap: { days: 1, hours: 12 } })

// @ts-expect-error — steps don't mix with durations
prices.split({ testFrom: '2025-01-01', gap: { steps: 1, days: 5 } })

// @ts-expect-error — a typo in the unit doesn't compile
prices.split({ testFrom: '2025-01-01', gap: { dayz: 5 } })

// Months and years follow the calendar
prices.split({ testFrom: '2025-01-01', gap: { months: 1 } })
prices.split({ testFrom: '2025-01-01', gap: { years: 1 } })

// @ts-expect-error — validation only exists when it was asked for
twoWay.validation

// @ts-expect-error — roles are assigned once: a block can't be split again
twoWay.train.split({ testFrom: '2025-01-01', gap: { steps: 1 } })

// @ts-expect-error — the training block of a series isn't from a dataset
const _datasetTrain: Train<P, 'dataset'> = twoWay.train
