import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildCanalRoutingNetwork, generateCanalLoopRoute, planCanalRoute, planCanalRouteVia, reconstructCanalRoute } from './canalRouting.js'

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

test('plans a manual route over the canal network', () => {
  const network = buildCanalRoutingNetwork(canals, { respectRestrictions: true })
  const result = planCanalRoute(
    { latitude: 52.37001, longitude: 4.90002 },
    { latitude: 52.37001, longitude: 4.90198 },
    network,
  )

  assert.equal(result.status, 'ok')
  assert.ok(result.coordinates.length >= 2)
  assert.ok(result.distanceMeters > 100)
  assert.ok(result.durationMinutes > 0)
})

test('manual route planning reports points that are too far from water', () => {
  const network = buildCanalRoutingNetwork(canals, { respectRestrictions: true })
  const result = planCanalRoute(
    { latitude: 52.3800, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9020 },
    network,
    { snapDistanceMeters: 50 },
  )

  assert.equal(result.status, 'not-on-water')
})

test('manual route planning can connect freely placed map points to the nearest water', () => {
  const network = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9020, 52.3700]] }, properties: { name: 'Test canal' } }],
  }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  const result = planCanalRoute(
    { latitude: 52.3750, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9020 },
    network,
    { snapDistanceMeters: Infinity },
  )

  assert.ok(['ok', 'partial'].includes(result.status))
  assert.ok(result.snapped[0].snapDistanceMeters > 120)
  assert.ok(result.coordinates.length >= 2)
})

test('manual route planning returns the closest reachable water point when the destination is disconnected', () => {
  const network = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3700]] }, properties: { name: 'Bereikbaar water' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9100, 52.3700], [4.9110, 52.3700]] }, properties: { name: 'Los water' } },
    ],
  }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  const result = planCanalRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9110 },
    network,
    { snapDistanceMeters: 40 },
  )

  assert.equal(result.status, 'partial')
  assert.ok(result.distanceMeters > 50)
  assert.ok(result.partialRoute.distanceToTargetMeters > 500)
  assert.ok(result.coordinates.length >= 2)
})

test('manual route planning respects oneway water segments', () => {
  const network = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3700]] },
      properties: { oneway: 'yes' },
    }],
  }, { respectRestrictions: true })

  assert.equal(planCanalRoute({ latitude: 52.3700, longitude: 4.9000 }, { latitude: 52.3700, longitude: 4.9010 }, network).status, 'ok')
  assert.equal(planCanalRoute({ latitude: 52.3700, longitude: 4.9010 }, { latitude: 52.3700, longitude: 4.9000 }, network).status, 'partial')
})

test('manual route planning supports waypoints and route steps', () => {
  const network = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3700]] }, properties: { name: 'A-water' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9010, 52.3700], [4.9010, 52.3710]] }, properties: { name: 'B-water' } },
    ],
  }, { respectRestrictions: true })

  const result = planCanalRouteVia([
    { latitude: 52.3700, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9010 },
    { latitude: 52.3710, longitude: 4.9010 },
  ], network)

  assert.equal(result.status, 'ok')
  assert.equal(result.steps.length, 2)
  assert.deepEqual(result.steps.map((step) => step.name), ['A-water', 'B-water'])
  assert.ok(result.segments.length >= 2)
  assert.deepEqual([...new Set(result.segments.map((segment) => segment.name))], ['A-water', 'B-water'])
  assert.ok(result.segments.every((segment) => Number.isFinite(segment.startMeters) && Number.isFinite(segment.endMeters) && segment.endMeters > segment.startMeters))
})

test('generates a loop route that returns to the start within the requested time', () => {
  const network = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3700], [4.9010, 52.3710], [4.9000, 52.3710], [4.9000, 52.3700]] }, properties: { name: 'Rondje testwater' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9010, 52.3700], [4.9020, 52.3700], [4.9020, 52.3710], [4.9010, 52.3710]] }, properties: { name: 'Extra lus' } },
    ],
  }, { respectRestrictions: true, includeSupplementalOpenWater: false })

  const result = generateCanalLoopRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    network,
    { targetMinutes: 20, speedKnots: 5.5, seed: 42, attempts: 80 },
  )

  assert.equal(result.status, 'ok')
  assert.equal(result.routeType, 'loop')
  assert.ok(result.durationMinutes <= 20)
  assert.ok(result.coordinates.length >= 4)
  assert.deepEqual(result.coordinates[0], result.coordinates.at(-1))
})

