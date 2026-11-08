import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bridgeRouteCrossing } from './bridgeRouteCrossing.js'

test('RWS point bridges use the actual opening along the route and keep its width', () => {
  const segment={name:'Oosterdoksdoorgang',start:[52.376,4.9103],end:[52.378,4.9103],startMeters:0,endMeters:222}
  const openings=[{coordinates:[4.91,52.377],widthMeters:17},{coordinates:[4.9103,52.377],widthMeters:19}]
  const hit=bridgeRouteCrossing({type:'Point',coordinates:[4.91,52.377]},[segment],openings)
  assert.equal(hit.sourceOpening.widthMeters,19)
  assert.equal(Math.round(hit.routeMeters),111)
  assert.equal(bridgeRouteCrossing({type:'Point',coordinates:[4.91,52.377]},[segment],[]),null)
})

const polygon = { type: 'Polygon', coordinates: [[[4.8998,52.3699],[4.9002,52.3699],[4.9002,52.3701],[4.8998,52.3701],[4.8998,52.3699]]] }
const segment = { name: 'Testgracht', start: [52.369,4.9], end: [52.371,4.9], startMeters: 100, endMeters: 300 }

test('recognizes passage under a wide bridge whose corners are on the banks', () => {
  const crossing = bridgeRouteCrossing(polygon, [segment])
  assert.ok(crossing)
  assert.ok(Math.abs(crossing.routeMeters - 200) < 0.01)
  assert.equal(crossing.segmentName, 'Testgracht')
})
test('excludes a nearby route and a route ending before the bridge', () => {
  assert.equal(bridgeRouteCrossing(polygon, [{ ...segment, start: [52.369,4.901], end: [52.371,4.901] }]), null)
  assert.equal(bridgeRouteCrossing(polygon, [{ ...segment, end: [52.3698,4.9] }]), null)
})
test('recognizes the four Nieuwe Herengracht bridges against the actual canal geometry', () => {
  const canals = JSON.parse(readFileSync(new URL('../../public/export.geojson', import.meta.url)))
  const bridges = JSON.parse(readFileSync(new URL('./fixtures/nieuwe-herengracht-bridges.json', import.meta.url)))
  const segments = canals.features.filter(f => f.properties?.name === 'Nieuwe Herengracht')
    .flatMap(f => f.geometry.coordinates.slice(1).map((end, i) => ({
      name: f.properties.name, start: f.geometry.coordinates[i].toReversed(), end: end.toReversed(), startMeters: 0, endMeters: 100,
    })))
  for (const bridge of bridges) assert.ok(bridgeRouteCrossing(bridge.geometry, segments), bridge.properties.name)
  assert.equal(bridges.length, 4)
})
