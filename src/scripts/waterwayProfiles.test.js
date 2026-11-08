import test from 'node:test'
import assert from 'node:assert/strict'
import { waterwayProfileForFeature } from './waterwayProfiles.js'
import { buildCanalRoutingNetwork, planCanalRoute } from './canalRouting.js'

const line = (name, coordinates, properties = {}) => ({ type: 'Feature', properties: { name, ...properties }, geometry: { type: 'LineString', coordinates } })
const start = { latitude: 52.37, longitude: 4.9 }
const end = { latitude: 52.37, longitude: 4.902 }
function network(properties = {}, name = 'Prinsengracht') {
  return buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line(name, [[4.9, 52.37], [4.901, 52.37], [4.902, 52.37]], properties),
    line('Amstel', [[4.9, 52.37], [4.9, 52.371], [4.902, 52.371], [4.902, 52.37]]),
  ] }, { includeSupplementalOpenWater: false, respectRestrictions: true })
}

test('profile B enforces vessel width and length, including the exact boundary', () => {
  const n = network()
  const fit = planCanalRoute(start, end, n, { boatProfile: { widthMeters: 4.25, lengthMeters: 20 } })
  assert.ok(fit.steps.some((s) => s.name === 'Prinsengracht'))
  for (const boatProfile of [{ widthMeters: 4.26 }, { lengthMeters: 20.01 }]) {
    const route = planCanalRoute(start, end, n, { boatProfile })
    assert.equal(route.status, 'ok')
    assert.equal(route.steps.some((s) => s.name === 'Prinsengracht'), false)
    assert.ok(route.steps.some((s) => s.name === 'Amstel'))
  }
})

test('narrow profile and stricter local maxwidth both apply', () => {
  const n = network({ navigationProfile: 'E®', maxwidth: '3,5' })
  const route = planCanalRoute(start, end, n, { boatProfile: { widthMeters: 3.6 } })
  assert.equal(route.steps.some((s) => s.name === 'Prinsengracht'), false)
})

test('does not infer a draft limit from a NAP profile depth', () => {
  const n = network()
  const edge = [...n.nodes.values()][0].neighbors.values().next().value
  assert.equal(edge.maxDraft, null)
})

test('unmapped waterways warn about incomplete profile coverage', () => {
  const route = planCanalRoute(start, end, network({}, 'Onbekende testgracht'), { boatProfile: { widthMeters: 4, lengthMeters: 19 } })
  assert.ok(route.warnings.some((warning) => warning.includes('Vaarprofiel onbekend')))
})

test('Amsterdam names are not applied elsewhere or to mixed-profile waterways', () => {
  assert.equal(waterwayProfileForFeature(line('Prinsengracht', [[5.2, 52.2], [5.21, 52.2]])), null)
  assert.equal(waterwayProfileForFeature(line('Lijnbaansgracht', [[4.9, 52.37], [4.901, 52.37]])), null)
  assert.equal(waterwayProfileForFeature(line('Test', [[4.9, 52.37], [4.901, 52.37]], { doorvaartprofiel: 'E(r)' })).code, 'E®')
})

test('no boat dimensions is supported without a null profile error', () => {
  assert.equal(planCanalRoute(start, end, network(), { boatProfile: null }).status, 'ok')
})

test('synthetic map-gap connections inherit adjacent vessel limits', () => {
  const n = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line('Smal water', [[4.9, 52.37], [4.901, 52.37]], { maxwidth: '2', maxlength: '10' }),
    line('Breed water', [[4.9012, 52.37], [4.902, 52.37]]),
  ] }, { includeSupplementalOpenWater: false, respectRestrictions: true })
  const gaps = [...n.nodes.values()].flatMap((node) => [...node.neighbors.values()]).filter((edge) => edge.virtual)
  assert.ok(gaps.length)
  assert.ok(gaps.every((edge) => edge.clearanceWidth === 2 && edge.maxLength === 10))
  assert.equal(planCanalRoute(start, end, n, { boatProfile: { widthMeters: 2 } }).status, 'ok')
  assert.notEqual(planCanalRoute(start, end, n, { boatProfile: { widthMeters: 2.01 } }).status, 'ok')
})
