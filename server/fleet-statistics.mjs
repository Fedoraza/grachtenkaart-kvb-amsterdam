import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildOperatorDirectories, groupVesselsByOperator, VESSEL_OPERATORS } from '../shared/vessel-operators.mjs'
const MINUTE = 60000
const HOUR = 60 * MINUTE
const MAX_GAP = 5 * MINUTE
const localParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
export function localSlot(timestamp) {
  const p = Object.fromEntries(localParts.formatToParts(timestamp).map((part) => [part.type, part.value]))
  const date = `${p.year}-${p.month}-${p.day}`
  return { date, hour: Number(p.hour), weekday: (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7 + 1 }
}
function midnight(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const utc = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== date) return null
  let result = utc
  for (let i = 0; i < 3; i++) {
    const p = localSlot(result)
    result -= Date.parse(`${p.date}T${String(p.hour).padStart(2, '0')}:00:00Z`) - utc
  }
  return result
}
export function statisticsRange(input = {}, now = Date.now()) {
  const today = localSlot(now).date
  const end = String(input.to || today)
  if (midnight(end) === null) throw new Error('Kies een geldige einddatum.')
  const start = String(input.from || new Date(Date.parse(`${end}T12:00:00Z`) - 6 * 24 * HOUR).toISOString().slice(0, 10))
  const from = midnight(start), endStart = midnight(end)
  if (from === null || endStart === null || from > endStart || end > today) throw new Error('Kies een geldige periode tot en met vandaag.')
  const calendarDays = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / (24 * HOUR)) + 1
  if (calendarDays > 31) throw new Error('Kies maximaal 31 dagen per overzicht.')
  const next = new Date(Date.parse(`${end}T12:00:00Z`) + 24 * HOUR).toISOString().slice(0, 10)
  const hour = input.hour === '' || input.hour == null ? null : Number(input.hour)
  if (hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) throw new Error('Kies een uur tussen 0 en 23.')
  return { from, until: Math.min(midnight(next), now), fromDate: start, toDate: end, calendarDays, hour, operator: input.operator || 'all', mmsi: input.mmsi || null, includeUnassigned: input.includeUnassigned === '1' || input.includeUnassigned === true }
}
export function distanceMeters(a, b) {
  const r = Math.PI / 180, dLat = (b.latitude - a.latitude) * r, dLon = (b.longitude - a.longitude) * r
  const n = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(n)))
}
const inArea = (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.latitude >= 52.28 && p.latitude <= 52.45 && p.longitude >= 4.72 && p.longitude <= 5.1
const round = (n, digits = 2) => Number(n.toFixed(digits))
const metric = () => ({ meters: 0, movingMs: 0, stoppedMs: 0, samples: 0, active: new Set(), seen: new Set() })
const serialize = (m) => ({ distanceKm: round(m.meters / 1000), movingHours: round(m.movingMs / HOUR), stoppedHours: round(m.stoppedMs / HOUR), observedHours: round((m.movingMs + m.stoppedMs) / HOUR), activeBoats: m.active.size, observedBoats: m.seen.size, samples: m.samples })
const project = (p) => [p.longitude * 67800, p.latitude * 111200]
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
export function waterwayIndex(collection = { features: [] }) {
  const grid = new Map(), names = new Set(), zones = []
  for (const f of collection.features || []) {
    const name = f.properties?.name
    if (!name || !['LineString', 'MultiLineString'].includes(f.geometry?.type)) continue
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
    names.add(name)
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const a = project({ longitude: line[i - 1][0], latitude: line[i - 1][1] }), b = project({ longitude: line[i][0], latitude: line[i][1] })
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 2000) continue
      const segment = { name, a, b }
      for (let x = Math.floor((Math.min(a[0], b[0]) - 40) / 100); x <= Math.floor((Math.max(a[0], b[0]) + 40) / 100); x++) for (let y = Math.floor((Math.min(a[1], b[1]) - 40) / 100); y <= Math.floor((Math.max(a[1], b[1]) + 40) / 100); y++) {
        const key = `${x}:${y}`
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push(segment)
      }
    }
    if (f.properties.lock === 'yes' && lines[0]?.length && !zones.some((z) => z.name === name)) {
      const coordinate = lines[0][Math.floor(lines[0].length / 2)]
      zones.push({ id: f.properties['@id'] || name, name, type: 'sluis', latitude: coordinate[1], longitude: coordinate[0], radius: 45 })
    }
  }
  return { zones, names: [...names], nearest(point) {
    const p = project(point), segments = grid.get(`${Math.floor(p[0] / 100)}:${Math.floor(p[1] / 100)}`) || []
    let best = null, d = 40
    for (const segment of segments) { const value = segmentDistance(p, segment.a, segment.b); if (value < d) { d = value; best = segment.name } }
    return best
  } }
}

