import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveReportingManeuver, matchReportingMovements, nextReportingNumber, validateReportingRules } from '../../shared/reporting-movements.mjs'

const point = { latitude: 52, longitude: 4 }
test('selects the next numeric reporting number', () => {
  assert.equal(nextReportingNumber([{ properties: { number: 82 } }, { properties: { number: '17' } }, { properties: { number: 'MP-old' } }]), 83)
  assert.equal(nextReportingNumber([]), 1)
})
const route = [
  { name: 'Reguliersgracht', start: [51.9995, 4], end: [52, 4], startMeters: 0, endMeters: 56 },
  { name: 'Herengracht', start: [52, 4], end: [52, 4.001], startMeters: 56, endMeters: 124 },
]
const rule = { incomingLine: 'Reguliersgracht', bearing: 0, outgoingLine: 'Herengracht', outgoingBearing: 90, call: 'Regulier de Heren op richting Amstel' }
test('matches arrival line, direction, next line and departure direction', () => {
  assert.equal(matchReportingMovements(point, route, [rule]).length, 1)
  for (const patch of [{ bearing: 180 }, { outgoingLine: 'Prinsengracht' }, { outgoingBearing: 270 }, { incomingLine: 'Keizersgracht' }]) {
    assert.equal(matchReportingMovements(point, route, [{ ...rule, ...patch }]).length, 0)
  }
})
test('does not match a desired line reached only after another waterway', () => {
  const extra = { name: 'Amstel', start: [52, 4.001], end: [52.0001, 4.001], startMeters: 124, endMeters: 135 }
  assert.equal(matchReportingMovements(point, [...route, extra], [{ ...rule, outgoingLine: 'Amstel' }]).length, 0)
})
test('supports unrestricted continuation and suppresses distant points', () => {
  const any = { ...rule, outgoingLine: '', outgoingBearing: '' }
  assert.equal(matchReportingMovements(point, route, [any]).length, 1)
  assert.equal(matchReportingMovements({ latitude: 53, longitude: 4 }, route, [any]).length, 0)
})
test('validates incomplete movement rules', () => {
  assert.equal(validateReportingRules([rule]), '')
  assert.ok(validateReportingRules([{ ...rule, incomingLine: '' }]))
  assert.ok(validateReportingRules([{ ...rule, bearing: '' }]))
  assert.ok(validateReportingRules([{ ...rule, call: '' }]))
})
test('keeps repeated visits and deduplicates adjoining arrival segments', () => {
  const split = [
    { ...route[0], end: [51.9998, 4], endMeters: 34 },
    { ...route[0], start: [51.9998, 4], startMeters: 34 },
    route[1],
  ]
  assert.equal(matchReportingMovements(point, split, [rule]).length, 1)
  const revisit = route.map(segment => ({ ...segment, startMeters: segment.startMeters + 500, endMeters: segment.endMeters + 500 }))
  assert.equal(matchReportingMovements(point, [...route, ...revisit], [rule]).length, 2)
})
test('matches straight passage on the same line but not a route ending at the point', () => {
  const straight = [route[0], { ...route[1], name: 'Reguliersgracht', end: [52.0005, 4] }]
  const ruleStraight = { ...rule, outgoingLine: 'Reguliersgracht', outgoingBearing: 0 }
  assert.equal(matchReportingMovements(point, straight, [ruleStraight]).length, 1)
  assert.equal(matchReportingMovements(point, [route[0]], [ruleStraight]).length, 0)
})
test('rejects invalid rule data without throwing', () => {
  assert.ok(validateReportingRules([null]))
  assert.ok(validateReportingRules([{ ...rule, bearing: 360 }]))
  assert.ok(validateReportingRules([{ ...rule, outgoingLine: '' }]))
})

const west = { latitude: 52, longitude: 3.9995, lineName: 'Herengracht' }
const east = { latitude: 52, longitude: 4.0005, lineName: 'Herengracht' }
const passage = { kind: 'map-passage', from: west, to: east, call: 'Herengracht, ik kruis de Reguliersgracht vanaf deze kant' }
const across = [{ name: 'Herengracht', start: [52, 3.999], end: [52, 4.001], startMeters: 0, endMeters: 137 }]
test('derives straight, left, right and turning-back movements from map points', () => {
  assert.equal(deriveReportingManeuver(point, west, east), 'straight')
  assert.equal(deriveReportingManeuver(point, west, { latitude: 52.0005, longitude: 4 }), 'left')
  assert.equal(deriveReportingManeuver(point, west, { latitude: 51.9995, longitude: 4 }), 'right')
  assert.equal(deriveReportingManeuver(point, west, { latitude: 52, longitude: 3.9996 }), 'uturn')
})
test('map selections distinguish opposite approaches on the SAME canal', () => {
  assert.equal(validateReportingRules([passage]), '')
  assert.equal(matchReportingMovements(point, across, [passage]).length, 1)
  const reverseRule = { ...passage, from: east, to: west, call: 'Melding vanaf de andere kant' }
  assert.equal(matchReportingMovements(point, across, [reverseRule]).length, 0)
  const reverseRoute = [{ ...across[0], start: across[0].end, end: across[0].start }]
  const hits = matchReportingMovements(point, reverseRoute, [passage, reverseRule])
  assert.equal(hits.length, 1)
  assert.equal(hits[0].rule.call, reverseRule.call)
})
test('map selections distinguish crossing from turning onto Reguliersgracht', () => {
  const south = { latitude: 51.9995, longitude: 4, lineName: 'Reguliersgracht' }
  const turning = { ...passage, to: south, call: 'Herengracht, de Reguliersgracht in' }
  const turnRoute = [
    { name: 'Herengracht', start: [52, 3.999], end: [52, 4], startMeters: 0, endMeters: 68 },
    { name: 'Reguliersgracht', start: [52, 4], end: [51.999, 4], startMeters: 68, endMeters: 179 },
  ]
  assert.equal(matchReportingMovements(point, across, [turning]).length, 0)
  const hits = matchReportingMovements(point, turnRoute, [passage, turning])
  assert.equal(hits.length, 1)
  assert.equal(hits[0].rule.call, turning.call)
})
test('map passage matching survives a different route name on the same geometry', () => {
  const renamed = [{ ...across[0], name: 'Sint Antoniesluis' }]
  assert.equal(matchReportingMovements(point, renamed, [passage]).length, 1)
})
test('map passage matching allows graph nodes just inside the selected anchors', () => {
  const nodeToNode = [{ name: 'Sint Antoniesluis', start: [52, 3.9998], end: [52, 4.0002], startMeters: 0, endMeters: 28 }]
  assert.equal(matchReportingMovements(point, nodeToNode, [passage]).length, 1)
})
test('map rules require both selected sides and a message', () => {
  assert.ok(validateReportingRules([{ ...passage, to: null }]))
  assert.ok(validateReportingRules([{ ...passage, from: { ...west, latitude: null } }]))
  assert.ok(validateReportingRules([{ ...passage, to: west }]))
  assert.ok(validateReportingRules([{ ...passage, call: '' }]))
})
test('map rules retain repeated visits and reject a route that ends at the crossing', () => {
  const later = across.map(segment => ({ ...segment, startMeters: segment.startMeters + 500, endMeters: segment.endMeters + 500 }))
  assert.equal(matchReportingMovements(point, [...across, ...later], [passage]).length, 2)
  assert.equal(matchReportingMovements(point, [{ ...across[0], end: [52, 4], endMeters: 68 }], [passage]).length, 0)
})
