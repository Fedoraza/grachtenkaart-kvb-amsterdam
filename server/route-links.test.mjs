import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRouteLinkStore } from './route-links.mjs'

test('bridge links survive reopening the database and edits to other bridges', () => {
  const directory = mkdtempSync(join(tmpdir(), 'route-links-'))
  const path = join(directory, 'links.sqlite')
  let db = new DatabaseSync(path)
  try {
    const store = createRouteLinkStore(db)
    const value = { networkPositions: [{ latitude: 52.37, longitude: 4.88, lineName: 'Prinsengracht' }] }
    store.write('bridges', '12', value)
    store.write('bridges', '13', { routeNames: ['Singel'] })
    store.write('reporting', '12', { bearing: 90 })
    db.close()
    db = new DatabaseSync(path)
    assert.deepEqual(createRouteLinkStore(db).read(), {
      bridges: { 12: value, 13: { routeNames: ['Singel'] } }, reporting: { 12: { bearing: 90 } },
    })
    const reopened = createRouteLinkStore(db)
    reopened.write('bridges', '12', {})
    assert.deepEqual(reopened.read().bridges['12'], {})
    assert.throws(() => reopened.write('unknown', '12', {}))
    assert.throws(() => reopened.write('bridges', '', {}))
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }) }
})
