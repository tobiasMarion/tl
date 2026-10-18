import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { type KFold, type KFoldOptions, ml } from '../../src/index.ts'

const points = ml.features({
  id: ml.number(),
  label: ml.category(['a', 'b'])
})
// 12 rows: ids 0 to 11, 'a' for ids below 8 and 'b' for the rest
const data = ml.dataset(
  points,
  Array.from({ length: 12 }, (_, id) => ({ id, label: id < 8 ? 'a' : 'b' }))
)
// A split with the smallest test block leaves 11 training rows
const { train } = data.split({ test: 0.01, seed: 7 })

const ids = (block: { readonly rows: readonly { id: number }[] }) =>
  block.rows.map(row => row.id)
const count = (block: { readonly rows: readonly { label: string }[] }) =>
  block.rows.filter(row => row.label === 'b').length

// Casts stand for JavaScript callers, where the types don't reach
const loose = (options: Record<string, unknown>) =>
  ml.kFold(options as unknown as KFoldOptions<never>)

describe('ml.kFold', () => {
  test('holds out every row exactly once', () => {
    const folds = ml.kFold({ k: 3, seed: 42 }).folds(train)
    assert.equal(folds.length, 3)
    const heldOut = folds.flatMap(fold => ids(fold.validation))
    assert.deepEqual(
      heldOut.toSorted((a, b) => a - b),
      ids(train).toSorted((a, b) => a - b)
    )
  })

  test("trains each fold on every row it doesn't hold out", () => {
    for (const fold of ml.kFold({ k: 3, seed: 42 }).folds(train)) {
      const held = new Set(ids(fold.validation))
      assert.ok(ids(fold.train).every(id => !held.has(id)))
      assert.equal(fold.train.rows.length + held.size, train.rows.length)
    }
  })

  test('gives folds sizes that differ by at most one', () => {
    const sizes = ml
      .kFold({ k: 3, seed: 42 })
      .folds(train)
      .map(fold => fold.validation.rows.length)
    assert.deepEqual(sizes, [4, 4, 3])
  })

  test('keeps the order of the training block in both blocks', () => {
    const order = new Map(ids(train).map((id, i) => [id, i]))
    const position = (id: number) => order.get(id) as number
    for (const fold of ml.kFold({ k: 3, seed: 42 }).folds(train)) {
      for (const block of [fold.train, fold.validation]) {
        const positions = ids(block).map(position)
        assert.deepEqual(
          positions,
          positions.toSorted((a, b) => a - b)
        )
      }
    }
  })

  test('gives the same folds for the same seed', () => {
    const first = ml.kFold({ k: 3, seed: 42 }).folds(train)
    const second = ml.kFold({ k: 3, seed: 42 }).folds(train)
    const other = ml.kFold({ k: 3, seed: 43 }).folds(train)
    assert.deepEqual(
      first.map(fold => ids(fold.validation)),
      second.map(fold => ids(fold.validation))
    )
    assert.notDeepEqual(
      first.map(fold => ids(fold.validation)),
      other.map(fold => ids(fold.validation))
    )
  })

  test('keeps the class proportions with stratify', () => {
    // Each fold holds out its share of the 'b' rows, give or take one
    const b = count(train)
    for (const seed of [1, 2, 3, 4, 5]) {
      const folds = ml.kFold({ k: 3, seed, stratify: 'label' }).folds(train)
      for (const fold of folds) {
        const held = count(fold.validation)
        assert.ok(held === Math.floor(b / 3) || held === Math.ceil(b / 3))
      }
      const sizes = folds.map(fold => fold.validation.rows.length)
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1)
    }
  })

  test('cross-validates the training block of a fold', () => {
    const outer = ml.kFold({ k: 3, seed: 42 }).folds(train)[0]
    assert.ok(outer)
    const inner = ml.kFold({ k: 2, seed: 42 }).folds(outer.train)
    assert.equal(inner.length, 2)
  })

  test('gives every block the schema, frozen', () => {
    const cv = ml.kFold({ k: 3, seed: 42 })
    const folds = cv.folds(train)
    assert.ok(Object.isFrozen(cv))
    assert.ok(Object.isFrozen(folds))
    for (const fold of folds) {
      assert.ok(Object.isFrozen(fold))
      for (const block of [fold.train, fold.validation]) {
        assert.equal(block.features, points)
        assert.ok(Object.isFrozen(block.rows))
      }
    }
  })

  test('keeps the options', () => {
    const cv: KFold<'label'> = ml.kFold({ k: 3, seed: 42, stratify: 'label' })
    assert.deepEqual([cv.k, cv.seed, cv.stratify], [3, 42, 'label'])
  })
})

describe('ml.kFold errors', () => {
  test("rejects k that isn't an integer of at least 2", () => {
    for (const k of [1, 0, 2.5, Number.NaN, '5']) {
      assert.throws(() => loose({ k, seed: 42 }), {
        name: 'RangeError',
        message: /^ml\.kFold\(\): k must be an integer of at least 2/
      })
    }
  })

  test("rejects a seed that isn't a uint32", () => {
    for (const seed of [-1, 1.5, 2 ** 32, undefined]) {
      assert.throws(() => loose({ k: 3, seed }), {
        name: 'RangeError',
        message: /^ml\.kFold\(\): seed must be an integer/
      })
    }
  })

  test("rejects a stratify that isn't a string", () => {
    assert.throws(() => loose({ k: 3, seed: 42, stratify: 1 }), TypeError)
  })

  test('rejects more folds than rows', () => {
    assert.throws(() => ml.kFold({ k: 12, seed: 42 }).folds(train), {
      name: 'RangeError',
      message:
        'kFold.folds(): 12 folds need at least 12 rows, and the training block has 11'
    })
  })

  test("rejects a stratify field that isn't a required category", () => {
    assert.throws(
      () => loose({ k: 3, seed: 42, stratify: 'id' }).folds(train),
      {
        name: 'TypeError',
        message:
          "kFold.folds(): stratify must be a required category field, one of 'label', received 'id'"
      }
    )
  })

  test('rejects a class with fewer rows than folds', () => {
    assert.throws(
      () => ml.kFold({ k: 5, seed: 42, stratify: 'label' }).folds(train),
      {
        name: 'RangeError',
        message: `kFold.folds(): stratify needs at least 5 rows of each class to put one in every fold, but 'b' has ${count(train)}`
      }
    )
  })
})
