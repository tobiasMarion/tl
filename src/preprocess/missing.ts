import type { Shape } from '../features/index.ts'
import {
  type Context,
  type FittedStep,
  type Positions,
  type Row,
  rowName,
  type Step,
  show,
  toCurrent
} from './step.ts'

export type MissingPolicy =
  | 'mean'
  | 'median'
  | 'mode'
  | 'error'
  | { readonly constant: unknown }

const isPresent = (value: unknown) => value !== undefined

const mean = (values: readonly number[]) =>
  values.reduce((sum, x) => sum + x, 0) / values.length

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

/** The most frequent value; ties go to the one that comes first in `order`. */
export const mode = (values: readonly unknown[], order: readonly unknown[]) => {
  const counts = new Map<unknown, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: unknown
  let bestCount = 0
  for (const value of order) {
    const count = counts.get(value) ?? 0
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

const label = (policy: MissingPolicy) =>
  typeof policy === 'string' ? policy : 'constant'

const showValue = (value: unknown) =>
  typeof value === 'number'
    ? show(value)
    : typeof value === 'string'
      ? `'${value}'`
      : String(value)

/**
 * The order ties are broken in: declared categories, false before true, or,
 * for a scaled ordered category, its positions after scaling.
 */
const orderOf = (
  fields: Shape,
  key: string,
  context: Context,
  values: readonly unknown[]
): readonly unknown[] => {
  const field = fields[key]
  if (field === undefined) return values
  if (field.kind === 'boolean') return [false, true]
  if ('categories' in field) {
    const scale = context.scales.get(key)
    return scale === undefined
      ? field.categories
      : field.categories.map(c => toCurrent(c, scale, field.categories))
  }
  return values
}

/** Fills missing values with a value learned in fit, or throws for 'error'. */
export const missingStep = (
  fields: Shape,
  policies: Readonly<Record<string, MissingPolicy>>
): Step => ({
  label: `missing  ${Object.entries(policies)
    .map(([key, policy]) => `${key}: ${label(policy)}`)
    .join(', ')}`,
  fit(rows: readonly Row[], _at: Positions, context: Context): FittedStep {
    const fills = new Map<string, unknown>()
    for (const [key, policy] of Object.entries(policies)) {
      if (policy === 'error') continue
      if (typeof policy === 'object') {
        const field = fields[key]
        const categories =
          field !== undefined && 'categories' in field
            ? field.categories
            : undefined
        fills.set(
          key,
          toCurrent(policy.constant, context.scales.get(key), categories)
        )
        continue
      }
      const values = rows.map(row => row[key]).filter(isPresent)
      if (values.length === 0) {
        throw new RangeError(
          `fit(): '${key}' has no values in the training block, so it has no ${policy}`
        )
      }
      fills.set(
        key,
        policy === 'mean'
          ? mean(values as number[])
          : policy === 'median'
            ? median(values as number[])
            : mode(values, orderOf(fields, key, context, values))
      )
    }

    return {
      transform: (rows, at) =>
        rows.map((row, i) => {
          const filled: Record<string, unknown> = { ...row }
          for (const [key, policy] of Object.entries(policies)) {
            if (isPresent(row[key])) continue
            if (policy === 'error') {
              throw new TypeError(
                `'${key}' is missing in ${rowName(at[i])}, and its missing-value policy is 'error'`
              )
            }
            filled[key] = fills.get(key)
          }
          return Object.freeze(filled)
        }),
      describe: () =>
        [
          'missing',
          ...Object.entries(policies).map(([key, policy]) =>
            policy === 'error'
              ? `  ${key}: error when missing`
              : `  ${key}: ${label(policy)} ${showValue(fills.get(key))}`
          )
        ].join('\n')
    }
  }
})
