// Clip waterway segments to the interior of a bridge footprint. Touching its
// outline alone is not a crossing; holes and disconnected passages stay separate.
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]]
function insideRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
function insidePolygon(point, polygon) {
  // Points exactly on the outline do not establish an interior crossing.
  for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i]
    const d = subtract(b, a), p = subtract(point, a)
    if (Math.abs(cross(d, p)) < 1e-7 && p[0] * d[0] + p[1] * d[1] >= 0 && p[0] * d[0] + p[1] * d[1] <= d[0] ** 2 + d[1] ** 2) return false
  }
  return insideRing(point, polygon[0]) && !polygon.slice(1).some(ring => insideRing(point, ring))
}
export function uniqueBridgeCrossing(edges, polygons) {
  const pieces = []
  for (const edge of edges) {
    const direction = subtract(edge.b, edge.a)
    const cuts = [0, 1]
    for (const polygon of polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      const side = subtract(ring[i], ring[i - 1])
      const denominator = cross(direction, side)
      if (Math.abs(denominator) < 1e-10) continue
      const offset = subtract(ring[i - 1], edge.a)
      const t = cross(offset, side) / denominator
      const u = cross(offset, direction) / denominator
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t)
    }
    cuts.sort((a, b) => a - b)
    const at = t => [edge.a[0] + direction[0] * t, edge.a[1] + direction[1] * t]
    for (let i = 1; i < cuts.length; i++) {
      if ((cuts[i] - cuts[i - 1]) * Math.hypot(...direction) < 0.05) continue
      if (polygons.some(polygon => insidePolygon(at((cuts[i] + cuts[i - 1]) / 2), polygon))) {
        pieces.push({ edge, a: at(cuts[i - 1]), b: at(cuts[i]) })
      }
    }
  }
  if (!pieces.length) return null
  const nodes = new Map()
  const key = point => point.map(value => value.toFixed(3)).join(',')
  for (const piece of pieces) {
    const a = key(piece.a), b = key(piece.b)
    if (a === b) continue
    if (!nodes.has(a)) nodes.set(a, new Set())
    if (!nodes.has(b)) nodes.set(b, new Set())
    nodes.get(a).add(b); nodes.get(b).add(a)
  }
  if (!nodes.size || [...nodes.values()].some(neighbors => neighbors.size > 2)) return false
  const visited = new Set(), pending = [nodes.keys().next().value]
  while (pending.length) {
    const current = pending.pop()
    if (visited.has(current)) continue
    visited.add(current)
    pending.push(...nodes.get(current))
  }
  // A single unbranched passage, rather than multiple lines with the same name.
  return visited.size === nodes.size ? pieces : false
}
