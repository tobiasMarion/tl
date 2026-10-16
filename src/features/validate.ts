import type { AnyField } from './fields.ts'
import type { Shape } from './infer.ts'

export type IssueCode =
  | 'invalid_record'
  | 'missing'
  | 'invalid_type'
  | 'unknown_category'
  | 'invalid_timestamp'

export interface FeatureIssue {
  /** The field the issue refers to, or `undefined` when the whole record is invalid. */
  readonly field: string | undefined
  readonly code: IssueCode
  readonly message: string
  /** Indexes of the rows with this issue. */
  readonly rows: readonly number[]
  /** A few distinct offending values, for the message. */
  readonly received: readonly unknown[]
}

export class FeatureValidationError extends Error {
  override readonly name = 'FeatureValidationError'
  readonly issues: readonly FeatureIssue[]

  constructor(issues: readonly FeatureIssue[]) {
    const count =
      issues.length === 1 ? '1 problem' : `${issues.length} problems`
    const lines = issues.map(issue => `  - ${issue.message}`).join('\n')
    super(`Invalid features: ${count} found\n${lines}`)
    this.issues = issues
  }
}

// ── Checking one value ───────────────────────────────────────────────────────

type Check =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly code: Exclude<IssueCode, 'invalid_record'> }

const isMissing = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'number' && Number.isNaN(value))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const checkValue = (field: AnyField, value: unknown): Check => {
  if (isMissing(value)) {
    return field.isOptional
      ? { ok: true, value: undefined }
      : { ok: false, code: 'missing' }
  }
  switch (field.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, code: 'invalid_type' }
    case 'boolean':
      return typeof value === 'boolean'
        ? { ok: true, value }
        : { ok: false, code: 'invalid_type' }
    case 'category':
      if (typeof value !== 'string') return { ok: false, code: 'invalid_type' }
      return field.categories.includes(value)
        ? { ok: true, value }
        : { ok: false, code: 'unknown_category' }
    case 'timestamp':
      if (!(value instanceof Date)) return { ok: false, code: 'invalid_type' }
      return Number.isNaN(value.getTime())
        ? { ok: false, code: 'invalid_timestamp' }
        : { ok: true, value }
  }
}

// ── Messages ─────────────────────────────────────────────────────────────────

const MAX_LISTED_ROWS = 5
const MAX_SAMPLES = 3

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return `'${value}'`
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? 'Invalid Date'
      : `Date(${value.toISOString()})`
  }
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'object' && value !== null) return 'an object'
  return String(value)
}

const describeExpected = (field: AnyField): string => {
  switch (field.kind) {
    case 'number':
      return 'a finite number'
    case 'boolean':
      return 'a boolean'
    case 'category':
      return `one of ${field.categories.map(formatValue).join(' | ')}`
    case 'timestamp':
      return 'a Date'
  }
}

const formatRows = (rows: readonly number[]): string => {
  const listed = rows.slice(0, MAX_LISTED_ROWS).join(', ')
  const more = rows.length > MAX_LISTED_ROWS ? ', …' : ''
  const count = rows.length === 1 ? '1 row' : `${rows.length} rows`
  return ` in ${count} (index ${listed}${more})`
}

interface Group {
  readonly field: string | undefined
  readonly code: IssueCode
  readonly rows: number[]
  readonly received: unknown[]
  readonly seen: Set<string>
}

const buildMessage = (group: Group, shape: Shape, indexed: boolean): string => {
  const where = indexed ? formatRows(group.rows) : ''
  const samples = group.received.map(formatValue).join(', ')
  const field = group.field === undefined ? undefined : shape[group.field]
  if (group.field === undefined || field === undefined) {
    return `Expected a record object${where}, received ${samples}`
  }
  const name = `'${group.field}'`
  switch (group.code) {
    case 'missing':
      return `${name} is required but missing${where}. Mark it with .optional() if missing values are expected`
    case 'unknown_category':
      return `${name} received unknown categories${where}: ${samples}. Expected ${describeExpected(field)}`
    case 'invalid_timestamp':
      return `${name} received invalid dates${where}`
    default:
      return `${name} expected ${describeExpected(field)}${where}, received ${samples}`
  }
}

// ── Validating many rows ─────────────────────────────────────────────────────

export interface ValidationResult {
  /** Only meaningful when `issues` is empty. */
  readonly values: Record<string, unknown>[]
  readonly issues: FeatureIssue[]
}

/**
 * Validates every row and groups the issues by field and problem, so a large
 * dataset with one bad column produces one issue, not one per row.
 * Fields not declared in the shape are dropped from the output.
 */
export const validateRows = (
  shape: Shape,
  rows: readonly unknown[],
  { indexed }: { readonly indexed: boolean }
): ValidationResult => {
  const entries = Object.entries(shape)
  const values: Record<string, unknown>[] = []
  const groups = new Map<string, Group>()

  const report = (
    field: string | undefined,
    code: IssueCode,
    row: number,
    value: unknown
  ) => {
    const key = `${field ?? ''}\u0000${code}`
    let group = groups.get(key)
    if (group === undefined) {
      group = { field, code, rows: [], received: [], seen: new Set() }
      groups.set(key, group)
    }
    group.rows.push(row)
    const formatted = formatValue(value)
    if (
      code !== 'missing' &&
      group.received.length < MAX_SAMPLES &&
      !group.seen.has(formatted)
    ) {
      group.seen.add(formatted)
      group.received.push(value)
    }
  }

  rows.forEach((row, index) => {
    if (!isRecord(row)) {
      report(undefined, 'invalid_record', index, row)
      return
    }
    const output: Record<string, unknown> = {}
    for (const [name, field] of entries) {
      const check = checkValue(field, row[name])
      if (check.ok) {
        output[name] = check.value
      } else {
        report(name, check.code, index, row[name])
      }
    }
    values.push(output)
  })

  const issues = [...groups.values()].map(
    (group): FeatureIssue => ({
      field: group.field,
      code: group.code,
      rows: group.rows,
      received: group.received,
      message: buildMessage(group, shape, indexed)
    })
  )

  return { values, issues }
}
