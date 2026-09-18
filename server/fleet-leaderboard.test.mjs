import assert from 'node:assert/strict'
import test from 'node:test'
import { amsterdamDayBounds, amsterdamRaceDate, calculateFleetDistances } from './fleet-leaderboard.mjs'

test('uses Amsterdam calendar days across daylight saving time', () => {
  const winter = amsterdamDayBounds('2026-01-10')
  const summer = amsterdamDayBounds('2026-07-10')
  assert.equal(new Date(winter.from).toISOString(), '2026-01-10T01:00:00.000Z')
  assert.equal(new Date(summer.from).toISOString(), '2026-07-10T00:00:00.000Z')
})

test('keeps boats sailing after midnight in the previous race day', () => {
  assert.equal(amsterdamRaceDate(Date.parse('2026-07-10T23:30:00Z')), '2026-07-10')
  assert.equal(amsterdamRaceDate(Date.parse('2026-07-11T00:30:00Z')), '2026-07-11')
})

test('ranks fleet boats and ignores jumps and stationary GPS noise', () => {
  const boats = [{ id: 1, name: 'Antonia', mmsi: '111111111' }, { id: 2, name: 'Anna', mmsi: '222222222' }]
  const positions = [
    { mmsi: '111111111', latitude: 52.37, longitude: 4.89, speed: 4, received_at: 0 },
    { mmsi: '111111111', latitude: 52.371, longitude: 4.89, speed: 4, received_at: 60_000 },
    { mmsi: '111111111', latitude: 53, longitude: 5, speed: 4, received_at: 120_000 },
    { mmsi: '222222222', latitude: 52.37, longitude: 4.89, speed: 0, received_at: 0 },
    { mmsi: '222222222', latitude: 52.37002, longitude: 4.89, speed: 0, received_at: 60_000 },
  ]
  const result = calculateFleetDistances(boats, positions)
  assert.equal(result[0].name, 'Antonia')
  assert.equal(result[0].distanceKm, 0.12)
  assert.equal(result[1].distanceKm, 0)
})
