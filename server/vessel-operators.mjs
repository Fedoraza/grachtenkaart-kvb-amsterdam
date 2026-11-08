import { operatorById, groupVesselsByOperator } from '../shared/vessel-operators.mjs'
export function createOperatorStore(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS vessel_operator_assignments (
    mmsi TEXT PRIMARY KEY, operator_id TEXT, updated_by INTEGER,
    updated_at INTEGER NOT NULL
  )`)
  return {
    read() { return Object.fromEntries(database.prepare('SELECT mmsi, operator_id FROM vessel_operator_assignments ORDER BY mmsi').all().map((row) => [row.mmsi, row.operator_id])) },
    write(mmsi, operatorId, userId, now = Date.now()) {
      if (!/^\d{9}$/.test(String(mmsi)) || operatorId !== null && !operatorById(operatorId)) throw new Error('Invalid vessel operator')
      database.prepare('INSERT INTO vessel_operator_assignments VALUES (?, ?, ?, ?) ON CONFLICT(mmsi) DO UPDATE SET operator_id=excluded.operator_id, updated_by=excluded.updated_by, updated_at=excluded.updated_at').run(String(mmsi), operatorId, userId, now)
    },
    reset(mmsi) {
      if (!/^\d{9}$/.test(String(mmsi))) throw new Error('Invalid MMSI')
      database.prepare('DELETE FROM vessel_operator_assignments WHERE mmsi = ?').run(String(mmsi))
    },
  }
}
export function publicOperatorGroups(database, assignments) {
  const vessels = database.prepare('SELECT mmsi, data FROM vessels').all().flatMap((row) => {
    try {
      const p = JSON.parse(row.data)
      return [{ mmsi: row.mmsi, name: p.name || '', latitude: p.latitude, longitude: p.longitude, receivedAt: p.sourceReceivedAt || p.receivedAt }]
    } catch { return [] }
  })
  return groupVesselsByOperator(vessels, assignments)
}
