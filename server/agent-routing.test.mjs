import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAgentRoute, calculateAgentRoute } from './agent-routing.mjs'
import { EXAMPLE_ROUTES } from '../shared/example-routes.mjs'
import { readFileSync } from 'node:fs'

const query = () => new URLSearchParams({ points: '[[4.8920164,52.3792362],[4.8975988,52.3650949]]', heightMeters: '1.4', widthMeters: '2.2', lengthMeters: '7', draftMeters: '0.6' })
test('agent input requires real dimensions and rejects malformed, repeated and oversized requests', () => {
  const parsed = parseAgentRoute(query())
  assert.equal(parsed.points[0].longitude, 4.8920164)
  assert.equal(parsed.boatProfile.safetyMarginMeters, 0.15)
  for (const [key, value] of [['points','[[52.37,4.89],[52.36,4.90]]'],['widthMeters',''],['heightMeters','Infinity'],['draftMeters','-1'],['speedKmh','13'],['points','null'],['points','[[4.89,52.37]]'],['unknown','yes']]) {
    const p = query(); p.set(key,value); assert.throws(() => parseAgentRoute(p))
  }
  const missing = query(); missing.delete('lengthMeters'); assert.throws(() => parseAgentRoute(missing))
  const repeated = query(); repeated.append('widthMeters','1'); assert.throws(() => parseAgentRoute(repeated))
})
const args = input => ({ input, bridges: { features: [], fetchedAt: 123 }, links: {}, edits: [], closures: { features: [], fetchedAt: '2026-11-07T12:00:00Z' } })
test('agent route uses actual routing engine and GeoJSON coordinate order, closures and complete status', () => {
  const input = parseAgentRoute(query())
  const result = calculateAgentRoute(args(input))
  assert.equal(result.status,'ok'); assert.equal(result.complete,true)
  assert.ok(Math.abs(result.distanceMeters - EXAMPLE_ROUTES[0].distanceMeters)<15)
  assert.ok(result.geometry.coordinates[0][0] < 5)
  assert.ok(result.warnings.length)
  const blocked = args(input)
  blocked.closures.features = [{ type:'Feature', geometry:{ type:'Point', coordinates:[input.points[0].longitude,input.points[0].latitude] },properties:{type:'Stremming',blocksRouting:true} }]
  const noRoute = calculateAgentRoute(blocked)
  assert.equal(noRoute.complete,false)
  assert.notEqual(noRoute.status,'ok')
  assert.ok(!JSON.stringify(noRoute).includes('neighbors'))
})
test('agent routes enforce canal width profiles and do not label unreachable destination complete', () => {
  const input = parseAgentRoute(query())
  const feature = { type:'Feature',properties:{name:'Bloemgracht'}, geometry:{type:'LineString',coordinates:[[4.89,52.37],[4.892,52.37],[4.894,52.37]]} }
  input.points = [{longitude:4.89,latitude:52.37},{longitude:4.894,latitude:52.37}]
  input.boatProfile.widthMeters = 20
  const r=calculateAgentRoute(args(input),{type:'FeatureCollection',features:[feature]})
  assert.equal(r.complete,false)
})
test('OpenAPI and agent instructions describe the public operation', () => {
  const spec=JSON.parse(readFileSync(new URL('../public/openapi.json',import.meta.url)))
  assert.equal(spec.paths['/api/routeplanner/route'].get.operationId,'planAmsterdamBoatRoute')
  assert.deepEqual(spec.security,[])
  assert.match(readFileSync(new URL('../public/llms.txt',import.meta.url),'utf8'),/partial route/)
})

test('AI route responses disclose partial and stale waterway notices', () => {
  const request = args(parseAgentRoute(query()))
  request.closures.partial = true
  request.closures.stale = true
  const result = calculateAgentRoute(request)
  assert.equal(result.data.closuresPartial, true)
  assert.equal(result.data.closuresStale, true)
  assert.ok(result.warnings.some(w => /Some official waterway notices/.test(w)))
  assert.ok(result.warnings.some(w => /Waterway notices are stale/.test(w)))
})

test('AI route responses report the water level used for bridge clearances', () => {
  const request = args(parseAgentRoute(query()))
  const missing = calculateAgentRoute(request)
  assert.equal(missing.data.waterLevelCorrectionApplied, false)
  assert.equal(missing.data.clearanceReductionMeters, 0)
  const high = calculateAgentRoute({ ...request, waterLevel: { valueCmNap: -25, measuredAt: new Date().toISOString() } })
  assert.equal(high.data.waterLevelCmNap, -25)
  assert.equal(high.data.waterLevelCorrectionApplied, true)
  assert.equal(high.data.clearanceReductionMeters, 0.15)
  assert.ok(high.warnings.some(warning => warning.includes('15 cm lager')))
})
