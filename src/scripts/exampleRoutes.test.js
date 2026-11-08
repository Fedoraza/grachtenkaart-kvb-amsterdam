import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EXAMPLE_ROUTES, EXAMPLE_ROUTE_BOAT, exampleRouteFromSearch } from '../../shared/example-routes.mjs'
import { buildCanalRoutingNetwork, planCanalRouteVia } from './canalRouting.js'

const geo = JSON.parse(readFileSync(new URL('../../public/export.geojson', import.meta.url)))
const network = buildCanalRoutingNetwork(geo, { respectRestrictions: true })
for (const example of EXAMPLE_ROUTES) {
  test(`example ${example.slug} follows mapped water without gap connectors`, () => {
    const result = planCanalRouteVia(example.points, network, { speedKmh: example.speedKmh, boatProfile: EXAMPLE_ROUTE_BOAT, allowZone3: false, avoidVirtualEdges: example.avoidVirtualEdges })
    assert.equal(result.status, 'ok')
    assert.equal(result.virtualSegmentCount, 0)
    assert.ok(Math.abs(result.distanceMeters - example.distanceMeters) <= 15)
    assert.equal(result.durationMinutes, example.durationMinutes)
    assert.ok(result.snapped.every((point) => point.snapDistanceMeters <= 2))
  })
}

test('example links import points by known slug without importing boat dimensions', () => {
  for (const example of EXAMPLE_ROUTES) {
    const loaded = exampleRouteFromSearch(new URL(example.plannerUrl, 'https://boottracker.nl').search)
    assert.equal(loaded.slug, example.slug)
    assert.equal(loaded.points[0].role, 'start')
    assert.equal(loaded.points.at(-1).role, 'end')
    assert.equal(loaded.boatProfile, undefined)
    loaded.points[0].latitude = 0
    assert.notEqual(exampleRouteFromSearch(`?voorbeeld=${example.slug}`).points[0].latitude, 0)
  }
  assert.equal(exampleRouteFromSearch('?voorbeeld=unknown'), null)
  assert.equal(exampleRouteFromSearch('?voorbeeld=herengracht-noord-zuid&route=shared-token'), null)
  assert.equal(exampleRouteFromSearch('?voorbeeld=<script>alert(1)</script>'), null)
})
