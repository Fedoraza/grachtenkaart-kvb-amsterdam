import test from 'node:test'
import assert from 'node:assert/strict'
import { sharedRouteDocument, renderSharedRoutePage } from './shared-route-page.mjs'
import { reportingPointsAlongRoute } from '../shared/reporting-route.mjs'

const template = '<!doctype html><html><head><title>Generic</title><meta name="description" content="generic"><link rel="canonical" href="https://boottracker.nl/"></head><body><div id="app"><main>JavaScript is needed</main></div><script type="module" src="/app.js"></script></body></html>'
const route = { name: 'Gracht naar Amstel', points: [{role:'start',latitude:52.37,longitude:4.89}], settings:{boatProfile:{widthMeters:2.2}}, result:{status:'partial',distanceMeters:100,durationMinutes:1,coordinates:[[52.37,4.89],[52.371,4.891]],steps:[{name:'Herengracht',distanceMeters:100}],warnings:['Let op de brug']} }
const stored = value => ({route_json:JSON.stringify(value),created_at:1,expires_at:100000000})
test('shared route exposes exact geometry in GeoJSON order, stored warnings and incomplete status', () => {
  const d=sharedRouteDocument(stored(route))
  assert.deepEqual(d.geometry.coordinates,[[4.89,52.37],[4.891,52.371]])
  assert.equal(d.complete,false)
  const html=renderSharedRoutePage(template,d,'abcdefghijklmnopqrstuvwx')
  assert.ok(html.includes('Herengracht'))
  assert.ok(html.includes('Let op de brug'))
  assert.ok(html.includes('<td>4.891</td><td>52.371</td>'))
  assert.ok(html.includes('Geen bevestigde volledige route'))
  assert.ok(html.includes('type="module" src="/app.js"'))
  assert.ok(!html.includes('JavaScript is needed'))
  assert.match(html,/canonical.*\?route=abcdefghijklmnopqrstuvwx/)
})
test('stored content cannot inject HTML, JSON scripts or replacement patterns', () => {
  const malicious = JSON.parse(JSON.stringify(route))
  malicious.name = '<script>alert(1)</script> $& $`'
  malicious.result.steps[0].name = '<img src=x onerror=alert(1)>'
  const html=renderSharedRoutePage(template,sharedRouteDocument(stored(malicious)),'abcdefghijklmnopqrstuvwx')
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(!html.includes('<img src=x'))
  assert.ok(html.includes('$&amp;'))
  assert.equal((html.match(/id="app"/g)||[]).length,1)
  const ld=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1])
  assert.equal(ld.name,malicious.name)
})
test('shared route marifoon matching uses direction and following waterway rather than proximity alone', () => {
  const segments=[{name:'Reguliersgracht',start:{latitude:51.9995,longitude:4},end:{latitude:52,longitude:4},startMeters:0,endMeters:56},{name:'Herengracht',start:{latitude:52,longitude:4},end:{latitude:52,longitude:4.001},startMeters:56,endMeters:124}]
  const result={coordinates:[[51.9995,4],[52,4],[52,4.001]],segments}
  const rule={incomingLine:'Reguliersgracht',bearing:0,outgoingLine:'Herengracht',outgoingBearing:90,call:'Regulier de Heren op richting Amstel'}
  const feature={geometry:{type:'Point',coordinates:[4,52]},properties:{number:1,name:'Test',movementRules:[rule],source:'Kaartbron'}}
  const matched=reportingPointsAlongRoute([feature],result)
  assert.equal(matched.length,1)
  assert.equal(matched[0].call,rule.call)
  feature.properties.movementRules=[{...rule,bearing:180}]
  assert.equal(reportingPointsAlongRoute([feature],result).length,0)
})
