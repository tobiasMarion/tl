import type {
  AnyField,
  CategoryField,
  OrderedCategoryField
} from '../features/fields.ts'
import type { InferShape, Shape } from '../features/infer.ts'
import { describeKFold, printable } from './describe.ts'
import { isSeed, MAX_SEED, shuffledIndices } from './random.ts'
import {
  type Fold,
  fold,
  type Train,
  trainBlock,
  validationBlock
} from './roles.ts'
import { isStratifiable } from './split.ts'

// Type aliases, not interfaces: see Type quality in docs/principles.md.
// Generic in the stratify key, not in the schema: ml.kFold is called before
// it meets a training block. The key is checked against the schema in folds.
export type KFoldOptions<K extends string> = {
  /** Number of folds, an integer >= 2. Every row is held out in one of them. */
  readonly k: number
  /** Integer seed for the shuffle. The same seed gives the same folds. */
  readonly seed: number
  /**
   * Category field whose proportions every fold keeps. Only required category
   * and ordered category fields of the training block.
   */
  readonly stratify?: K
}

export type KFold<K extends string> = {
  readonly k: number
  readonly seed: number
  readonly stratify: K | undefined
  // The this parameter checks the stratify key against the training block's
  // schema, so a wrong key reports `Type '"x"' is not assignable to type
  // '"island" | "species"'`. The keys are spelled out for the same reason as
  // in Dataset.split.
  /**
   * Cuts a training block into `k` folds. Each row is held out in exactly one
   * of them, and trains in the others.
   */
  folds<S extends Shape>(
    this: KFold<
      {
        [F in keyof S]: S[F] extends CategoryField | OrderedCategoryField
          ? F
          : never
      }[keyof S] &
        string
    >,
    train: Train<S, 'dataset'>
  ): readonly Fold<S, 'dataset'>[]
}

// Quotes strings, so a JavaScript caller passing '5' sees why it was rejected.
const show = (value: unknown) =>
  typeof value === 'string' ? `'${value}'` : String(value)

// The types already reject a wrong key; this covers JavaScript callers and
// casts. A class with fewer rows than folds can't appear in all of them, so
// its proportion can't be kept.
const checkStratify = <S extends Shape>(
  train: Train<S, 'dataset'>,
  key: string,
  k: number
) => {
  const fields: Readonly<Record<string, AnyField>> = train.features.fields
  if (!isStratifiable(fields[key])) {
    const valid = Object.keys(fields).filter(name =>
      isStratifiable(fields[name])
    )
    throw new TypeError(
      valid.length === 0
        ? `kFold.folds(): stratify needs a required category field, and the schema has none, received ${show(key)}`
        : `kFold.folds(): stratify must be a required category field, one of ${valid.map(show).join(', ')}, received ${show(key)}`
    )
  }
  const counts = new Map<unknown, number>()
  for (const row of train.rows) {
    const value = (row as Record<string, unknown>)[key]
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  for (const [value, count] of counts) {
    if (count < k) {
      throw new RangeError(
        `kFold.folds(): stratify needs at least ${k} rows of each class to put one in every fold, but ${show(value)} has ${count}`
      )
    }
  }
}

// Deals the shuffled rows to the folds like cards: position p goes to fold
// p % k, so fold sizes differ by at most one. With stratify, the shuffled rows
// are first grouped by class, so each class is dealt in turn and every fold
// gets its share of each class, give or take one row.
const assignFolds = <S extends Shape>(
  train: Train<S, 'dataset'>,
  k: number,
  seed: number,
  key: string | undefined
): number[] => {
  const shuffled = shuffledIndices(train.rows.length, seed)
  let order = shuffled
  if (key !== undefined) {
    // checkStratify made sure the field is a required category
    const field = train.features.fields[key] as CategoryField
    const rank = new Map(field.categories.map((category, i) => [category, i]))
    const rankOf = (i: number) =>
      rank.get(
        (train.rows[i] as Record<string, string>)[key] as string
      ) as number
    // Sort is stable, so rows of the same class keep the shuffled order
    order = shuffled.toSorted((a, b) => rankOf(a) - rankOf(b))
  }
  const fold: number[] = []
  order.forEach((row, position) => {
    fold[row] = position % k
  })
  return fold
}

/**
 * K-fold cross-validation of a training block cut from a dataset. Shuffles
 * the rows with `seed` and cuts them into `k` folds; each fold is held out
 * once while the others train.
 */
export const kFold = <K extends string = never>(
  options: KFoldOptions<K>
): KFold<K> => {
  const { k, seed, stratify } = options
  if (!(Number.isInteger(k) && k >= 2)) {
    throw new RangeError(
      `ml.kFold(): k must be an integer of at least 2, such as 5, received ${show(k)}`
    )
  }
  if (!isSeed(seed)) {
    throw new RangeError(
      `ml.kFold(): seed must be an integer from 0 to ${MAX_SEED}, such as 42, received ${show(seed)}`
    )
  }
  if (stratify !== undefined && typeof stratify !== 'string') {
    throw new TypeError(
      `ml.kFold(): stratify must be the name of a category field, received ${show(stratify)}`
    )
  }

  // folds reads the options from the closure, not from this: the this
  // parameter only exists for the type check.
  const folds = <S extends Shape>(train: Train<S, 'dataset'>) => {
    const n = train.rows.length
    if (n < k) {
      throw new RangeError(
        `kFold.folds(): ${k} folds need at least ${k} rows, and the training block has ${n}`
      )
    }
    if (stratify !== undefined) checkStratify(train, stratify, k)
    const assigned = assignFolds(train, k, seed, stratify)

    // Both blocks keep the order of the training block. It was shuffled by
    // the split, so rows of the same class aren't grouped together.
    const rows = (f: number, held: boolean) =>
      train.rows.filter(
        (_, i) => (assigned[i] === f) === held
      ) as InferShape<S>[]
    const result = Array.from({ length: k }, (_, f) =>
      fold(
        trainBlock<S, 'dataset'>(train.features, rows(f, false)),
        validationBlock(train.features, rows(f, true)),
        f,
        k
      )
    )
    return printable(result, () =>
      describeKFold({
        k,
        seed,
        stratify,
        rows: train.rows.length,
        fold: assigned,
        classes:
          stratify === undefined
            ? undefined
            : train.rows.map(
                row => (row as Record<string, string>)[stratify] as string
              )
      })
    )
  }

  return Object.freeze({ k, seed, stratify, folds }) as KFold<K>
}
