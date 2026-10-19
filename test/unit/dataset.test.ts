import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FeatureValidationError, ml } from '../../src/index.ts'

const penguinSchema = ml.features({
  species: ml.category(['Adelie', 'Chinstrap', 'Gentoo']),
  billLengthMm: ml.number().optional()
})

const rows = [
  { species: 'Adelie', billLengthMm: 39.1 },
  { species: 'Gentoo', billLengthMm: null }
]

describe('dataset', () => {
  test('keeps the schema and the parsed records', () => {
    const penguins = ml.dataset(penguinSchema, rows)
    assert.strictEqual(penguins.features, penguinSchema)
    // Parsed, not copied: a missing value comes out as undefined
    assert.deepEqual(penguins.rows, [
      { species: 'Adelie', billLengthMm: 39.1 },
      { species: 'Gentoo', billLengthMm: undefined }
    ])
  })

  test('rejects invalid rows', () => {
    assert.throws(
      () => ml.dataset(penguinSchema, [{ species: 'Emperor' }]),
      FeatureValidationError
    )
  })

  test('starts the error stack at the dataset call', () => {
    try {
      ml.dataset(penguinSchema, [{ species: 'Emperor' }])
    } catch (error) {
      assert.ok(error instanceof FeatureValidationError)
      const frame = error.stack?.split('\n').find(line => /^\s+at /.test(line))
      assert.match(frame ?? '', /dataset\.test\.ts/)
      return
    }
    assert.fail('expected a FeatureValidationError')
  })

  test('freezes the dataset, its rows and each record', () => {
    const penguins = ml.dataset(penguinSchema, rows)
    assert.ok(Object.isFrozen(penguins))
    assert.ok(Object.isFrozen(penguins.rows))
    assert.ok(Object.isFrozen(penguins.rows[0]))
  })

  test("leaves the caller's rows untouched", () => {
    const input = [{ species: 'Adelie', billLengthMm: 39.1 }]
    ml.dataset(penguinSchema, input)
    assert.ok(!Object.isFrozen(input))
    assert.ok(!Object.isFrozen(input[0]))
  })
})
