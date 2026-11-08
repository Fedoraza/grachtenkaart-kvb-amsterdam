import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createUsageAnalytics, usageDate, usageDays } from './usage-analytics.mjs'

const now = Date.parse('2026-10-17T10:00:00Z')
function setup(t) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  t.after(() => db.close())
  return { db, usage: createUsageAnalytics(db) }
}
const view = (visitorId, userId = null) => ({ visitorId, userId, page: 'map', type: 'view' })

test('splits guest browsers and authenticated accounts without counting heartbeats as views', t => {
  const { usage } = setup(t)
  usage.record(view('guest'), now)
  usage.record({ ...view('guest'), type: 'heartbeat', activeSeconds: 30 }, now + 30_000)
  usage.record(view('browser-a', 42), now)
  usage.record(view('browser-b', 42), now)
  const result = usage.summary(7, now + 31_000)
  assert.equal(result.total.pageViews, 3)
  assert.equal(result.total.visits, 3)
  assert.equal(result.authenticated.visitors, 1)
  assert.equal(result.guest.visitors, 1)
  assert.equal(result.guest.activeSeconds, 30)
  assert.deepEqual(result.online, { authenticated: 1, guest: 1 })
  assert.equal(result.daily.length, 7)
  assert.equal(result.daily.at(-1).total.pageViews, 3)
  assert.equal(result.pages[0].total.pageViews, 3)
  assert.equal(result.pages[1].total.pageViews, 0)
  assert.equal(JSON.stringify(result).includes('browser-a'), false)
})

test('login and logout change groups using server identity and close previous online visits', t => {
  const { usage } = setup(t)
  usage.record(view('browser'), now)
  usage.record({ ...view('browser', 12), type: 'heartbeat' }, now + 1_000)
  const loggedIn = usage.summary(1, now + 2_000)
  assert.equal(loggedIn.guest.visits, 1)
  assert.equal(loggedIn.authenticated.visits, 1)
  assert.deepEqual(loggedIn.online, { authenticated: 1, guest: 0 })
  usage.record({ ...view('browser'), type: 'heartbeat' }, now + 3_000)
  assert.deepEqual(usage.summary(1, now + 4_000).online, { authenticated: 0, guest: 1 })
})

test('inactivity starts a new visit; rapid heartbeats and oversized durations cannot inflate time', t => {
  const { usage } = setup(t)
  usage.record(view('browser'), now)
  usage.record({ ...view('browser'), type: 'heartbeat', activeSeconds: 9000 }, now + 5_000)
  usage.record({ ...view('browser'), type: 'heartbeat', activeSeconds: 9000 }, now + 5_010)
  assert.equal(usage.summary(1, now + 6_000).total.activeSeconds, 5)
  usage.record(view('browser'), now + 31 * 60_000)
  assert.equal(usage.summary(1, now + 31 * 60_000).total.visits, 2)
  assert.equal(usage.summary(1, now + 34 * 60_000).online.guest, 0)
})

test('calendar days use Amsterdam midnight and handle daylight saving changes', t => {
  const { usage } = setup(t)
  const before = Date.parse('2026-10-24T21:59:50Z')
  const after = Date.parse('2026-10-24T22:00:20Z')
  usage.record(view('browser'), before)
  usage.record({ ...view('browser'), type: 'heartbeat', activeSeconds: 30 }, after)
  assert.equal(usageDate(before), '2026-10-24')
  assert.equal(usageDate(after), '2026-10-25')
  assert.deepEqual(usageDays(3, Date.parse('2026-10-26T12:00:00Z')), ['2026-10-24', '2026-10-25', '2026-10-26'])
  const result = usage.summary(1, after)
  assert.equal(result.total.pageViews, 0)
  assert.equal(result.total.activeSeconds, 30)
  assert.equal(result.total.visits, 1)
})

test('keeps persisted analytics when the store is recreated and removes records older than 90 days', t => {
  const { db, usage } = setup(t)
  usage.record(view('old-browser'), now - 91 * 86_400_000)
  assert.equal(createUsageAnalytics(db).summary(90, now - 90 * 86_400_000).total.visits, 1)
  usage.record(view('new-browser'), now)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM usage_sessions').get().count, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM usage_daily').get().count, 1)
  assert.equal(createUsageAnalytics(db).summary(90, now).total.visits, 1)
})

test('rejects arbitrary page names and unsupported periods', t => {
  const { usage } = setup(t)
  assert.throws(() => usage.record({ ...view('browser'), page: '/?email=private' }, now))
  assert.throws(() => usage.record({ ...view('browser'), type: 'click' }, now))
  assert.throws(() => usage.summary(365, now))
  assert.equal(usage.summary(7, now).firstRecordedAt, null)
})
