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

// The permutation is cut as [test | validation | train]. Test comes first, so
// asking for a validation block with the same seed and test fraction keeps the
// same test block: validation is taken from what would have been training data.
// Dataset.split narrows the result with overloads; validation is only present
// when it was asked for.
export const randomSplit = <S extends Shape>(
  rows: readonly InferShape<S>[],
  options: RandomSplitOptions & { readonly validation?: number }
): TrainTest<S> | TrainValidationTest<S> => {
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
