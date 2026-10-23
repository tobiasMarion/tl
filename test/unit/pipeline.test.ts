import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ml } from '../../src/index.ts'

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes
const plain = (text: string) => text.replace(/\u001b\[\d+m/g, '')

const pointSchema = ml
  .features({
    x: ml.number(),
    label: ml.category(['a', 'b'])
  })
  .target('label')

const points = ml.dataset(
  pointSchema,
  Array.from({ length: 10 }, (_, x) => ({ x, label: x % 2 ? 'b' : 'a' }))
)
const { train, test: testBlock } = points.split({ test: 0.3, seed: 1 })

describe('ml.pipeline', () => {
  test('fit returns a new value and leaves the pipeline as it was', () => {
    const pipeline = ml.pipeline(pointSchema)
    const first = pipeline.fit(train)
    const second = pipeline.fit(train)
    assert.notEqual(first, second)
    assert.ok(Object.isFrozen(pipeline))
    assert.ok(Object.isFrozen(first))
  })

  test('transform keeps the rows of a block in order', () => {
    const fitted = ml.pipeline(pointSchema).fit(train)
    assert.deepEqual(fitted.transform(testBlock).rows, testBlock.rows)
    assert.ok(Object.isFrozen(fitted.transform(testBlock).rows))
  })

  test('a prepared block prints its role and the positions of its rows', () => {
    const prepared = ml.pipeline(pointSchema).fit(train).transform(testBlock)
    const table = plain(String(prepared)).split('\n')
    assert.equal(table[0], 'prepared test: 3 rows')
    assert.deepEqual(
      table.slice(2).map(line => line.trim().split(/\s+/)[0]),
      testBlock.rows.map(row => String(points.rows.indexOf(row)))
    )
  })

  test('transform rejects a value that is not a block', () => {
    const fitted = ml.pipeline(pointSchema).fit(train)
    assert.throws(
      () => fitted.transform({ rows: [] } as never),
      /expects a block from split\(\) or folds\(\)/
    )
  })

  test('a fitted pipeline without steps says so', () => {
    const fitted = ml.pipeline(pointSchema).fit(train)
    assert.equal(plain(String(fitted)), 'fitted pipeline: no steps')
  })
})
