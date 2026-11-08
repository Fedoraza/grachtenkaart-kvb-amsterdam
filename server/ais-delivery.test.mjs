import test from 'node:test'
import assert from 'node:assert/strict'
import { queueLatestAis, takeAisBatch } from './ais-delivery.mjs'

test('data saver sends only the latest position while preserving independent static details', () => {
  const pending = new Map()
  queueLatestAis(pending, [{ type: 'vessel-position', mmsi: '123', latitude: 52.1, speed: 3 }, { type: 'vessel-static', mmsi: '123', length: 20 }])
  queueLatestAis(pending, [{ type: 'vessel-position', mmsi: '123', latitude: 52.2 }, { type: 'vessel-static', mmsi: '123', name: 'Boot' }, { type: 'vessel-position', mmsi: '456', latitude: 52.3 }])
  const batch = takeAisBatch(pending)
  assert.deepEqual(batch.messages, [
    { type: 'vessel-position', mmsi: '123', latitude: 52.2, speed: 3 },
    { type: 'vessel-static', mmsi: '123', length: 20, name: 'Boot' },
    { type: 'vessel-position', mmsi: '456', latitude: 52.3 },
  ])
  assert.equal(pending.size, 0)
})


test('data saver retains the class-B name when the next static part contains only a callsign', () => {
  const pending = new Map()
  queueLatestAis(pending, [{ type: 'vessel-static', mmsi: '244123456', name: 'Jackson 1' }])
  queueLatestAis(pending, [{ type: 'vessel-static', mmsi: '244123456', name: '', callSign: 'TEST' }])
  assert.equal(takeAisBatch(pending).messages[0].name, 'Jackson 1')
})