export function calculateFleetStatistics({ roster, positions, range, waterways = waterwayIndex(), zones = [], now = Date.now(), available = {} }) {
  const allowed = new Set([...VESSEL_OPERATORS.map((o) => o.id), 'unassigned', 'all'])
  if (!allowed.has(range.operator)) throw new Error('Onbekende rederij.')
  if (range.mmsi && !/^\d{9}$/.test(range.mmsi)) throw new Error('Ongeldig MMSI.')
  const allOperators = [...VESSEL_OPERATORS.map((o) => ({ id: o.id, name: o.name, color: o.color })), { id: 'unassigned', name: 'Overige / niet gekoppeld', color: '#94a3b8' }]
  const byMmsi = new Map(), operators = new Map(allOperators.map((o) => [o.id, { ...o, ...metric(), fleetSize: 0, linkedBoats: 0, completedTrips: 0 }]))
  const boatRows = []
  for (const boat of roster) {
    const id = boat.operatorId || 'unassigned'
    const operator = operators.get(id)
    if (!operator) continue
    const row = { ...boat, operatorId: id, ...metric(), gaps: 0, rejected: 0, firstAt: null, lastAt: null, maxSpeedKmh: 0, completedTrips: 0, legs: [], stops: [] }
    boatRows.push(row)
    if (boat.mmsi) byMmsi.set(String(boat.mmsi), row)
    operator.fleetSize++
    if (boat.mmsi) operator.linkedBoats++
  }
  const selected = (b) => (b.operatorId !== 'unassigned' || range.includeUnassigned || range.operator === 'unassigned') && (range.operator === 'all' || b.operatorId === range.operator) && (!range.mmsi || String(b.mmsi) === range.mmsi)
  const dates = [], daily = new Map(), buckets = new Map(), calendarBuckets = new Map(), utcSlots = new Map()
  for (let t = Date.parse(`${range.fromDate}T12:00:00Z`); t <= Date.parse(`${range.toDate}T12:00:00Z`); t += 24 * HOUR) { const date = new Date(t).toISOString().slice(0, 10); dates.push(date); daily.set(date, { date, ...metric() }) }
  let selectedDuration = 0
  for (let t = range.from; t < range.until;) {
    const until = Math.min(Math.floor(t / HOUR) * HOUR + HOUR, range.until), slot = localSlot(t)
    utcSlots.set(Math.floor(t / HOUR), slot)
    if (range.hour === null || slot.hour === range.hour) { selectedDuration += until - t; calendarBuckets.set(`${slot.date}:${slot.hour}`, slot) }
    t = until
  }
  const bucket = (slot) => { const key = `${slot.date}:${slot.hour}`; if (!buckets.has(key)) buckets.set(key, { ...slot, ...metric() }); return buckets.get(key) }
  const slotAt = (t) => utcSlots.get(Math.floor(t / HOUR)) || localSlot(t)
  const spatial = new Map(), wayMetrics = new Map(), operatorDaily = new Map(), quality = { gaps: 0, rejectedSegments: 0, scannedPositions: 0 }, activeStates = new Map()
  const closeLeg = (state, complete, end) => {
    if (state.leg && state.leg.meters >= 200 && state.leg.movingMs >= 5 * MINUTE) {
      const leg = { mmsi: state.boat.mmsi, name: state.boat.name, operatorId: state.boat.operatorId, from: state.leg.from, until: end || state.leg.until, distanceKm: round(state.leg.meters / 1000), movingMinutes: round(state.leg.movingMs / MINUTE, 1), complete: Boolean(complete && state.leg.startKnown) }
      state.boat.legs.push(leg)
      if (leg.complete) { state.boat.completedTrips++; operators.get(state.boat.operatorId).completedTrips++ }
    }
    state.leg = null
  }
  const closeStop = (state) => {
    if (state.stop && state.stop.duration >= 3 * MINUTE) state.boat.stops.push({ ...state.stop, mmsi: state.boat.mmsi, name: state.boat.name, operatorId: state.boat.operatorId })
    state.stop = null
  }
  for (const raw of positions) {
    const p = { ...raw, mmsi: String(raw.mmsi), received_at: Number(raw.received_at) }
    const boat = byMmsi.get(p.mmsi)
    if (!boat || !selected(boat) || !Number.isFinite(p.received_at) || !inArea(p) || p.received_at < range.from || p.received_at >= range.until) continue
    const slot = slotAt(p.received_at)
    if (range.hour !== null && slot.hour !== range.hour) {
      const previousState = activeStates.get(p.mmsi)
      if (previousState) { closeLeg(previousState, false); closeStop(previousState); previousState.previous = null; previousState.startKnown = false }
      continue
    }
    quality.scannedPositions++
    const op = operators.get(boat.operatorId), day = daily.get(slot.date), hour = bucket(slot)
    if (!day) continue
    for (const target of [boat, op, day, hour]) { target.samples++; target.seen.add(p.mmsi) }
    boat.firstAt ??= p.received_at; boat.lastAt = p.received_at
    let state = activeStates.get(p.mmsi)
    if (!state) { state = { boat, previous: null, leg: null, stop: null, startKnown: false }; activeStates.set(p.mmsi, state) }
    const previous = state.previous; state.previous = p
    if (!previous) continue
    const dt = p.received_at - previous.received_at
    if (dt <= 0) continue
    if (dt > MAX_GAP) { boat.gaps++; quality.gaps++; closeLeg(state, false); closeStop(state); state.startKnown = false; continue }
    const meters = distanceMeters(previous, p), speed = meters / dt * 3600
    if (speed > 35) { boat.rejected++; quality.rejectedSegments++; closeLeg(state, false); closeStop(state); state.startKnown = false; continue }
    const moving = meters >= 12 || meters >= 4 && [previous.speed, p.speed].some((s) => Number(s) > 0.5)
    const speeds = [previous.speed, p.speed]
    const validSpeeds = speeds.every((s) => s !== null && s !== undefined && Number.isFinite(Number(s)) && Number(s) >= 0 && Number(s) <= 14)
    const estimated = moving ? Math.max(meters, validSpeeds ? (Number(speeds[0]) + Number(speeds[1])) / 2 * 1.852 * dt / 3600 : 0) : 0
    boat.maxSpeedKmh = Math.max(boat.maxSpeedKmh, moving ? Math.min(35, estimated / dt * 3600) : 0)
    if (moving) {
      if (state.stop?.duration >= 5 * MINUTE) { closeLeg(state, true, state.stop.from); state.startKnown = true }
      closeStop(state)
      if (!state.leg) state.leg = { from: previous.received_at, until: p.received_at, meters: 0, movingMs: 0, startKnown: state.startKnown }
      state.leg.meters += estimated; state.leg.movingMs += dt; state.leg.until = p.received_at
    } else {
      if (!state.stop) state.stop = { from: previous.received_at, until: p.received_at, duration: 0, latitude: previous.latitude, longitude: previous.longitude }
      // A drifting/moored track cannot accumulate an artificial stop across town.
      if (distanceMeters(state.stop, p) > 35) { closeStop(state); state.stop = { from: previous.received_at, until: p.received_at, duration: 0, latitude: previous.latitude, longitude: previous.longitude } }
      state.stop.duration += dt; state.stop.until = p.received_at
      if (state.stop.duration >= 5 * MINUTE) closeLeg(state, true, state.stop.from)
    }
    const midpoint = { latitude: (previous.latitude + p.latitude) / 2, longitude: (previous.longitude + p.longitude) / 2 }
    const way = moving ? waterways.nearest(midpoint) : null
    if (way && !wayMetrics.has(way)) wayMetrics.set(way, { name: way, ...metric() })
    const cellKey = `${Math.floor(midpoint.latitude / 0.001)}:${Math.floor(midpoint.longitude / 0.0015)}`
    if (!spatial.has(cellKey)) spatial.set(cellKey, { latitude: (Math.floor(midpoint.latitude / 0.001) + .5) * .001, longitude: (Math.floor(midpoint.longitude / .0015) + .5) * .0015, ...metric() })
    const cell = spatial.get(cellKey)
    for (let t = previous.received_at; t < p.received_at;) {
      const until = Math.min(Math.floor(t / HOUR) * HOUR + HOUR, p.received_at), amount = until - t, fraction = amount / dt, s = slotAt(t)
      if (range.hour === null || s.hour === range.hour) {
        const dailyOpKey = `${s.date}:${boat.operatorId}`
        if (!operatorDaily.has(dailyOpKey)) operatorDaily.set(dailyOpKey, { date: s.date, operatorId: boat.operatorId, ...metric() })
        const targets = [boat, op, daily.get(s.date), bucket(s), cell, operatorDaily.get(dailyOpKey), ...(way ? [wayMetrics.get(way)] : [])]
        for (const target of targets) { if (!target) continue; target.meters += estimated * fraction; target[moving ? 'movingMs' : 'stoppedMs'] += amount; target.seen.add(p.mmsi); if (moving) target.active.add(p.mmsi) }
      }
      t = until
    }
  }
  for (const state of activeStates.values()) { const bounded = state.stop?.duration >= 5 * MINUTE; closeLeg(state, bounded, bounded ? state.stop.from : null); closeStop(state) }
  const selectedBoats = boatRows.filter(selected)
  const stopClusters = new Map(), locationStats = zones.map((zone) => ({ ...zone, visits: 0, stoppedMs: 0, boats: new Set(), durations: [] }))
  for (const boat of selectedBoats) for (const stop of boat.stops) {
    const key = `${Math.round(stop.latitude / .00035)}:${Math.round(stop.longitude / .00055)}`
    if (!stopClusters.has(key)) stopClusters.set(key, { latitude: stop.latitude, longitude: stop.longitude, waterway: waterways.nearest(stop), visits: 0, stoppedMs: 0, boats: new Set() })
    const cluster = stopClusters.get(key); cluster.visits++; cluster.stoppedMs += stop.duration; cluster.boats.add(boat.mmsi)
    for (const location of locationStats) if (distanceMeters(location, stop) <= location.radius) { location.visits++; location.stoppedMs += stop.duration; location.boats.add(boat.mmsi); location.durations.push(stop.duration) }
  }
  const totals = metric()
  for (const boat of selectedBoats) { totals.meters += boat.meters; totals.movingMs += boat.movingMs; totals.stoppedMs += boat.stoppedMs; totals.samples += boat.samples; for (const m of boat.active) totals.active.add(m); for (const m of boat.seen) totals.seen.add(m) }
  const heatmap = []
  for (let weekday = 1; weekday <= 7; weekday++) for (let hour = 0; hour < 24; hour++) {
    const calendar = [...calendarBuckets.values()].filter((s) => s.weekday === weekday && s.hour === hour)
    const values = [...buckets.values()].filter((s) => s.weekday === weekday && s.hour === hour)
    heatmap.push({ weekday, hour, days: calendar.length, meanActiveBoats: round(values.reduce((sum, m) => sum + m.active.size, 0) / (calendar.length || 1), 1), movingHours: round(values.reduce((sum, m) => sum + m.movingMs, 0) / HOUR) })
  }
  const boatResults = selectedBoats.map((b) => ({ id: b.id, name: b.name, mmsi: b.mmsi || null, operatorId: b.operatorId, operatorName: operators.get(b.operatorId).name, ...serialize(b), maxSpeedKmh: b.samples ? round(b.maxSpeedKmh, 1) : null, averageSpeedKmh: b.movingMs ? round(b.meters / b.movingMs * 3600, 1) : null, observedPercent: b.mmsi && selectedDuration ? round(Math.min(100, (b.movingMs + b.stoppedMs) / selectedDuration * 100), 1) : null, gaps: b.gaps, rejected: b.rejected, completedTrips: b.completedTrips, firstAt: b.firstAt, lastAt: b.lastAt })).sort((a, b) => b.distanceKm - a.distanceKm || a.name.localeCompare(b.name, 'nl'))
  const operatorResults = [...operators.values()].filter((o) => (o.id !== 'unassigned' || range.includeUnassigned || range.operator === 'unassigned') && (range.operator === 'all' || o.id === range.operator)).map((o) => ({ id: o.id, name: o.name, color: o.color, fleetSize: range.mmsi ? selectedBoats.filter((b) => b.operatorId === o.id).length : o.fleetSize, linkedBoats: range.mmsi ? selectedBoats.filter((b) => b.operatorId === o.id && b.mmsi).length : o.linkedBoats, ...serialize(o), completedTrips: o.completedTrips, kmPerActiveBoat: o.active.size ? round(o.meters / 1000 / o.active.size) : null, hoursPerActiveBoat: o.active.size ? round(o.movingMs / HOUR / o.active.size) : null, observedDeploymentPercent: o.fleetSize ? round(o.active.size / (range.mmsi ? 1 : o.fleetSize) * 100, 1) : null })).sort((a, b) => b.distanceKm - a.distanceKm)
  const trips = selectedBoats.flatMap((b) => b.legs).sort((a, b) => b.from - a.from)
  return { generatedAt: new Date(now).toISOString(), range, available, options: { operators: [...operators.values()].map((o) => ({ id: o.id, name: o.name, color: o.color, fleetSize: o.fleetSize })).sort((a, b) => a.id === 'unassigned' ? 1 : b.id === 'unassigned' ? -1 : b.fleetSize - a.fleetSize), boats: roster.filter((b) => b.mmsi).map((b) => ({ mmsi: b.mmsi, name: b.name, operatorId: b.operatorId })) }, summary: { ...serialize(totals), knownBoats: selectedBoats.length, linkedBoats: selectedBoats.filter((b) => b.mmsi).length, completedTrips: trips.filter((t) => t.complete).length, partialLegs: trips.filter((t) => !t.complete).length, averageTripMinutes: trips.some((t) => t.complete) ? round(trips.filter((t) => t.complete).reduce((sum, t) => sum + t.movingMinutes, 0) / trips.filter((t) => t.complete).length, 1) : null }, quality: { ...quality, intervalCoveragePercent: selectedDuration && selectedBoats.filter((b) => b.mmsi).length ? round((totals.movingMs + totals.stoppedMs) / (selectedDuration * selectedBoats.filter((b) => b.mmsi).length) * 100, 1) : null, maxGapMinutes: 5, classification: 'Huidige rederijkoppelingen toegepast op historische AIS-metingen.' }, operators: operatorResults, boats: boatResults, daily: dates.map((date) => ({ date, ...serialize(daily.get(date)) })), operatorDaily: [...operatorDaily.values()].map((m) => ({ date: m.date, operatorId: m.operatorId, ...serialize(m) })), hourly: Array.from({ length: 24 }, (_, hour) => { const values = [...buckets.values()].filter((s) => s.hour === hour); return { hour, movingHours: round(values.reduce((sum, m) => sum + m.movingMs, 0) / HOUR), distanceKm: round(values.reduce((sum, m) => sum + m.meters, 0) / 1000), activeBoatHours: values.reduce((sum, m) => sum + m.active.size, 0) } }), heatmap, waterways: [...wayMetrics.values()].map((m) => ({ name: m.name, ...serialize(m) })).sort((a, b) => b.distanceKm - a.distanceKm), density: [...spatial.values()].map((m) => ({ latitude: m.latitude, longitude: m.longitude, ...serialize(m) })), stops: [...stopClusters.values()].map((m) => ({ latitude: m.latitude, longitude: m.longitude, waterway: m.waterway, visits: m.visits, boats: m.boats.size, observedMinutes: round(m.stoppedMs / MINUTE, 1), meanMinutes: round(m.stoppedMs / MINUTE / m.visits, 1) })).sort((a, b) => b.observedMinutes - a.observedMinutes).slice(0, 100), locations: locationStats.map((m) => ({ id: m.id, name: m.name, type: m.type, radius: m.radius, visits: m.visits, boats: m.boats.size, observedMinutes: round(m.stoppedMs / MINUTE, 1), meanMinutes: m.visits ? round(m.stoppedMs / MINUTE / m.visits, 1) : null })), trips: trips.slice(0, 250), tripRowsTotal: trips.length }
}

