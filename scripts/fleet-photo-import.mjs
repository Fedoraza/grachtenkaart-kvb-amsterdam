import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

export function normalizePhotoBoatName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function importFleetPhotos(database, entries, directory, { apply = false, now = Date.now() } = {}) {
  if (!Array.isArray(entries)) throw new Error('Expected a photo manifest array')
  const seen = new Set()
  const plan = entries.map(entry => {
    if (!/^\d{9}$/.test(entry.mmsi) || seen.has(entry.mmsi)) throw new Error('Invalid or duplicate MMSI')
    seen.add(entry.mmsi)
    if (entry.file !== `${entry.mmsi}.webp`) throw new Error('Invalid image filename')
    for (const key of ['sourcePage', 'imageUrl']) {
      if (new URL(entry[key]).protocol !== 'https:') throw new Error('Image sources must use HTTPS')
    }
    const photo = readFileSync(resolve(directory, entry.file))
    if (photo.length > 5_000_000 || photo.toString('ascii', 0, 4) !== 'RIFF' || photo.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid WebP for ${entry.boatName}`)
    if (createHash('sha256').update(photo).digest('hex') !== entry.sha256) throw new Error(`Image checksum mismatch for ${entry.boatName}`)
    const boat = database.prepare('SELECT id, name, active, length(photo) AS photoBytes FROM fleet_boats WHERE mmsi = ?').get(entry.mmsi)
    if (!boat) return { entry, status: 'boat-not-found' }
    if (!boat.active) return { entry, status: 'inactive' }
    if (normalizePhotoBoatName(boat.name) !== normalizePhotoBoatName(entry.boatName)) return { entry, status: 'name-mismatch' }
    if (boat.photoBytes > 0) return { entry, boat, status: 'existing-photo-preserved' }
    return { entry, boat, photo, status: apply ? 'imported' : 'ready' }
  })
  if (apply) {
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`CREATE TABLE IF NOT EXISTS fleet_photo_imports (
        boat_id INTEGER PRIMARY KEY REFERENCES fleet_boats(id) ON DELETE CASCADE,
        boat_name TEXT NOT NULL, mmsi TEXT NOT NULL, source_page TEXT NOT NULL,
        image_url TEXT NOT NULL, sha256 TEXT NOT NULL, imported_at INTEGER NOT NULL
      )`)
      const update = database.prepare('UPDATE fleet_boats SET photo = ?, photo_mime = ?, updated_at = ? WHERE id = ? AND mmsi = ? AND name = ? AND active = 1 AND (photo IS NULL OR length(photo) = 0)')
      const record = database.prepare(`INSERT INTO fleet_photo_imports VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(boat_id) DO UPDATE SET boat_name=excluded.boat_name, mmsi=excluded.mmsi,
        source_page=excluded.source_page, image_url=excluded.image_url, sha256=excluded.sha256, imported_at=excluded.imported_at`)
      for (const item of plan) {
        if (item.status !== 'imported') continue
        const { entry, boat, photo } = item
        if (!update.run(photo, 'image/webp', now, boat.id, entry.mmsi, boat.name).changes) { item.status = 'existing-photo-preserved'; continue }
        record.run(boat.id, boat.name, entry.mmsi, entry.sourcePage, entry.imageUrl, entry.sha256, now)
      }
      database.exec('COMMIT')
    } catch (error) { database.exec('ROLLBACK'); throw error }
  }
  return plan.map(({ entry, status, photo }) => ({ boatName: entry.boatName, mmsi: entry.mmsi, status, ...(photo ? { bytes: photo.length } : {}) }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifestPath = process.argv[2]
  const directory = process.argv[3]
  if (!manifestPath || !directory) throw new Error('Usage: node scripts/fleet-photo-import.mjs manifest.json photo-directory [--apply]')
  const database = new DatabaseSync(process.env.DATABASE_PATH || 'data/ais.sqlite')
  database.exec('PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON')
  try {
    const result = importFleetPhotos(database, JSON.parse(readFileSync(manifestPath, 'utf8')), directory, { apply: process.argv.includes('--apply') })
    console.log(JSON.stringify({ apply: process.argv.includes('--apply'), results: result }, null, 2))
  } finally { database.close() }
}
