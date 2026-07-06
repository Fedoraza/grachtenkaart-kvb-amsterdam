import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCanalRoutingNetwork, reconstructCanalRoute } from './canalRouting.js'

const canals = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700]],
    },
    properties: {},
  }],
}

test('reconstructs nearby chronological AIS reports along the canal', () => {
  const network = buildCanalRoutingNetwork(canals)
  const result = reconstructCanalRoute([
    { latitude: 52.37001, longitude: 4.90005, receivedAt: 1_000_000 },
    { latitude: 52.37001, longitude: 4.90195, receivedAt: 1_120_000 },
  ], network)

  assert.equal(result.omittedSegments, 0)
  assert.ok(result.paths.length > 0)
})

test('omits implausible AIS jumps instead of inventing a large route', () => {
  const network = buildCanalRoutingNetwork(canals)
  const result = reconstructCanalRoute([
    { latitude: 52.3700, longitude: 4.9000, receivedAt: 1_000_000 },
    { latitude: 52.4200, longitude: 4.9500, receivedAt: 1_060_000 },
  ], network)

  assert.equal(result.omittedSegments, 1)
  assert.deepEqual(result.paths, [])
  assert.deepEqual(result.fallbackSegments, [])
})

test('does not snap AIS reports from a distant parallel location onto a canal', () => {
  const network = buildCanalRoutingNetwork(canals)
  const result = reconstructCanalRoute([
    { latitude: 52.3710, longitude: 4.9000, receivedAt: 1_000_000 },
    { latitude: 52.3710, longitude: 4.9010, receivedAt: 1_120_000 },
  ], network)

  assert.deepEqual(result.paths, [])
  assert.equal(result.fallbackSegments.length, 1)
})
