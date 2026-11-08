import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCanalRoutingNetwork, planCanalRoute } from './canalRouting.js'
import { applyBridgeClearances } from './bridgeClearances.js'

const line = (coordinates, name) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { name } })
const bridge = (properties) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[
    [4.9009, 52.36997], [4.9011, 52.36997], [4.9011, 52.37003],
    [4.9009, 52.37003], [4.9009, 52.36997],
  ]] },
  properties,
})

test('FIS point openings constrain their own lanes without mixing width and height', () => {
  const network=buildCanalRoutingNetwork({type:'FeatureCollection',features:[
    line([[4.91,52.376],[4.91,52.378]],'Fixed lane'),
    line([[4.9103,52.376],[4.9103,52.378]],'Movable lane'),
  ]},{respectRestrictions:true,includeSupplementalOpenWater:false})
  const fis={type:'Feature',geometry:{type:'Point',coordinates:[4.91,52.377]},properties:{number:'FIS-38832',fisClearanceMeters:5.1,fisPassageWidthMeters:17,fisOpenings:[
    {coordinates:[4.91,52.377],heightMeters:5.1,widthMeters:17},
    {coordinates:[4.9103,52.377],heightMeters:5.1,widthMeters:19},
  ]}}
  assert.equal(applyBridgeClearances(network,[fis]),1)
  const options={avoidVirtualEdges:true,boatProfile:{heightMeters:2,widthMeters:18}}
  const fixed=planCanalRoute({lat:52.376,lng:4.91},{lat:52.378,lng:4.91},network,options)
  const movable=planCanalRoute({lat:52.376,lng:4.9103},{lat:52.378,lng:4.9103},network,options)
  assert.notEqual(fixed.status,'ok')
  assert.equal(movable.status,'ok')
  assert.notEqual(planCanalRoute({lat:52.376,lng:4.9103},{lat:52.378,lng:4.9103},network,{...options,boatProfile:{heightMeters:5,widthMeters:18}}).status,'ok')
})

test('known bridge height diverts a boat that cannot fit underneath', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line([[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700]], 'Direct canal'),
    line([[4.9000, 52.3700], [4.9000, 52.3710], [4.9020, 52.3710], [4.9020, 52.3700]], 'Detour canal'),
  ] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  assert.equal(applyBridgeClearances(network, [bridge({ clearanceNap: 1.2, winterWaterLevelNap: -0.4 })]), 1)
  const start = { latitude: 52.3700, longitude: 4.9000 }
  const end = { latitude: 52.3700, longitude: 4.9020 }
  const low = planCanalRoute(start, end, network, { boatProfile: { heightMeters: 1.3, safetyMarginMeters: 0.15 } })
  const high = planCanalRoute(start, end, network, { boatProfile: { heightMeters: 1.5, safetyMarginMeters: 0.15 } })
  assert.equal(low.status, 'ok')
  assert.ok(low.steps.some((step) => step.name === 'Direct canal'))
  assert.equal(high.status, 'ok')
  assert.ok(high.steps.some((step) => step.name === 'Detour canal'))
  assert.equal(high.steps.some((step) => step.name === 'Direct canal'), false)
})

test('FIS clearance also limits routes when Amsterdam has no height', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line([[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700]], 'Direct canal'),
    line([[4.9000, 52.3700], [4.9000, 52.3710], [4.9020, 52.3710], [4.9020, 52.3700]], 'Detour canal'),
  ] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  assert.equal(applyBridgeClearances(network, [bridge({ fisClearanceMeters: 2.92 })]), 1)
  const route = planCanalRoute({ latitude: 52.3700, longitude: 4.9000 },
    { latitude: 52.3700, longitude: 4.9020 }, network,
    { boatProfile: { heightMeters: 2.8, safetyMarginMeters: 0.15 } })
  assert.equal(route.status, 'ok')
  assert.equal(route.steps.some((step) => step.name === 'Direct canal'), false)
})

test('Oesjesduiker is never routed through, including without height or with a tiny boat', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line([[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700]], 'Oesjesduiker'),
    line([[4.9000, 52.3700], [4.9000, 52.3710], [4.9020, 52.3710], [4.9020, 52.3700]], 'Detour canal'),
  ] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  assert.equal(applyBridgeClearances(network, [bridge({ number: 'BRU0114', fisClearanceMeters: 2.92 })]), 1)
  for (const [start, end] of [
    [{ latitude: 52.3700, longitude: 4.9000 }, { latitude: 52.3700, longitude: 4.9020 }],
    [{ latitude: 52.3700, longitude: 4.9020 }, { latitude: 52.3700, longitude: 4.9000 }],
  ]) {
    for (const boatProfile of [undefined, { heightMeters: 0.5 }]) {
      const result = planCanalRoute(start, end, network, { boatProfile })
      assert.equal(result.status, 'ok')
      assert.equal(result.steps.some((step) => step.name === 'Oesjesduiker'), false)
      assert.ok(result.steps.some((step) => step.name === 'Detour canal'))
    }
  }
})

