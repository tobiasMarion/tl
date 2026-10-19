import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { blockSize } from '../../src/dataset/split.ts'
import { ml } from '../../src/index.ts'

const pointSchema = ml.features({ id: ml.number() })
const points = ml.dataset(
  pointSchema,
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
  test('gives every block the schema', () => {
    const { train, validation, test } = points.split({
      validation: 0.2,
      test: 0.2,
      seed: 42
    })
    for (const block of [train, validation, test]) {
      assert.equal(block.features, pointSchema)
    }
  })

  test('holds out the test fraction, rounded up', () => {
    const { train, test } = points.split({ test: 0.25, seed: 42 })
    assert.equal(test.rows.length, 3)
    assert.equal(train.rows.length, 7)
  })

  test('puts every row in exactly one block', () => {
    const { train, test } = points.split({ test: 0.3, seed: 42 })
    assert.deepEqual(
      [...ids(train), ...ids(test)].toSorted((a, b) => a - b),
      ids(points)
    )
  })

  test('gives the same blocks for the same seed', () => {
    const first = points.split({ test: 0.3, seed: 42 })
    const second = points.split({ test: 0.3, seed: 42 })
    assert.deepEqual(ids(first.test), ids(second.test))
    assert.deepEqual(ids(first.train), ids(second.train))
  })

  test('gives different blocks for a different seed', () => {
    assert.notDeepEqual(
      ids(points.split({ test: 0.3, seed: 42 }).test),
      ids(points.split({ test: 0.3, seed: 43 }).test)
    )
  })

  test('shares the frozen records instead of copying them', () => {
    const { train, test } = points.split({ test: 0.3, seed: 42 })
    for (const row of [...train.rows, ...test.rows]) {
      assert.ok(points.rows.includes(row))
    }
  })

  test('freezes the result, each block and its rows', () => {
    const result = points.split({ test: 0.3, seed: 42 })
    assert.ok(Object.isFrozen(result))
    for (const block of [result.train, result.test]) {
      assert.ok(Object.isFrozen(block))
      assert.ok(Object.isFrozen(block.rows))
    }
  })

  test('holds out a validation fraction when asked for', () => {
    const { train, validation, test } = points.split({
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
      ids(points)
    )
  })

  test('only adds a validation block when asked for', () => {
    assert.ok(!('validation' in points.split({ test: 0.3, seed: 42 })))
  })

  test('keeps the same test block when validation is added', () => {
    // Validation comes out of what would have been training data
    const twoWay = points.split({ test: 0.3, seed: 42 })
    const threeWay = points.split({ validation: 0.2, test: 0.3, seed: 42 })
    assert.deepEqual(ids(threeWay.test), ids(twoWay.test))
    for (const id of ids(threeWay.validation)) {
      assert.ok(ids(twoWay.train).includes(id))
    }
  })

  test('freezes the validation block and its rows', () => {
    const { validation } = points.split({
      validation: 0.2,
      test: 0.3,
      seed: 42
    })
    assert.ok(Object.isFrozen(validation))
    assert.ok(Object.isFrozen(validation.rows))
  })
})

describe('dataset.split options', () => {
  const rejects = (options: object, message: string) =>
    assert.throws(() => points.split(options as never), {
      name: 'RangeError',
      message
    })

  test('rejects a test fraction outside (0, 1)', () => {
    for (const value of [0, 1, -0.1, 1.5, Number.NaN]) {
      rejects(
        { test: value, seed: 42 },
        `dataset.split(): test must be a fraction between 0 and 1, such as 0.2, received ${value}`
      )
    }
  })

  test('rejects a test fraction that is not a number', () => {
    rejects(
      { test: '0.2', seed: 42 },
      "dataset.split(): test must be a fraction between 0 and 1, such as 0.2, received '0.2'"
    )
  })

  test('rejects a validation fraction outside (0, 1)', () => {
    rejects(
      { validation: 0, test: 0.2, seed: 42 },
      'dataset.split(): validation must be a fraction between 0 and 1, such as 0.2, received 0'
    )
  })

  test('rejects fractions that leave no room for training', () => {
    rejects(
      { validation: 0.5, test: 0.5, seed: 42 },
      'dataset.split(): test + validation must be less than 1 to leave rows for training, received 0.5 + 0.5'
    )
  })

  test('rejects a seed that is not a uint32', () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      rejects(
        { test: 0.2, seed },
        `dataset.split(): seed must be an integer from 0 to 4294967295, such as 42, received ${seed}`
      )
    }
  })

  test('accepts the seed bounds', () => {
    points.split({ test: 0.2, seed: 0 })
    points.split({ test: 0.2, seed: 4294967295 })
  })

  test('rejects a split that rounds the training block away', () => {
    // 0.6 of 2 rows rounds up to 2
    const pair = ml.dataset(pointSchema, [{ id: 0 }, { id: 1 }])
    assert.throws(() => pair.split({ test: 0.6, seed: 42 }), {
      name: 'RangeError',
      message:
        'dataset.split(): 2 rows leave no rows for training after holding out 2. Use smaller fractions or more rows'
    })
    // 0.3 + 0.3 of 3 rows rounds up to 1 + 1, leaving 1
    const three = ml.dataset(pointSchema, [{ id: 0 }, { id: 1 }, { id: 2 }])
    const { train } = three.split({ validation: 0.3, test: 0.3, seed: 42 })
    assert.equal(train.rows.length, 1)
  })

  test('rejects an empty dataset', () => {
    const empty = ml.dataset(pointSchema, [])
    assert.throws(() => empty.split({ test: 0.2, seed: 42 }), {
      name: 'RangeError',
      message: 'dataset.split(): the dataset has no rows'
    })
  })
})
