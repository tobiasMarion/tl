import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, test } from 'node:test'
import {
  boolean,
  category,
  number,
  orderedCategory,
  timestamp
} from '../../src/features/fields.ts'
import {
  checkValue,
  FeatureValidationError,
  validateRows
} from '../../src/features/validate.ts'

describe('checkValue', () => {
  test('accepts valid values', () => {
    assert.deepEqual(checkValue(number(), 39.1), { ok: true, value: 39.1 })
    assert.deepEqual(checkValue(boolean(), false), { ok: true, value: false })
    assert.deepEqual(checkValue(category(['a', 'b']), 'b'), {
      ok: true,
      value: 'b'
    })
    // Timestamps come out as milliseconds since 1970
    assert.deepEqual(checkValue(timestamp(), new Date('2007-11-10')), {
      ok: true,
      value: 1194652800000
    })
  })

  test('treats undefined, null and NaN as missing', () => {
    for (const value of [undefined, null, Number.NaN]) {
      assert.deepEqual(checkValue(number().optional(), value), {
        ok: true,
        value: undefined
      })
      assert.deepEqual(checkValue(number(), value), {
        ok: false,
        code: 'missing'
      })
    }
  })

  test('rejects values of the wrong type', () => {
    for (const [field, value] of [
      [number(), '39.1'],
      [number(), Number.POSITIVE_INFINITY],
      [boolean(), 'true'],
      [category(['a']), 1],
      [timestamp(), '10/11/2007'],
      [timestamp(), true]
    ] as const) {
      assert.deepEqual(checkValue(field, value), {
        ok: false,
        code: 'invalid_type'
      })
    }
  })

  test('rejects unknown categories', () => {
    assert.deepEqual(checkValue(category(['a', 'b']), 'c'), {
      ok: false,
      code: 'unknown_category'
    })
  })

  test('checks ordered categories like categories', () => {
    const field = orderedCategory(['low', 'high'])
    assert.deepEqual(checkValue(field, 'low'), { ok: true, value: 'low' })
    assert.deepEqual(checkValue(field, 'mid'), {
      ok: false,
      code: 'unknown_category'
    })
  })

  test('rejects invalid dates', () => {
    for (const value of [new Date('nope'), '2007-02-30']) {
      assert.deepEqual(checkValue(timestamp(), value), {
        ok: false,
        code: 'invalid_timestamp'
      })
    }
  })
})

