import { uniqueBridgeCrossing } from '../../scripts/bridge-crossings.mjs'

const scaleY = 111320
const scaleX = scaleY * Math.cos(52.37 * Math.PI / 180)
const xy = (longitude, latitude) => [longitude * scaleX, latitude * scaleY]

// Detect the water passing through the bridge footprint, rather than measuring
// from a corner of the bridge on the bank to the canal centreline.
export function bridgeRouteCrossing(geometry, segments, openings = []) {
  if (geometry?.type === 'Point') {
    let best = null
    for (const opening of openings) {
      if (!Array.isArray(opening.coordinates) || !opening.coordinates.every(Number.isFinite)) continue
      const p = xy(...opening.coordinates)
      for (const segment of segments || []) {
        const a=xy(segment.start[1],segment.start[0]), b=xy(segment.end[1],segment.end[0])
        const dx=b[0]-a[0],dy=b[1]-a[1]
        const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)))
        const distanceMeters=Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t)
        if (distanceMeters>8 || best && best.distanceMeters<=distanceMeters) continue
        best={point:{longitude:(a[0]+dx*t)/scaleX,latitude:(a[1]+dy*t)/scaleY},routeMeters:segment.startMeters+t*(segment.endMeters-segment.startMeters),segmentName:segment.name,distanceMeters,sourceOpening:opening}
      }
    }
    return best
  }
  const raw = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []
  if (!raw.length) return null
  const polygons = raw.map(polygon => polygon.map(ring => ring.map(([lng, lat]) => xy(lng, lat))))
  const points = polygons.flat(2)
  const minX = Math.min(...points.map(point => point[0]))
  const maxX = Math.max(...points.map(point => point[0]))
  const minY = Math.min(...points.map(point => point[1]))
  const maxY = Math.max(...points.map(point => point[1]))
  for (const segment of segments || []) {
    const a = xy(segment.start[1], segment.start[0])
    const b = xy(segment.end[1], segment.end[0])
    if (Math.max(a[0], b[0]) < minX || Math.min(a[0], b[0]) > maxX
      || Math.max(a[1], b[1]) < minY || Math.min(a[1], b[1]) > maxY) continue
    const pieces = uniqueBridgeCrossing([{ a, b }], polygons)
    if (!pieces) continue
    const piece = pieces[0]
    const midpoint = [(piece.a[0] + piece.b[0]) / 2, (piece.a[1] + piece.b[1]) / 2]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const t = length ? Math.hypot(midpoint[0] - a[0], midpoint[1] - a[1]) / length : 0
    return {
      point: { latitude: midpoint[1] / scaleY, longitude: midpoint[0] / scaleX },
      routeMeters: segment.startMeters + t * (segment.endMeters - segment.startMeters),
      segmentName: segment.name,
      distanceMeters: 0,
    }
  }
  return null
}
