import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ml } from '../src/index.ts'

test('exposes the ml namespace', () => {
  assert.equal(typeof ml, 'object')
})
