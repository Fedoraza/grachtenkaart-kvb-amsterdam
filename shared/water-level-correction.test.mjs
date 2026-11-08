import test from 'node:test'
import assert from 'node:assert/strict'
import { isBoezemReferencedBridge, waterLevelCorrection, waterLevelWarning, WATER_LEVEL_MAX_AGE_MS } from './water-level-correction.mjs'

const now = Date.parse('2026-11-08T12:00:00Z')
const reading = (valueCmNap, ageMs = 10 * 60_000) => ({ valueCmNap, measuredAt: new Date(now - ageMs).toISOString() })

test('water above target lowers clearances by the difference', () => {
  const correction = waterLevelCorrection(reading(-28), now)
  assert.equal(correction.raiseMeters, 0.12)
  assert.equal(correction.applied, true)
  assert.match(waterLevelWarning(correction), /12 cm lager/)
})

test('water at or below target never adds clearance', () => {
  assert.equal(waterLevelCorrection(reading(-40), now).raiseMeters, 0)
  const low = waterLevelCorrection(reading(-60), now)
  assert.equal(low.raiseMeters, 0)
  assert.equal(waterLevelWarning(low), null)
})

test('stale or missing readings fall back to target level with a warning', () => {
  const stale = waterLevelCorrection(reading(-10, WATER_LEVEL_MAX_AGE_MS + 1), now)
  assert.equal(stale.raiseMeters, 0)
  assert.equal(stale.reason, 'stale')
  assert.match(waterLevelWarning(stale), /verouderd/)
  for (const missing of [null, {}, { valueCmNap: 'x', measuredAt: 'never' }]) {
    assert.equal(waterLevelCorrection(missing, now).reason, 'unavailable')
  }
})

test('only boezem-referenced heights are water-level sensitive', () => {
  assert.equal(isBoezemReferencedBridge({ clearanceNap: 1.2, winterWaterLevelNap: -0.4 }), true)
  assert.equal(isBoezemReferencedBridge({ clearanceNap: 1.2, winterWaterLevelNap: '-0.40' }), true)
  assert.equal(isBoezemReferencedBridge({ clearanceNap: 1.2, winterWaterLevelNap: -2.1 }), false)
  assert.equal(isBoezemReferencedBridge({ fisClearanceMeters: 3.4, fisReferenceLevel: 'KP' }), true)
  assert.equal(isBoezemReferencedBridge({ fisClearanceMeters: 3.4, fisReferenceLevel: 'NAP' }), false)
  assert.equal(isBoezemReferencedBridge({}), false)
})
