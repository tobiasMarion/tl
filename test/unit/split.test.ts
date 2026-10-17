import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { blockSize } from '../../src/dataset/split.ts'
import { ml } from '../../src/index.ts'

const points = ml.features({ id: ml.number() })
const data = ml.dataset(
  points,
  Array.from({ length: 10 }, (_, id) => ({ id }))
)
const ids = (block: { readonly rows: readonly { id: number }[] }) =>
  block.rows.map(row => row.id)

describe('blockSize', () => {
  test('rounds up', () => {
    assert.equal(blockSize(10, 0.25), 3)
    assert.equal(blockSize(3, 0.1), 1)
  })

  test('ignores float error in n * fraction', () => {
    // 100 * 0.07 is 7.000000000000001 and 50 * 0.14 is 7.000000000000001
    assert.equal(blockSize(100, 0.07), 7)
    assert.equal(blockSize(50, 0.14), 7)
    // 100 * 0.29 is 28.999999999999996
    assert.equal(blockSize(100, 0.29), 29)
  })

  test('keeps exact products', () => {
    assert.equal(blockSize(10, 0.2), 2)
    assert.equal(blockSize(1000, 0.15), 150)
  })
})

describe('dataset.split', () => {
  test('holds out the test fraction, rounded up', () => {
    const { train, test } = data.split({ test: 0.25, seed: 42 })
    assert.equal(test.rows.length, 3)
    assert.equal(train.rows.length, 7)
  })

  test('puts every row in exactly one block', () => {
    const { train, test } = data.split({ test: 0.3, seed: 42 })
    assert.deepEqual(
      [...ids(train), ...ids(test)].toSorted((a, b) => a - b),
      ids(data)
    )
  })

  test('gives the same blocks for the same seed', () => {
    const first = data.split({ test: 0.3, seed: 42 })
    const second = data.split({ test: 0.3, seed: 42 })
    assert.deepEqual(ids(first.test), ids(second.test))
    assert.deepEqual(ids(first.train), ids(second.train))
  })

  test('gives different blocks for a different seed', () => {
    assert.notDeepEqual(
      ids(data.split({ test: 0.3, seed: 42 }).test),
      ids(data.split({ test: 0.3, seed: 43 }).test)
    )
  })

  test('shares the frozen records instead of copying them', () => {
    const { train, test } = data.split({ test: 0.3, seed: 42 })
    for (const row of [...train.rows, ...test.rows]) {
      assert.ok(data.rows.includes(row))
    }
  })

  test('freezes the result, each block and its rows', () => {
    const result = data.split({ test: 0.3, seed: 42 })
    assert.ok(Object.isFrozen(result))
    for (const block of [result.train, result.test]) {
      assert.ok(Object.isFrozen(block))
      assert.ok(Object.isFrozen(block.rows))
    }
  })

  test('holds out a validation fraction when asked for', () => {
    const { train, validation, test } = data.split({
      validation: 0.2,
      test: 0.3,
      seed: 42
    })
    assert.equal(test.rows.length, 3)
    assert.equal(validation.rows.length, 2)
    assert.equal(train.rows.length, 5)
    assert.deepEqual(
      [...ids(train), ...ids(validation), ...ids(test)].toSorted(
        (a, b) => a - b
      ),
      ids(data)
    )
  })

  test('only adds a validation block when asked for', () => {
    assert.ok(!('validation' in data.split({ test: 0.3, seed: 42 })))
  })

  test('keeps the same test block when validation is added', () => {
    // Validation comes out of what would have been training data
    const twoWay = data.split({ test: 0.3, seed: 42 })
    const threeWay = data.split({ validation: 0.2, test: 0.3, seed: 42 })
    assert.deepEqual(ids(threeWay.test), ids(twoWay.test))
    for (const id of ids(threeWay.validation)) {
      assert.ok(ids(twoWay.train).includes(id))
    }
  })

  test('freezes the validation block and its rows', () => {
    const { validation } = data.split({ validation: 0.2, test: 0.3, seed: 42 })
    assert.ok(Object.isFrozen(validation))
    assert.ok(Object.isFrozen(validation.rows))
  })
})
