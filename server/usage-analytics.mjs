import { randomUUID } from 'node:crypto'

const DAY_MS = 86_400_000
const USAGE_PAGES = ['map', 'leaderboard', 'routeplanner', 'fleet', 'fleet-statistics', 'knowledge']
const SESSION_GAP_MS = 30 * 60_000
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' })
export const usageDate = (timestamp) => dateFormat.format(new Date(timestamp))
export function usageDays(days, now) {
  const today = usageDate(now)
  return Array.from({ length: days }, (_, index) => new Date(Date.parse(`${today}T12:00:00Z`) - (days - index - 1) * DAY_MS).toISOString().slice(0, 10))
}

export function createUsageAnalytics(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS usage_sessions (
      id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, user_id INTEGER,
      started_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS usage_sessions_visitor ON usage_sessions(visitor_id, last_seen);
    CREATE INDEX IF NOT EXISTS usage_sessions_seen ON usage_sessions(last_seen);
    CREATE TABLE IF NOT EXISTS usage_daily (
      session_id TEXT NOT NULL REFERENCES usage_sessions(id) ON DELETE CASCADE,
      day TEXT NOT NULL, page TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0,
      active_seconds REAL NOT NULL DEFAULT 0,
      PRIMARY KEY(session_id, day, page)
    );
    CREATE INDEX IF NOT EXISTS usage_daily_day ON usage_daily(day);
  `)
  let lastCleanup = 0
  function prune(now = Date.now()) {
    if (now - lastCleanup <= 3_600_000) return
    database.prepare('DELETE FROM usage_daily WHERE day < ?').run(usageDays(90, now)[0])
    database.prepare('DELETE FROM usage_sessions WHERE last_seen < ?').run(now - 90 * DAY_MS)
    lastCleanup = now
  }
  return {
    prune,
    record({ visitorId, userId = null, page, type, activeSeconds = 0 }, now = Date.now()) {
      if (!USAGE_PAGES.includes(page) || !['view', 'heartbeat'].includes(type)
        || typeof visitorId !== 'string' || !visitorId) throw new TypeError('Invalid usage event')
      prune(now)
      let session = database.prepare('SELECT * FROM usage_sessions WHERE visitor_id = ? AND ended_at IS NULL ORDER BY last_seen DESC LIMIT 1').get(visitorId)
      if (session && (session.user_id !== userId || now - session.last_seen >= SESSION_GAP_MS)) {
        database.prepare('UPDATE usage_sessions SET ended_at = ? WHERE id = ?').run(now, session.id)
        session = null
      }
      let seconds = 0
      if (session) {
        seconds = Math.max(0, Math.min(30, Number(activeSeconds) || 0, (now - session.last_seen) / 1000))
        // Ignore rapid duplicate requests, including concurrent tabs' heartbeats.
        if (type === 'heartbeat' && now - session.last_seen < 500) return
        database.prepare('UPDATE usage_sessions SET last_seen = ? WHERE id = ?').run(now, session.id)
      } else {
        session = { id: randomUUID() }
        database.prepare('INSERT INTO usage_sessions VALUES (?, ?, ?, ?, ?, NULL)').run(session.id, visitorId, userId, now, now)
      }
      database.prepare(`INSERT INTO usage_daily VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id, day, page) DO UPDATE SET
        views = views + excluded.views, active_seconds = active_seconds + excluded.active_seconds`)
        .run(session.id, usageDate(now), page, type === 'view' ? 1 : 0, type === 'heartbeat' ? seconds : 0)
    },
    summary(days = 7, now = Date.now()) {
      if (![1, 7, 30, 90].includes(days)) throw new Error('Invalid usage period')
      const dates = usageDays(days, now)
      const rows = database.prepare(`SELECT d.*, s.visitor_id, s.user_id FROM usage_daily d
        JOIN usage_sessions s ON s.id = d.session_id WHERE d.day >= ? AND d.day <= ?`).all(dates[0], dates.at(-1))
      const summarize = (entries) => ({
        visits: new Set(entries.map(row => row.session_id)).size,
        visitors: new Set(entries.map(row => row.user_id === null ? `guest:${row.visitor_id}` : `user:${row.user_id}`)).size,
        pageViews: entries.reduce((sum, row) => sum + row.views, 0),
        activeSeconds: Math.round(entries.reduce((sum, row) => sum + row.active_seconds, 0)),
      })
      const split = (entries) => ({
        total: summarize(entries),
        authenticated: summarize(entries.filter(row => row.user_id !== null)),
        guest: summarize(entries.filter(row => row.user_id === null)),
      })
      const online = database.prepare(`SELECT visitor_id, user_id FROM usage_sessions
        WHERE ended_at IS NULL AND last_seen > ?`).all(now - 90_000)
      return {
        days, from: dates[0], to: dates.at(-1), generatedAt: now,
        ...split(rows),
        online: {
          authenticated: new Set(online.filter(row => row.user_id !== null).map(row => row.user_id)).size,
          guest: new Set(online.filter(row => row.user_id === null).map(row => row.visitor_id)).size,
        },
        daily: dates.map(day => ({ day, ...split(rows.filter(row => row.day === day)) })),
        pages: USAGE_PAGES.map(page => ({ page, ...split(rows.filter(row => row.page === page)) })),
        firstRecordedAt: database.prepare('SELECT MIN(started_at) AS value FROM usage_sessions').get().value,
      }
    },
  }
}
