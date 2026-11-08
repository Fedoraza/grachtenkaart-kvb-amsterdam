import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { importFleetPhotos } from './fleet-photo-import.mjs'
function setup(t) {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE fleet_boats (id INTEGER PRIMARY KEY, name TEXT, mmsi TEXT UNIQUE, active INTEGER, photo BLOB, photo_mime TEXT, updated_at INTEGER);
    INSERT INTO fleet_boats VALUES (1, 'ROOS', '244070458', 1, NULL, NULL, 1);
    INSERT INTO fleet_boats VALUES (2, 'ROSE', '244615958', 1, NULL, NULL, 1);`)
  const directory = mkdtempSync(join(tmpdir(), 'fleet-photos-'))
  const image = Buffer.from('RIFF0000WEBPtest-image-content')
  writeFileSync(join(directory, '244070458.webp'), image)
  const entry = { boatName: 'ROOS', mmsi: '244070458', file: '244070458.webp', sha256: createHash('sha256').update(image).digest('hex'), sourcePage: 'https://amsterdamboatexperience.com/our-fleet/', imageUrl: 'https://amsterdamboatexperience.com/roos.jpg' }
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }) })
  return { db, directory, entry, image }
}
test('dry run keeps data unchanged; apply stores the photo and provenance only for its boat', t => {
  const { db, directory, entry, image } = setup(t)
  assert.equal(importFleetPhotos(db, [entry], directory)[0].status, 'ready')
  assert.equal(db.prepare('SELECT photo FROM fleet_boats WHERE id=1').get().photo, null)
  assert.equal(importFleetPhotos(db, [entry], directory, { apply: true, now: 1000 })[0].status, 'imported')
  assert.deepEqual(Buffer.from(db.prepare('SELECT photo FROM fleet_boats WHERE id=1').get().photo), image)
  assert.equal(db.prepare('SELECT photo FROM fleet_boats WHERE id=2').get().photo, null)
  assert.equal(db.prepare('SELECT source_page FROM fleet_photo_imports WHERE boat_id=1').get().source_page, entry.sourcePage)
})
test('repeated imports preserve existing photos and a later manual upload', t => {
  const { db, directory, entry } = setup(t)
  importFleetPhotos(db, [entry], directory, { apply: true })
  db.prepare('UPDATE fleet_boats SET photo=? WHERE id=1').run(Buffer.from('manual-photo'))
  assert.equal(importFleetPhotos(db, [entry], directory, { apply: true })[0].status, 'existing-photo-preserved')
  assert.equal(Buffer.from(db.prepare('SELECT photo FROM fleet_boats WHERE id=1').get().photo).toString(), 'manual-photo')
})
test('does not confuse ROOS and ROSE even when a manifest supplies an existing MMSI', t => {
  const { db, directory, entry } = setup(t)
  assert.equal(importFleetPhotos(db, [{ ...entry, boatName: 'ROSE' }], directory, { apply: true })[0].status, 'name-mismatch')
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM fleet_boats WHERE photo IS NOT NULL').get().count, 0)
})
test('rejects altered image contents, duplicate entries and directory traversal before changing data', t => {
  const { db, directory, entry } = setup(t)
  assert.throws(() => importFleetPhotos(db, [{ ...entry, sha256: 'wrong' }], directory, { apply: true }), /checksum/)
  assert.throws(() => importFleetPhotos(db, [entry, entry], directory, { apply: true }), /duplicate/)
  assert.throws(() => importFleetPhotos(db, [{ ...entry, file: '../secret.webp' }], directory, { apply: true }), /filename/)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM fleet_boats WHERE photo IS NOT NULL').get().count, 0)
})
