import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyWaterLevel, parseSurinamekadeResponse } from './water-level.mjs'

test('classifies the official ARK/NZK management band', () => {
  assert.equal(classifyWaterLevel(-56), 'low')
  assert.equal(classifyWaterLevel(-55), 'normal')
  assert.equal(classifyWaterLevel(-40), 'normal')
  assert.equal(classifyWaterLevel(-30), 'normal')
  assert.equal(classifyWaterLevel(-29), 'high')
})

test('selects the newest valid Surinamekade measurement', () => {
  const item = measuredAt => ({
    AquoMetadata: { Eenheid: { Code: 'cm' } },
    Locatie: { Code: 'amsterdam.surinamekade' },
    MetingenLijst: [{ Meetwaarde: { Waarde_Numeriek: measuredAt === '2026-09-18T10:00:00Z' ? -39 : -42 }, Tijdstip: measuredAt, WaarnemingMetadata: { Statuswaarde: 'Ongecontroleerd' } }],
  })
  const result = parseSurinamekadeResponse({ WaarnemingenLijst: [item('2025-01-01T10:00:00Z'), item('2026-09-18T10:00:00Z')] })
  assert.equal(result.valueCmNap, -39)
  assert.equal(result.measuredAt, '2026-09-18T10:00:00Z')
  assert.equal(result.status, 'normal')
})

