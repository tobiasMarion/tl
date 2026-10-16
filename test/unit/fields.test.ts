import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  boolean,
  category,
  number,
  orderedCategory,
  timestamp
} from '../../src/features/fields.ts'

describe('number, boolean, timestamp', () => {
  for (const [name, create] of [
    ['number', number],
    ['boolean', boolean],
    ['timestamp', timestamp]
  ] as const) {
    test(`${name}() starts required`, () => {
      const field = create()
      assert.equal(field.kind, name)
      assert.equal(field.isOptional, false)
    })

    test(`${name}().optional() returns a new optional field`, () => {
      const required = create()
      const optional = required.optional()
      assert.equal(optional.kind, name)
      assert.equal(optional.isOptional, true)
      assert.equal(required.isOptional, false)
    })

    test(`${name}() is frozen, and so is its optional copy`, () => {
      assert.ok(Object.isFrozen(create()))
      assert.ok(Object.isFrozen(create().optional()))
    })

    test(`${name}().optional() has no optional() of its own`, () => {
      assert.ok(!('optional' in create().optional()))
    })
  }
})

describe('category', () => {
  test('keeps the declaration order', () => {
    assert.deepEqual(category(['b', 'a', 'c']).categories, ['b', 'a', 'c'])
  })

  test('optional() keeps the categories', () => {
    const optional = category(['male', 'female']).optional()
    assert.equal(optional.isOptional, true)
    assert.deepEqual(optional.categories, ['male', 'female'])
  })

  test('copies and freezes the list', () => {
    const input: [string, ...string[]] = ['a', 'b']
    const field = category(input)
    input.push('c')
    assert.deepEqual(field.categories, ['a', 'b'])
    assert.ok(Object.isFrozen(field.categories))
  })

  test('rejects an empty list', () => {
    assert.throws(() => category([] as never), {
      name: 'TypeError',
      message: 'ml.category() needs at least one category'
    })
  })

  test('rejects duplicates', () => {
    assert.throws(() => category(['a', 'b', 'a']), {
      name: 'TypeError',
      message: "ml.category() received 'a' more than once"
    })
  })

  test('rejects values that are not strings', () => {
    assert.throws(() => category([1] as never), {
      name: 'TypeError',
      message: 'ml.category() only accepts strings, received 1'
    })
  })
})

describe('orderedCategory', () => {
  test('keeps the order from lowest to highest', () => {
    const field = orderedCategory(['cold', 'warm', 'hot'])
    assert.equal(field.kind, 'ordered-category')
    assert.deepEqual(field.categories, ['cold', 'warm', 'hot'])
  })

  test('optional() keeps the order', () => {
    const optional = orderedCategory(['low', 'high']).optional()
    assert.equal(optional.kind, 'ordered-category')
    assert.equal(optional.isOptional, true)
    assert.deepEqual(optional.categories, ['low', 'high'])
  })

  test('names itself in errors', () => {
    assert.throws(() => orderedCategory(['a', 'a']), {
      name: 'TypeError',
      message: "ml.orderedCategory() received 'a' more than once"
    })
  })
})
