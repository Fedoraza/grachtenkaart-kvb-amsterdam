import { uniqueBridgeCrossing } from '../../scripts/bridge-crossings.mjs'
import { waterkaartInfoForBridge } from './waterkaartBridgeInfo.js'
import { bridgeNavigationWarning } from './bridgeNavigationRules.js'

const METERS_PER_DEGREE = 111_320
const LON_METERS_PER_DEGREE = METERS_PER_DEGREE * Math.cos(52.37 * Math.PI / 180)
const xy = (longitude, latitude) => [longitude * LON_METERS_PER_DEGREE, latitude * METERS_PER_DEGREE]

function bridgeClearance(properties) {
  if (properties.clearanceNap != null && properties.winterWaterLevelNap != null) {
    const height = Number(properties.clearanceNap) - Number(properties.winterWaterLevelNap)
    if (Number.isFinite(height) && height > 0) return height
  }
  const fisHeight = Number(properties.fisClearanceMeters)
  if (Number.isFinite(fisHeight) && fisHeight > 0) return fisHeight
  const waterkaartHeight = Number(waterkaartInfoForBridge(properties)?.clearanceHeightMeters)
  return Number.isFinite(waterkaartHeight) && waterkaartHeight > 0 ? waterkaartHeight : null
}

function bridgeWidth(properties) {
  for (const value of [properties.passageWidth, properties.fisPassageWidthMeters, waterkaartInfoForBridge(properties)?.passageWidthMeters]) {
    const width = Number(value)
    if (Number.isFinite(width) && width > 0) return width
  }
  return null
}

function bridgePolygons(geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []
  return polygons.map((polygon) => polygon.map((ring) => ring.map(([longitude, latitude]) => xy(longitude, latitude))))
}

