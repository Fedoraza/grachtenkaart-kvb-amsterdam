import test from 'node:test'
import assert from 'node:assert/strict'
import { hasVerifiedBoatPhoto } from './boat-photo-verification.mjs'
test('legacy photos are hidden and a verified photo is bound to the exact current identity', () => {
  const photo = { name: 'APSARA', mmsi: '244090957', photo_verified: 1, photo_verified_name: 'APSARA', photo_verified_mmsi: '244090957' }
  assert.equal(hasVerifiedBoatPhoto(photo), true)
  assert.equal(hasVerifiedBoatPhoto({ ...photo, photo_verified: 0 }), false)
  assert.equal(hasVerifiedBoatPhoto({ ...photo, mmsi: '244999999' }), false)
  assert.equal(hasVerifiedBoatPhoto({ ...photo, name: 'OTHER BOAT' }), false)
  assert.equal(hasVerifiedBoatPhoto({ name: 'APSARA', photo_mime: 'image/jpeg' }), false)
})
