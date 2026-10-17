// End-to-end example with the Palmer Penguins dataset.
// It starts fully commented out: uncomment each block as its feature lands.
// Run with: npm run example (or npm run example:bad for a messy dataset)

import { ml } from '../../src/index.ts'
import badData from './bad-data.json' with { type: 'json' }
import goodData from './data.json' with { type: 'json' }

// Rows as they would come from a CSV parser: untrusted until parsed.
const rows: unknown[] = process.argv.includes('--bad') ? badData : goodData

// ── M1: Feature DSL ──────────────────────────────────────────────────────────

const penguins = ml.features({
  species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
  island: ml.category(['Biscoe', 'Dream', 'Torgersen']),
  billLengthMm: ml.number().optional(),
  billDepthMm: ml.number().optional(),
  flipperLengthMm: ml.number().optional(),
  bodyMassG: ml.number().optional(),
  sex: ml.category(['male', 'female']).optional(),
  // Not in the original dataset: a made-up field-assessment score, from lowest
  // to highest, to show ordered categories.
  bodyCondition: ml.orderedCategory(['poor', 'fair', 'good'])
})

type Penguin = typeof penguins.infer

// Validating a single record on its own, for example a form entry. Training
// rows go through ml.dataset below; predict trusts typed input like this one.
const entry: Penguin = penguins.parse({
  species: 'Gentoo',
  island: 'Biscoe',
  billLengthMm: 47.5,
  billDepthMm: null,
  flipperLengthMm: 218,
  bodyMassG: 4950,
  sex: 'male',
  bodyCondition: 'good'
})
console.log(entry)

// ── M2: Dataset and split ────────────────────────────────────────────────────

// The entry point for training rows: validated once, here.
const data = ml.dataset(penguins, rows)
console.log(`${data.rows.length} valid penguins`)

const { train, validation, test } = data.split({
  validation: 0.15,
  test: 0.15,
  seed: 42,
  stratify: 'species'
})
console.log(
  `${train.rows.length} for training, ${validation.rows.length} for validation, ${test.rows.length} for testing`
)

// ── M3: Preprocessing ────────────────────────────────────────────────────────
// ── M5: Pipeline and metrics ─────────────────────────────────────────────────
// ── M6: Second algorithm ─────────────────────────────────────────────────────

// const model = ml
//   .pipeline(penguins)
//   .target('species')
//   .missing({
//     billLengthMm: 'median',
//     billDepthMm: 'median',
//     flipperLengthMm: 'median',
//     bodyMassG: 'median',
//     sex: 'drop'
//   })
//   .encode(['island', 'sex', 'bodyCondition'], { unknown: 'error' })
//   .scale(['billLengthMm', 'billDepthMm', 'flipperLengthMm', 'bodyMassG'])
//   .estimator(ml.knn({ k: 5, distance: 'euclidean' }))

// const fitted = model.fit(train)
// console.log(fitted.evaluate(test, [ml.accuracy, ml.confusionMatrix]))

// console.log(
//   fitted.predict({
//     island: 'Biscoe',
//     billLengthMm: 47.5,
//     billDepthMm: 15.0,
//     flipperLengthMm: 218,
//     bodyMassG: 4950,
//     sex: 'male'
//   })
// )
