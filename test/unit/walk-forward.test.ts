import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ml, type WalkForwardOptions } from '../../src/index.ts'

const prices = ml.features({
  date: ml.timestamp(),
  ticker: ml.category(['AAPL', 'MSFT']),
  close: ml.number()
})

const DAY = 86_400_000
const JAN_1 = Date.UTC(2024, 0, 1)
const day = (iso: string) => Date.parse(iso)
const iso = (time: number) => new Date(time).toISOString().slice(0, 10)

// One AAPL row a day, from Jan 1 to Jun 30, 2024, except the days skipped
const dailyRows = (skip: (time: number) => boolean = () => false) =>
  Array.from({ length: 182 }, (_, i) => JAN_1 + i * DAY)
    .filter(time => !skip(time))
    .map(time => ({ date: time, ticker: 'AAPL', close: 1 }))

// A test block from Jul 1 that no row reaches leaves every row for training,
// so the split needs one row after it
const trainOf = (rows: readonly object[]) =>
  ml
    .series(
      prices,
      [...rows, { date: '2024-12-31', ticker: 'AAPL', close: 1 }],
      {
        time: 'date',
        group: 'ticker'
      }
    )
    .split({ testFrom: '2024-07-01', gap: { steps: 0 } }).train

const train = trainOf(dailyRows())

type Block = { readonly rows: readonly { date: number }[] }
const range = (block: Block) => {
  const dates = block.rows.map(row => row.date)
  return `${iso(Math.min(...dates))}..${iso(Math.max(...dates))}`
}
const ranges = (options: WalkForwardOptions, block = train) =>
  ml
    .walkForward(options)
    .folds(block)
    .map(fold => [range(fold.train), range(fold.validation)])

describe('ml.walkForward', () => {
  test('validates one calendar block after another, training on all history', () => {
    assert.deepEqual(
      ranges({
        validationFrom: '2024-04-01',
        validation: { months: 1 },
        train: 'expanding',
        gap: { steps: 0 }
      }),
      [
        ['2024-01-01..2024-03-31', '2024-04-01..2024-04-30'],
        ['2024-01-01..2024-04-30', '2024-05-01..2024-05-31'],
        ['2024-01-01..2024-05-31', '2024-06-01..2024-06-30']
      ]
    )
  })

  test('trains on a rolling window', () => {
    assert.deepEqual(
      ranges({
        validationFrom: '2024-04-01',
        validation: { months: 1 },
        train: { months: 3 },
        gap: { steps: 0 }
      }),
      [
        ['2024-01-01..2024-03-31', '2024-04-01..2024-04-30'],
        ['2024-02-01..2024-04-30', '2024-05-01..2024-05-31'],
        ['2024-03-01..2024-05-31', '2024-06-01..2024-06-30']
      ]
    )
  })

  test('takes the gap out of the end of the training window', () => {
    const [first] = ranges({
      validationFrom: '2024-04-01',
      validation: { months: 1 },
      train: { months: 3 },
      gap: { days: 5 }
    })
    assert.deepEqual(first, [
      '2024-01-01..2024-03-26',
      '2024-04-01..2024-04-30'
    ])
  })

  test('counts blocks and windows in steps', () => {
    // The window is the 30 days before each block, and the gap takes its
    // last 2
    assert.deepEqual(
      ranges({
        validationFrom: '2024-06-01',
        validation: { steps: 10 },
        train: { steps: 30 },
        gap: { steps: 2 }
      }),
      [
        ['2024-05-02..2024-05-29', '2024-06-01..2024-06-10'],
        ['2024-05-12..2024-06-08', '2024-06-11..2024-06-20'],
        ['2024-05-22..2024-06-18', '2024-06-21..2024-06-30']
      ]
    )
  })

  test('keeps a shorter last block', () => {
    const folds = ranges({
      validationFrom: '2024-05-15',
      validation: { months: 1 },
      train: 'expanding',
      gap: { steps: 0 }
    })
    assert.deepEqual(
      folds.map(([, validation]) => validation),
      ['2024-05-15..2024-06-14', '2024-06-15..2024-06-30']
    )
  })

  test('skips a calendar block without rows', () => {
    const noMay = trainOf(dailyRows(time => new Date(time).getUTCMonth() === 4))
    const folds = ranges(
      {
        validationFrom: '2024-04-01',
        validation: { months: 1 },
        train: 'expanding',
        gap: { steps: 0 }
      },
      noMay
    )
    assert.deepEqual(
      folds.map(([, validation]) => validation),
      ['2024-04-01..2024-04-30', '2024-06-01..2024-06-30']
    )
  })

  test('cuts every group at the same time', () => {
    const msft = dailyRows().map(row => ({ ...row, ticker: 'MSFT' }))
    const panel = trainOf([...dailyRows(), ...msft])
    const folds = ml
      .walkForward({
        validationFrom: '2024-06-01',
        validation: { months: 1 },
        train: 'expanding',
        gap: { steps: 0 }
      })
      .folds(panel)
    const validation = folds[0]?.validation.rows ?? []
    for (const ticker of ['AAPL', 'MSFT']) {
      const held = validation.filter(row => row.ticker === ticker)
      assert.equal(held.length, 30)
      assert.equal(Math.min(...held.map(row => row.date)), day('2024-06-01'))
    }
  })

  test('cross-validates the training block of a fold', () => {
    const [, second] = ml
      .walkForward({
        validationFrom: '2024-04-01',
        validation: { months: 1 },
        train: 'expanding',
        gap: { steps: 0 }
      })
      .folds(train)
    assert.ok(second)
    const inner = ml
      .walkForward({
        validationFrom: '2024-03-01',
        validation: { months: 1 },
        train: 'expanding',
        gap: { steps: 0 }
      })
      .folds(second.train)
    assert.deepEqual(
      inner.map(fold => range(fold.validation)),
      ['2024-03-01..2024-03-31', '2024-04-01..2024-04-30']
    )
  })

  test('gives every block the schema, frozen', () => {
    const cv = ml.walkForward({
      validationFrom: '2024-06-01',
      validation: { months: 1 },
      train: 'expanding',
      gap: { steps: 0 }
    })
    const folds = cv.folds(train)
    assert.ok(Object.isFrozen(cv))
    assert.ok(Object.isFrozen(folds))
    for (const fold of folds) {
      assert.ok(Object.isFrozen(fold))
      for (const block of [fold.train, fold.validation]) {
        assert.equal(block.features, prices)
        assert.ok(Object.isFrozen(block.rows))
      }
    }
    assert.equal(cv.validationFrom, day('2024-06-01'))
  })
})

