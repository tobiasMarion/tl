import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FeatureValidationError, ml } from '../../src/index.ts'

const penguins = ml.features({
  species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: ml.number().optional(),
  isAdult: ml.boolean(),
  observedAt: ml.timestamp()
})

const valid = {
  species: 'Adelie',
  billLengthMm: 39.1,
  isAdult: true,
  observedAt: new Date('2007-11-10')
}

const issuesOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof FeatureValidationError)
    return error.issues
  }
  assert.fail('expected a FeatureValidationError')
}

describe('fields', () => {
  test('category keeps the declaration order', () => {
    assert.deepEqual(ml.category(['b', 'a', 'c']).categories, ['b', 'a', 'c'])
  })

  test('category rejects duplicates', () => {
    assert.throws(() => ml.category(['a', 'a']), /'a' more than once/)
  })

  test('optional() returns a new field and keeps the original', () => {
    const required = ml.number()
    const optional = required.optional()
    assert.equal(required.isOptional, false)
    assert.equal(optional.isOptional, true)
  })
})

describe('ml.features', () => {
  test('keeps keys in declaration order', () => {
    assert.deepEqual(penguins.keys, [
      'species',
      'billLengthMm',
      'isAdult',
      'observedAt'
    ])
  })

  test('rejects values that are not fields', () => {
    assert.throws(
      () => ml.features({ age: 3 } as never),
      /'age' is not a field/
    )
  })

  test('infer is type-only', () => {
    assert.throws(() => penguins.infer, /type-only/)
  })
})

describe('parse', () => {
  test('returns the record', () => {
    assert.deepEqual(penguins.parse(valid), valid)
  })

  test('drops undeclared fields', () => {
    assert.deepEqual(penguins.parse({ ...valid, id: 7 }), valid)
  })

  test('treats undefined, null and NaN as missing in optional fields', () => {
    for (const billLengthMm of [undefined, null, Number.NaN]) {
      assert.equal(
        penguins.parse({ ...valid, billLengthMm }).billLengthMm,
        undefined
      )
    }
  })

  test('reports a missing required field with a hint', () => {
    const [issue] = issuesOf(() => penguins.parse({ ...valid, isAdult: null }))
    assert.equal(issue?.code, 'missing')
    assert.match(issue?.message ?? '', /'isAdult' is required.*\.optional\(\)/)
  })

  test('reports the wrong type', () => {
    const [issue] = issuesOf(() =>
      penguins.parse({ ...valid, billLengthMm: '39.1' })
    )
    assert.equal(issue?.code, 'invalid_type')
    assert.match(issue?.message ?? '', /expected a finite number.*'39\.1'/)
  })

  test('rejects Infinity', () => {
    const [issue] = issuesOf(() =>
      penguins.parse({ ...valid, billLengthMm: Number.POSITIVE_INFINITY })
    )
    assert.equal(issue?.code, 'invalid_type')
  })

  test('reports unknown categories with the expected ones', () => {
    const [issue] = issuesOf(() =>
      penguins.parse({ ...valid, species: 'Emperor' })
    )
    assert.equal(issue?.code, 'unknown_category')
    assert.match(
      issue?.message ?? '',
      /'Emperor'.*'Adelie' \| 'Chinstrap' \| 'Gentoo'/
    )
  })

  test('reports invalid dates', () => {
    const [issue] = issuesOf(() =>
      penguins.parse({ ...valid, observedAt: new Date('nope') })
    )
    assert.equal(issue?.code, 'invalid_timestamp')
  })

  test('reports records that are not objects', () => {
    const [issue] = issuesOf(() => penguins.parse([1, 2]))
    assert.equal(issue?.code, 'invalid_record')
  })
})

describe('parseRows', () => {
  test('groups issues by field and code', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      ...valid,
      billLengthMm: index % 10 === 0 ? 'NA' : 40
    }))
    const issues = issuesOf(() => penguins.parseRows(rows))
    assert.equal(issues.length, 1)
    assert.deepEqual(issues[0]?.rows, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90])
    assert.deepEqual(issues[0]?.received, ['NA'])
    assert.match(
      issues[0]?.message ?? '',
      /in 10 rows \(index 0, 10, 20, 30, 40, …\)/
    )
  })

  test('reports every problem at once', () => {
    const issues = issuesOf(() =>
      penguins.parseRows([
        { ...valid, species: 'Emperor' },
        { ...valid, isAdult: 'yes' }
      ])
    )
    assert.deepEqual(
      issues.map(issue => [issue.field, issue.code]),
      [
        ['species', 'unknown_category'],
        ['isAdult', 'invalid_type']
      ]
    )
  })
})

describe('Standard Schema', () => {
  const { validate, vendor, version } = penguins['~standard']

  test('exposes vendor and version', () => {
    assert.equal(vendor, 'tl')
    assert.equal(version, 1)
  })

  test('returns the value on success', () => {
    assert.deepEqual(validate(valid), { value: valid })
  })

  test('returns issues with a path on failure', () => {
    const result = validate({ ...valid, species: 'Emperor' })
    assert.ok('issues' in result && result.issues !== undefined)
    assert.deepEqual(result.issues[0]?.path, ['species'])
  })
})
