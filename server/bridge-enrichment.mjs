import { readGeoJsonPages } from './bridge-source-pages.mjs'
const FIS_BASE = 'https://geo.rijkswaterstaat.nl/services/ogc/gdr/fis_vnds/ogc/features/v1/collections'
const AMSTERDAM_BOUNDS = '4.65,52.20,5.15,52.50'

function distanceMeters(a, b) {
  const lat = (a[1] + b[1]) / 2 * Math.PI / 180
  return Math.hypot((a[0] - b[0]) * 111_320 * Math.cos(lat), (a[1] - b[1]) * 111_320)
}

// Openings lie on the sailing lane, which can be far from a long bridge's
// centre. Measure against its footprint instead of widening the search radius.
export function distanceToBridge(geometry, point) {
  if (geometry?.type === 'Point') return distanceMeters(geometry.coordinates, point)
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []
  let minimum = Infinity
  const scale = 111_320 * Math.cos(point[1] * Math.PI / 180)
  for (const polygon of polygons) {
    let inside = false
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = [(ring[j][0] - point[0]) * scale, (ring[j][1] - point[1]) * 111_320]
        const b = [(ring[i][0] - point[0]) * scale, (ring[i][1] - point[1]) * 111_320]
        if ((a[1] > 0) !== (b[1] > 0) && 0 < a[0] + (b[0] - a[0]) * -a[1] / (b[1] - a[1])) inside = !inside
        const dx = b[0] - a[0], dy = b[1] - a[1]
        const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)))
        minimum = Math.min(minimum, Math.hypot(a[0] + t * dx, a[1] + t * dy))
      }
    }
    if (inside) return 0
  }
  return minimum
}

function normalizedName(name) {
  return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/doorvaartopening|beweegbaar|vast|brug/g, '').replace(/[^a-z0-9]/g, '')
}

function bridgeNumber(name) {
  const match = String(name || '').match(/\bbrug\s*0*(\d+)\b/i)
  return match ? Number(match[1]) : null
}

function matchesIdentity(amsterdam, fisBridge, fisOpening) {
  const number = String(amsterdam.number || '').match(/^BRU0*(\d+)$/i)
  const fisNumber = bridgeNumber(fisBridge?.properties?.name)
  if (number && fisNumber !== null) return Number(number[1]) === fisNumber
  const name = normalizedName(amsterdam.name)
  const fisNames = [fisBridge?.properties?.name, fisOpening.properties?.name].map(normalizedName)
  return name.length >= 6 && fisNames.some((candidate) => candidate.includes(name))
    || name.length >= 4 && fisNames.some((candidate) => [name, `${name}weesp`, `${name}amsterdam`].includes(candidate))
}

const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0

export function enrichMissingBridgeClearances(amsterdamFeatures, fisOpenings, fisBridges) {
  const parents = new Map(fisBridges.map((bridge) => [bridge.properties?.id, bridge]))
  const openings = fisOpenings.filter((feature) => feature.geometry?.type === 'Point'
    && (!feature.properties?.parentgeotype || feature.properties.parentgeotype === 'bridge')
    && parents.has(feature.properties?.parentid)
    && ((positive(feature.properties?.clearanceheightclosed) && Number(feature.properties.clearanceheightclosed) < 50)
      || positive(feature.properties?.width))
    && feature.properties?.condition === 'CONSTRUCTED')
  let enriched = 0
  for (const feature of amsterdamFeatures) {
    const properties = feature.properties || {}
    const needsHeight = !(properties.clearanceNap != null && properties.winterWaterLevelNap != null)
      && !positive(properties.fisClearanceMeters)
    const needsWidth = !positive(properties.passageWidth) && !positive(properties.fisPassageWidthMeters)
    if (!needsHeight && !needsWidth) continue
    let matches = openings.filter((opening) => properties.fisBridgeId
      ? (properties.fisBridgeIds || [properties.fisBridgeId]).includes(opening.properties.parentid)
      : distanceToBridge(feature.geometry, opening.geometry.coordinates) <= 30 && matchesIdentity(properties, parents.get(opening.properties.parentid), opening))
    const numbered = matches.filter((opening) => bridgeNumber(parents.get(opening.properties.parentid)?.properties?.name) !== null)
    if (numbered.length) matches = numbered
    const parentIds = new Set(matches.map((opening) => opening.properties.parentid))
    if (parentIds.size !== 1 && !properties.fisBridgeId) continue
    const heights = matches.filter((opening) => positive(opening.properties.clearanceheightclosed)
      && Number(opening.properties.clearanceheightclosed) < 50)
    const widths = matches.filter((opening) => positive(opening.properties.width))
    let changed = false
    if (needsHeight && heights.length) {
      const best = heights.reduce((a, b) => Number(a.properties.clearanceheightclosed) <= Number(b.properties.clearanceheightclosed) ? a : b)
      properties.fisClearanceMeters = Number(best.properties.clearanceheightclosed)
      properties.fisOpeningName = best.properties.name
      properties.fisSourceUrl = `${FIS_BASE}/opening/items/${encodeURIComponent(best.id)}?f=json`
      changed = true
    }
    if (needsWidth && widths.length) {
      const best = widths.reduce((a, b) => Number(a.properties.width) <= Number(b.properties.width) ? a : b)
      properties.fisPassageWidthMeters = Number(best.properties.width)
      properties.fisWidthOpeningName = best.properties.name
      properties.fisWidthSourceUrl = `${FIS_BASE}/opening/items/${encodeURIComponent(best.id)}?f=json`
      changed = true
    }
    if (!changed) continue
    enriched += 1
  }
  return enriched
}

export async function loadFisBridgeData(fetcher = fetch) {
  const load = async collection => (await readGeoJsonPages(`${FIS_BASE}/${collection}/items?bbox=${AMSTERDAM_BOUNDS}&limit=1000&f=json`, fetcher)).features
  const [openings, bridges] = await Promise.all([load('opening'), load('brug')])
  return { openings, bridges }
}
