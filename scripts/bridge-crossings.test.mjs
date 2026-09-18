import test from 'node:test'
import assert from 'node:assert/strict'
import { uniqueBridgeCrossing } from './bridge-crossings.mjs'
const polygon = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]]
const edge = (a, b) => ({ a, b, name: 'Gracht' })
test('accepts one crossing even when another waterway is nearby outside the bridge', () => {
  assert.equal(uniqueBridgeCrossing([edge([-5, 5], [15, 5]), edge([-5, 15], [15, 15])], polygon).length, 1)
})
test('joins consecutive pieces of the same passage', () => {
  assert.equal(uniqueBridgeCrossing([edge([-5, 5], [5, 5]), edge([5, 5], [15, 5])], polygon).length, 2)
})
test('rejects multiple passages even with the same waterway name', () => {
  assert.equal(uniqueBridgeCrossing([edge([-5, 3], [15, 3]), edge([-5, 7], [15, 7])], polygon), false)
  assert.equal(uniqueBridgeCrossing([edge([-5, 5], [15, 5]), edge([5, -5], [5, 15])], polygon), false)
})
test('rejects branches within the bridge', () => {
  assert.equal(uniqueBridgeCrossing([edge([-5, 5], [5, 5]), edge([5, 5], [15, 5]), edge([5, 5], [5, 15])], polygon), false)
})
test('boundary touches and holes are not crossings', () => {
  assert.equal(uniqueBridgeCrossing([edge([-5, 0], [15, 0])], polygon), null)
  const hole = [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]
  assert.equal(uniqueBridgeCrossing([edge([4, 5], [6, 5])], [[polygon[0][0], hole]]), null)
})
