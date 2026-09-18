const SURINAMEKADE_URL = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenLaatsteWaarnemingen'

export const SURINAMEKADE_REFERENCE = Object.freeze({
  station: 'Amsterdam, Surinamekade',
  stationCode: 'amsterdam.surinamekade',
  targetCmNap: -40,
  normalMinCmNap: -55,
  normalMaxCmNap: -30,
  sourceName: 'Rijkswaterstaat',
  sourceUrl: 'https://rijkswaterstaatdata.nl/waterdata/',
})

export function classifyWaterLevel(valueCmNap) {
  if (!Number.isFinite(valueCmNap)) return 'unknown'
  if (valueCmNap < SURINAMEKADE_REFERENCE.normalMinCmNap) return 'low'
  if (valueCmNap > SURINAMEKADE_REFERENCE.normalMaxCmNap) return 'high'
  return 'normal'
}

export function parseSurinamekadeResponse(payload) {
  const observations = Array.isArray(payload?.WaarnemingenLijst) ? payload.WaarnemingenLijst : []
  const measurements = observations
    .filter(item => item?.Locatie?.Code === SURINAMEKADE_REFERENCE.stationCode)
    .flatMap(item => (Array.isArray(item.MetingenLijst) ? item.MetingenLijst : []).map(measurement => ({ item, measurement })))
    .map(({ item, measurement }) => ({
      valueCmNap: Number(measurement?.Meetwaarde?.Waarde_Numeriek),
      measuredAt: measurement?.Tijdstip,
      quality: measurement?.WaarnemingMetadata?.Statuswaarde || null,
      unit: item?.AquoMetadata?.Eenheid?.Code || 'cm',
    }))
    .filter(item => Number.isFinite(item.valueCmNap) && Number.isFinite(Date.parse(item.measuredAt)))
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))

  if (!measurements.length) throw new Error('Surinamekade water level is missing from the Rijkswaterstaat response')
  const latest = measurements[0]
  return {
    ...SURINAMEKADE_REFERENCE,
    ...latest,
    status: classifyWaterLevel(latest.valueCmNap),
  }
}

export async function fetchSurinamekadeWaterLevel(fetchImpl = fetch) {
  const response = await fetchImpl(SURINAMEKADE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      LocatieLijst: [{ Code: SURINAMEKADE_REFERENCE.stationCode }],
      AquoPlusWaarnemingMetadataLijst: [{
        AquoMetadata: { Compartiment: { Code: 'OW' }, Grootheid: { Code: 'WATHTE' } },
      }],
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Rijkswaterstaat returned ${response.status}`)
  return parseSurinamekadeResponse(await response.json())
}

