import { bold, cyan, dim, green, red, useColors, yellow } from '../colors.ts'
import type { AnyField } from './fields.ts'
import type { Shape } from './infer.ts'
import { parseTimestamp } from './timestamp.ts'

export type IssueCode =
  | 'invalid_record'
  | 'missing'
  | 'invalid_type'
  | 'unknown_category'
  | 'invalid_timestamp'
  | 'duplicate_time'

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
  declare readonly issues: readonly FeatureIssue[]

  /** `caller` starts the stack trace there, so Node points at the user's line. */
  constructor(
    issues: readonly FeatureIssue[],
    caller?: (...args: never[]) => unknown
  ) {
    const count =
      issues.length === 1 ? '1 problem' : `${issues.length} problems`
    const title = `Invalid features: ${count} found`
    const lines = issues.map(issue => `  - ${issue.message}`).join('\n')
    super(`${title}\n${lines}`)
    // Non-enumerable: the message already lists the issues, so Node does not
    // dump them again when the error is uncaught.
    Object.defineProperty(this, 'issues', { value: issues, enumerable: false })
    // V8-only, hence the `?.`.
    Error.captureStackTrace?.(this, caller ?? FeatureValidationError)

    // `message` stays plain for logs and tests; only the stack, which Node
    // prints for uncaught errors, gets colors.
    if (useColors && this.stack !== undefined) {
      const frames = this.stack.slice(this.stack.indexOf('\n    at '))
      const colored = issues
        .map(
          issue =>
            `  ${red('✖')} ${coloredMessages.get(issue) ?? issue.message}`
        )
        .join('\n')
      this.stack = `${bold(red(this.name))}: ${bold(title)}\n${colored}${frames}`
    }
  }
}

// ── Checking one value ───────────────────────────────────────────────────────

type Check =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false
      readonly code: Exclude<IssueCode, 'invalid_record' | 'duplicate_time'>
    }

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
    case 'ordered-category':
      if (typeof value !== 'string') return { ok: false, code: 'invalid_type' }
      return field.categories.includes(value)
        ? { ok: true, value }
        : { ok: false, code: 'unknown_category' }
    case 'timestamp':
      return parseTimestamp(value)
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
    case 'ordered-category':
      return `one of ${field.categories.map(formatValue).join(' < ')}`
    case 'timestamp':
      return "a Date, milliseconds since 1970 or an ISO 8601 date such as '2025-01-31'"
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

/** How each part of a message is painted: identity for `message`, ANSI for the terminal. */
interface Paint {
  readonly field: (text: string) => string
  readonly received: (text: string) => string
  readonly expected: (text: string) => string
  readonly hint: (text: string) => string
}

const same = (text: string): string => text
const plain: Paint = { field: same, received: same, expected: same, hint: same }
const terminal: Paint = {
  field: text => bold(cyan(text)),
  received: yellow,
  expected: green,
  hint: dim
}

// The colored version of each message, kept out of the issue objects.
const coloredMessages = new WeakMap<FeatureIssue, string>()

const buildMessage = (
  group: Group,
  shape: Shape,
  indexed: boolean,
  paint: Paint
): string => {
  const where = indexed ? paint.hint(formatRows(group.rows)) : ''
  const samples = group.received
    .map(value => paint.received(formatValue(value)))
    .join(', ')
  const field = group.field === undefined ? undefined : shape[group.field]
  if (group.field === undefined || field === undefined) {
    return `Expected ${paint.expected('a record object')}${where}, received ${samples}`
  }
  const name = paint.field(`'${group.field}'`)
  const expected = paint.expected(describeExpected(field))
  switch (group.code) {
    case 'missing':
      return `${name} is required but missing${where}. ${paint.hint('Mark it with .optional() if missing values are expected')}`
    case 'unknown_category':
      return `${name} received unknown categories${where}: ${samples}. Expected ${expected}`
    case 'invalid_timestamp':
      return `${name} received dates that don't exist${where}: ${samples}`
    default:
      return `${name} expected ${expected}${where}, received ${samples}`
  }
}

// ── Repeated times in a series ───────────────────────────────────────────────

export interface RepeatedTime {
  /** Milliseconds since 1970. */
  readonly time: number
  /** The group value, when the series has a group. */
  readonly group: string | undefined
  /** Indexes of the rows that share this time, in the caller's order. */
  readonly rows: readonly number[]
}

const repeatedTimesMessage = (
  time: string,
  group: string | undefined,
  repeats: readonly RepeatedTime[],
  paint: Paint
): string => {
  const rows = repeats.flatMap(repeat => repeat.rows).toSorted((a, b) => a - b)
  const samples = repeats
    .slice(0, MAX_SAMPLES)
    .map(repeat => {
      const at = paint.received(new Date(repeat.time).toISOString())
      return repeat.group === undefined
        ? at
        : `${at} for ${paint.received(`'${repeat.group}'`)}`
    })
    .join(', ')
  const more = repeats.length > MAX_SAMPLES ? ', …' : ''
  const name = paint.field(`'${time}'`)
  return group === undefined
    ? `${name} repeats times${paint.hint(formatRows(rows))}: ${samples}${more}. ${paint.hint('Each time can appear once. Pass a group if the rows belong to different series')}`
    : `${name} repeats times within the same ${paint.field(`'${group}'`)}${paint.hint(formatRows(rows))}: ${samples}${more}. ${paint.hint('Each time can appear once per series')}`
}

/** One issue for every time that repeats within a series. */
export const repeatedTimesIssue = (
  time: string,
  group: string | undefined,
  repeats: readonly RepeatedTime[]
): FeatureIssue => {
  const issue: FeatureIssue = {
    field: time,
    code: 'duplicate_time',
    rows: repeats.flatMap(repeat => repeat.rows).toSorted((a, b) => a - b),
    received: repeats.slice(0, MAX_SAMPLES).map(repeat => repeat.time),
    message: repeatedTimesMessage(time, group, repeats, plain)
  }
  if (useColors) {
    coloredMessages.set(
      issue,
      repeatedTimesMessage(time, group, repeats, terminal)
    )
  }
  return issue
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

  const issues = [...groups.values()].map(group => {
    const issue: FeatureIssue = {
      field: group.field,
      code: group.code,
      rows: group.rows,
      received: group.received,
      message: buildMessage(group, shape, indexed, plain)
    }
    if (useColors) {
      coloredMessages.set(issue, buildMessage(group, shape, indexed, terminal))
    }
    return issue
  })

  return { values, issues }
}
