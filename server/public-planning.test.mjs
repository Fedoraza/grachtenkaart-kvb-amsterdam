import test from 'node:test'
import assert from 'node:assert/strict'
import { publicPlanningDay } from './public-planning.mjs'

test('public planning retains schedule and crew fields while omitting internal source data and notes', () => {
  const day = { date: '2026-10-17', locations: [{ name: 'Central Station', internal: 'secret' }], items: [{ id: 7, boat_name: 'Testboot', start_time: '10:00', end_time: '11:00', person_name: 'Testschipper', role: 'skipper', event_type: 'tour', group_location: 'Central Station', mmsi: '123', tour_status: 'scheduled', route_from: 1, route_to: 2, ais_point_count: 3, sender: 'private phone', chat_title: 'private group', external_message_id: 'private message', import_id: 42, notes: 'internal note', future_private_field: 'secret' }], staff: [{ id: 8, person_name: 'Testteam', role: 'kade', location: 'Central Station', start_time: '09:00', end_time: '17:00', sender: 'private phone', notes: 'internal note' }] }
  const result = publicPlanningDay(day)
  assert.deepEqual(result.locations, [{ name: 'Central Station' }])
  assert.equal(result.items[0].boat_name, 'Testboot')
  assert.equal(result.items[0].person_name, 'Testschipper')
  assert.equal(result.items[0].ais_point_count, 3)
  assert.equal(result.staff[0].person_name, 'Testteam')
  assert.doesNotMatch(JSON.stringify(result), /private|internal|secret|import_id/)
  assert.equal(day.items[0].sender, 'private phone')
})
