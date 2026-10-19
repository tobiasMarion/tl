import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ml } from '../../src/index.ts'

const DAY = 86_400_000

const priceSchema = ml.features({
  date: ml.timestamp(),
  ticker: ml.category(['AAPL', 'MSFT']),
  close: ml.number()
})

const date = (day: number) => `2025-01-${String(day).padStart(2, '0')}`
const days = Array.from({ length: 10 }, (_, i) => i + 1)

// One row a day from Jan 1 to Jan 10; close is the day of the month
const daily = ml.series(
  priceSchema,
  days.map(day => ({ date: date(day), ticker: 'AAPL', close: day })),
  { time: 'date' }
)

type Block = { readonly rows: readonly { close: number }[] }
const closes = (block: Block) => block.rows.map(row => row.close)
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('series.split', () => {
  test('gives every block the schema', () => {
    const { train, validation, test } = daily.split({
      validationFrom: date(5),
      testFrom: date(8),
      gap: { steps: 0 }
    })
    for (const block of [train, validation, test]) {
      assert.equal(block.features, priceSchema)
    }
  })

  test('cuts at testFrom', () => {
    const { train, test } = daily.split({
      testFrom: date(8),
      gap: { steps: 0 }
    })
    assert.deepEqual(closes(train), range(1, 7))
    assert.deepEqual(closes(test), range(8, 10))
  })

  test('drops the last steps before the test block', () => {
    const { train, test } = daily.split({
      testFrom: date(8),
      gap: { steps: 2 }
    })
    assert.deepEqual(closes(train), range(1, 5))
    assert.deepEqual(closes(test), range(8, 10))
  })

  test('drops a duration before the test block', () => {
    // [Jan 6, Jan 8) is dropped
    const twoDays = daily.split({ testFrom: date(8), gap: { days: 2 } })
    assert.deepEqual(closes(twoDays.train), range(1, 5))
    // [Jan 6 12:00, Jan 8) is dropped, so Jan 6 stays
    const dayAndHalf = daily.split({ testFrom: date(8), gap: { hours: 36 } })
    assert.deepEqual(closes(dayAndHalf.train), range(1, 6))
  })

  test('gives each unit its fixed length', () => {
    // Each gap is just over two days before Jan 8, so it starts late on
    // Jan 5: Jan 6 and Jan 7 are dropped
    for (const gap of [
      { weeks: 2 / 7 + 1e-6 },
      { days: 2.001 },
      { hours: 49 },
      { minutes: 2 * 24 * 60 + 1 },
      { seconds: (2 * DAY) / 1000 + 1 },
      { milliseconds: 2 * DAY + 1 }
    ]) {
      const { train } = daily.split({ testFrom: date(8), gap })
      assert.deepEqual(closes(train), range(1, 5))
    }
  })

  test('cuts a validation block with a gap before each held-out block', () => {
    const { train, validation, test } = daily.split({
      validationFrom: date(5),
      testFrom: date(8),
      gap: { steps: 1 }
    })
    assert.deepEqual(closes(train), range(1, 3))
    assert.deepEqual(closes(validation), range(5, 6))
    assert.deepEqual(closes(test), range(8, 10))
  })

  test('only adds a validation block when asked for', () => {
    const result = daily.split({ testFrom: date(8), gap: { steps: 0 } })
    assert.ok(!('validation' in result))
  })

  test('counts steps in distinct times, so every group shares the cut', () => {
    const panel = ml.series(
      priceSchema,
      days.flatMap(day => [
        { date: date(day), ticker: 'AAPL', close: day },
        { date: date(day), ticker: 'MSFT', close: day }
      ]),
      { time: 'date', group: 'ticker' }
    )
    const { train, test } = panel.split({
      testFrom: date(8),
      gap: { steps: 1 }
    })
    // One step drops Jan 7 for both tickers, not one row
    assert.deepEqual(
      closes(train),
      range(1, 6).flatMap(day => [day, day])
    )
    assert.deepEqual(
      closes(test),
      range(8, 10).flatMap(day => [day, day])
    )
  })

  test('accepts testFrom as a Date, milliseconds or an ISO string', () => {
    const at = Date.parse('2025-01-08T00:00:00Z')
    for (const testFrom of [
      new Date(at),
      at,
      '2025-01-08',
      '2025-01-07T21:00:00-03:00'
    ]) {
      const { test } = daily.split({ testFrom, gap: { steps: 0 } })
      assert.deepEqual(closes(test), range(8, 10))
    }
  })

  test('cuts between times that are not in the series', () => {
    const { train, test } = daily.split({
      testFrom: '2025-01-07T12:00:00Z',
      gap: { steps: 1 }
    })
    // The first held-out time is Jan 8, and the step before it is Jan 7
    assert.deepEqual(closes(train), range(1, 6))
    assert.deepEqual(closes(test), range(8, 10))
  })

  test('keeps the time order and shares the frozen records', () => {
    const result = daily.split({ testFrom: date(8), gap: { steps: 0 } })
    assert.ok(Object.isFrozen(result))
    for (const block of [result.train, result.test]) {
      assert.ok(Object.isFrozen(block))
      assert.ok(Object.isFrozen(block.rows))
      for (const row of block.rows) assert.ok(daily.rows.includes(row))
    }
  })
})

