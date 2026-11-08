// Live water-level correction for bridge clearances.
//
// Municipal bridge heights are stored as NAP heights and converted with the
// Amsterdam boezem target level (NAP -0.40 m). The Surinamekade gauge measures
// that same open water. When the water stands above target, every bridge whose
// height is referenced to that level has correspondingly less free height.
//
// The correction is deliberately one-sided: high water lowers clearances, low
// water never raises them. The gauge is a single point and local levels vary
// with wind and pumping, so extra headroom is not promised from a low reading.

export const BOEZEM_TARGET_NAP_METERS = -0.40
export const WATER_LEVEL_MAX_AGE_MS = 3 * 60 * 60 * 1000

const REFERENCE_TOLERANCE_METERS = 0.005

// FIS "KP" (kanaalpeil) heights in this area are referenced to the
// Noordzeekanaal/IJ level, which equals the boezem target. Applying the
// correction to a KP bridge on another canal level can only make routing more
// cautious, never less.
export function isBoezemReferencedBridge(properties = {}) {
  const winter = properties.winterWaterLevelNap
  if (properties.clearanceNap != null && winter != null && winter !== '') {
    const level = Number(winter)
    return Number.isFinite(level) && Math.abs(level - BOEZEM_TARGET_NAP_METERS) <= REFERENCE_TOLERANCE_METERS
  }
  return String(properties.fisReferenceLevel || '').toUpperCase() === 'KP'
}

// Returns how many metres every boezem-referenced clearance must be reduced.
export function waterLevelCorrection(level, now = Date.now()) {
  const valueCmNap = Number(level?.valueCmNap)
  const measuredAt = Date.parse(level?.measuredAt)
  if (!level || !Number.isFinite(valueCmNap) || !Number.isFinite(measuredAt)) {
    return { raiseMeters: 0, applied: false, reason: 'unavailable', valueCmNap: null, measuredAt: null }
  }
  const base = { valueCmNap, measuredAt: new Date(measuredAt).toISOString() }
  if (now - measuredAt > WATER_LEVEL_MAX_AGE_MS) return { ...base, raiseMeters: 0, applied: false, reason: 'stale' }
  const raise = Math.round((valueCmNap / 100 - BOEZEM_TARGET_NAP_METERS) * 100) / 100
  if (raise <= 0) return { ...base, raiseMeters: 0, applied: true, reason: 'at-or-below-target' }
  return { ...base, raiseMeters: raise, applied: true, reason: 'above-target' }
}

export function waterLevelWarning(correction) {
  if (!correction) return null
  if (correction.reason === 'above-target') {
    return `Waterstand Surinamekade ${formatCm(correction.valueCmNap)} cm NAP: doorvaarthoogtes van grachtbruggen zijn ${Math.round(correction.raiseMeters * 100)} cm lager gerekend.`
  }
  if (correction.reason === 'stale') return 'Actuele waterstand is verouderd; doorvaarthoogtes gaan uit van streefpeil NAP −0,40 m.'
  if (correction.reason === 'unavailable') return 'Actuele waterstand niet beschikbaar; doorvaarthoogtes gaan uit van streefpeil NAP −0,40 m.'
  return null
}

function formatCm(value) {
  return String(Math.round(value)).replace('-', '−')
}