describe('ml.walkForward errors', () => {
  const valid: WalkForwardOptions = {
    validationFrom: '2024-04-01',
    validation: { months: 1 },
    train: 'expanding',
    gap: { steps: 0 }
  }
  const loose = (changes: Record<string, unknown>) =>
    ml.walkForward({ ...valid, ...changes } as unknown as WalkForwardOptions)

  test('rejects invalid options when it is created', () => {
    assert.throws(() => loose({ validationFrom: '04/01/2024' }), {
      name: 'TypeError',
      message: /^ml\.walkForward\(\): validationFrom expected a Date/
    })
    assert.throws(() => loose({ validation: { steps: 0 } }), {
      name: 'TypeError',
      message:
        'ml.walkForward(): validation steps must be a whole number >= 1, received {"steps":0}'
    })
    assert.throws(() => loose({ train: { days: 0 } }), {
      name: 'TypeError',
      message:
        'ml.walkForward(): train days must be a number > 0, received {"days":0}'
    })
    assert.throws(() => loose({ train: 'rolling' }), {
      name: 'TypeError',
      message:
        "ml.walkForward(): train takes 'expanding' or one unit such as { months: 3 }, received 'rolling'"
    })
    assert.throws(() => loose({ gap: undefined }), {
      name: 'TypeError',
      message: /^ml\.walkForward\(\): gap takes one unit/
    })
  })

  test('rejects a rolling window longer than the history of the first fold', () => {
    assert.throws(() => loose({ train: { months: 4 } }).folds(train), {
      name: 'RangeError',
      message:
        'walkForward.folds(): the first fold needs 4 months of training before 2024-04-01T00:00:00.000Z; the training block runs from 2024-01-01T00:00:00.000Z to 2024-06-30T00:00:00.000Z. Use a later validationFrom'
    })
  })

  test('rejects a validationFrom after the training block', () => {
    assert.throws(() => loose({ validationFrom: '2024-07-01' }).folds(train), {
      name: 'RangeError',
      message:
        'walkForward.folds(): no rows at or after validationFrom 2024-07-01T00:00:00.000Z; the training block runs from 2024-01-01T00:00:00.000Z to 2024-06-30T00:00:00.000Z'
    })
  })

  test('rejects a fold left without training rows', () => {
    assert.throws(() => loose({ validationFrom: '2024-01-01' }).folds(train), {
      name: 'RangeError',
      message:
        'walkForward.folds(): no rows left for training before 2024-01-01T00:00:00.000Z after a gap of 0 steps; the training block runs from 2024-01-01T00:00:00.000Z to 2024-06-30T00:00:00.000Z'
    })
  })

  test('rejects a block that is not the training block of a series', () => {
    const forged = {
      features: prices,
      rows: train.rows
    } as unknown as typeof train
    assert.throws(() => ml.walkForward(valid).folds(forged), {
      name: 'TypeError',
      message:
        /^walkForward\.folds\(\): expected the training block of a series/
    })
  })
})
