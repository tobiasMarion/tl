import type { Features } from '../features/features.ts'
import type {
  AnyField,
  CategoryField,
  OrderedCategoryField
} from '../features/fields.ts'
import type { InferShape, Shape } from '../features/infer.ts'
import { allocate } from './allocate.ts'
import { shuffledIndices } from './random.ts'
import type { Test, Train, Validation } from './roles.ts'

// Keys of the required category and ordered category fields: the ones
// `stratify` accepts. Optional ones are left out: stratifying them would need
// a decision about missing values. Only for the implementation: Dataset.split
// spells the same type out, so hovers and errors show the field names.
export type CategoryKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends CategoryField | OrderedCategoryField ? K : never
}[keyof S] &
  string

// The options are generic in the stratify keys, not in the whole schema, so
// hovers show RandomSplitOptions<"island" | "species">. The types in this file
// are type aliases, not interfaces: see Type quality in docs/principles.md.
export type RandomSplitOptions<K extends string> = {
  /** Fraction of the rows that goes to the test block, in (0, 1). */
  readonly test: number
  /** Integer seed for the shuffle. The same seed gives the same blocks. */
  readonly seed: number
  /**
   * Category field whose proportions every block keeps. Only required category
   * and ordered category fields.
   */
  readonly stratify?: K
}

export type RandomSplitWithValidationOptions<K extends string> =
  RandomSplitOptions<K> & {
    /** Fraction of the rows that goes to the validation block, in (0, 1). */
    readonly validation: number
  }

export type TrainTest<S extends Shape> = {
  readonly train: Train<S>
  readonly test: Test<S>
}

export type TrainValidationTest<S extends Shape> = TrainTest<S> & {
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
const checkOptions = <S extends Shape>(n: number, options: SplitOptions<S>) => {
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

const isStratifiable = (field: AnyField | undefined) =>
  field !== undefined &&
  (field.kind === 'category' || field.kind === 'ordered-category') &&
  !field.isOptional

// The types already reject a wrong field; this covers JavaScript callers and
// casts. A class with fewer rows than blocks can't appear in all of them, so
// its proportion can't be kept.
const checkStratify = <S extends Shape>(
  features: Features<S>,
  rows: readonly InferShape<S>[],
  options: SplitOptions<S>
) => {
  const key: unknown = options.stratify
  if (key === undefined) return

  const fields: Readonly<Record<string, AnyField>> = features.fields
  const field = typeof key === 'string' ? fields[key] : undefined
  if (!isStratifiable(field)) {
    const valid = Object.keys(fields).filter(name =>
      isStratifiable(fields[name])
    )
    throw new TypeError(
      valid.length === 0
        ? `dataset.split(): stratify needs a required category field, and the schema has none, received ${show(key)}`
        : `dataset.split(): stratify must be a required category field, one of ${valid.map(show).join(', ')}, received ${show(key)}`
    )
  }

  const blocks = options.validation === undefined ? 2 : 3
  const counts = new Map<unknown, number>()
  for (const row of rows) {
    const value = (row as Record<string, unknown>)[key as string]
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  for (const [value, count] of counts) {
    if (count < blocks) {
      throw new RangeError(
        `dataset.split(): stratify needs at least ${blocks} rows of each class to put one in every block, but ${show(value)} has ${count}`
      )
    }
  }
}

type SplitOptions<S extends Shape> = RandomSplitOptions<CategoryKeys<S>> & {
  readonly validation?: number
}

type Role = 'train' | 'validation' | 'test'

// Cuts `order` as [test | validation | train], writing each row's role.
const assignRoles = (
  roles: Role[],
  order: readonly number[],
  testSize: number,
  validationSize: number
) => {
  order.forEach((row, position) => {
    roles[row] =
      position < testSize
        ? 'test'
        : position < testSize + validationSize
          ? 'validation'
          : 'train'
  })
}

// Cuts each class on its own, in shuffled order. allocate gives each class its
// share of the test and validation blocks, so the blocks keep the class
// proportions and still have the same sizes as without stratify.
const assignRolesByClass = <S extends Shape>(
  roles: Role[],
  rows: readonly InferShape<S>[],
  shuffled: readonly number[],
  categories: readonly string[],
  key: string,
  testSize: number,
  validationSize: number
) => {
  const classes = categories.map(category =>
    shuffled.filter(i => (rows[i] as Record<string, unknown>)[key] === category)
  )
  const testQuotas = allocate(
    classes.map(order => order.length),
    testSize
  )
  const validationQuotas = allocate(
    classes.map((order, c) => order.length - (testQuotas[c] as number)),
    validationSize
  )
  classes.forEach((order, c) => {
    assignRoles(
      roles,
      order,
      testQuotas[c] as number,
      validationQuotas[c] as number
    )
  })
}

// Test is cut first, so asking for a validation block with the same seed and
// test fraction keeps the same test block: validation is taken from what would
// have been training data. Blocks keep the shuffled order, so rows of the same
// class aren't grouped together. Dataset.split narrows the result with
// overloads; validation is only present when it was asked for.
export const randomSplit = <S extends Shape>(
  features: Features<S>,
  rows: readonly InferShape<S>[],
  options: SplitOptions<S>
): TrainTest<S> | TrainValidationTest<S> => {
  checkOptions(rows.length, options)
  checkStratify(features, rows, options)
  const shuffled = shuffledIndices(rows.length, options.seed)
  const testSize = blockSize(rows.length, options.test)
  const validationSize =
    options.validation === undefined
      ? 0
      : blockSize(rows.length, options.validation)

  const roles: Role[] = []
  if (options.stratify === undefined) {
    assignRoles(roles, shuffled, testSize, validationSize)
  } else {
    // checkStratify made sure the field is a required category
    const field = features.fields[options.stratify] as CategoryField
    assignRolesByClass(
      roles,
      rows,
      shuffled,
      field.categories,
      options.stratify,
      testSize,
      validationSize
    )
  }
  const pick = (role: Role) =>
    block(
      rows,
      shuffled.filter(i => roles[i] === role)
    )

  const test = pick('test') as Test<S>
  const train = pick('train') as Train<S>
  if (options.validation === undefined) return Object.freeze({ train, test })
  const validation = pick('validation') as Validation<S>
  return Object.freeze({ train, validation, test })
}
