import test from 'node:test'
import assert from 'node:assert/strict'
import { activeClosurePoints } from './route-closures.mjs'
import { applyWaterwayEdits, waterwayKey } from './waterway-edits.mjs'
import { buildCanalRoutingNetwork, planCanalRoute } from '../src/scripts/canalRouting.js'
const now = Date.parse('2026-09-10T12:00:00Z')
const source = { type: 'Feature', id: 'way/test', properties: { name: 'Herengracht' }, geometry: { type: 'LineString', coordinates: [[4.9,52.37],[4.901,52.37],[4.902,52.37]] } }
const detour = { type: 'Feature', properties: { name: 'Omvaart' }, geometry: { type: 'LineString', coordinates: [[4.9,52.37],[4.901,52.371],[4.902,52.37]] } }
const collection = { type: 'FeatureCollection', features: [source, detour] }
const closure = { ...source, properties: { name: 'Werkzaamheden', type: 'Stremming', blocksRouting: true, waterway: 'Herengracht', start: '2026-09-10T10:00:00Z', end: '2026-09-10T15:00:00Z' } }
function route(data, points = []) {
  return planCanalRoute({latitude:52.37,longitude:4.9}, {latitude:52.37,longitude:4.902},
    buildCanalRoutingNetwork(data, { respectRestrictions: true, includeSupplementalOpenWater: false }), { closurePoints: points })
}
test('a temporary line closure causes a detour along another waterway', () => {
  const points = activeClosurePoints([closure], now)
  assert.ok(points.length > 3)
  const result = route(collection, points)
  assert.equal(result.status, 'ok')
  assert.ok(result.steps.some(step => step.name === 'Omvaart'))
  assert.ok(!result.steps.some(step => step.name === 'Herengracht'))
})
test('expired and future closures and no-service notices do not block routes', () => {
  assert.equal(activeClosurePoints([closure], Date.parse('2026-09-10T16:00:00Z')).length, 0)
  assert.equal(activeClosurePoints([closure], Date.parse('2026-09-10T09:00:00Z')).length, 0)
  assert.equal(activeClosurePoints([{ ...closure, properties: { ...closure.properties, blocksRouting: false } }], now).length, 0)
})
test('saved permanent closures affect routing without mutating the original map', () => {
  const edited = { ...source, properties: { ...source.properties, closed: true } }
  const data = applyWaterwayEdits(collection, [{ objectKey: waterwayKey(source), action: 'upsert', feature: edited }])
  assert.equal(source.properties.closed, undefined)
  assert.ok(route(data).steps.some(step => step.name === 'Omvaart'))
  const reopened = applyWaterwayEdits(collection, [{ objectKey: waterwayKey(source), action: 'upsert', feature: source }])
  assert.ok(route(reopened).steps.some(step => step.name === 'Herengracht'))
})
test('editing a line to reverse one-way changes allowed travel direction', () => {
  const reversed = { ...source, properties: { ...source.properties, oneway: '-1' } }
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [reversed] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  const west = { latitude: 52.37, longitude: 4.9 }, east = { latitude: 52.37, longitude: 4.902 }
  assert.notEqual(planCanalRoute(west, east, network).status, 'ok')
  assert.equal(planCanalRoute(east, west, network).status, 'ok')
})
