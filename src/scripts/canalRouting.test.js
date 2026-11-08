import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildCanalRoutingNetwork, generateCanalLoopRoute, planCanalRoute, planCanalRouteVia, reconstructCanalRoute } from './canalRouting.js'
import { SUPPLEMENTAL_WATERWAY_FEATURES } from './supplementalWaterways.js'

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
  assert.equal(result.speedKmh, 6)
  assert.equal('speedKnots' in result, false)
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
    { targetMinutes: 20, speedKmh: 10.2, seed: 42, attempts: 80 },
  )

  assert.equal(result.status, 'ok')
  assert.equal(result.routeType, 'loop')
  assert.ok(result.durationMinutes <= 20)
  assert.ok(result.coordinates.length >= 4)
  assert.deepEqual(result.coordinates[0], result.coordinates.at(-1))
  assert.ok(result.retracedRoutePercent <= 42)
})

test('does not present a single waterway sailed out and back as a loop', () => {
  const network = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700], [4.9030, 52.3700]] },
      properties: { name: 'Doodlopende rechte lijn' },
    }],
  }, { respectRestrictions: true, includeSupplementalOpenWater: false })

  const result = generateCanalLoopRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    network,
    { targetMinutes: 20, speedKmh: 6, seed: 4, attempts: 60 },
  )

  assert.equal(result.status, 'no-loop')
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
    { targetMinutes: 10, speedKmh: 10.2, seed: 7, attempts: 40 },
  )

  assert.equal(result.status, 'no-loop')
})

test('a two-hour Amsterdam loop stays close to the requested duration', () => {
  const exportGeoJson = JSON.parse(readFileSync(new URL('../../public/export.geojson', import.meta.url), 'utf8'))
  const network = buildCanalRoutingNetwork(exportGeoJson, { respectRestrictions: true })
  const result = generateCanalLoopRoute(
    { latitude: 52.3692, longitude: 4.9206 }, network,
    { targetMinutes: 120, speedKmh: 6, seed: 2 },
  )
  assert.equal(result.status, 'ok')
  assert.ok(result.durationMinutes >= 110 && result.durationMinutes <= 120)
  assert.equal(result.virtualSegmentCount, 0)
})

test('manual route ETA ignores live AIS traffic', () => {
  const network = buildCanalRoutingNetwork(canals, { respectRestrictions: true })
  const plain = planCanalRoute({ latitude: 52.3700, longitude: 4.9000 }, { latitude: 52.3700, longitude: 4.9020 }, network, { speedKmh: 3.7 })
  const busy = planCanalRoute(
    { latitude: 52.3700, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9020 },
    network,
    { speedKmh: 3.7, trafficPoints: Array.from({ length: 8 }, (_, index) => ({ mmsi: String(index), latitude: 52.3700, longitude: 4.9002 + index * 0.0002, receivedAt: new Date().toISOString() })) },
  )

  assert.equal(busy.status, 'ok')
  assert.equal(busy.durationMinutes, plain.durationMinutes)
  assert.equal(busy.durationMinutes, busy.baseDurationMinutes)
  assert.equal('trafficDelayMinutes' in busy, false)
})

test('route planning includes the official IJ fairway as zone 3 water', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [] }, { respectRestrictions: true })
  const from = { latitude: 52.3826, longitude: 4.8993 }
  const to = { latitude: 52.3796, longitude: 4.9104 }
  const restricted = planCanalRoute(from, to, network, { snapDistanceMeters: 30 })
  assert.equal(restricted.status, 'partial')

  const result = planCanalRoute(from, to, network, { snapDistanceMeters: 30, allowZone3: true })
  assert.equal(result.status, 'ok')
  assert.equal(result.virtualSegmentCount, 0)
  assert.ok(result.steps.some((step) => step.name === 'IJ'))
  assert.ok(result.segments.filter((segment) => segment.name === 'IJ').length > 1)
})

