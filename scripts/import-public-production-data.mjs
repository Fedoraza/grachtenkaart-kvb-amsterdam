import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const databasePath = process.env.DATABASE_PATH || '/app/data/ais.sqlite'
const payloadPath = process.argv[2] || '/tmp/boat-tracker-public-data.json'
const database = new DatabaseSync(databasePath)
const payload = JSON.parse(readFileSync(payloadPath, 'utf8'))

function upsertRows(table, rows, keyColumns) {
  if (!Array.isArray(rows) || !rows.length) return 0
  const columns = Object.keys(rows[0])
  const placeholders = columns.map(() => '?').join(', ')
  const updates = columns
    .filter((column) => !keyColumns.includes(column))
    .map((column) => `${column}=excluded.${column}`)
    .join(', ')
  const statement = database.prepare(`
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(${keyColumns.join(', ')}) DO UPDATE SET ${updates}
  `)
  for (const row of rows) statement.run(...columns.map((column) => row[column]))
  return rows.length
}

database.exec('BEGIN IMMEDIATE')
try {
  const fleetCount = upsertRows('fleet_boats', payload.fleet_boats || [], ['id'])
  const vesselCount = upsertRows('vessels', payload.vessels || [], ['mmsi'])
  const mapCount = upsertRows('map_object_overrides', payload.map_object_overrides || [], ['layer', 'object_key'])
  database.exec('COMMIT')
  console.log(JSON.stringify({ fleet_boats: fleetCount, vessels: vesselCount, map_object_overrides: mapCount }))
} catch (error) {
  try { database.exec('ROLLBACK') } catch {}
  throw error
} finally {
  database.close()
}
