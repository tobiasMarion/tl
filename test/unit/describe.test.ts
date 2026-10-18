import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { inspect } from 'node:util'
import { ml } from '../../src/index.ts'

// Colors depend on the terminal, so the diagrams are compared without them
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes
const plain = (text: string) => text.replace(/\u001b\[\d+m/g, '')

describe('printing folds', () => {
  const points = ml.features({
    id: ml.number(),
    label: ml.category(['a', 'b'])
  })
  const { train } = ml
    .dataset(
      points,
      Array.from({ length: 13 }, (_, id) => ({ id, label: id % 2 ? 'b' : 'a' }))
    )
    .split({ test: 0.01, seed: 7 })

  test('draws k-fold folds with their sizes and classes', () => {
    // 7 'a' and 5 'b' rows: each class gets its share per fold, give or take one
    const folds = ml.kFold({ k: 3, seed: 42, stratify: 'label' }).folds(train)
    assert.equal(
      plain(String(folds)),
      [
        "k-fold: 3 folds of 12 training rows, stratified by 'label', seed 42",
        'fold 1  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓████████████████████████████████   8 train,  4 validation  a 3, b 1',
        'fold 2  ████████████████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓████████████████   8 train,  4 validation  a 2, b 2',
        'fold 3  ████████████████████████████████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   8 train,  4 validation  a 2, b 2',
        '█ train  ▓ validation'
      ].join('\n')
    )
  })

  test('prints the same diagram through console.log', () => {
    const folds = ml.kFold({ k: 3, seed: 42 }).folds(train)
    assert.equal(inspect(folds), String(folds))
  })

  test('draws walk-forward folds on a timeline', () => {
    const prices = ml.features({ date: ml.timestamp(), close: ml.number() })
    // One row a day in January 2024, and a test block from Feb 1
    const days = Array.from({ length: 32 }, (_, i) => ({
      date: Date.UTC(2024, 0, 1 + i),
      close: i
    }))
    const { train: series } = ml
      .series(prices, days, { time: 'date' })
      .split({ testFrom: '2024-02-01', gap: { steps: 0 } })
    // Each fold trains on the 12 days before its block minus the 2-day gap
    const folds = ml
      .walkForward({
        validationFrom: '2024-01-19',
        validation: { days: 6 },
        train: { days: 12 },
        gap: { days: 2 }
      })
      .folds(series)
    assert.equal(
      plain(String(folds)),
      [
        'walk-forward: 3 folds, rolling 12 days train, 6 days validation blocks, gap of 2 days',
        '        2024-01-01                            2024-01-31',
        'fold 1           ████████████████░░░▓▓▓▓▓▓▓▓▓▓            train 2024-01-07..2024-01-16, validation 2024-01-19..2024-01-24',
        'fold 2                     ████████████████░░░▓▓▓▓▓▓▓▓▓   train 2024-01-13..2024-01-22, validation 2024-01-25..2024-01-30',
        'fold 3                              ████████████████░░░▓  train 2024-01-19..2024-01-28, validation 2024-01-31..2024-01-31',
        '█ train  ▓ validation  ░ dropped by the gap'
      ].join('\n')
    )
  })
})

describe('printing blocks', () => {
  const measures = ml.features({
    taken: ml.timestamp(),
    size: ml.number().optional(),
    kind: ml.category(['small', 'large'])
  })
  const rows = Array.from({ length: 20 }, (_, i) => ({
    taken: Date.UTC(2024, 0, 1 + i),
    size: i === 3 ? null : i * 1.5,
    kind: i < 10 ? 'small' : 'large'
  }))
  const data = ml.dataset(measures, rows)

  test('prints a block as a table, numbered by position in the data', () => {
    const { test: held } = data.split({ test: 0.2, seed: 1 })
    const numbers = held.rows.map(row =>
      rows.findIndex(r => r.taken === row.taken)
    )
    const table = plain(String(held)).split('\n')
    assert.equal(table[0], 'test: 4 rows')
    assert.equal(table[1], ' #       taken  size  kind')
    assert.deepEqual(
      table.slice(2).map(line => Number(line.trim().split(/ +/)[0])),
      numbers
    )
    assert.equal(inspect(held), String(held))
  })

  test('prints missing values and dates', () => {
    const two = ml.dataset(measures, [rows[3], rows[4]])
    const { train, test: held } = two.split({ test: 0.5, seed: 1 })
    const all = plain(`${train}\n${held}`)
    assert.match(all, /0 {2}2024-01-04 {2}null {2}small/)
    assert.match(all, /1 {2}2024-01-05 {5}6 {2}small/)
  })

  test('keeps the first and last rows of a long block', () => {
    const { train } = data.split({ test: 0.05, seed: 1 })
    const table = plain(String(train)).split('\n')
    assert.equal(table[0], 'train: 19 rows')
    // header, titles, 10 rows, the ellipsis, 5 rows
    assert.equal(table.length, 2 + 10 + 1 + 5)
    assert.equal(table[12], '… 4 more rows')
  })

  test('gives a row the same number in every fold', () => {
    const { train } = data.split({ test: 0.2, seed: 1 })
    const folds = ml.kFold({ k: 4, seed: 1 }).folds(train)
    const numbers = (text: string) =>
      plain(text)
        .split('\n')
        .slice(2)
        .map(line => Number(line.trim().split(/ +/)[0]))
        .toSorted((a, b) => a - b)
    const held = folds.flatMap(fold => numbers(String(fold.validation)))
    assert.deepEqual(
      held.toSorted((a, b) => a - b),
      numbers(String(train))
    )
  })

  test('prints a fold as its number and both blocks', () => {
    const { train } = data.split({ test: 0.2, seed: 1 })
    const second = ml.kFold({ k: 4, seed: 1 }).folds(train)[1]
    assert.ok(second)
    assert.equal(
      plain(String(second)),
      plain(`fold 2 of 4\n\n${second.train}\n\n${second.validation}`)
    )
    assert.equal(inspect(second), String(second))
  })

  test('leaves rows, keys and JSON as they are', () => {
    const { train } = data.split({ test: 0.2, seed: 1 })
    const [first] = ml.kFold({ k: 4, seed: 1 }).folds(train)
    assert.ok(first)
    assert.deepEqual(Object.keys(first), ['train', 'validation'])
    assert.deepEqual(Object.keys(train), ['features', 'rows'])
    assert.equal(
      JSON.stringify(first.validation.rows),
      JSON.stringify([...first.validation.rows])
    )
  })
})
