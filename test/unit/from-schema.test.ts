import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { z } from 'zod'
import { FeatureValidationError, ml } from '../../src/index.ts'

const Penguin = z.object({
  species: z.enum(['Adelie', 'Chinstrap', 'Gentoo']),
  island: z.enum(['Biscoe', 'Dream', 'Torgersen']),
  billLengthMm: z.number().optional(),
  flipperLengthMm: z.number().int().nullable(),
  isAdult: z.boolean(),
  colony: z.literal('Palmer')
})

describe('ml.fromSchema with Zod', () => {
  const penguinSchema = ml.fromSchema(Penguin)

  test('maps every field', () => {
    const { fields } = penguinSchema
    assert.equal(fields.species.kind, 'category')
    assert.deepEqual(fields.species.categories, [
      'Adelie',
      'Chinstrap',
      'Gentoo'
    ])
    assert.equal(fields.billLengthMm.kind, 'number')
    assert.equal(fields.flipperLengthMm.kind, 'number')
    assert.equal(fields.isAdult.kind, 'boolean')
    assert.deepEqual(fields.colony.categories, ['Palmer'])
  })

  test('keeps the order of the Zod object', () => {
    assert.deepEqual(penguinSchema.keys, [
      'species',
      'island',
      'billLengthMm',
      'flipperLengthMm',
      'isAdult',
      'colony'
    ])
  })

  test('marks optional and nullable fields as optional', () => {
    const { fields } = penguinSchema
    assert.equal(fields.billLengthMm.isOptional, true)
    assert.equal(fields.flipperLengthMm.isOptional, true)
    assert.equal(fields.species.isOptional, false)
  })

  test('validates with the TL rules', () => {
    assert.throws(
      () =>
        penguinSchema.parse({
          species: 'Emperor',
          island: 'Dream',
          flipperLengthMm: null,
          isAdult: true,
          colony: 'Palmer'
        }),
      FeatureValidationError
    )
  })

  test('requires overrides for fields that cannot be mapped', () => {
    const Observation = z.object({
      species: z.enum(['Adelie', 'Gentoo']),
      notes: z.string(),
      observedAt: z.date()
    })
    assert.throws(() => ml.fromSchema(Observation, {} as never), {
      name: 'TypeError',
      message: /can't map 'notes', 'observedAt' automatically/
    })

    const observationSchema = ml.fromSchema(Observation, {
      notes: ml.category(['calm', 'agitated']),
      observedAt: ml.timestamp()
    })
    assert.equal(observationSchema.fields.notes.kind, 'category')
    assert.equal(observationSchema.fields.observedAt.kind, 'timestamp')
  })

  test('lets overrides replace mapped fields', () => {
    const penguinSchema = ml.fromSchema(Penguin, {
      species: ml.category(['Gentoo', 'Adelie', 'Chinstrap'])
    })
    assert.deepEqual(penguinSchema.fields.species.categories, [
      'Gentoo',
      'Adelie',
      'Chinstrap'
    ])
  })

  test('rejects overrides for fields that are not in the schema', () => {
    assert.throws(
      () => ml.fromSchema(Penguin, { weight: ml.number() } as never),
      /the override 'weight' is not a field of the schema/
    )
  })

  test('rejects schemas without Standard JSON Schema', () => {
    const schema = {
      '~standard': { version: 1, vendor: 'x', validate: () => ({ value: {} }) }
    } as const
    assert.throws(() => ml.fromSchema(schema as never), /Standard JSON Schema/)
  })

  test('rejects schemas that are not objects', () => {
    assert.throws(
      () => ml.fromSchema(z.number() as never),
      /expects an object schema/
    )
  })
})

describe('TL features as a Standard Schema', () => {
  test('can be used where Zod accepts a Standard Schema', async () => {
    const penguinSchema = ml.features({
      species: ml.category(['Adelie', 'Gentoo'])
    })
    const result = await penguinSchema['~standard'].validate({
      species: 'Gentoo'
    })
    assert.deepEqual(result, { value: { species: 'Gentoo' } })
  })
})
