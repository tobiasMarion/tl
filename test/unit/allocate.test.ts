import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { allocate } from '../../src/dataset/allocate.ts'

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0)

describe('allocate', () => {
  test('gives exact shares when they are integers', () => {
    assert.deepEqual(allocate([50, 30, 20], 10), [5, 3, 2])
  })

  test('gives the leftover units to the largest remainders', () => {
    // Exact shares: 3.5, 2.1, 1.4 → floors 3, 2, 1, one unit left for 3.5
    assert.deepEqual(allocate([50, 30, 20], 7), [4, 2, 1])
  })

  test('always sums to the total', () => {
    const counts = [7, 13, 1, 29, 50]
    for (let total = 0; total <= sum(counts); total++) {
      assert.equal(sum(allocate(counts, total)), total)
    }
  })

  test('never gives a count more than it has', () => {
    const counts = [1, 2, 3, 94]
    for (let total = 0; total <= sum(counts); total++) {
      allocate(counts, total).forEach((quota, i) => {
        assert.ok(quota <= (counts[i] as number))
      })
    }
  })

  test('breaks ties in favor of the earlier count', () => {
    // Exact shares: 1.5 and 1.5 → one unit left
    assert.deepEqual(allocate([5, 5], 3), [2, 1])
  })

  test('gives nothing to empty counts', () => {
    assert.deepEqual(allocate([0, 10, 0], 4), [0, 4, 0])
    assert.deepEqual(allocate([0, 0], 0), [0, 0])
  })
})
