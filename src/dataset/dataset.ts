import type { Features } from '../features/features.ts'
import type { CategoryField, OrderedCategoryField } from '../features/fields.ts'
import type { InferShape, Shape } from '../features/infer.ts'
import { FeatureValidationError, validateRows } from '../features/validate.ts'
import {
  type CategoryKeys,
  type RandomSplitOptions,
  type RandomSplitWithValidationOptions,
  randomSplit,
  type TrainTest,
  type TrainValidationTest
} from './split.ts'

// A type alias, not an interface: see Type quality in docs/principles.md.
export type Dataset<S extends Shape> = {
  readonly features: Features<S>
  readonly rows: readonly InferShape<S>[]
  // The stratify keys are spelled out instead of written as CategoryKeys<S>:
  // TypeScript keeps an alias name in hovers and errors, so a wrong field would
  // report CategoryKeys<{ ...the whole schema }> instead of the valid fields.
  /**
   * Shuffles the rows with `seed` and holds out a `validation` and a `test`
   * fraction.
   */
  split(
    options: RandomSplitWithValidationOptions<
      {
        [K in keyof S]: S[K] extends CategoryField | OrderedCategoryField
          ? K
          : never
      }[keyof S] &
        string
    >
  ): TrainValidationTest<S>
  /** Shuffles the rows with `seed` and holds out a `test` fraction. */
  split(
    options: RandomSplitOptions<
      {
        [K in keyof S]: S[K] extends CategoryField | OrderedCategoryField
          ? K
          : never
      }[keyof S] &
        string
    >
  ): TrainTest<S>
}

export const dataset = <S extends Shape>(
  features: Features<S>,
  rows: readonly unknown[]
): Dataset<S> => {
  // Same as features.parseRows, but the error stack starts at the dataset()
  // call instead of inside it.
  const { values, issues } = validateRows(features.fields, rows, {
    indexed: true
  })
  if (issues.length > 0) throw new FeatureValidationError(issues, dataset)

  // validateRows builds new records, so freezing them leaves the caller's rows
  // untouched. Dates inside them stay mutable: freeze can't reach their value.
  // The cast is safe for the same reason as in parseRows: values are only
  // returned when every field passed its check.
  const parsed = Object.freeze(
    (values as InferShape<S>[]).map(record => Object.freeze(record))
  )

  // randomSplit returns the union of both results; the cast hands the narrowing
  // to the overloads on Dataset.split, which match what randomSplit returns.
  const split = ((
    options: RandomSplitOptions<CategoryKeys<S>> & {
      readonly validation?: number
    }
  ) => randomSplit<S>(features, parsed, options)) as Dataset<S>['split']

  return Object.freeze({ features, rows: parsed, split })
}
