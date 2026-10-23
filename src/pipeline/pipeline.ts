import { bold, dim } from '../colors.ts'
import { describeBlock, printable } from '../dataset/describe.ts'
import {
  keepPosition,
  markRole,
  positionOf,
  type Role,
  type RoleBrand,
  roleOf,
  type Test,
  type Train,
  type Validation
} from '../dataset/roles.ts'
import type { Features, Targeted } from '../features/features.ts'
import type {
  FieldValue,
  OptionalKeys,
  Shape,
  Simplify
} from '../features/infer.ts'
import { columnsOf, describeEncoding } from '../preprocess/encode.ts'
import { type MissingPolicy, missingStep } from '../preprocess/missing.ts'
import type { Context, FittedStep, Row, Step } from '../preprocess/step.ts'

/** A record after preprocessing: the fields in `Pending` may still be missing. */
export type PreparedRow<S extends Shape, Pending extends keyof S> = Simplify<
  { -readonly [K in Exclude<keyof S, Pending>]: FieldValue<S[K]> } & {
    -readonly [K in Pending]?: FieldValue<S[K]> | undefined
  }
>

/**
 * The column names of the matrix: one per field, or `field=category` for each
 * category of a one-hot field. The target and timestamps aren't columns.
 */
export type Columns<S extends Shape, T extends keyof S> = {
  [K in keyof S]: K extends T
    ? never
    : S[K] extends { readonly kind: 'timestamp' }
      ? never
      : S[K] extends {
            readonly kind: 'category'
            readonly categories: readonly (infer C extends string)[]
          }
        ? `${K & string}=${C}`
        : K
}[keyof S] &
  string

/** The numbers an estimator consumes, with the target apart. */
export type Matrix<C extends string, Y> = {
  /** Column names, in the order of each row of `values`. */
  readonly columns: readonly C[]
  /** One row of numbers per record. */
  readonly values: readonly (readonly number[])[]
  /** The target of each record, or undefined for a schema without one. */
  readonly y: Y
}

/** A block after preprocessing. It keeps the role of the block it came from. */
export type Prepared<
  S extends Shape,
  T extends keyof S,
  Pending extends keyof S,
  R extends Role
> = RoleBrand<R> & {
  readonly rows: readonly PreparedRow<S, Pending>[]
  /** Fields that still need a missing-value policy. `matrix()` needs none. */
  readonly pending: readonly Pending[]
  /** The matrix an estimator would get, once no field is pending. */
  matrix(this: { readonly pending: readonly never[] }): Matrix<
    Columns<S, T>,
    [T] extends [never] ? undefined : readonly FieldValue<S[T]>[]
  >
}

// Type aliases, not interfaces: see Type quality in docs/principles.md.
/**
 * Preprocessing for records of a schema. `T` is the target, which no step
 * touches; `Pending` are the fields that still need a missing-value policy.
 */
export type Pipeline<
  S extends Shape,
  T extends keyof S,
  Pending extends keyof S
> = {
  /**
   * Chooses how to fill the missing values of optional fields. Every optional
   * field needs a policy before `matrix()`. Statistics come from the training
   * block, and a policy behaves the same in every block.
   */
  missing<const K extends Pending>(
    // With nothing pending, the mapped type below would be {}, which takes
    // any object: no field accepts a policy then.
    policies: [Pending] extends [never]
      ? { readonly [key: string]: never }
      : {
          readonly [Key in K]: S[Key] extends { readonly kind: 'number' }
            ? 'mean' | 'median' | { readonly constant: number } | 'error'
            : S[Key] extends { readonly kind: 'boolean' }
              ? 'mode' | { readonly constant: boolean } | 'error'
              : S[Key] extends { readonly categories: readonly (infer C)[] }
                ? 'mode' | { readonly constant: C } | 'error'
                : { readonly constant: number } | 'error'
        }
  ): Pipeline<S, T, Exclude<Pending, K>>
  /** Learns every step's state from a training block. */
  fit(train: Train<S>): Fitted<S, T, Pending>
}

/** A pipeline with the state each step learned from a training block. */
export type Fitted<
  S extends Shape,
  T extends keyof S,
  Pending extends keyof S
> = {
  /** Applies the learned state. The prepared block keeps the role of `block`. */
  transform(block: Train<S>): Prepared<S, T, Pending, 'train'>
  transform(block: Validation<S>): Prepared<S, T, Pending, 'validation'>
  transform(block: Test<S>): Prepared<S, T, Pending, 'test'>
}

/** What the builder has declared so far. */
type Config = {
  readonly fields: Shape
  readonly target: string | undefined
  readonly steps: readonly Step[]
  /** Optional fields without a missing-value policy yet. */
  readonly pending: readonly string[]
  /** Ordered categories that `encode` turned into one-hot columns. */
  readonly oneHot: ReadonlySet<string>
}

const quoted = (names: readonly string[]) =>
  names.map(name => `'${name}'`).join(', ')