test('NAP clearance without a water level is not treated as height above water', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line([[4.9000, 52.3700], [4.9020, 52.3700]], 'Canal'),
  ] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  assert.equal(applyBridgeClearances(network, [bridge({ clearanceNap: 1.2, winterWaterLevelNap: null })]), 0)
})

test('bridge clearance applies to both directions when overlapping lines have different edge objects', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line([[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700]], 'Canal'),
  ] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  const nodes = [...network.nodes.values()]
  const west = nodes.find((node) => node.lng === 4.9000)
  const middle = nodes.find((node) => node.lng === 4.9010)
  // Some map exports overwrite only one direction of an overlapping segment.
  middle.neighbors.set(west.key, { ...middle.neighbors.get(west.key) })
  assert.equal(applyBridgeClearances(network, [bridge({ clearanceNap: 1.12, winterWaterLevelNap: -0.4 })]), 1)
  assert.equal(west.neighbors.get(middle.key).clearanceHeight, 1.52)
  assert.equal(middle.neighbors.get(west.key).clearanceHeight, 1.52)
})

test('one bridge link can restrict two separate sailing lanes', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line([[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700]], 'North lane'),
    line([[4.9000, 52.3702], [4.9010, 52.3702], [4.9020, 52.3702]], 'South lane'),
  ] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  const feature = bridge({ number: 'BRU0306', clearanceNap: 1.9, winterWaterLevelNap: -0.4 })
  assert.equal(applyBridgeClearances(network, [feature], {
    BRU0306: { networkPositions: [
      { latitude: 52.3700, longitude: 4.9009, lineName: 'North lane' },
      { latitude: 52.3702, longitude: 4.9009, lineName: 'South lane' },
    ] },
  }), 1)
  for (const latitude of [52.3700, 52.3702]) {
    const west = [...network.nodes.values()].find((node) => node.lat === latitude && node.lng === 4.9000)
    const middle = [...network.nodes.values()].find((node) => node.lat === latitude && node.lng === 4.9010)
    assert.equal(west.neighbors.get(middle.key).clearanceHeight, 2.3)
    assert.equal(middle.neighbors.get(west.key).clearanceHeight, 2.3)
  }
})

test('automatic map-gap connectors cannot bypass a low bridge', () => {
  const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
    line([[4.8980966, 52.3637594], [4.8986844, 52.3638722]], 'Keizersgracht'),
    line([[4.8980966, 52.3637594], [4.8980, 52.3645], [4.8988, 52.3645], [4.8986844, 52.3638722]], 'Detour'),
    line([[4.89830328, 52.36380176], [4.89830455, 52.36379931]], 'Brug BRU0037 verbinding'),
  ] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
  const keizersgrachtBridge = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[
      [4.8981288, 52.3637312], [4.8984778, 52.3637312],
      [4.8984778, 52.3638723], [4.8981288, 52.3638723],
      [4.8981288, 52.3637312],
    ]] },
    properties: { number: 'BRU0037', clearanceNap: 1.12, winterWaterLevelNap: -0.4 },
  }
  applyBridgeClearances(network, [keizersgrachtBridge], {
    BRU0037: { networkPosition: { latitude: 52.36379931, longitude: 4.89830455, lineName: 'Keizersgracht' } },
  })
  const start = { latitude: 52.3637594, longitude: 4.8980966 }
  const end = { latitude: 52.3638722, longitude: 4.8986844 }
  const route = planCanalRoute(start, end, network, { boatProfile: { heightMeters: 2 } })
  assert.equal(route.status, 'ok')
  assert.ok(route.steps.some((step) => step.name === 'Detour'))
  assert.equal(route.virtualSegmentCount, 0)
})

for (const source of ['passageWidth', 'fisPassageWidthMeters']) {
  test(`${source} diverts a wide boat even when the bridge has no known height`, () => {
    const network = buildCanalRoutingNetwork({ type: 'FeatureCollection', features: [
      line([[4.9000, 52.3700], [4.9010, 52.3700], [4.9020, 52.3700]], 'Direct canal'),
      line([[4.9000, 52.3700], [4.9000, 52.3710], [4.9020, 52.3710], [4.9020, 52.3700]], 'Detour canal'),
    ] }, { respectRestrictions: true, includeSupplementalOpenWater: false })
    assert.equal(applyBridgeClearances(network, [bridge({ [source]: 3.75 })]), 1)
    const start = { latitude: 52.3700, longitude: 4.9000 }
    const end = { latitude: 52.3700, longitude: 4.9020 }
    const fitting = planCanalRoute(start, end, network, { boatProfile: { widthMeters: 3.75 } })
    const wide = planCanalRoute(start, end, network, { boatProfile: { widthMeters: 3.76 } })
    assert.ok(fitting.steps.some((step) => step.name === 'Direct canal'))
    assert.equal(wide.status, 'ok')
    assert.equal(wide.steps.some((step) => step.name === 'Direct canal'), false)
    const reverse = planCanalRoute(end, start, network, { boatProfile: { widthMeters: 3.76 } })
    assert.equal(reverse.steps.some((step) => step.name === 'Direct canal'), false)
  })
}
