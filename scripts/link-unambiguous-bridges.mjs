import { readFileSync, writeFileSync } from 'node:fs'
import { uniqueBridgeCrossing } from './bridge-crossings.mjs'
import { buildCanalRoutingNetwork } from '../src/scripts/canalRouting.js'

const canals = JSON.parse(readFileSync('public/export.geojson', 'utf8'))
const bridges = JSON.parse(readFileSync('data/amsterdam-bridges-v2.json', 'utf8'))
const network = buildCanalRoutingNetwork(canals, { respectRestrictions: true })
const scaleX = 111320 * Math.cos(52.37 * Math.PI / 180)
const xy = (lng, lat) => [lng * scaleX, lat * 111320]
const edges = []
const junctions = []
for (const node of network.nodes.values()) {
  if (node.neighbors.size > 2) junctions.push(xy(node.lng, node.lat))
  for (const [key, edge] of node.neighbors) {
    if (node.key >= key || edge.virtual) continue
    const other = network.nodes.get(key)
    edges.push({ a: xy(node.lng, node.lat), b: xy(other.lng, other.lat), name: edge.name })
  }
}
function project(p, edge) {
  const dx = edge.b[0] - edge.a[0], dy = edge.b[1] - edge.a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - edge.a[0]) * dx + (p[1] - edge.a[1]) * dy) / (dx * dx + dy * dy)))
  const point = [edge.a[0] + t * dx, edge.a[1] + t * dy]
  return { edge, point, distance: Math.hypot(p[0] - point[0], p[1] - point[1]) }
}
function coordinates(value) {
  return typeof value[0] === 'number' ? [value] : value.flatMap(coordinates)
}
const links = {}
const counts = { linked: 0, existing: 0, singleCrossing: 0, distant: 0, ambiguous: 0 }
for (const feature of bridges.features) {
  const props = feature.properties
  if (props.route) { counts.existing++; continue }
  const coords = coordinates(feature.geometry.coordinates)
  const lng = (Math.min(...coords.map(p => p[0])) + Math.max(...coords.map(p => p[0]))) / 2
  const lat = (Math.min(...coords.map(p => p[1])) + Math.max(...coords.map(p => p[1]))) / 2
  const point = xy(lng, lat)
  const nearby = edges.map(edge => project(point, edge)).filter(p => p.distance <= 60).sort((a, b) => a.distance - b.distance)
  const geometry = feature.geometry
  const rawPolygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  const polygons = rawPolygons.map(polygon => polygon.map(ring => ring.map(p => xy(...p))))
  const radius = Math.max(...coords.map(p => Math.hypot(...xy(...p).map((value, i) => value - point[i])))) + 1
  const crossing = uniqueBridgeCrossing(edges.filter(edge => project(point, edge).distance <= radius), polygons)
  if (crossing === false) { counts.ambiguous++; continue }
  const best = crossing
    ? crossing.map(piece => project(point, { ...piece.edge, a: piece.a, b: piece.b })).sort((a, b) => a.distance - b.distance)[0]
    : nearby[0]
  if (!best || (!crossing && best.distance > 12) || !best.edge.name) { counts.distant++; continue }
  // Also reject crossing lines that are not represented as shared network nodes.
  const angle = edge => Math.atan2(edge.b[1] - edge.a[1], edge.b[0] - edge.a[0])
  const ambiguous = nearby.some(p => p.edge.name !== best.edge.name || Math.abs(Math.sin(angle(p.edge) - angle(best.edge))) > 0.5)
    || junctions.some(p => Math.hypot(p[0] - point[0], p[1] - point[1]) < 60)
  if (!crossing && ambiguous) { counts.ambiguous++; continue }
  const id = String(props.number || props.id || props.name || '').trim()
  if (!id || id === 'Naam onbekend') continue
  links[id] = {
    routeNames: [best.edge.name],
    networkPosition: {
      sourceLatitude: lat, sourceLongitude: lng,
      latitude: best.point[1] / 111320, longitude: best.point[0] / scaleX,
      lineName: best.edge.name,
    },
  }
  counts.linked++
  if (crossing) counts.singleCrossing++
}
writeFileSync('src/scripts/automaticBridgeLinks.json', JSON.stringify(links, null, 2) + '\n')
console.log(JSON.stringify(counts))