test('generated loop routes do not use virtual map-gap connectors', () => {
  const network = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3700]] }, properties: { name: 'Zuidelijke losse lijn' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9000, 52.3703], [4.9010, 52.3703]] }, properties: { name: 'Noordelijke losse lijn' } },
    ],
  }, { respectRestrictions: true, includeSupplementalOpenWater: false })

  assert.ok(network.virtualEdges.size > 0)

  const result = generateCanalLoopRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    network,
    { targetMinutes: 10, speedKnots: 5.5, seed: 7, attempts: 40 },
  )

  assert.equal(result.status, 'no-loop')
})

test('manual route ETA increases when live AIS traffic is near the route', () => {
  const network = buildCanalRoutingNetwork(canals, { respectRestrictions: true })
  const plain = planCanalRoute({ latitude: 52.3700, longitude: 4.9000 }, { latitude: 52.3700, longitude: 4.9020 }, network)
  const busy = planCanalRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9020 },
    network,
    { trafficPoints: Array.from({ length: 8 }, (_, index) => ({ mmsi: String(index), latitude: 52.3700, longitude: 4.9002 + index * 0.0002, receivedAt: new Date().toISOString() })) },
  )

  assert.equal(busy.status, 'ok')
  assert.ok(busy.trafficFactor > plain.trafficFactor)
  assert.ok(busy.trafficVesselCount >= 8)
})

test('route planning includes the IJ as navigable open water', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [] }, { respectRestrictions: true })
  const restricted = planCanalRoute(
    { latitude: 52.3830, longitude: 4.8950 },
    { latitude: 52.3810, longitude: 4.9110 },
    network,
    { snapDistanceMeters: 160 },
  )
  assert.equal(restricted.status, 'partial')

  const result = planCanalRoute(
    { latitude: 52.3830, longitude: 4.8950 },
    { latitude: 52.3810, longitude: 4.9110 },
    network,
    { snapDistanceMeters: 160, allowZone3: true },
  )

  assert.equal(result.status, 'ok')
  assert.equal(result.virtualSegmentCount, 0)
  assert.ok(result.steps.some((step) => step.name === 'IJ'))
  assert.equal(result.segments.some((segment) => segment.name === 'IJ' && (segment.start.latitude < 52.382 || segment.end.latitude < 52.382)), false)
  assert.ok(result.segments.filter((segment) => segment.name === 'IJ').length > 1)
})

test('zone 3 route can use IJhaven instead of jumping over land', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [] }, { respectRestrictions: true })
  const result = planCanalRoute(
    { latitude: 52.3811, longitude: 4.9200 },
    { latitude: 52.3784, longitude: 4.9570 },
    network,
    { snapDistanceMeters: 80, allowZone3: true },
  )

  assert.equal(result.status, 'ok')
  assert.equal(result.virtualSegmentCount, 0)
  assert.ok(result.steps.some((step) => step.name === 'IJhaven'))
  assert.ok(result.steps.some((step) => step.name === 'IJhaven westelijke toegang'))
})

test('zone 3 route can cross the IJ between Westerdok and Oosterdok', () => {
  const exportGeoJson = JSON.parse(readFileSync(new URL('../../public/export.geojson', import.meta.url), 'utf8'))
  const network = buildCanalRoutingNetwork(exportGeoJson, { respectRestrictions: true })
  const result = planCanalRoute(
    { latitude: 52.3830424, longitude: 4.8907017 },
    { latitude: 52.3783535, longitude: 4.9106169 },
    network,
    { snapDistanceMeters: 30, allowZone3: true },
  )

  assert.equal(result.status, 'ok')
  assert.equal(result.virtualSegmentCount, 0)
  assert.ok(result.steps.some((step) => step.name === 'IJ'))
  assert.equal(result.segments.some((segment) => segment.name === 'IJ' && (segment.start.latitude < 52.382 || segment.end.latitude < 52.382)), false)
  assert.ok(result.steps.some((step) => step.name === 'IJ verbinding Westerdoksluis'))
  assert.ok(result.steps.some((step) => step.name === 'IJ verbinding Oosterdoksdoorgang'))
  assert.ok(result.warnings.some((warning) => warning.includes('Zone 3')))
})

