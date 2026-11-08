const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam'
const MAX_GAP_MS = 20 * 60_000
const MAX_SPEED_KMH = 35
const MIN_MOVEMENT_METERS = 4

export function amsterdamDayBounds(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null
  const startParts = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]))
  if (parsed.toISOString().slice(0, 10) !== date) return null
  const next = new Date(parsed.getTime() + 24 * 60 * 60_000).toISOString().slice(0, 10)
  return { from: localHourUtc(date, 2), to: localHourUtc(next, 2) }
}

export function amsterdamRaceDate(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AMSTERDAM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const calendarDate = `${values.year}-${values.month}-${values.day}`
  if (Number(values.hour) >= 2) return calendarDate
  const previous = new Date(`${calendarDate}T12:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return previous.toISOString().slice(0, 10)
}

export function calculateFleetDistances(boats, positions) {
  const allEntries = boats.map((boat) => ({ ...boat, meters: 0, samples: 0 }))
  const byMmsi = new Map(allEntries.filter((boat) => boat.mmsi).map((boat) => [String(boat.mmsi), boat]))
  const previous = new Map()

  for (const point of positions) {
    const entry = byMmsi.get(String(point.mmsi))
    if (!entry) continue
    entry.samples += 1
    const earlier = previous.get(String(point.mmsi))
    previous.set(String(point.mmsi), point)
    if (!earlier) continue
    const elapsedMs = Number(point.received_at) - Number(earlier.received_at)
    if (!(elapsedMs > 0) || elapsedMs > MAX_GAP_MS) continue
    const directMeters = haversineMeters(earlier, point)
    const derivedSpeedKmh = directMeters / elapsedMs * 3_600
    if (directMeters < MIN_MOVEMENT_METERS || derivedSpeedKmh > MAX_SPEED_KMH) continue
    const reportedSpeeds = [earlier.speed, point.speed].map(Number)
    const reportedMoving = reportedSpeeds.some((speed) => speed > 0.5)
    if (!reportedMoving && directMeters < 12) continue
    const validSpeeds = reportedSpeeds.every((speed) => Number.isFinite(speed) && speed >= 0 && speed <= 14)
    const speedDistanceMeters = validSpeeds
      ? ((reportedSpeeds[0] + reportedSpeeds[1]) / 2) * 1.852 * elapsedMs / 3_600
      : 0
    entry.meters += Math.max(directMeters, speedDistanceMeters)
  }

  return allEntries
    .map((entry) => ({ id: entry.id, name: entry.name, mmsi: entry.mmsi, operatorId: entry.operatorId || null, operatorName: entry.operatorName || null, distanceKm: Math.round(entry.meters / 10) / 100, samples: entry.samples }))
    .sort((left, right) => right.distanceKm - left.distanceKm || left.name.localeCompare(right.name, 'nl'))
}

function localHourUtc(date, hour) {
  const [year, month, day] = date.split('-').map(Number)
  const target = Date.UTC(year, month - 1, day, hour)
  let candidate = target
  for (let iteration = 0; iteration < 3; iteration += 1) candidate = target - timeZoneOffset(candidate)
  return candidate
}

function timeZoneOffset(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - timestamp
}

function haversineMeters(first, second) {
  const radians = Math.PI / 180
  const firstLat = Number(first.latitude) * radians
  const secondLat = Number(second.latitude) * radians
  const latitudeDelta = secondLat - firstLat
  const longitudeDelta = (Number(second.longitude) - Number(first.longitude)) * radians
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(longitudeDelta / 2) ** 2
  return 12_742_000 * Math.asin(Math.sqrt(value))
}
