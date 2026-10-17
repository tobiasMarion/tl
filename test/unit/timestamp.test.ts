import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseTimestamp } from '../../src/features/timestamp.ts'

const accepts = (value: unknown, iso: string) =>
  assert.deepEqual(parseTimestamp(value), {
    ok: true,
    value: Date.parse(iso)
  })

const rejects = (value: unknown, code: 'invalid_type' | 'invalid_timestamp') =>
  assert.deepEqual(parseTimestamp(value), { ok: false, code })

describe('parseTimestamp', () => {
  test('converts a Date to milliseconds', () => {
    accepts(new Date('2025-01-31T10:00:00Z'), '2025-01-31T10:00:00Z')
  })

  test('takes a number as milliseconds', () => {
    assert.deepEqual(parseTimestamp(1738317600000), {
      ok: true,
      value: 1738317600000
    })
    assert.deepEqual(parseTimestamp(-1), { ok: true, value: -1 })
  })

  test('parses ISO 8601 dates as midnight UTC', () => {
    accepts('2025-01-31', '2025-01-31T00:00:00Z')
  })

  test('parses ISO 8601 date-times with an offset', () => {
    accepts('2025-01-31T10:00Z', '2025-01-31T10:00:00Z')
    accepts('2025-01-31T10:00:00+03:00', '2025-01-31T07:00:00Z')
    accepts('2025-01-31T10:00:00.250-03:00', '2025-01-31T13:00:00.250Z')
  })

  test('reads date-times without an offset as UTC', () => {
    accepts('2025-01-31T10:00', '2025-01-31T10:00:00Z')
    accepts('2025-01-31T10:00:30', '2025-01-31T10:00:30Z')
  })

  test('accepts a space between date and time', () => {
    accepts('2025-01-31 10:00:00', '2025-01-31T10:00:00Z')
  })

  test('drops digits past milliseconds', () => {
    accepts('2025-01-31T10:00:00.123456789Z', '2025-01-31T10:00:00.123Z')
  })

  test('keeps years before 100', () => {
    // Date.UTC would read year 1 as 1901
    assert.equal(
      new Date(
        (parseTimestamp('0001-01-01') as { value: number }).value
      ).toISOString(),
      '0001-01-01T00:00:00.000Z'
    )
  })

  test('rejects dates that do not exist', () => {
    for (const value of [
      '2025-02-29',
      '2025-04-31',
      '2025-13-01',
      '2025-00-10',
      '1900-02-29',
      '2025-01-31T24:00',
      '2025-01-31T10:60',
      '2025-01-31T10:00:60',
      '2025-01-31T10:00+24:00'
    ]) {
      rejects(value, 'invalid_timestamp')
    }
    accepts('2024-02-29', '2024-02-29T00:00:00Z')
    accepts('2000-02-29', '2000-02-29T00:00:00Z')
  })

  test('rejects an Invalid Date and times a Date cannot hold', () => {
    rejects(new Date('nope'), 'invalid_timestamp')
    rejects(Number.POSITIVE_INFINITY, 'invalid_timestamp')
    rejects(8.64e15 + 1, 'invalid_timestamp')
  })

  test('rejects strings that are not ISO 8601', () => {
    for (const value of [
      '2025-1-31',
      '31/01/2025',
      'yesterday',
      '2025-01-31T10Z',
      '2025-01-31Z',
      ''
    ]) {
      rejects(value, 'invalid_type')
    }
  })

  test('rejects other types', () => {
    for (const value of [true, {}, [], 1n]) rejects(value, 'invalid_type')
  })
})