describe('series.split calendar gaps', () => {
  // One row on the last day of each month of 2024, and a test block from
  // Mar 31, 2025
  const monthEnds = Array.from({ length: 12 }, (_, month) =>
    new Date(Date.UTC(2024, month + 1, 0)).toISOString()
  )
  const monthly = ml.series(
    priceSchema,
    [...monthEnds, '2025-03-31'].map((time, i) => ({
      date: time,
      ticker: 'AAPL',
      close: i + 1
    })),
    { time: 'date' }
  )

  test('counts months on the calendar, clamped to the end of the month', () => {
    // One month before Mar 31, 2025 is Feb 28, so Feb has no row in the
    // series and Dec 31 is the last training row. Three months back is
    // Dec 31: [Dec 31, Mar 31) drops Dec 31 itself
    const oneMonth = monthly.split({
      testFrom: '2025-03-31',
      gap: { months: 1 }
    })
    assert.equal(closes(oneMonth.train).at(-1), 12)
    const threeMonths = monthly.split({
      testFrom: '2025-03-31',
      gap: { months: 3 }
    })
    assert.equal(closes(threeMonths.train).at(-1), 11)
  })

  test('counts a year as twelve months', () => {
    // [Mar 31, 2024, Mar 31, 2025) drops every month end from March on
    const { train } = monthly.split({
      testFrom: '2025-03-31',
      gap: { years: 1 }
    })
    assert.deepEqual(closes(train), [1, 2])
  })

  test('clamps the 29th of February in a year without one', () => {
    // One year before Feb 29, 2024 is Feb 28, 2023, not Mar 1, so Feb 28
    // falls inside the gap
    const leap = ml.series(
      priceSchema,
      ['2023-02-27', '2023-02-28', '2024-02-29'].map((time, i) => ({
        date: time,
        ticker: 'AAPL',
        close: i + 1
      })),
      { time: 'date' }
    )
    const { train } = leap.split({ testFrom: '2024-02-29', gap: { years: 1 } })
    assert.deepEqual(closes(train), [1])
  })
})