function distanceToEdge(point, edge) {
  const dx = edge.b[0] - edge.a[0]
  const dy = edge.b[1] - edge.a[1]
  const t = Math.max(0, Math.min(1, ((point[0] - edge.a[0]) * dx + (point[1] - edge.a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(point[0] - edge.a[0] - t * dx, point[1] - edge.a[1] - t * dy)
}

export function applyBridgeClearances(network, bridgeFeatures = [], bridgeLinks = {}) {
  if (!network?.nodes?.size || !bridgeFeatures.length) return 0
  const edgesByPair = new Map()
  for (const node of network.nodes.values()) {
    for (const [neighborKey, routeEdge] of node.neighbors) {
      const neighbor = network.nodes.get(neighborKey)
      if (!neighbor) continue
      const key = [node.key, neighborKey].sort().join('|')
      let pair = edgesByPair.get(key)
      if (!pair) {
        pair = { a: xy(node.lng, node.lat), b: xy(neighbor.lng, neighbor.lat), routeEdges: [] }
        edgesByPair.set(key, pair)
      }
      pair.routeEdges.push(routeEdge)
    }
  }
  const edges = [...edgesByPair.values()]

  let linked = 0
  for (const feature of bridgeFeatures) {
    const properties = feature.properties || {}
    const clearance = bridgeClearance(properties)
    const width = bridgeWidth(properties)
    const navigationBlocked = Boolean(bridgeNavigationWarning(properties))
    if (clearance === null && width === null && !navigationBlocked) continue
    if (feature.geometry?.type === 'Point') {
      // FIS supplies real opening positions, not bridge footprints. Bind each
      // opening separately; never combine a height from one lane with another's width.
      const link = bridgeLinks[properties.number] || bridgeLinks[properties.name]
      const positions = Array.isArray(link?.networkPositions) ? link.networkPositions : link?.networkPosition ? [link.networkPosition] : []
      const lanes = (properties.fisOpenings || []).map(opening => ({
        point: opening.coordinates, height: opening.heightMeters, width: opening.widthMeters,
      }))
      for (const position of positions) lanes.push({ point: [Number(position.longitude), Number(position.latitude)], height: clearance, width, lineName: position.lineName })
      let matched = false
      for (const lane of lanes) {
        if (!Array.isArray(lane.point) || !lane.point.every(Number.isFinite)) continue
        const location = xy(...lane.point)
        const candidates = edges.filter(edge => !edge.routeEdges.some(e => e.virtual) && (!lane.lineName || edge.routeEdges.some(e => e.name === lane.lineName)))
          .map(edge => ({edge,distance:distanceToEdge(location,edge)})).sort((a,b)=>a.distance-b.distance)
        if (!candidates.length || candidates[0].distance > 8) continue
        const selected = candidates.filter(candidate => candidate.distance <= candidates[0].distance + 0.05).map(c => c.edge)
        selected.push(...edges.filter(edge => edge.routeEdges.some(e => e.virtual) && distanceToEdge(location,edge) <= 8))
        for (const edge of selected.flatMap(pair => pair.routeEdges)) {
          if (navigationBlocked) edge.closed = true
          if (Number(lane.height) > 0) edge.clearanceHeight = Math.min(edge.clearanceHeight ?? Infinity, Number(lane.height))
          if (Number(lane.width) > 0) edge.clearanceWidth = Math.min(edge.clearanceWidth ?? Infinity, Number(lane.width))
          matched = true
        }
      }
      if (matched) linked += 1
      continue
    }
    const polygons = bridgePolygons(feature.geometry)
    const coordinates = polygons.flat(2)
    if (!coordinates.length) continue
    const minX = Math.min(...coordinates.map((point) => point[0]))
    const maxX = Math.max(...coordinates.map((point) => point[0]))
    const minY = Math.min(...coordinates.map((point) => point[1]))
    const maxY = Math.max(...coordinates.map((point) => point[1]))
    const nearby = edges.filter((edge) => Math.max(edge.a[0], edge.b[0]) >= minX - 1
      && Math.min(edge.a[0], edge.b[0]) <= maxX + 1
      && Math.max(edge.a[1], edge.b[1]) >= minY - 1
      && Math.min(edge.a[1], edge.b[1]) <= maxY + 1)
    const crossing = uniqueBridgeCrossing(nearby.filter((edge) => !edge.routeEdges.some((routeEdge) => routeEdge.virtual)), polygons)
    let matchedEdges = crossing ? [...new Set(crossing.flatMap((piece) => piece.edge.routeEdges))] : []

    // A bridge can span several separate sailing lanes. Apply its restriction
    // to every explicitly linked lane, including ones offset from the polygon.
    const link = bridgeLinks[properties.number] || bridgeLinks[properties.name]
    const positions = Array.isArray(link?.networkPositions) ? link.networkPositions : link?.networkPosition ? [link.networkPosition] : []
    for (const position of positions) {
      if (position?.latitude != null && position?.longitude != null
        && Number.isFinite(Number(position.latitude)) && Number.isFinite(Number(position.longitude))) {
        const point = xy(Number(position.longitude), Number(position.latitude))
        const candidates = edges.filter((edge) => !position.lineName || edge.routeEdges.some((routeEdge) => routeEdge.name === position.lineName))
          .map((edge) => ({ edge, distance: distanceToEdge(point, edge) }))
          .sort((a, b) => a.distance - b.distance)
        if (candidates[0]?.distance <= 8) matchedEdges.push(...candidates[0].edge.routeEdges)
      }
    }
    // Automatic network-gap connectors can cut straight through a bridge even
    // when the underlying canal edge has the correct clearance. They need the
    // same restriction or the shortest-path search will use them as a bypass.
    for (const edge of nearby) {
      if (!edge.routeEdges.some((routeEdge) => routeEdge.virtual)) continue
      if (uniqueBridgeCrossing([edge], polygons)) matchedEdges.push(...edge.routeEdges)
    }
    if (!matchedEdges.length) continue
    for (const edge of matchedEdges) {
      if (navigationBlocked) edge.closed = true
      if (width !== null) edge.clearanceWidth = Math.min(edge.clearanceWidth ?? Infinity, width)
      if (clearance !== null) edge.clearanceHeight = Math.min(edge.clearanceHeight ?? Infinity, clearance)
    }
    linked += 1
  }
  return linked
}
