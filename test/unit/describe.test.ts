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
