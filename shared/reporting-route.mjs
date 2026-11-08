import { matchReportingMovements } from './reporting-movements.mjs'

// Shared by the interactive map and server-rendered shared routes.
export function reportingPointsAlongRoute(features, result, overrides = {}) {
  function routeLinkOverride(kind, id) {
    const key = String(id || '').trim()
    return key ? overrides[kind === 'reporting' ? 'reporting' : 'bridges']?.[key] || null : null
  }
function collect(features, result) {
  const coordinates = result?.coordinates || []
  const segments = routeSegmentsForResult(result)
  return features
    .flatMap((feature) => {
      const point = featureRoutePoint(feature, coordinates, 'reporting')
      if (!point) return null
      const properties = feature.properties || {}
      const override = reportingOverrideForProperties(properties)
      const rules = properties.movementRules ?? override?.movementRules
      if (Array.isArray(rules) && rules.length) {
        return matchReportingMovements(point, segments, rules).map(hit => ({
          ...reportingPointExportItem(feature, point, override),
          call: hit.rule.call,
          bearing: hit.bearingDegrees,
          routeBearing: hit.bearingDegrees,
          sourceLatitude: point.latitude, sourceLongitude: point.longitude,
          latitude: hit.point.latitude, longitude: hit.point.longitude,
          routeNames: [hit.rule.from?.lineName || hit.rule.incomingLine, hit.rule.to?.lineName || hit.rule.outgoingLine].filter(Boolean),
          movementRules: rules,
          matchedRouteName: true, matchedRouteSegment: true,
          matchedSegmentName: hit.segmentName, routeMeters: hit.routeMeters,
          distanceToRouteMeters: Math.round(hit.distanceMeters),
        }))
      }
      const overrideRouteNames = routeLinkNamesFromOverride(override)
      const explicitRoutePosition = projectPointOnLinkedRouteSegment(point, segments, override)
      const candidateRouteNames = overrideRouteNames.length ? overrideRouteNames : inferReportingRouteNames(properties)
      const routePosition = explicitRoutePosition || projectPointOnMatchingRouteSegment(point, segments, candidateRouteNames)
      if (!routePosition || routePosition.distanceMeters > 80) return null
      const bearing = Number(override?.bearing ?? properties.bearing)
      if (Number.isFinite(bearing) && Number.isFinite(routePosition.bearingDegrees) && bearingDeltaDegrees(routePosition.bearingDegrees, bearing) > 45) return null
      return {
        ...reportingPointExportItem(feature, point, override),
        bearing,
        routeBearing: routePosition.bearingDegrees,
        sourceLatitude: point.latitude,
        sourceLongitude: point.longitude,
        latitude: routePosition.point.latitude,
        longitude: routePosition.point.longitude,
        routeNames: candidateRouteNames,
        matchedRouteName: true,
        matchedRouteSegment: Boolean(explicitRoutePosition),
        matchedSegmentName: routePosition.segmentName,
        routeMeters: routePosition.routeMeters,
        distanceToRouteMeters: Math.round(routePosition.distanceMeters),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.routeMeters - b.routeMeters || Number(a.number) - Number(b.number))
}

function routeSegmentsForResult(result) {
  if (Array.isArray(result?.segments) && result.segments.length) {
    return result.segments
      .map((segment) => ({
        name: segment.name || '',
        startMeters: Number(segment.startMeters) || 0,
        endMeters: Number(segment.endMeters) || 0,
        start: [Number(segment.start?.latitude), Number(segment.start?.longitude)],
        end: [Number(segment.end?.latitude), Number(segment.end?.longitude)],
      }))
      .filter((segment) => Number.isFinite(segment.start[0]) && Number.isFinite(segment.start[1]) && Number.isFinite(segment.end[0]) && Number.isFinite(segment.end[1]))
  }
  const coordinates = result?.coordinates || []
  const names = result?.steps || []
  if (!coordinates.length || !names.length) return []
  let routeMeters = 0
  return coordinates.slice(1).map((coordinate, index) => {
    const start = coordinates[index]
    const distance = routeDistanceMeters({ latitude: start[0], longitude: start[1] }, { latitude: coordinate[0], longitude: coordinate[1] })
    const segment = {
      name: routeStepNameAtMeters(result, routeMeters + distance / 2),
      startMeters: routeMeters,
      endMeters: routeMeters + distance,
      start,
      end: coordinate,
    }
    routeMeters += distance
    return segment
  })
}

function routeStepNameAtMeters(result, routeMeters) {
  const steps = (result?.steps || []).filter((step) => step.name)
  if (!steps.length) return ''
  let coveredMeters = 0
  for (const step of steps) {
    coveredMeters += Number(step.distanceMeters) || 0
    if (routeMeters <= coveredMeters) return step.name
  }
  return steps[steps.length - 1]?.name || ''
}

function routeDistanceMeters(a, b) {
  const latitude = ((a.latitude + b.latitude) / 2) * Math.PI / 180
  return Math.hypot((a.longitude - b.longitude) * Math.cos(latitude), a.latitude - b.latitude) * 111_320
}

function featureRoutePoint(feature, coordinates, kind = null) {
  const overridePoint = kind ? routeLinkPositionOverride(kind, feature.properties || {}) : null
  if (overridePoint) return overridePoint
  const points = geometryRoutePoints(feature.geometry)
  if (!points.length) return null
  let best = null
  for (const point of points) {
    const projection = projectPointOnRoute(point, coordinates)
    if (!projection) continue
    if (!best || projection.distanceMeters < best.distanceMeters) best = { ...point, distanceMeters: projection.distanceMeters }
  }
  return best || averageRoutePoint(points)
}

function geometryRoutePoints(geometry) {
  if (!geometry) return []
  if (geometry.type === 'GeometryCollection') return (geometry.geometries || []).flatMap(geometryRoutePoints)
  return flattenCoordinatePairs(geometry.coordinates)
    .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
}

function flattenCoordinatePairs(value) {
  if (!Array.isArray(value)) return []
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) return [[Number(value[0]), Number(value[1])]]
  return value.flatMap(flattenCoordinatePairs)
}

function averageRoutePoint(points) {
  if (!points.length) return null
  const total = points.reduce((sum, point) => ({ latitude: sum.latitude + point.latitude, longitude: sum.longitude + point.longitude }), { latitude: 0, longitude: 0 })
  return { latitude: total.latitude / points.length, longitude: total.longitude / points.length }
}

function projectPointOnRoute(point, coordinates) {
  if (!point || !coordinates?.length) return null
  let best = null
  let coveredMeters = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const segment = projectPointOnSegment(point, coordinates[index - 1], coordinates[index])
    const routeMeters = coveredMeters + segment.segmentMeters * segment.t
    if (!best || segment.distanceMeters < best.distanceMeters) best = { ...segment, routeMeters }
    coveredMeters += segment.segmentMeters
  }
  return best
}

function projectPointOnSegment(point, start, end) {
  const scale = Math.cos(point.latitude * Math.PI / 180)
  const px = point.longitude * scale
  const py = point.latitude
  const ax = start[1] * scale
  const ay = start[0]
  const bx = end[1] * scale
  const by = end[0]
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  const projected = { latitude: ay + t * dy, longitude: (ax + t * dx) / scale }
  const segmentMeters = routeDistanceMeters({ latitude: start[0], longitude: start[1] }, { latitude: end[0], longitude: end[1] })
  return { t, point: projected, segmentMeters, distanceMeters: routeDistanceMeters(point, projected), bearingDegrees: routeBearingDegrees(start, end) }
}

function routeBearingDegrees(start, end) {
  const lat1 = start[0] * Math.PI / 180
  const lat2 = end[0] * Math.PI / 180
  const deltaLng = (end[1] - start[1]) * Math.PI / 180
  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function routeLinkPositionOverride(kind, item) {
  const override = routeLinkOverride(kind, item?.number || item?.id || item?.name || item?.call)
  const latitude = Number(override?.latitude)
  const longitude = Number(override?.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
}

function reportingOverrideForProperties(properties) {
  return routeLinkOverride('reporting', properties.number) || routeLinkOverride('reporting', properties.call)
}

function routeLinkNamesFromOverride(override) {
  const networkNames = [...new Set(bridgeNetworkPositions(override).map((position) => position.lineName).filter(Boolean))]
  if (networkNames.length) return networkNames
  if (Array.isArray(override?.routeNames)) return override.routeNames.filter(Boolean)
  if (typeof override?.routeNames === 'string') return parseRouteNames(override.routeNames)
  return []
}

function bridgeNetworkPositions(override) {
  if (Array.isArray(override?.networkPositions)) return override.networkPositions.filter(Boolean)
  return override?.networkPosition ? [override.networkPosition] : []
}

function parseRouteNames(value) {
  return String(value || '').split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean)
}

function inferReportingRouteNames(properties) {
  return [
    ...(Array.isArray(properties.routeNames) ? properties.routeNames : []),
    ...parseRouteNames([properties.call, properties.locationName, properties.name].filter(Boolean).join(', ')),
  ]
}

function projectPointOnMatchingRouteSegment(point, segments, names) {
  const candidateNames = (names || []).map(normalizeRouteName).filter(Boolean)
  if (!candidateNames.length) return null
  let best = null
  for (const segment of segments || []) {
    const segmentName = normalizeRouteName(segment.name)
    if (!segmentName || !candidateNames.some((name) => routeNameTokensMatch(name, segmentName))) continue
    const projection = projectPointOnSegment(point, segment.start, segment.end)
    const routeMeters = (Number(segment.startMeters) || 0) + projection.segmentMeters * projection.t
    const candidate = { ...projection, routeMeters, segmentName: segment.name }
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate
  }
  return best
}

function projectPointOnLinkedRouteSegment(point, segments, override) {
  const positions = bridgeNetworkPositions(override)
  if (positions.length) {
    for (const networkPosition of positions) {
    if (!Number.isFinite(Number(networkPosition?.latitude)) || !Number.isFinite(Number(networkPosition?.longitude))) continue
    const linkedPoint = { latitude: Number(networkPosition.latitude), longitude: Number(networkPosition.longitude) }
    const linkedPosition = networkPosition.lineName
      ? projectPointOnMatchingRouteSegment(linkedPoint, segments, [networkPosition.lineName])
      : null
    if (linkedPosition && linkedPosition.distanceMeters <= 12) return linkedPosition
    }
    return null
  }
  const assignedSegments = override?.routeSegments || []
  const linkedKeys = new Set(assignedSegments.map((segment) => segment?.key).filter(Boolean))
  if (!linkedKeys.size) return null
  const assignedPoint = point
  let best = null
  for (const segment of segments || []) {
    if (!linkedKeys.has(routeSegmentKey(segment))) continue
    const projection = projectPointOnSegment(assignedPoint, segment.start, segment.end)
    const routeMeters = (Number(segment.startMeters) || 0) + projection.segmentMeters * projection.t
    const candidate = { ...projection, routeMeters, segmentName: segment.name, segment }
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate
  }
  return best
}

function routeSegmentKey(segment) {
  const name = normalizeRouteName(segment?.name)
  const start = Array.isArray(segment?.start) ? segment.start : []
  const end = Array.isArray(segment?.end) ? segment.end : []
  const coordinates = [start, end]
    .map(([latitude, longitude]) => `${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}`)
    .join('|')
  return `${name}|${coordinates}`
}

function normalizeRouteName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(gracht|kanaal|vaart|dok|haven|sluis|brug|verbinding)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function routeNameTokensMatch(candidate, routeName) {
  if (!candidate || !routeName) return false
  if (candidate === routeName) return true
  const ignored = new Set(['oude', 'nieuwe', 'groot', 'grote', 'klein', 'kleine', 'richting', 'naar', 'van', 'voor', 'bij', 'over', 'onder'])
  const candidateTokens = new Set(candidate.split(' ').filter((token) => token.length >= 4 && !ignored.has(token)))
  const routeTokens = routeName.split(' ').filter((token) => token.length >= 4 && !ignored.has(token))
  return routeTokens.some((token) => candidateTokens.has(token))
}

function bearingDeltaDegrees(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180)
}

function reportingPointExportItem(feature, point, override = null) {
  const properties = feature.properties || {}
  return {
    name: override?.name || properties.locationName || properties.name || 'Marifoonmeldpunt',
    number: properties.number || '',
    call: override?.call || properties.call || '',
    source: properties.source || '',
    latitude: point.latitude,
    longitude: point.longitude,
  }
}
  return collect(features, result)
}
