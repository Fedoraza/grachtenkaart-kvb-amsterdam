import test from 'node:test'
import assert from 'node:assert/strict'
import { isPublicMapRead } from './public-map-access.mjs'

test('guests can read map data for routing and filters', () => {
  for (const path of ['/api/map/bridges', '/api/map/navigation-layer', '/api/map/objects', '/api/fleet/summary', '/api/fleet/leaderboard', '/api/water-level/surinamekade', '/api/fleet/boats/12/photo', '/api/ais/vessels/244123456/history']) {
    assert.equal(isPublicMapRead('GET', path), true)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal(isPublicMapRead(method, path), false)
    }
  }
})

test('private account data and unknown map endpoints require authentication', () => {
  for (const path of ['/api/planning/day', '/api/fleet/boats', '/api/fleet/whatsapp', '/api/boat-duty',
    '/api/inventory', '/api/whatsapp/status',
    '/api/map/objects/private', '/api/map/new-feature']) {
    assert.equal(isPublicMapRead('GET', path), false)
  }
})
