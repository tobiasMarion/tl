import { bold } from '../colors.ts'
import { printable } from '../dataset/describe.ts'
import {
  type Prepared,
  preparedBlock,
  roleOf,
  type Test,
  type Train,
  type Validation
} from '../dataset/roles.ts'
import type { Features } from '../features/features.ts'
import type {
  FieldValue,
  OptionalKeys,
  Shape,
  Simplify
} from '../features/infer.ts'

export type Row = Readonly<Record<string, unknown>>

/**
 * One step of the builder. `fit` learns from the rows it is given, which are
 * the output of the steps before it, and returns what applies that state.
 */
export type Step = {
  fit(rows: readonly Row[]): FittedStep
}

export type FittedStep = {
  /** Returns one new record per record given, in the same order. */
  transform(rows: readonly Row[]): Row[]
  /** The learned state, for printing. */
  describe(): string
}

/** A record after preprocessing: the fields in `Pending` may still be missing. */
export type PreparedRow<S extends Shape, Pending extends keyof S> = Simplify<
  { -readonly [K in Exclude<keyof S, Pending>]: FieldValue<S[K]> } & {
    -readonly [K in Pending]?: FieldValue<S[K]> | undefined
  }
>

// Type aliases, not interfaces: see Type quality in docs/principles.md.
/** Preprocessing for records of a schema. `Pending` are the fields that still need a decision. */
export type Pipeline<S extends Shape, Pending extends keyof S> = {
  /** Learns every step's state from a training block. */
  fit(train: Train<S>): Fitted<S, Pending>
}

/** A pipeline with the state each step learned from a training block. */
export type Fitted<S extends Shape, Pending extends keyof S> = {
  /** Applies the learned state. The prepared block keeps the role of `block`. */
  transform(block: Train<S>): Prepared<PreparedRow<S, Pending>, 'train'>
  transform(
    block: Validation<S>
  ): Prepared<PreparedRow<S, Pending>, 'validation'>
  transform(block: Test<S>): Prepared<PreparedRow<S, Pending>, 'test'>
}

const fitted = (fields: Shape, steps: readonly FittedStep[]) =>
  printable(
    {
      transform: (block: { readonly rows: readonly Row[] }) => {
        const role = roleOf(block)
        if (role === undefined) {
          throw new TypeError(
            'transform() expects a block from split() or folds()'
          )
        }
        const rows = steps.reduce(
          (rows: readonly Row[], step) => step.transform(rows),
          block.rows
        )
        return preparedBlock(block, role, fields, [...rows])
      }
    },
    () =>
      [
        bold(
          `fitted pipeline: ${steps.length === 0 ? 'no steps' : `${steps.length} steps`}`
        ),
        ...steps.map(step => step.describe())
      ].join('\n')
  )

const build = (fields: Shape, steps: readonly Step[]) =>
  Object.freeze({
    fit: (train: { readonly rows: readonly Row[] }) => {
      let rows = train.rows
      const learned = steps.map(step => {
        const state = step.fit(rows)
        rows = state.transform(rows)
        return state
      })
      return fitted(fields, learned)
    }
  })

/**
 * Starts the preprocessing of records of `schema`. It is built from the
 * schema, never from data: the state of every step comes from `fit`, which
 * only accepts a training block.
 */
export const pipeline = <S extends Shape>(
  schema: Features<S>
): Pipeline<S, OptionalKeys<S>> =>
  // The steps only see plain records; the types live on Pipeline.
  build(schema.fields, []) as unknown as Pipeline<S, OptionalKeys<S>>