test('zone 3 route can continue from the IJ into the IJhaven mesh', () => {
  const exportGeoJson = JSON.parse(readFileSync(new URL('../../public/export.geojson', import.meta.url), 'utf8'))
  const network = buildCanalRoutingNetwork(exportGeoJson, { respectRestrictions: true })
  const result = planCanalRoute(
    { latitude: 52.3830, longitude: 4.8950 },
    { latitude: 52.3810, longitude: 4.9600 },
    network,
    { snapDistanceMeters: 180, allowZone3: true },
  )

  assert.equal(result.status, 'ok')
  assert.equal(result.virtualSegmentCount, 0)
  assert.ok(result.steps.some((step) => step.name === 'IJ'))
  assert.equal(result.segments.some((segment) => segment.name === 'IJ' && (segment.start.latitude < 52.382 || segment.end.latitude < 52.382)), false)
  assert.ok(result.steps.some((step) => step.name === 'IJhaven'))
  assert.ok(result.steps.some((step) => step.name === 'IJhaven oostelijke toegang'))
})

test('route planning avoids temporary closure points', () => {
  const network = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700]] }, properties: { name: 'Gestremd water' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3710], [4.9020, 52.3700]] }, properties: { name: 'Omvaart water' } },
    ],
  }, { respectRestrictions: true, includeSupplementalOpenWater: false })

  const result = planCanalRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9020 },
    network,
    { closurePoints: [{ latitude: 52.3700, longitude: 4.9010, radiusMeters: 35 }] },
  )

  assert.equal(result.status, 'ok')
  assert.ok(result.steps.some((step) => step.name === 'Omvaart water'))
  assert.equal(result.steps.some((step) => step.name === 'Gestremd water'), false)
})

test('route planning rejects water segments below the configured boat height', () => {
  const restricted = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3700]] },
      properties: { name: 'Lage brug', 'seamark:bridge:clearance_height': '1.50' },
    }],
  }
  const network = buildCanalRoutingNetwork(restricted, { respectRestrictions: true, includeSupplementalOpenWater: false })

  assert.equal(planCanalRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9010 },
    network,
    { boatProfile: { heightMeters: 1.2, safetyMarginMeters: 0.1 } },
  ).status, 'ok')
  const tooHigh = planCanalRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9010 },
    network,
    { boatProfile: { heightMeters: 1.6, safetyMarginMeters: 0.1 } },
  )
  assert.equal(tooHigh.status, 'partial')
  assert.ok(tooHigh.partialRoute.distanceToTargetMeters > 50)
})

test('production waterway export includes Blauwburgwal and a real Muntbrug connector', () => {
  const exportGeoJson = JSON.parse(readFileSync(new URL('../../public/export.geojson', import.meta.url), 'utf8'))
  const network = buildCanalRoutingNetwork(exportGeoJson, { respectRestrictions: true })
  assert.ok(exportGeoJson.features.some((feature) => feature.properties?.name === 'Blauwburgwal'))
  assert.ok(exportGeoJson.features.some((feature) => feature.id === 'way/28346224'))

  const blauwburgwal = planCanalRoute(
    { latitude: 52.3769011, longitude: 4.8898875 },
    { latitude: 52.3763449, longitude: 4.8913117 },
    network,
    { snapDistanceMeters: 30 },
  )
  assert.equal(blauwburgwal.status, 'ok')
  assert.ok(blauwburgwal.steps.some((step) => step.name === 'Blauwburgwal'))

  const muntbrug = planCanalRoute(
    { latitude: 52.3673029, longitude: 4.8938637 },
    { latitude: 52.3673606, longitude: 4.8939945 },
    network,
    { snapDistanceMeters: 10 },
  )
  assert.equal(muntbrug.status, 'ok')
  assert.equal(muntbrug.virtualSegmentCount, 0)
  assert.ok(muntbrug.steps.some((step) => step.name === 'Muntbrug routeverbinding'))
})
