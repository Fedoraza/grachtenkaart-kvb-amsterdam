const normalize = value => String(value || '').trim().toLowerCase()
const delta = (a, b) => Math.abs(((a - b + 540) % 360) - 180)
const hasBearing = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))

export function nextReportingNumber(features) {
  const used = (features || [])
    .map(feature => Number(feature?.properties?.number))
    .filter(number => Number.isSafeInteger(number) && number > 0)
  return used.length ? Math.max(...used) + 1 : 1
}

export function deriveReportingManeuver(point, from, to) {
  if (![point, from, to].every(value => Number.isFinite(value?.latitude) && Number.isFinite(value?.longitude))) return ''
  const scale = Math.cos(point.latitude * Math.PI / 180)
  const incoming = [(point.longitude - from.longitude) * scale, point.latitude - from.latitude]
  const outgoing = [(to.longitude - point.longitude) * scale, to.latitude - point.latitude]
  const inLength = Math.hypot(...incoming), outLength = Math.hypot(...outgoing)
  if (!inLength || !outLength) return ''
  const dot = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / (inLength * outLength)
  const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI
  if (angle <= 35) return 'straight'
  if (angle >= 145) return 'uturn'
  const cross = incoming[0] * outgoing[1] - incoming[1] * outgoing[0]
  return cross > 0 ? 'left' : 'right'
}

export function validateReportingRules(rules) {
  if (!Array.isArray(rules)) return 'Ongeldige meldregels.'
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') return 'Ongeldige meldregel.'
    if (rule.kind === 'map-passage') {
      const validAnchor = anchor => anchor && Number.isFinite(anchor.latitude) && Math.abs(anchor.latitude) <= 90 && Number.isFinite(anchor.longitude) && Math.abs(anchor.longitude) <= 180 && normalize(anchor.lineName)
      if (!validAnchor(rule.from) || !validAnchor(rule.to)) return 'Klik op de kaart waar de boot vandaan komt en waar hij naartoe vaart.'
      if (!String(rule.call || '').trim()) return 'Vul de marifoonmelding in.'
      if (Math.hypot(rule.from.latitude - rule.to.latitude, rule.from.longitude - rule.to.longitude) < 0.00001) return 'Kies twee verschillende kanten van het meldpunt.'
      continue
    }
    if (!normalize(rule.incomingLine) || !hasBearing(rule.bearing) || !String(rule.call || '').trim()) {
      return 'Vul voor iedere regel een aankomstlijn, vaarrichting en melding in.'
    }
    if (hasBearing(rule.outgoingBearing) && !normalize(rule.outgoingLine)) return 'Kies een vervolglijn bij de vervolgrichting.'
    if ([rule.bearing, rule.outgoingBearing].some(value => value !== '' && value != null && (!hasBearing(value) || Number(value) < 0 || Number(value) >= 360))) return 'Kies een richting tussen 0° en 359°.'
  }
  return ''
}

function projection(point, segment) {
  const sx = Math.cos(point.latitude * Math.PI / 180) * 111320
  const dx = (segment.end[1] - segment.start[1]) * sx
  const dy = (segment.end[0] - segment.start[0]) * 111320
  const px = (point.longitude - segment.start[1]) * sx
  const py = (point.latitude - segment.start[0]) * 111320
  const length = Math.hypot(dx, dy)
  if (!length) return null
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (length * length)))
  return {
    distanceMeters: Math.hypot(px - dx * t, py - dy * t),
    routeMeters: segment.startMeters + (segment.endMeters - segment.startMeters) * t,
    bearingDegrees: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360,
    point: { latitude: segment.start[0] + (segment.end[0] - segment.start[0]) * t, longitude: segment.start[1] + (segment.end[1] - segment.start[1]) * t },
    segmentName: segment.name,
  }
}

// Check each visit separately, using the actual next waterway in route order.
export function matchReportingMovements(point, segments, rules) {
  const matches = []
  for (const rule of rules || []) {
    if (validateReportingRules([rule])) continue
    if (rule.kind === 'map-passage') {
      matches.push(...matchMapPassage(point, segments, rule))
      continue
    }
    const candidates = segments.flatMap((segment, index) => {
      if (normalize(segment.name) !== normalize(rule.incomingLine)) return []
      const hit = projection(point, segment)
      if (!hit || hit.distanceMeters > 80 || delta(hit.bearingDegrees, Number(rule.bearing)) > 45) return []
      return [{ ...hit, index }]
    })
    // Adjacent segments around a single visit should produce one announcement.
    const visits = []
    for (const candidate of candidates) {
      const visit = visits.at(-1)
      if (!visit || candidate.routeMeters - visit.at(-1).routeMeters > 160) visits.push([candidate])
      else visit.push(candidate)
    }
    for (const visit of visits) {
      const hit = visit.reduce((best, value) => value.distanceMeters < best.distanceMeters ? value : best)
      if (normalize(rule.outgoingLine)) {
        const following = segments.slice(hit.index + 1).filter(segment => segment.startMeters - hit.routeMeters <= 120)
        const nextLine = following.find(segment => normalize(segment.name) && normalize(segment.name) !== normalize(rule.incomingLine))
        const departure = nextLine || segments.find(segment => segment.startMeters <= hit.routeMeters + 15 && segment.endMeters >= hit.routeMeters + 15)
        if (!departure || normalize(departure.name) !== normalize(rule.outgoingLine)) continue
        const heading = projection(point, departure)?.bearingDegrees
        if (hasBearing(rule.outgoingBearing) && (!Number.isFinite(heading) || delta(heading, Number(rule.outgoingBearing)) > 45)) continue
      }
      matches.push({ ...hit, rule })
    }
  }
  return matches.sort((a, b) => a.routeMeters - b.routeMeters)
}

// A movement is two points on the waterway network. Route order distinguishes
// opposite approaches even when both sides have the same canal name.
function matchMapPassage(point, segments, rule) {
  const hitsAt = anchor => segments.flatMap(segment => {
    const hit = projection(anchor, segment)
    // Geometry is authoritative. The same blue line can have a different name
    // in OSM/FIS or on either side of a bridge or lock.
    // Planned routes run between graph nodes, while an admin can place an
    // anchor halfway along an edge. Allow the normal node-to-anchor gap.
    return hit && hit.distanceMeters <= 35 ? [hit] : []
  }).sort((a, b) => a.routeMeters - b.routeMeters)
  const fromHits = hitsAt(rule.from), toHits = hitsAt(rule.to)
  const result = []
  for (const from of fromHits) {
    const to = toHits.find(hit => hit.routeMeters > from.routeMeters + 10 && hit.routeMeters - from.routeMeters <= 700)
    if (!to) continue
    const passing = segments.flatMap(segment => {
      if (segment.endMeters < from.routeMeters || segment.startMeters > to.routeMeters) return []
      const hit = projection(point, segment)
      return hit && hit.routeMeters > from.routeMeters + 5 && hit.routeMeters < to.routeMeters - 5 && hit.distanceMeters <= 80 ? [hit] : []
    }).sort((a, b) => a.distanceMeters - b.distanceMeters)
    const hit = passing[0]
    if (!hit || result.some(previous => Math.abs(previous.routeMeters - hit.routeMeters) < 30)) continue
    result.push({ ...hit, rule })
  }
  return result
}
