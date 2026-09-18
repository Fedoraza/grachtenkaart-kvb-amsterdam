export function activeClosurePoints(features, now = Date.now()) {
  const points = []
  for (const feature of features || []) {
    const p = feature.properties || {}
    if (p.blocksRouting === false || (p.type && p.type !== 'Stremming' && p.blocksRouting !== true)) continue
    const start = p.start ? Date.parse(p.start) : -Infinity
    const end = p.end ? Date.parse(p.end) : Infinity
    if (now < start || now >= end) continue
    const add = coordinate => {
      if (!Array.isArray(coordinate) || !coordinate.every(Number.isFinite)) return
      points.push({ longitude: coordinate[0], latitude: coordinate[1], radiusMeters: 25,
        name: p.name, waterway: p.waterway || '', start: p.start, end: p.end })
    }
    const line = coordinates => {
      for (let i = 0; i < coordinates.length; i++) {
        add(coordinates[i])
        if (!i) continue
        const a = coordinates[i - 1], b = coordinates[i]
        const distance = Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 111320
        const steps = Math.ceil(distance / 20)
        for (let j = 1; j < steps; j++) add([a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps])
      }
    }
    const g = feature.geometry || {}
    if (g.type === 'Point') add(g.coordinates)
    if (g.type === 'MultiPoint') g.coordinates.forEach(add)
    if (g.type === 'LineString') line(g.coordinates)
    if (g.type === 'MultiLineString') g.coordinates.forEach(line)
  }
  return points
}