const describeMatrix = (
  role: Role,
  config: Config,
  rows: readonly Row[],
  matrix: Matrix<string, readonly unknown[] | undefined>
) => {
  const fields: Record<string, { readonly kind: string }> = {}
  for (const column of matrix.columns) fields[column] = { kind: 'number' }
  if (config.target !== undefined) {
    fields[config.target] = config.fields[config.target] ?? { kind: 'number' }
  }
  const records = matrix.values.map((values, i) => {
    const record: Record<string, unknown> = {}
    matrix.columns.forEach((column, c) => {
      record[column] = Number((values[c] as number).toFixed(3))
    })
    if (config.target !== undefined) {
      record[config.target] = matrix.y?.[i]
    }
    return record
  })
  const position = new Map<object, number | undefined>(
    records.map((record, i) => [record, positionOf(rows[i] as object)])
  )
  const count = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`
  const target =
    config.target === undefined ? '' : `, target '${config.target}'`
  return describeBlock({
    role,
    title: `${role} matrix: ${count}, ${matrix.columns.length} columns${target}`,
    fields,
    rows: records,
    position: record => position.get(record)
  })
}

const prepare = (
  config: Config,
  steps: readonly FittedStep[],
  block: { readonly rows: readonly Row[] }
) => {
  const role = roleOf(block)
  if (role === undefined) {
    throw new TypeError('transform() expects a block from split() or folds()')
  }
  const at = block.rows.map(row => positionOf(row))
  const rows = Object.freeze(
    steps.reduce(
      (rows: readonly Row[], step) => step.transform(rows, at),
      block.rows
    )
  )
  rows.forEach((row, i) => {
    keepPosition(block.rows[i] as object, row)
  })

  const matrix = () => {
    if (config.pending.length > 0) {
      throw new TypeError(
        `matrix(): ${quoted(config.pending)} still need a missing-value policy. Add .missing({ ... }) to the pipeline`
      )
    }
    const columns = columnsOf(config.fields, config.target, config.oneHot)
    const { target } = config
    const value: Matrix<string, readonly unknown[] | undefined> = {
      columns: Object.freeze(columns.map(column => column.name)),
      values: Object.freeze(
        rows.map(row => Object.freeze(columns.map(column => column.value(row))))
      ),
      y:
        target === undefined
          ? undefined
          : Object.freeze(rows.map(row => row[target]))
    }
    return printable(value, () => describeMatrix(role, config, rows, value))
  }

  const prepared = printable(
    { rows, pending: Object.freeze([...config.pending]), matrix },
    () =>
      describeBlock({
        role: `prepared ${role}`,
        fields: config.fields,
        rows,
        position: record => positionOf(record)
      })
  )
  return markRole(prepared, role)
}

const describeFitted = (
  config: Config,
  steps: readonly FittedStep[],
  train: readonly Row[]
) => {
  const encoding = describeEncoding(
    config.fields,
    config.target,
    config.oneHot,
    train
  )
  return [
    bold('fitted pipeline'),
    ...steps.map(step => step.describe()),
    ...(encoding.length === 0 ? [] : ['encode', ...encoding]),
    ...(config.pending.length === 0
      ? []
      : [dim(`pending: ${quoted(config.pending)} need a missing-value policy`)])
  ].join('\n')
}

const describePipeline = (config: Config) =>
  [
    bold(
      config.target === undefined
        ? 'pipeline'
        : `pipeline for '${config.target}'`
    ),
    ...config.steps.map(step => `  ${step.label}`),
    ...(config.pending.length === 0
      ? []
      : [dim(`pending: ${quoted(config.pending)} need a missing-value policy`)])
  ].join('\n')

const build = (config: Config): object =>
  printable(
    {
      missing: (policies: Readonly<Record<string, MissingPolicy>>) =>
        build({
          ...config,
          steps: [...config.steps, missingStep(config.fields, policies)],
          pending: config.pending.filter(key => !(key in policies))
        }),
      fit: (train: { readonly rows: readonly Row[] }) => {
        const context: Context = { scales: new Map() }
        const at = train.rows.map(row => positionOf(row))
        let rows = train.rows
        const steps = config.steps.map(step => {
          const fitted = step.fit(rows, at, context)
          rows = fitted.transform(rows, at)
          return fitted
        })
        const learned = rows
        return printable(
          {
            transform: (block: { readonly rows: readonly Row[] }) =>
              prepare(config, steps, block)
          },
          () => describeFitted(config, steps, learned)
        )
      }
    },
    () => describePipeline(config)
  )

/**
 * Starts the preprocessing of records of `schema`. It is built from the
 * schema, never from data: the state of every step comes from `fit`, which
 * only accepts a training block.
 */
export function pipeline<S extends Shape, K extends keyof S & string>(
  schema: Targeted<S, K>
): Pipeline<S, K, OptionalKeys<S>>
export function pipeline<S extends Shape>(
  schema: Features<S>
): Pipeline<S, never, OptionalKeys<S>>
// The steps only see plain records, so the implementation returns the untyped
// builder; the overloads carry the types.
export function pipeline(
  schema: Features<Shape> & { readonly targetKey?: string }
): unknown {
  const { fields } = schema
  return build({
    fields,
    target: schema.targetKey,
    steps: [],
    pending: Object.keys(fields).filter(key => fields[key]?.isOptional),
    oneHot: new Set()
  })
}
