import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { addMonths } from '../../src/dataset/period.ts'

const at = (iso: string) => Date.parse(iso)
const iso = (time: number) => new Date(time).toISOString()

describe('addMonths', () => {
  test('moves along the calendar and keeps the time of day', () => {
    assert.equal(
      iso(addMonths(at('2025-01-15T10:30:00Z'), 1)),
      '2025-02-15T10:30:00.000Z'
    )
    assert.equal(
      iso(addMonths(at('2025-01-15T10:30:00Z'), -13)),
      '2023-12-15T10:30:00.000Z'
    )
  })

  test('clamps the day to the end of a shorter month', () => {
    assert.equal(
      iso(addMonths(at('2025-01-31'), 1)),
      '2025-02-28T00:00:00.000Z'
    )
    assert.equal(
      iso(addMonths(at('2024-01-31'), 1)),
      '2024-02-29T00:00:00.000Z'
    )
    assert.equal(
      iso(addMonths(at('2025-03-31'), -1)),
      '2025-02-28T00:00:00.000Z'
    )
  })

  test("doesn't carry a clamped day when shifting from the same anchor", () => {
    const anchor = at('2025-01-31')
    assert.equal(iso(addMonths(anchor, 2)), '2025-03-31T00:00:00.000Z')
  })
})
