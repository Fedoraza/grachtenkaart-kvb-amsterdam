import test from 'node:test'
import assert from 'node:assert/strict'
import { loadCurrentClosures, normalizeClosureMessage, periodWindows } from './navigation-closures.mjs'
const now = Date.parse('2026-09-07T06:30:00Z')
const message = {
  ntsNumber: { organisation: 'Rijkswaterstaat', year: 2026, number: 1 },
  subjectLimitations: [{
    geoObject: { name: 'Testbrug', fairwayName: 'Herengracht', coordinates: [{ lat: 52.37, lon: 4.9 }, { lat: 52.37, lon: 4.901 }] },
    limitations: [{ limitationCode: 'OBSTRU', limitationPeriods: [{ startDate: Date.parse('2026-09-01T22:00:00Z'), endDate: Date.parse('2026-09-30T22:00:00Z'), interval: 'WRD', startTimeMs: 21600000, endTimeMs: 32400000 }] }],
  }],
}
test('normalizes geographic trajectories and Amsterdam weekday time windows', () => {
  const features = normalizeClosureMessage(message, now)
  assert.ok(features.length)
  assert.equal(features[0].geometry.type, 'LineString')
  assert.equal(features[0].properties.start, '2026-09-07T05:00:00.000Z')
  assert.equal(features[0].properties.end, '2026-09-07T08:00:00.000Z')
  assert.equal(features[0].properties.blocksRouting, true)
})
test('bridge non-operation is shown without closing the waterway for all boats', () => {
  const copy = structuredClone(message)
  copy.subjectLimitations[0].limitations[0].limitationCode = 'NOSERV'
  assert.equal(normalizeClosureMessage(copy, now)[0].properties.blocksRouting, false)
})
test('imports warnings and dimensional limits without treating them as full closures', () => {
  const copy = structuredClone(message)
  copy.reasonCode = 'WORK'
  copy.contents = 'Doorvaart is smaller during the works.'
  copy.subjectLimitations[0].limitations = [
    { limitationCode: 'CAUTIO', limitationPeriods: [{ startDate: now - 1000, endDate: now + 1000 }] },
    { limitationCode: 'CLEWID', value: 2.4, unit: 'M', indicationCode: 'MAX', limitationPeriods: [{ startDate: now - 1000, endDate: now + 1000 }] },
  ]
  const features = normalizeClosureMessage(copy, now)
  assert.deepEqual(features.map(feature => feature.properties.type), ['Waarschuwing', 'Beperkte doorvaartbreedte'])
  assert.ok(features.every(feature => feature.properties.blocksRouting === false))
  assert.equal(features[1].properties.value, 2.4)
  assert.equal(features[1].properties.reason, 'Werkzaamheden')
})
test('includes planned restrictions within the next thirty days', () => {
  const copy = structuredClone(message)
  copy.subjectLimitations[0].limitations[0].limitationPeriods = [{ startDate: now + 10 * 86400000, endDate: now + 11 * 86400000 }]
  const features = normalizeClosureMessage(copy, now)
  assert.equal(features.length, 1)
  assert.equal(features[0].properties.state, 'upcoming')
})
test('continuous periods respect explicit start and end times', () => {
  const p = { startDate: Date.parse('2026-09-07T22:00:00Z'), endDate: Date.parse('2026-09-07T22:00:00Z'), interval: 'CON', startTimeMs: 21600000, endTimeMs: 32400000 }
  assert.deepEqual(periodWindows(p, now), [[Date.parse('2026-09-08T05:00:00Z'), Date.parse('2026-09-08T08:00:00Z')]])
})
test('rejects malformed upstream success responses rather than reporting no closures', async () => {
  await assert.rejects(loadCurrentClosures({ now, fetchImpl: async () => ({ ok: true, json: async () => ({ error: { code: 500 } }) }) }))
})
test('loads only regional messages and deduplicates detail requests', async () => {
  const summary = { location: [{ lon: 4.9, lat: 52.37 }], ntsNumber: message.ntsNumber }
  const calls = []
  const data = await loadCurrentClosures({ now, fetchImpl: async url => {
    calls.push(url)
    return { ok: true, json: async () => url.includes('/summaries?') ? [summary, summary] : message }
  } })
  assert.equal(calls.length, 2)
  assert.ok(data.features.length)
  assert.equal(data.stale, false)
  assert.match(calls[0], /limitationGroup=ALL/)
})

test('failed individual details retain only their valid previous warnings; withdrawn notices disappear', async () => {
  const previous = { features: normalizeClosureMessage(message, now) }
  const fresh = structuredClone(message); fresh.ntsNumber.number = 2
  const summaries = [message, fresh].map(m => ({ ntsNumber: m.ntsNumber, location: [{ lon: 4.9, lat: 52.37 }] }))
  const data = await loadCurrentClosures({ now, previous, fetchImpl: async url => {
    if (url.includes('/summaries?')) return { ok: true, json: async () => summaries }
    return { ok: true, json: async () => url.endsWith('-1') ? {} : fresh }
  } })
  assert.equal(data.partial, true)
  assert.equal(data.failedDetails, 1)
  assert.equal(data.retainedFeatures, 1)
  assert.equal(data.features.find(f => f.properties.noticeNumber.endsWith('-1')).properties.sourceStale, true)
  const withdrawn = await loadCurrentClosures({ now, previous, fetchImpl: async () => ({ ok: true, json: async () => [] }) })
  assert.deepEqual(withdrawn.features, [])
})
test('unrecognized official limitations remain visible as information', () => {
  const copy = structuredClone(message)
  copy.subjectLimitations[0].limitations[0].limitationCode = 'NEWCODE'
  const [feature] = normalizeClosureMessage(copy, now)
  assert.match(feature.properties.type, /NEWCODE/)
  assert.equal(feature.properties.blocksRouting, false)
})