test('zone 3 route follows the official IJhaven axis instead of jumping over land', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [] }, { respectRestrictions: true })
  const result = planCanalRoute(
    { latitude: 52.3799, longitude: 4.9131 },
    { latitude: 52.3755, longitude: 4.9388 },
    network,
    { snapDistanceMeters: 30, allowZone3: true },
  )
  assert.equal(result.status, 'ok')
  assert.equal(result.virtualSegmentCount, 0)
  assert.ok(result.steps.some((step) => step.name === 'IJhaven'))
})

test('zone 3 route connects Westerdok to Oosterdok without virtual land jumps', () => {
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
  assert.ok(result.steps.some((step) => step.name === 'IJ verbinding Westerdok'))
  assert.ok(result.steps.some((step) => step.name === 'Voormalige Oosterdoksluis'))
  assert.ok(result.warnings.some((warning) => warning.includes('Zone 3')))
})

test('zone 3 route can continue from the IJ through IJhaven to Ertshaven', () => {
  const exportGeoJson = JSON.parse(readFileSync(new URL('../../public/export.geojson', import.meta.url), 'utf8'))
  const network = buildCanalRoutingNetwork(exportGeoJson, { respectRestrictions: true })
  const result = planCanalRoute(
    { latitude: 52.3826, longitude: 4.8993 },
    { latitude: 52.3759, longitude: 4.9488 },
    network,
    { snapDistanceMeters: 30, allowZone3: true },
  )
  assert.equal(result.status, 'ok')
  assert.equal(result.virtualSegmentCount, 0)
  assert.ok(result.steps.some((step) => step.name === 'IJ'))
  assert.ok(result.steps.some((step) => step.name === 'IJhaven'))
  assert.ok(result.steps.some((step) => step.name === 'Ertshaven'))
})

test('all supplemental IJ routes cite Rijkswaterstaat and are marked zone 3', () => {
  assert.ok(SUPPLEMENTAL_WATERWAY_FEATURES.length > 0)
  for (const feature of SUPPLEMENTAL_WATERWAY_FEATURES) {
    assert.equal(feature.properties.navigationZone, 'zone3')
    assert.equal(feature.properties.source, 'Rijkswaterstaat NWB Vaarwegen')
    assert.match(feature.properties.sourceFeatureId, /^vaarwegvakken\.\d+$/)
    assert.match(feature.id, /^supplemental\/nwb-vaarwegvakken\/\d+$/)
  }
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

test('Brouwersgracht between Herengracht and Singel only permits travel toward Singel', () => {
  const data = JSON.parse(readFileSync(new URL('../../public/export.geojson', import.meta.url), 'utf8'))
  const network = buildCanalRoutingNetwork(data, { respectRestrictions: true })
  const heren = { latitude: 52.3792362, longitude: 4.8920164 }
  const singel = { latitude: 52.3787771, longitude: 4.893972 }
  const forward = planCanalRoute(heren, singel, network)
  assert.equal(forward.status, 'ok')
  assert.ok(forward.steps.some(step => step.name === 'Brouwersgracht'))
  const reverse = planCanalRoute(singel, heren, network)
  assert.equal(reverse.status, 'ok')
  assert.ok(reverse.steps.some(step => step.name === 'Blauwburgwal'))
  for (const id of ['way/1308400519','way/1308400518','way/1308400524','way/1308400517','way/1308400516']) {
    const feature = data.features.find(f => f.id === id)
    for (let i = 1; i < feature.geometry.coordinates.length; i++) {
      const a = feature.geometry.coordinates[i - 1], b = feature.geometry.coordinates[i]
      const key = p => `${p[1].toFixed(7)},${p[0].toFixed(7)}`
      assert.ok(network.nodes.get(key(a)).neighbors.has(key(b)))
      assert.equal(network.nodes.get(key(b)).neighbors.has(key(a)), false)
    }
  }
  const west = data.features.find(f => f.id === 'local/brouwersgracht-west-herengracht')
  assert.equal(west.properties.oneway, undefined)
})
