import test from 'node:test'
import assert from 'node:assert/strict'
import { statisticsRange, calculateFleetStatistics, waterwayIndex } from './fleet-statistics.mjs'
const now = Date.parse('2026-11-01T12:00:00Z')
const range = () => statisticsRange({ from: '2026-10-30', to: '2026-10-30' }, now)
const boat = { id: 'mmsi:244123456', name: 'Test boat', mmsi: '244123456', operatorId: 'lovers' }
const roster = [boat, { id: 'other', name: 'Other', mmsi: '244123457', operatorId: 'flagship' }]
function point(minute, latitude, speed = 0, mmsi = boat.mmsi) { return { mmsi, latitude, longitude: 4.9, speed, received_at: Date.parse('2026-10-30T10:00:00Z') + minute * 60000 } }

test('calendar windows respect Amsterdam DST, invalid dates and the 31-day bound', () => {
  assert.equal((statisticsRange({ from: '2026-10-25', to: '2026-10-25' }, now).until - statisticsRange({ from: '2026-10-25', to: '2026-10-25' }, now).from) / 3600000, 25)
  assert.equal((statisticsRange({ from: '2026-03-29', to: '2026-03-29' }, now).until - statisticsRange({ from: '2026-03-29', to: '2026-03-29' }, now).from) / 3600000, 23)
  for (const input of [{ to: 'bad' }, { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-01-01', to: '2026-02-01' }, { from: '2027-01-01', to: '2027-01-01' }, { hour: '24' }]) assert.throws(() => statisticsRange(input, now))
})

test('movement, bounded trips, waterway attribution and stops are measured across companies', () => {
  const positions = []
  for (let i = 0; i <= 6; i++) positions.push(point(i, 52.37))
  for (let i = 7; i <= 17; i++) positions.push(point(i, 52.37 + (i - 6) * .001, 3))
  for (let i = 18; i <= 24; i++) positions.push(point(i, 52.381))
  const waterways = waterwayIndex({ features: [{ geometry: { type: 'LineString', coordinates: [[4.9,52.369],[4.9,52.383]] }, properties: { name: 'Fixture canal' } }] })
  const report = calculateFleetStatistics({ roster, positions, range: range(), waterways, now, zones: [{ id: 'fixture', name: 'Fixture lock', type: 'sluis', latitude: 52.37, longitude: 4.9, radius: 45 }] })
  assert.equal(report.summary.activeBoats, 1)
  assert.equal(report.summary.completedTrips, 1)
  assert.equal(report.summary.partialLegs, 0)
  assert.equal(report.summary.samples, 25)
  assert.ok(report.summary.distanceKm > 1.1 && report.summary.distanceKm < 1.3)
  assert.equal(report.summary.movingHours, .18)
  assert.equal(report.operators.find((o) => o.id === 'lovers').activeBoats, 1)
  assert.equal(report.operators.find((o) => o.id === 'flagship').activeBoats, 0)
  assert.equal(report.operators.find((o) => o.id === 'flagship').kmPerActiveBoat, null)
  assert.equal(report.locations[0].visits, 1)
  assert.equal(report.waterways[0].name, 'Fixture canal')
  assert.equal(report.trips[0].complete, true)
  assert.equal(report.daily[0].distanceKm, report.summary.distanceKm)
})

test('gaps, GPS jumps and unassigned vessels do not create fictitious movement or coverage', () => {
  const positions = [point(0,52.37),point(1,52.371,3),point(20,52.38,3),point(21,52.44,3)]
  const report = calculateFleetStatistics({ roster: [...roster, { id: 'unknown', name: 'Unknown', mmsi:'244123458', operatorId:'unassigned' }], positions: [...positions,point(22,52.37,3,'244123458')], range: range(), now })
  assert.equal(report.quality.gaps, 1)
  assert.equal(report.quality.rejectedSegments, 1)
  assert.ok(report.summary.distanceKm < .2)
  assert.equal(report.summary.knownBoats, 2)
  assert.equal(report.summary.completedTrips, 0)
  assert.equal(report.boats.find((b) => b.mmsi === '244123458'), undefined)
  assert.ok(report.quality.intervalCoveragePercent < 1)
})

test('operator, vessel and local-hour filters agree and do not join disconnected hours', () => {
  const r = statisticsRange({ from:'2026-10-30', to:'2026-10-30', operator:'lovers', mmsi:boat.mmsi, hour:'11' }, now)
  const positions = [point(-1,52.37),point(0,52.37),point(1,52.371,3),point(60,52.38),point(61,52.381,3)]
  const report = calculateFleetStatistics({ roster, positions, range:r, now })
  assert.equal(report.summary.samples, 2)
  assert.equal(report.boats.length, 1)
  assert.equal(report.operators.length, 1)
  assert.equal(report.hourly.filter((h) => h.distanceKm > 0).length, 1)
  assert.equal(report.quality.gaps, 0)
  assert.throws(() => calculateFleetStatistics({ roster, positions: [], range: { ...r, operator:'invalid' }, now }))
})

test('a movement interval crossing local midnight is split between days exactly once', () => {
  const r=statisticsRange({from:'2026-10-29',to:'2026-10-30'},now)
  const positions=[{...point(0,52.37,2),received_at:Date.parse('2026-10-29T22:59:00Z')},{...point(0,52.371,2),received_at:Date.parse('2026-10-29T23:01:00Z')}]
  const report=calculateFleetStatistics({roster:[boat],positions,range:r,now})
  assert.equal(report.daily[0].activeBoats,1)
  assert.equal(report.daily[1].activeBoats,1)
  assert.equal(report.summary.activeBoats,1)
  assert.equal(report.summary.distanceKm,.12)
  assert.equal(report.daily[0].distanceKm,.06)
  assert.equal(report.daily[1].distanceKm,.06)
})

test('the repeated autumn hour counts its clock duration twice but its daily vessels once', () => {
  const r=statisticsRange({from:'2026-10-25',to:'2026-10-25',hour:'2'},now)
  const positions=[{...point(0,52.37,2),received_at:Date.parse('2026-10-25T00:59:00Z')},{...point(0,52.371,2),received_at:Date.parse('2026-10-25T01:01:00Z')}]
  const report=calculateFleetStatistics({roster:[boat],positions,range:r,now})
  assert.equal(report.summary.activeBoats,1)
  assert.equal(report.heatmap.find(c=>c.weekday===7&&c.hour===2).meanActiveBoats,1)
  assert.equal(report.quality.intervalCoveragePercent,1.7)
})
