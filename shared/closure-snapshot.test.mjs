import test from 'node:test'
import assert from 'node:assert/strict'
import { closureSnapshot } from './closure-snapshot.mjs'
test('a cached snapshot removes expired notices and activates planned windows without mutating the source', () => {
  const now = Date.parse('2026-11-07T12:00:00Z')
  const data = { fetchedAt: 'unchanged', stale: true, features: [
    { id: 'expired', properties: { end: new Date(now).toISOString() } },
    { id: 'active', properties: { state: 'upcoming', start: new Date(now - 1).toISOString(), end: new Date(now + 1000).toISOString() } },
    { id: 'later', properties: { start: new Date(now + 1000).toISOString() } },
  ] }
  const result = closureSnapshot(data, now)
  assert.deepEqual(result.features.map(f => [f.id, f.properties.state]), [['active','active'],['later','upcoming']])
  assert.equal(data.features[1].properties.state, 'upcoming')
  assert.equal(result.fetchedAt, 'unchanged')
  assert.equal(result.stale, true)
})
