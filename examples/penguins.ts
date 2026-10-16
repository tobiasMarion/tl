// End-to-end example with the Palmer Penguins dataset.
// It starts fully commented out: uncomment each block as its feature lands.
// Run with: npm run example

// import { ml } from '../src/index.ts'

// A few rows of the dataset, as they would come from a CSV parser.
// const rows: unknown[] = [
//   { species: 'Adelie', island: 'Torgersen', billLengthMm: 39.1, billDepthMm: 18.7, flipperLengthMm: 181, bodyMassG: 3750, sex: 'male' },
//   { species: 'Adelie', island: 'Torgersen', billLengthMm: 39.5, billDepthMm: 17.4, flipperLengthMm: 186, bodyMassG: 3800, sex: 'female' },
//   { species: 'Adelie', island: 'Torgersen', billLengthMm: 40.3, billDepthMm: 18.0, flipperLengthMm: 195, bodyMassG: 3250, sex: 'female' },
//   { species: 'Adelie', island: 'Torgersen', billLengthMm: null, billDepthMm: null, flipperLengthMm: null, bodyMassG: null, sex: null },
//   { species: 'Adelie', island: 'Torgersen', billLengthMm: 36.7, billDepthMm: 19.3, flipperLengthMm: 193, bodyMassG: 3450, sex: 'female' },
//   { species: 'Chinstrap', island: 'Dream', billLengthMm: 46.5, billDepthMm: 17.9, flipperLengthMm: 192, bodyMassG: 3500, sex: 'female' },
//   { species: 'Chinstrap', island: 'Dream', billLengthMm: 50.0, billDepthMm: 19.5, flipperLengthMm: 196, bodyMassG: 3900, sex: 'male' },
//   { species: 'Gentoo', island: 'Biscoe', billLengthMm: 46.1, billDepthMm: 13.2, flipperLengthMm: 211, bodyMassG: 4500, sex: 'female' },
//   { species: 'Gentoo', island: 'Biscoe', billLengthMm: 50.0, billDepthMm: 16.3, flipperLengthMm: 230, bodyMassG: 5700, sex: 'male' }
// ]

// ── M1: Feature DSL ──────────────────────────────────────────────────────────

// const penguins = ml.features({
//   species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
//   island: ml.category(['Biscoe', 'Dream', 'Torgersen']),
//   billLengthMm: ml.number().optional(),
//   billDepthMm: ml.number().optional(),
//   flipperLengthMm: ml.number().optional(),
//   bodyMassG: ml.number().optional(),
//   sex: ml.category(['male', 'female']).optional()
// })

// type Penguin = typeof penguins.infer

// const records: Penguin[] = penguins.parseRows(rows)
// console.log(`${records.length} valid penguins`)

// ── M2: Dataset and split ────────────────────────────────────────────────────

// const data = ml.dataset(penguins, rows)
// const { train, test } = data.split({ test: 0.2, seed: 42, stratify: 'species' })

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
//   .encode(['island', 'sex'], { unknown: 'error' })
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

export {}
