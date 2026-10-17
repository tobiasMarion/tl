import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { seededRandom, shuffledIndices } from '../../src/dataset/random.ts'

describe('seededRandom', () => {
  test('matches the reference mulberry32 sequence', () => {
    const random = seededRandom(42)
    assert.deepEqual(
      [random(), random(), random()],
      [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]
    )
  })

  test('returns numbers in [0, 1)', () => {
    const random = seededRandom(7)
    for (let i = 0; i < 10_000; i++) {
      const value = random()
      assert.ok(value >= 0 && value < 1)
    }
  })

  test('gives different sequences for different seeds', () => {
    assert.notEqual(seededRandom(1)(), seededRandom(2)())
  })
})

describe('shuffledIndices', () => {
  test('is a permutation of 0..n-1', () => {
    const indices = shuffledIndices(100, 42)
    assert.deepEqual(
      indices.toSorted((a, b) => a - b),
      Array.from({ length: 100 }, (_, i) => i)
    )
  })

  test('gives the same order for the same seed', () => {
    assert.deepEqual(shuffledIndices(10, 42), [0, 7, 3, 5, 2, 1, 8, 9, 4, 6])
    assert.deepEqual(shuffledIndices(10, 42), shuffledIndices(10, 42))
  })

  test('gives a different order for a different seed', () => {
    assert.notDeepEqual(shuffledIndices(10, 42), shuffledIndices(10, 43))
  })

  test('handles empty and single-element inputs', () => {
    assert.deepEqual(shuffledIndices(0, 42), [])
    assert.deepEqual(shuffledIndices(1, 42), [0])
  })
})