let cachedGeography
function loadGeography() {
  if (cachedGeography) return cachedGeography
  let collection = { features: [] }
  for (const file of ['dist/export.geojson', 'public/export.geojson']) if (existsSync(file)) { try { collection = JSON.parse(readFileSync(file, 'utf8')); break } catch {} }
  const waterways = waterwayIndex(collection), zones = [...waterways.zones]
  try {
    const bridges = JSON.parse(readFileSync(join('data', existsSync(join('data', 'amsterdam-bridges-v6.json')) ? 'amsterdam-bridges-v6.json' : 'amsterdam-bridges-v5.json'), 'utf8'))
    for (const f of bridges.features || []) {
      if (!/^(Magere Brug|Torontobrug|Berlagebrug|Westerkeersluis|Kikkerbilssluis|Kortjewantsbrug)$/i.test(f.properties?.name || '')) continue
      const coords = f.geometry?.type === 'Point' ? [f.geometry.coordinates] : f.geometry?.type === 'Polygon' ? f.geometry.coordinates[0] : []
      if (!coords.length) continue
      zones.push({ id: f.properties.number, name: f.properties.name, type: 'brug', longitude: coords.reduce((sum, c) => sum + c[0], 0) / coords.length, latitude: coords.reduce((sum, c) => sum + c[1], 0) / coords.length, radius: 45 })
    }
  } catch {}
  cachedGeography = { waterways, zones }
  return cachedGeography
}
export function readFleetStatistics(database, input) {
  const now = Date.now(), range = statisticsRange(input, now)
  const assignments = Object.fromEntries(database.prepare('SELECT mmsi, operator_id FROM vessel_operator_assignments').all().map((r) => [r.mmsi, r.operator_id]))
  const vessels = database.prepare('SELECT mmsi, data FROM vessels').all().flatMap((r) => { try { return [{ ...JSON.parse(r.data), mmsi: String(r.mmsi) }] } catch { return [] } })
  const groups = groupVesselsByOperator(vessels, assignments), directories = buildOperatorDirectories(database.prepare('SELECT id, name, mmsi, operator_id FROM fleet_boats WHERE active=1').all(), groups, assignments)
  const roster = directories.flatMap((directory) => directory.boats.map((b) => ({ id: b.mmsi ? `mmsi:${b.mmsi}` : `name:${directory.id}:${b.name}`, name: b.name, mmsi: b.mmsi ? String(b.mmsi) : null, operatorId: directory.id })))
  const seen = new Set(roster.map((b) => b.mmsi).filter(Boolean))
  for (const vessel of vessels) if (!seen.has(vessel.mmsi) && inArea(vessel)) { roster.push({ id: `mmsi:${vessel.mmsi}`, name: vessel.name || `AIS ${vessel.mmsi}`, mmsi: vessel.mmsi, operatorId: 'unassigned' }); seen.add(vessel.mmsi) }
  const available = database.prepare('SELECT MIN(received_at) AS earliest, MAX(received_at) AS latest FROM positions').get()
  const selectedMmsis = roster.filter((b) => b.mmsi && (b.operatorId !== 'unassigned' || range.includeUnassigned || range.operator === 'unassigned') && (range.operator === 'all' || b.operatorId === range.operator) && (!range.mmsi || b.mmsi === range.mmsi)).map((b) => b.mmsi)
  const positions = database.prepare('SELECT mmsi, latitude, longitude, speed, received_at FROM positions WHERE mmsi IN (SELECT value FROM json_each(?)) AND received_at >= ? AND received_at < ? ORDER BY mmsi, received_at').iterate(JSON.stringify(selectedMmsis), range.from, range.until)
  return calculateFleetStatistics({ roster, positions, range, ...loadGeography(), now, available })
}