describe('validateRows', () => {
  const shape = {
    species: category(['Adelie', 'Chinstrap', 'Gentoo']),
    bodyMassG: number(),
    sex: category(['male', 'female']).optional()
  }
  const valid = { species: 'Adelie', bodyMassG: 3750, sex: 'male' }

  test('returns the values and no issues for valid rows', () => {
    const result = validateRows(shape, [valid, { ...valid, sex: null }], {
      indexed: true
    })
    assert.deepEqual(result.issues, [])
    assert.deepEqual(result.values, [valid, { ...valid, sex: undefined }])
  })

  test('drops undeclared fields', () => {
    const result = validateRows(shape, [{ ...valid, id: 7 }], {
      indexed: true
    })
    assert.deepEqual(result.values, [valid])
  })

  test('groups issues by field and code', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      ...valid,
      bodyMassG: index % 10 === 0 ? 'NA' : 3750
    }))
    const { issues } = validateRows(shape, rows, { indexed: true })
    assert.equal(issues.length, 1)
    assert.equal(issues[0]?.field, 'bodyMassG')
    assert.equal(issues[0]?.code, 'invalid_type')
    assert.deepEqual(issues[0]?.rows, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90])
    assert.deepEqual(issues[0]?.received, ['NA'])
  })

  test('keeps at most 3 distinct samples', () => {
    const rows = ['x', 'y', 'x', 'z', 'w'].map(bodyMassG => ({
      ...valid,
      bodyMassG
    }))
    const { issues } = validateRows(shape, rows, { indexed: true })
    assert.deepEqual(issues[0]?.received, ['x', 'y', 'z'])
  })

  test('reports records that are not objects', () => {
    const { issues } = validateRows(shape, [valid, [1, 2], null], {
      indexed: true
    })
    assert.equal(issues.length, 1)
    assert.equal(issues[0]?.code, 'invalid_record')
    assert.deepEqual(issues[0]?.rows, [1, 2])
  })

  test('writes messages that point to the field and the next step', () => {
    const { issues } = validateRows(
      shape,
      [
        valid,
        { species: 'Adelie ', bodyMassG: 'NA', sex: null },
        { species: 'Gentoo', bodyMassG: 'NA' },
        { species: 'Gentoo' }
      ],
      { indexed: true }
    )
    assert.deepEqual(
      issues.map(issue => issue.message),
      [
        "'species' received unknown categories in 1 row (index 1): 'Adelie '. Expected one of 'Adelie' | 'Chinstrap' | 'Gentoo'",
        "'bodyMassG' expected a finite number in 2 rows (index 1, 2), received 'NA'",
        "'bodyMassG' is required but missing in 1 row (index 3). Mark it with .optional() if missing values are expected"
      ]
    )
  })

  test('lists at most 5 row indexes', () => {
    const rows = Array.from({ length: 8 }, () => ({ ...valid, bodyMassG: 'x' }))
    const { issues } = validateRows(shape, rows, { indexed: true })
    assert.match(
      issues[0]?.message ?? '',
      /in 8 rows \(index 0, 1, 2, 3, 4, …\)/
    )
  })

  test('shows the order of ordered categories', () => {
    const { issues } = validateRows(
      { size: orderedCategory(['S', 'M', 'L']) },
      [{ size: 'XL' }],
      { indexed: false }
    )
    assert.equal(
      issues[0]?.message,
      "'size' received unknown categories: 'XL'. Expected one of 'S' < 'M' < 'L'"
    )
  })

  test('omits row indexes when validating a single record', () => {
    const { issues } = validateRows(shape, [{ ...valid, species: 'Emperor' }], {
      indexed: false
    })
    assert.equal(
      issues[0]?.message,
      "'species' received unknown categories: 'Emperor'. Expected one of 'Adelie' | 'Chinstrap' | 'Gentoo'"
    )
  })
})

describe('FeatureValidationError', () => {
  test('lists every issue in the message', () => {
    const { issues } = validateRows(
      { a: number(), b: boolean() },
      [{ a: 'x', b: 'y' }],
      { indexed: false }
    )
    const error = new FeatureValidationError(issues)
    assert.equal(error.name, 'FeatureValidationError')
    assert.equal(error.issues, issues)
    assert.equal(
      error.message,
      "Invalid features: 2 problems found\n  - 'a' expected a finite number, received 'x'\n  - 'b' expected a boolean, received 'y'"
    )
  })

  test('keeps issues out of the enumerable keys', () => {
    const error = new FeatureValidationError([])
    assert.ok(!Object.keys(error).includes('issues'))
    assert.deepEqual(error.issues, [])
  })

  // Colors are decided when the module loads, so each case runs in a child process.
  const throwInChild = (env: Record<string, string>) => {
    const script = `
      import { ml } from ${JSON.stringify(import.meta.resolve('../../src/index.ts'))}
      try {
        ml.features({ a: ml.number() }).parse({ a: 'x' })
      } catch (error) {
        console.log(JSON.stringify({ message: error.message, stack: error.stack }))
      }`
    const { NO_COLOR: _, FORCE_COLOR: __, ...base } = process.env
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', script],
      { env: { ...base, ...env }, encoding: 'utf8' }
    )
    return JSON.parse(child.stdout) as { message: string; stack: string }
  }
  const ANSI = '\u001b['

  test('colors only the stack when colors are on', () => {
    const { message, stack } = throwInChild({ FORCE_COLOR: '1' })
    assert.ok(!message.includes(ANSI))
    assert.ok(stack.includes(ANSI))
  })

  test('NO_COLOR turns colors off', () => {
    const { stack } = throwInChild({ FORCE_COLOR: '1', NO_COLOR: '1' })
    assert.ok(!stack.includes(ANSI))
  })
})
