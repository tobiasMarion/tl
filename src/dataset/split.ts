import type { InferShape, Shape } from '../features/infer.ts'
import { shuffledIndices } from './random.ts'
import type { Test, Train, Validation } from './roles.ts'

export interface RandomSplitOptions {
  /** Fraction of the rows that goes to the test block, in (0, 1). */
  readonly test: number
  /** Integer seed for the shuffle. The same seed gives the same blocks. */
  readonly seed: number
}

export interface RandomSplitWithValidationOptions extends RandomSplitOptions {
  /** Fraction of the rows that goes to the validation block, in (0, 1). */
  readonly validation: number
}

export interface TrainTest<S extends Shape> {
  readonly train: Train<S>
  readonly test: Test<S>
}

export interface TrainValidationTest<S extends Shape> extends TrainTest<S> {
  readonly validation: Validation<S>
}

// Rounds up, so a small dataset doesn't lose its held-out block to rounding.
// n * fraction carries float error (100 * 0.07 is 7.000000000000001), and a
// plain ceil would turn that into 8. Shrinking by a relative 1e-12 removes the
// error while staying far below 1 for any realistic row count.
export const blockSize = (n: number, fraction: number): number =>
  Math.ceil(n * fraction * (1 - 1e-12))

// The roles are type-only brands, so a frozen { rows } is all a block needs at
// runtime. The casts in randomSplit are the one place where blocks are created.
// The indices come from a permutation of 0..rows.length-1, so rows[i] is never
// undefined.
const block = <S extends Shape>(
  rows: readonly InferShape<S>[],
  indices: readonly number[]
) =>
  Object.freeze({
    rows: Object.freeze(indices.map(i => rows[i] as InferShape<S>))
  })

const MAX_SEED = 0xffffffff

// Quotes strings, so a JavaScript caller passing '0.2' sees why it was rejected.
const show = (value: unknown) =>
  typeof value === 'string' ? `'${value}'` : String(value)

// The typeof check matters: '0.2' > 0 is true, because comparisons coerce
// strings to numbers. The negated comparison also rejects NaN.
const checkFraction = (name: string, value: number) => {
  if (typeof value !== 'number' || !(value > 0 && value < 1)) {
    throw new RangeError(
      `dataset.split(): ${name} must be a fraction between 0 and 1, such as 0.2, received ${show(value)}`
    )
  }
}

// Validates the options at the entry point, so randomSplit can trust them. The
// seed has to be a uint32: seededRandom keeps only 32 bits, so any other number
// would silently become a different seed.
const checkOptions = (
  n: number,
  options: RandomSplitOptions & { readonly validation?: number }
) => {
  if (n === 0) throw new RangeError('dataset.split(): the dataset has no rows')

  checkFraction('test', options.test)
  if (options.validation !== undefined) {
    checkFraction('validation', options.validation)
    if (options.test + options.validation >= 1) {
      throw new RangeError(
        `dataset.split(): test + validation must be less than 1 to leave rows for training, received ${options.test} + ${options.validation}`
      )
    }
  }

  const { seed } = options
  if (!(Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED)) {
    throw new RangeError(
      `dataset.split(): seed must be an integer from 0 to ${MAX_SEED}, such as 42, received ${show(seed)}`
    )
  }

  // Held-out blocks round up, so a small dataset can run out of training rows
  // even when the fractions add up to less than 1.
  const heldOut =
    blockSize(n, options.test) +
    (options.validation === undefined ? 0 : blockSize(n, options.validation))
  if (heldOut >= n) {
    throw new RangeError(
      `dataset.split(): ${n} rows leave no rows for training after holding out ${heldOut}. Use smaller fractions or more rows`
    )
  }
}

// The permutation is cut as [test | validation | train]. Test comes first, so
// asking for a validation block with the same seed and test fraction keeps the
// same test block: validation is taken from what would have been training data.
// Dataset.split narrows the result with overloads; validation is only present
// when it was asked for.
export const randomSplit = <S extends Shape>(
  rows: readonly InferShape<S>[],
  options: RandomSplitOptions & { readonly validation?: number }
): TrainTest<S> | TrainValidationTest<S> => {
  checkOptions(rows.length, options)
  const indices = shuffledIndices(rows.length, options.seed)
  const testEnd = blockSize(rows.length, options.test)
  const test = block(rows, indices.slice(0, testEnd)) as Test<S>

  if (options.validation === undefined) {
    const train = block(rows, indices.slice(testEnd)) as Train<S>
    return Object.freeze({ train, test })
  }

  const validationEnd = testEnd + blockSize(rows.length, options.validation)
  const validation = block(
    rows,
    indices.slice(testEnd, validationEnd)
  ) as Validation<S>
  const train = block(rows, indices.slice(validationEnd)) as Train<S>
  return Object.freeze({ train, validation, test })
}
