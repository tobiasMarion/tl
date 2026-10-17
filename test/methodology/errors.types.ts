// The errors of docs/methodology.md that don't compile, by ID. Runtime and
// by-design statuses are in errors.test.ts.
import { ml, type Train } from '../../src/index.ts'

const penguins = ml.features({
  species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: ml.number()
})
type P = typeof penguins.fields
const data = ml.dataset(penguins, [])
const { test } = data.split({ test: 0.2, seed: 42 })

const prices = ml.features({ date: ml.timestamp(), close: ml.number() })
const series = ml.series(prices, [], { time: 'date' })

// S1: training on the test block
// @ts-expect-error — a Test isn't a Train
const _s1: Train<P> = test

// S2: splitting the test block again
// @ts-expect-error — only the original data has split
test.split({ test: 0.5, seed: 42 })

// T1: random split of a time series
// @ts-expect-error — a series only splits by time
series.split({ test: 0.2, seed: 42 })

// T4: no gap between train and test
// @ts-expect-error — gap is required, even { steps: 0 }
series.split({ testFrom: '2025-01-01' })

// E1: a split that can't be repeated
// @ts-expect-error — seed is required
data.split({ test: 0.2 })
