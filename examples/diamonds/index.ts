// Regression example with the ggplot2 diamonds dataset: predict the price.
// cut, color and clarity are graded scales, so they are ordered categories.
// Run with: npm run example:diamonds

import { ml } from '../../src/index.ts'
import raw from './data.json' with { type: 'json' }

// Rows as they would come from a CSV parser: untrusted until parsed.
const rows: unknown[] = raw

// ── M1: Feature DSL ──────────────────────────────────────────────────────────

const diamonds = ml.features({
  carat: ml.number(),
  // Each list goes from lowest to highest grade.
  cut: ml.orderedCategory(['Fair', 'Good', 'Very Good', 'Premium', 'Ideal']),
  color: ml.orderedCategory(['J', 'I', 'H', 'G', 'F', 'E', 'D']),
  clarity: ml.orderedCategory([
    'I1',
    'SI2',
    'SI1',
    'VS2',
    'VS1',
    'VVS2',
    'VVS1',
    'IF'
  ]),
  depth: ml.number(),
  table: ml.number(),
  price: ml.number(),
  x: ml.number(),
  y: ml.number(),
  z: ml.number()
})

type Diamond = typeof diamonds.infer

const records: Diamond[] = diamonds.parseRows(rows)
console.log(`${records.length} valid diamonds`)

// ── M2: Dataset and split ────────────────────────────────────────────────────

// const data = ml.dataset(diamonds, rows)
// const { train, test } = data.split({ test: 0.2, seed: 42 })

// ── M3: Preprocessing ────────────────────────────────────────────────────────
// ── M4: Linear regression ────────────────────────────────────────────────────
// ── M5: Pipeline and metrics ─────────────────────────────────────────────────

// Ordered categories become one ranked column each (Fair → 0 … Ideal → 4)
// instead of one-hot columns, so the model sees that Ideal > Premium.

// const model = ml
//   .pipeline(diamonds)
//   .target('price')
//   .encode(['cut', 'color', 'clarity'], { unknown: 'error' })
//   .scale(['carat', 'depth', 'table', 'x', 'y', 'z'])
//   .estimator(ml.linearRegression({ solver: 'normal-equation' }))

// const fitted = model.fit(train)
// console.log(fitted.evaluate(test, [ml.mae, ml.r2]))
