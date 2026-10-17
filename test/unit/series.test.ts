import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FeatureValidationError, ml } from '../../src/index.ts'

const prices = ml.features({
  date: ml.timestamp(),
  ticker: ml.category(['MSFT', 'AAPL']),
  close: ml.number(),
  seen: ml.timestamp().optional(),
  sector: ml.orderedCategory(['low', 'high'])
})

const row = (date: string, ticker: string, close: number) => ({
  date,
  ticker,
  close,
  sector: 'low'
})

const day = (date: string) => Date.parse(`${date}T00:00:00Z`)

describe('series', () => {
  test('orders the rows by time', () => {
    const data = ml.series(
      prices,
      [
        row('2025-01-03', 'AAPL', 3),
        row('2025-01-01', 'AAPL', 1),
        row('2025-01-02', 'AAPL', 2)
      ],
      { time: 'date' }
    )
    assert.deepEqual(
      data.rows.map(r => r.close),
      [1, 2, 3]
    )
    assert.equal(data.rows[0]?.date, day('2025-01-01'))
  })

  test('orders rows at the same time by the group category order', () => {
    // MSFT comes first in the schema, so it comes first on each day
    const data = ml.series(
      prices,
      [
        row('2025-01-02', 'AAPL', 4),
        row('2025-01-01', 'AAPL', 2),
        row('2025-01-02', 'MSFT', 3),
        row('2025-01-01', 'MSFT', 1)
      ],
      { time: 'date', group: 'ticker' }
    )
    assert.deepEqual(
      data.rows.map(r => r.close),
      [1, 2, 3, 4]
    )
  })

  test('keeps the time and group fields', () => {
    const data = ml.series(prices, [], { time: 'date', group: 'ticker' })
    assert.equal(data.time, 'date')
    assert.equal(data.group, 'ticker')
    assert.equal(data.features, prices)
    assert.equal(ml.series(prices, [], { time: 'date' }).group, undefined)
  })

  test('freezes the series, its rows and each record', () => {
    const data = ml.series(prices, [row('2025-01-01', 'AAPL', 1)], {
      time: 'date'
    })
    assert.ok(Object.isFrozen(data))
    assert.ok(Object.isFrozen(data.rows))
    assert.ok(Object.isFrozen(data.rows[0]))
  })

  test("leaves the caller's rows untouched", () => {
    const input = [row('2025-01-02', 'AAPL', 2), row('2025-01-01', 'AAPL', 1)]
    ml.series(prices, input, { time: 'date' })
    assert.deepEqual(
      input.map(r => r.close),
      [2, 1]
    )
    assert.ok(!Object.isFrozen(input[0]))
  })

  test('rejects invalid rows and starts the stack at the series call', () => {
    try {
      ml.series(prices, [row('2025-02-30', 'AAPL', 1)], { time: 'date' })
    } catch (error) {
      assert.ok(error instanceof FeatureValidationError)
      assert.equal(error.issues[0]?.code, 'invalid_timestamp')
      const frame = error.stack?.split('\n').find(line => /^\s+at /.test(line))
      assert.match(frame ?? '', /series\.test\.ts/)
      return
    }
    assert.fail('expected a FeatureValidationError')
  })
})

describe('series options', () => {
  const rejects = (options: object, message: string) =>
    assert.throws(() => ml.series(prices, [], options as never), {
      name: 'TypeError',
      message
    })

  test('rejects a time field that is not a required timestamp', () => {
    for (const time of ['close', 'seen', 'nope']) {
      rejects(
        { time },
        `ml.series(): time must be a required timestamp field, one of 'date', received '${time}'`
      )
    }
  })

  test('rejects a group field that is not a required category', () => {
    for (const group of ['sector', 'close', 'nope']) {
      rejects(
        { time: 'date', group },
        `ml.series(): group must be a required category field, one of 'ticker', received '${group}'`
      )
    }
  })

  test('says when the schema has no field of the right kind', () => {
    const numbers = ml.features({ x: ml.number() })
    assert.throws(() => ml.series(numbers, [], { time: 'x' } as never), {
      name: 'TypeError',
      message:
        "ml.series(): time needs a required timestamp field, and the schema has none, received 'x'"
    })
  })
})
