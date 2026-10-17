import { type Dataset, type Infer, ml, type Train } from '../../src/index.ts'
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
