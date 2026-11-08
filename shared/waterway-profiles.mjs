// Gemeente Amsterdam, Uitvoeringsplan Transport over Water, figure 5, p. 9.
// Profile widths are maximum VESSEL widths, not the width of the fairway.
export const PROFILE_SOURCE_URL = 'https://assets.amsterdam.nl/publish/pages/1071270/uitvoeringsplan_transport_over_water_3.pdf'
export const WATERWAY_PROFILES = {
  A1: { maxLength: 80, maxWidth: 9.5, depthNap: -3 },
  'A1+': { maxLength: 80, maxWidth: 9.5, depthNap: -3 },
  A2: { maxLength: 67, maxWidth: 7.2, depthNap: -2.75 },
  'A2+': { maxLength: 67, maxWidth: 7.2, depthNap: -2.75 },
  B: { maxLength: 20, maxWidth: 4.25, depthNap: -2.2 },
  C: { maxLength: 18, maxWidth: 4, depthNap: -2.2 },
  D: { maxLength: 14, maxWidth: 3.75, depthNap: -1.9 },
  E: { maxLength: 14, maxWidth: 3.75, depthNap: -1.8 },
  'E®': { maxLength: 14, maxWidth: 3.75, depthNap: -1.8 },
}
const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
// Only whole waterways with an unambiguous classification are listed here.
// Mixed-profile waterways must carry a profile on each individual feature.
const WATERWAY_NAMES = {
  A1: ['Kostverlorenvaart', 'Westerkanaal'],
  'A1+': ['Schinkel'],
  A2: ['Nieuwe Herengracht', 'Oudeschans', 'Nieuwe Vaart', 'Entrepotdok'],
  'A2+': ['Amstel', 'Oosterdok'],
  B: ['Prinsengracht', 'Korte Prinsengracht', 'Keizersgracht', 'Herengracht', 'Singel',
    'Brouwersgracht', 'Lauriergracht', 'Leidsegracht', 'Leliegracht', 'Reguliersgracht',
    'Spiegelgracht', 'Kloveniersburgwal', 'Oudezijds Voorburgwal', 'Geldersekade',
    'Nieuwe Keizersgracht', 'Nieuwe Prinsengracht', 'Nieuwe Achtergracht',
    'Plantage Muidergracht', 'Rokin', 'Zoutkeetsgracht', 'Bickersgracht', 'Realengracht'],
  C: ['Bloemgracht', 'Raamgracht'],
  E: ['Achtergracht', 'Oudezijds Kolk'],
  'E®': ['Blauwburgwal', 'Egelantiersgracht', 'Looiersgracht', 'Passeerdersgracht', 'Groenburgwal'],
}
const byName = new Map(Object.entries(WATERWAY_NAMES).flatMap(([code, names]) => names.map((name) => [normalize(name), code])))

export function waterwayProfileForFeature(feature) {
  const p = feature?.properties || {}
  const explicit = p.navigationProfile ?? p.doorvaartprofiel ?? p['ref:doorvaartprofiel']
  let code = explicit == null ? null : String(explicit).trim().toUpperCase().replace(/E\(?R\)?$/, 'E®')
  if (explicit == null) {
    // Avoid applying Amsterdam rules to similarly named waterways elsewhere.
    const coordinates = feature?.geometry?.coordinates
    const points = feature?.geometry?.type === 'MultiLineString' ? coordinates?.flat() : coordinates
    if (!points?.length || !points.every(([lng, lat]) => lng >= 4.80 && lng <= 4.96 && lat >= 52.32 && lat <= 52.41)) return null
    code = byName.get(normalize(p.name))
  }
  return WATERWAY_PROFILES[code] ? { code, ...WATERWAY_PROFILES[code], sourceUrl: PROFILE_SOURCE_URL } : null
}
