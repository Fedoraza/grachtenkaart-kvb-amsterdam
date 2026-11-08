import { existsSync, readFileSync } from 'node:fs'
import { buildCanalRoutingNetwork, planCanalRouteVia } from '../src/scripts/canalRouting.js'
import { applyBridgeClearances } from '../src/scripts/bridgeClearances.js'
import { applyWaterwayEdits } from '../shared/waterway-edits.mjs'
import { activeClosurePoints } from '../shared/route-closures.mjs'
import { waterLevelCorrection } from '../shared/water-level-correction.mjs'

export function parseAgentRoute(params) {
  const allowed = new Set(['points', 'heightMeters', 'widthMeters', 'lengthMeters', 'draftMeters', 'speedKmh', 'safetyMarginMeters'])
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error(`Unknown or repeated parameter: ${key}`)
  let points
  try { points = JSON.parse(params.get('points')) } catch { throw new Error('points must be a JSON array of [longitude, latitude] pairs') }
  if (!Array.isArray(points) || points.length < 2 || points.length > 8 || points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(v => typeof v === 'number' && Number.isFinite(v)) || p[0] < 4.70 || p[0] > 5.02 || p[1] < 52.28 || p[1] > 52.46)) throw new Error('Provide 2–8 [longitude, latitude] points within Amsterdam (4.70–5.02, 52.28–52.46)')
  const number = (key, min, max, fallback) => {
    const raw = params.get(key)
    if (raw === null && fallback !== undefined) return fallback
    const value = raw?.trim() ? Number(raw) : NaN
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be a number between ${min} and ${max}`)
    return value
  }
  return { points: points.map(([longitude, latitude]) => ({ longitude, latitude })),
    speedKmh: number('speedKmh', 1, 12, 6), boatProfile: {
      heightMeters: number('heightMeters', 0.1, 30), widthMeters: number('widthMeters', 0.1, 30),
      lengthMeters: number('lengthMeters', 0.1, 150), draftMeters: number('draftMeters', 0.1, 10),
      safetyMarginMeters: number('safetyMarginMeters', 0, 2, 0.15),
    } }
}

// Runs in the existing background worker. Cache topology only; closures are
// evaluated for each request. Never include private saved routes or account data.
let cached
export function calculateAgentRoute({ input, bridges, links, edits, closures, waterLevel }, source) {
  const key = JSON.stringify([bridges, links, edits])
  const build = geo => {
    const network = buildCanalRoutingNetwork(applyWaterwayEdits(geo, edits || []), { respectRestrictions: true })
    applyBridgeClearances(network, bridges.features, links?.bridges)
    return network
  }
  // A caller-supplied source (tests) must not replace the cached public network.
  if (!source && (!cached || cached.key !== key)) {
    const publicSource = new URL('../public/export.geojson', import.meta.url)
    cached = { key, network: build(JSON.parse(readFileSync(existsSync(publicSource) ? publicSource : new URL('../dist/export.geojson', import.meta.url)))) }
  }
  const network = source ? build(source) : cached.network
  const correction = waterLevelCorrection(waterLevel)
  const result = planCanalRouteVia(input.points, network, { ...input, waterLevelCorrection: correction,
    snapDistanceMeters: 120, maximumDistanceMeters: 30_000,
    avoidVirtualEdges: true, allowZone3: false, closurePoints: activeClosurePoints(closures.features),
  })
  // Engine failure results may contain graph nodes; expose only the public DTO.
  const { coordinates, snapped, status, message, distanceMeters, durationMinutes, steps, segments, warnings, partialRoute } = result
  return { apiVersion: '1', status, complete: status === 'ok', message,
    distanceMeters: distanceMeters ?? null, durationMinutes: durationMinutes ?? null,
    geometry: coordinates?.length >= 2 ? { type: 'LineString', coordinates: coordinates.map(([lat, lng]) => [lng, lat]) } : null,
    snapped: Array.isArray(snapped) ? snapped.map(p => p?.node ? { latitude: p.node.lat, longitude: p.node.lng, snapDistanceMeters: Math.round(p.distance) } : p) : [],
    steps: steps || [], segments: segments || [], partialRoute: partialRoute || null,
    warnings: [...(warnings || []), ...(closures.partial ? ['Some official waterway notices could not be refreshed; retained notices may be outdated.'] : []), ...(closures.stale ? ['Waterway notices are stale; current restrictions could not be retrieved.'] : []), ...(bridges.stale ? ['Bridge source data is stale; current bridge data could not be retrieved.'] : []), 'Indicative route only. Unknown bridge dimensions and depths are not verified; water levels, bridge openings, permits and temporary dimensional restrictions are not guaranteed.'],
    input, data: { calculatedAt: new Date().toISOString(), bridgesFetchedAt: bridges.fetchedAt ?? null,
      closuresFetchedAt: closures.fetchedAt ?? null, closuresStale: Boolean(closures.stale), closuresPartial: Boolean(closures.partial), bridgesStale: Boolean(bridges.stale),
      waterLevelCmNap: correction.valueCmNap, waterLevelMeasuredAt: correction.measuredAt, waterLevelCorrectionApplied: correction.applied, clearanceReductionMeters: correction.raiseMeters,
      virtualConnectionsAllowed: false, zone3Allowed: false, personalRoutesIncluded: false },
    documentation: 'https://boottracker.nl/routeplanner-api',
  }
}
