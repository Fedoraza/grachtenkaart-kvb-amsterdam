import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { BOAT_PHOTOS, boatPhoto } from './boat-photos.mjs'

test('published boat photos have local WebP assets and intact source provenance', () => {
  for (const photo of BOAT_PHOTOS) {
    assert.match(photo.file, /^[a-z0-9-]+\.webp$/)
    assert.equal(new URL(photo.sourcePage).protocol, 'https:')
    assert.equal(new URL(photo.imageUrl).protocol, 'https:')
    const data = readFileSync(new URL(`../public/boat-photos/${photo.file}`, import.meta.url))
    assert.equal(data.toString('ascii', 0, 4), 'RIFF')
    assert.equal(data.toString('ascii', 8, 12), 'WEBP')
    assert.equal(createHash('sha256').update(data).digest('hex'), photo.sha256)
  }
})

test('only confirmed identity photos or explicitly verified uploads are displayed', () => {
  assert.equal(boatPhoto({ name: 'Spartacus', photoUrl: '/api/fleet/boats/1/photo', photoVerified: true }, 'lovers').photoUrl, '/api/fleet/boats/1/photo')
  assert.equal(boatPhoto({ name: 'Unverified', photoUrl: '/api/fleet/boats/1/photo' }, 'lovers').photoUrl, null)
  assert.equal(boatPhoto({ name: 'Spartacus', mmsi: '244311331' }, 'lovers').photoKind, 'vessel')
  assert.equal(boatPhoto({ name: 'Spartacus', mmsi: '244999999' }, 'lovers').photoUrl, null)
  assert.equal(boatPhoto({ name: 'Vondel' }, 'smidtje').photoUrl, null)
  assert.equal(boatPhoto({ name: 'KIN12' }, 'kinboat').photoUrl, null)
  assert.equal(boatPhoto({ name: 'Vondel' }, 'unassigned').photoUrl, null)
})