describe('series.split options', () => {
  const rejects = (
    options: object,
    name: 'TypeError' | 'RangeError',
    message: string
  ) => assert.throws(() => daily.split(options as never), { name, message })

  test('rejects a testFrom that is not a timestamp', () => {
    rejects(
      { testFrom: '08/01/2025', gap: { steps: 0 } },
      'TypeError',
      "series.split(): testFrom expected a Date, milliseconds since 1970 or an ISO 8601 date such as '2025-01-31', received '08/01/2025'"
    )
    rejects(
      { testFrom: '2025-02-30', gap: { steps: 0 } },
      'RangeError',
      "series.split(): testFrom expected a Date, milliseconds since 1970 or an ISO 8601 date such as '2025-01-31', received '2025-02-30'"
    )
  })

  test('rejects a gap that is not one unit', () => {
    const gapRejects = (gap: unknown, message: string) =>
      rejects({ testFrom: date(8), gap }, 'TypeError', message)
    const shapes =
      'series.split(): gap takes one unit: { steps: n } or a duration such as { days: 5 } (years, months, weeks, days, hours, minutes, seconds, milliseconds)'
    gapRejects(1, `${shapes}, received 1`)
    gapRejects(undefined, `${shapes}, received undefined`)
    gapRejects({}, `${shapes}, received {}`)
    gapRejects({ step: 1 }, `${shapes}, received {"step":1}`)
    gapRejects(
      { days: 1, hours: 12 },
      `${shapes}, received {"days":1,"hours":12}`
    )
    gapRejects(
      { steps: 1, days: 1 },
      `${shapes}, received {"steps":1,"days":1}`
    )
    for (const steps of [-1, 1.5]) {
      gapRejects(
        { steps },
        `series.split(): gap steps must be a whole number >= 0, received {"steps":${steps}}`
      )
    }
    gapRejects(
      { days: -1 },
      'series.split(): gap days must be a number >= 0, received {"days":-1}'
    )
  })

  test('rejects months and years that are not whole', () => {
    rejects(
      { testFrom: date(8), gap: { months: 1.5 } },
      'TypeError',
      'series.split(): gap months must be a whole number >= 0, received {"months":1.5}'
    )
  })

  test('names the gap in messages', () => {
    rejects(
      // [Dec 31 12:00, Jan 3) covers Jan 1 and Jan 2
      { testFrom: date(3), gap: { hours: 60 } },
      'RangeError',
      'series.split(): no rows left for training before 2025-01-03T00:00:00.000Z after a gap of 60 hours; the series runs from 2025-01-01T00:00:00.000Z to 2025-01-10T00:00:00.000Z'
    )
  })

  test('rejects a validationFrom that is not before testFrom', () => {
    rejects(
      { validationFrom: date(8), testFrom: date(8), gap: { steps: 0 } },
      'RangeError',
      'series.split(): validationFrom must be before testFrom, received 2025-01-08T00:00:00.000Z and 2025-01-08T00:00:00.000Z'
    )
  })

  test('rejects a testFrom after the last time', () => {
    rejects(
      { testFrom: date(11), gap: { steps: 0 } },
      'RangeError',
      'series.split(): no rows at or after testFrom 2025-01-11T00:00:00.000Z; the series runs from 2025-01-01T00:00:00.000Z to 2025-01-10T00:00:00.000Z'
    )
  })

  test('rejects a gap that leaves no rows for training', () => {
    rejects(
      { testFrom: date(4), gap: { steps: 3 } },
      'RangeError',
      'series.split(): no rows left for training before 2025-01-04T00:00:00.000Z after a gap of 3 steps; the series runs from 2025-01-01T00:00:00.000Z to 2025-01-10T00:00:00.000Z'
    )
  })

  test('rejects a validation block shorter than the gap', () => {
    // The 2 steps before Jan 8 are Jan 6 and 7: all of the validation block
    rejects(
      { validationFrom: date(6), testFrom: date(8), gap: { steps: 2 } },
      'RangeError',
      'series.split(): no rows for validation from 2025-01-06T00:00:00.000Z to 2025-01-08T00:00:00.000Z after a gap of 2 steps; the series runs from 2025-01-01T00:00:00.000Z to 2025-01-10T00:00:00.000Z'
    )
  })

  test('rejects an empty series', () => {
    const empty = ml.series(priceSchema, [], { time: 'date' })
    assert.throws(() => empty.split({ testFrom: date(8), gap: { steps: 0 } }), {
      name: 'RangeError',
      message:
        'series.split(): no rows at or after testFrom 2025-01-08T00:00:00.000Z; the series has no rows'
    })
  })
})
