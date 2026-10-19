import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { shuffledIndices } from '../../src/dataset/random.ts'
import { ml } from '../../src/index.ts'

const animalSchema = ml.features({
  id: ml.number(),
  species: ml.category(['a', 'b', 'c'])
})
// 60 a, 30 b, 10 c
const animals = ml.dataset(
  animalSchema,
  Array.from({ length: 100 }, (_, id) => ({
    id,
    species: id < 60 ? 'a' : id < 90 ? 'b' : 'c'
  }))
)

type Block = { readonly rows: readonly { id: number; species: string }[] }
const ids = (block: Block) => block.rows.map(row => row.id)
const counts = (block: Block) => {
  const result = { a: 0, b: 0, c: 0 }
  for (const row of block.rows) result[row.species as 'a' | 'b' | 'c']++
  return result
}

describe('dataset.split with stratify', () => {
  test('keeps the class proportions in every block', () => {
    const { train, test } = animals.split({
      test: 0.2,
      seed: 42,
      stratify: 'species'
    })
    assert.deepEqual(counts(test), { a: 12, b: 6, c: 2 })
    assert.deepEqual(counts(train), { a: 48, b: 24, c: 8 })
  })

  test('keeps the block sizes of the split without stratify', () => {
    // 7 rows: exact shares 4.2, 2.1, 0.7 → floors 4, 2, 0, one unit left for c
    const { train, test } = animals.split({
      test: 0.07,
      seed: 42,
      stratify: 'species'
    })
    assert.deepEqual(counts(test), { a: 4, b: 2, c: 1 })
    assert.equal(test.rows.length, 7)
    assert.equal(train.rows.length, 93)
  })

  test('keeps the class proportions with a validation block', () => {
    const { train, validation, test } = animals.split({
      validation: 0.1,
      test: 0.2,
      seed: 42,
      stratify: 'species'
    })
    assert.deepEqual(counts(test), { a: 12, b: 6, c: 2 })
    assert.deepEqual(counts(validation), { a: 6, b: 3, c: 1 })
    assert.deepEqual(counts(train), { a: 42, b: 21, c: 7 })
  })

  test('puts every row in exactly one block', () => {
    const { train, validation, test } = animals.split({
      validation: 0.1,
      test: 0.2,
      seed: 42,
      stratify: 'species'
    })
    assert.deepEqual(
      [...ids(train), ...ids(validation), ...ids(test)].toSorted(
        (a, b) => a - b
      ),
      ids(animals)
    )
  })

  test('keeps the same test block when validation is added', () => {
    const options = { test: 0.2, seed: 42, stratify: 'species' } as const
    const twoWay = animals.split(options)
    const threeWay = animals.split({ ...options, validation: 0.1 })
    assert.deepEqual(ids(threeWay.test), ids(twoWay.test))
  })

  test('gives the same blocks for the same seed', () => {
    const options = { test: 0.2, seed: 42, stratify: 'species' } as const
    assert.deepEqual(
      ids(animals.split(options).test),
      ids(animals.split(options).test)
    )
  })

  test('gives different blocks for a different seed', () => {
    assert.notDeepEqual(
      ids(animals.split({ test: 0.2, seed: 42, stratify: 'species' }).test),
      ids(animals.split({ test: 0.2, seed: 43, stratify: 'species' }).test)
    )
  })

  test('keeps the shuffled order instead of grouping rows by class', () => {
    const { train, test } = animals.split({
      test: 0.2,
      seed: 42,
      stratify: 'species'
    })
    const shuffled = shuffledIndices(100, 42)
    for (const block of [train, test]) {
      const inBlock = new Set(ids(block))
      assert.deepEqual(
        ids(block),
        shuffled.filter(id => inBlock.has(id))
      )
    }
  })

  test('accepts ordered category fields', () => {
    const sizeSchema = ml.features({
      size: ml.orderedCategory(['small', 'large'])
    })
    const rows = Array.from({ length: 10 }, (_, i) => ({
      size: i < 8 ? 'small' : 'large'
    }))
    const { test } = ml
      .dataset(sizeSchema, rows)
      .split({ test: 0.5, seed: 42, stratify: 'size' })
    assert.equal(test.rows.filter(row => row.size === 'large').length, 1)
  })
})

describe('dataset.split stratify checks', () => {
  test('rejects a field that is not in the schema', () => {
    assert.throws(
      () => animals.split({ test: 0.2, seed: 42, stratify: 'specie' as never }),
      {
        name: 'TypeError',
        message:
          "dataset.split(): stratify must be a required category field, one of 'species', received 'specie'"
      }
    )
  })

  test('rejects a field that is not a category', () => {
    assert.throws(
      () => animals.split({ test: 0.2, seed: 42, stratify: 'id' as never }),
      {
        name: 'TypeError',
        message:
          "dataset.split(): stratify must be a required category field, one of 'species', received 'id'"
      }
    )
  })

  test('rejects an optional category field', () => {
    const taggedSchema = ml.features({
      kind: ml.category(['x', 'y']),
      tag: ml.category(['x', 'y']).optional()
    })
    const rows = Array.from({ length: 4 }, () => ({ kind: 'x', tag: 'y' }))
    assert.throws(
      () =>
        ml
          .dataset(taggedSchema, rows)
          .split({ test: 0.5, seed: 42, stratify: 'tag' as never }),
      {
        name: 'TypeError',
        message:
          "dataset.split(): stratify must be a required category field, one of 'kind', received 'tag'"
      }
    )
  })

  test('says when the schema has no category field to stratify by', () => {
    const numberSchema = ml.features({ x: ml.number() })
    const rows = Array.from({ length: 4 }, (_, x) => ({ x }))
    assert.throws(
      () =>
        ml
          .dataset(numberSchema, rows)
          .split({ test: 0.5, seed: 42, stratify: 'x' as never }),
      {
        name: 'TypeError',
        message:
          "dataset.split(): stratify needs a required category field, and the schema has none, received 'x'"
      }
    )
  })

  test('rejects a class with fewer rows than blocks', () => {
    const rows = [
      { id: 0, species: 'a' },
      { id: 1, species: 'a' },
      { id: 2, species: 'a' },
      { id: 3, species: 'b' },
      { id: 4, species: 'b' }
    ]
    const small = ml.dataset(animalSchema, rows)
    // Two blocks: 2 rows of 'b' are enough
    small.split({ test: 0.4, seed: 42, stratify: 'species' })
    // Three blocks: 'b' can't be in all of them
    assert.throws(
      () =>
        small.split({
          validation: 0.2,
          test: 0.2,
          seed: 42,
          stratify: 'species'
        }),
      {
        name: 'RangeError',
        message:
          "dataset.split(): stratify needs at least 3 rows of each class to put one in every block, but 'b' has 2"
      }
    )
  })

  test('ignores categories with no rows', () => {
    // 'c' is declared but absent: it can't be missing from any block
    const rows = Array.from({ length: 10 }, (_, id) => ({
      id,
      species: id < 5 ? 'a' : 'b'
    }))
    const { test } = ml
      .dataset(animalSchema, rows)
      .split({ test: 0.2, seed: 42, stratify: 'species' })
    assert.equal(test.rows.length, 2)
  })
})
