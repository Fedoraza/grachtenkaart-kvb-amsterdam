import test from 'node:test'
import assert from 'node:assert/strict'
import { enrichMissingBridgeClearances } from './bridge-enrichment.mjs'

const amsterdam = (name, number, longitude = 4.9206) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[longitude, 52.3692], [longitude + 0.0001, 52.3692], [longitude, 52.3693], [longitude, 52.3692]]] },
  properties: { name, number, clearanceNap: null, winterWaterLevelNap: null },
})
const opening = (parentid, height, longitude = 4.9206) => ({
  type: 'Feature', id: `opening.${parentid}`,
  geometry: { type: 'Point', coordinates: [longitude, 52.3692] },
  properties: { parentid, name: 'Doorvaartopening (vast) Oesjesduikerbrug', clearanceheightclosed: height, condition: 'CONSTRUCTED' },
})
const bridge = (id, name) => ({ properties: { id, name } })

test('fills missing Oesjesduiker clearance from the same numbered FIS bridge', () => {
  const features = [amsterdam('Oesjesduiker', 'BRU0114')]
  assert.equal(enrichMissingBridgeClearances(features, [opening(10, 2.92)], [bridge(10, 'Oesjesduikerbrug (Brug 114)')]), 1)
  assert.equal(features[0].properties.fisClearanceMeters, 2.92)
})

test('never fills a height from a nearby bridge with another number or an ambiguous match', () => {
  const features = [amsterdam('Oesjesduiker', 'BRU0114')]
  assert.equal(enrichMissingBridgeClearances(features, [opening(10, 2.92)], [bridge(10, 'Oesjesduikerbrug (Brug 115)')]), 0)
  assert.equal(enrichMissingBridgeClearances(features, [opening(10, 2.92), opening(11, 2.1)], [bridge(10, 'Brug 114'), bridge(11, 'Brug 114')]), 0)
})

test('keeps an existing municipal clearance instead of replacing it', () => {
  const feature = amsterdam('Oesjesduiker', 'BRU0114')
  feature.properties.clearanceNap = 2.5
  feature.properties.winterWaterLevelNap = -0.4
  assert.equal(enrichMissingBridgeClearances([feature], [opening(10, 2.92)], [bridge(10, 'Brug 114')]), 0)
  assert.equal(feature.properties.fisClearanceMeters, undefined)
})

test('fills width independently when a municipal height already exists', () => {
  const feature = amsterdam('Oesjesduiker', 'BRU0114')
  feature.properties.clearanceNap = 2.5
  feature.properties.winterWaterLevelNap = -0.4
  const source = opening(10, 2.92)
  source.properties.width = 10
  assert.equal(enrichMissingBridgeClearances([feature], [source], [bridge(10, 'Brug 114')]), 1)
  assert.equal(feature.properties.fisClearanceMeters, undefined)
  assert.equal(feature.properties.fisPassageWidthMeters, 10)
  assert.match(feature.properties.fisWidthSourceUrl, /opening\.10/)
})

test('accepts a width without a known height and preserves municipal widths', () => {
  const feature = amsterdam('Oesjesduiker', 'BRU0114')
  const source = opening(10, null)
  source.properties.width = 8
  assert.equal(enrichMissingBridgeClearances([feature], [source], [bridge(10, 'Brug 114')]), 1)
  assert.equal(feature.properties.fisClearanceMeters, undefined)
  assert.equal(feature.properties.fisPassageWidthMeters, 8)
  const existing = amsterdam('Oesjesduiker', 'BRU0114')
  existing.properties.passageWidth = 9
  enrichMissingBridgeClearances([existing], [source], [bridge(10, 'Brug 114')])
  assert.equal(existing.properties.fisPassageWidthMeters, undefined)
})

test('uses conservative dimensions with separate sources across multiple openings', () => {
  const feature = amsterdam('Oesjesduiker', 'BRU0114')
  const a = opening(10, 2.9)
  const b = opening(10, 3.5)
  a.properties.width = 10
  b.properties.width = 6
  b.id = 'opening.second'
  enrichMissingBridgeClearances([feature], [a, b], [bridge(10, 'Brug 114')])
  assert.equal(feature.properties.fisClearanceMeters, 2.9)
  assert.equal(feature.properties.fisPassageWidthMeters, 6)
  assert.match(feature.properties.fisWidthSourceUrl, /opening.second/)
})

test('Kortjewantsbrug is not made ambiguous by its adjacent flood barrier', () => {
  const feature = amsterdam('Kortjewantsbrug', 'BRU0487')
  const real = opening(5743, 3.94)
  real.properties.width = 12
  real.properties.parentgeotype = 'bridge'
  const barrier = opening(28487, 2.92)
  barrier.properties.name = 'Doorvaartopening (beweegbaar) keersluis Kortjewantsbrug'
  barrier.properties.parentgeotype = 'exceptionalnavigationalstructure'
  assert.equal(enrichMissingBridgeClearances([feature], [real, barrier], [bridge(5743, 'Kortjewantsbrug (Brug 487)')]), 1)
  assert.equal(feature.properties.fisClearanceMeters, 3.94)
  assert.equal(feature.properties.fisPassageWidthMeters, 12)
})

test('matches openings along a long bridge footprint without matching a distant bridge', () => {
  const feature = amsterdam('Langebrug', 'BRU0487')
  feature.geometry.coordinates = [[[4.9206, 52.3692], [4.9236, 52.3692], [4.9236, 52.3693], [4.9206, 52.3693], [4.9206, 52.3692]]]
  assert.equal(enrichMissingBridgeClearances([feature], [opening(1, 3.5, 4.9235)], [bridge(1, 'Langebrug (Brug 487)')]), 1)
  const distant = amsterdam('Langebrug', 'BRU0487')
  assert.equal(enrichMissingBridgeClearances([distant], [opening(1, 3.5, 4.9235)], [bridge(1, 'Langebrug (Brug 487)')]), 0)
})

test('recognizes Sluisbrug Weesp without accepting unrelated short-name substrings', () => {
  const feature = amsterdam('Sluisbrug', 'BRU5044')
  assert.equal(enrichMissingBridgeClearances([feature], [opening(1, 1.8)], [bridge(1, 'Sluisbrug Weesp')]), 1)
  const unrelated = amsterdam('Sluisbrug', 'BRU5044')
  assert.equal(enrichMissingBridgeClearances([unrelated], [opening(1, 1.8)], [bridge(1, 'Andere Sluisbrug')]), 0)
})

test('a verified bridge number takes precedence over a waterway name match', () => {
  const feature = amsterdam('Slotervaart', 'BRU0787')
  const wrong = opening(2, 1.2)
  wrong.properties.name = 'Doorvaartopening Slotervaart'
  assert.equal(enrichMissingBridgeClearances([feature], [opening(1, 2.6), wrong], [bridge(1, 'Brug 787'), bridge(2, 'Slotervaart')]), 1)
  assert.equal(feature.properties.fisClearanceMeters, 2.6)
})
