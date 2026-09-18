const API = 'https://vaarweginformatie.nl/frp/api/messages'
const DAY = 86400000
const LOOKAHEAD_DAYS = 30
const AMSTERDAM_BOUNDS = { west: 4.70, east: 5.02, south: 52.28, north: 52.46 }
const limitationTypes = {
  OBSTRU: { label: 'Volledige stremming', category: 'blocked', blocksRouting: true },
  NOSERV: { label: 'Geen bediening', category: 'service', blocksRouting: false },
  CLEWID: { label: 'Beperkte doorvaartbreedte', category: 'dimensions', blocksRouting: false },
  CLEHEI: { label: 'Beperkte doorvaarthoogte', category: 'dimensions', blocksRouting: false },
  DELAY: { label: 'Vertraging', category: 'delay', blocksRouting: false },
  CAUTIO: { label: 'Waarschuwing', category: 'warning', blocksRouting: false },
  NOMOOR: { label: 'Afmeren verboden', category: 'mooring', blocksRouting: false },
  WAVWAS: { label: 'Hinderlijke waterbeweging vermijden', category: 'traffic', blocksRouting: false },
  PASSIN: { label: 'Passeren beperkt', category: 'traffic', blocksRouting: false },
  OVRTAK: { label: 'Inhalen beperkt', category: 'traffic', blocksRouting: false },
  SERVIC: { label: 'Bediening beschikbaar', category: 'information', blocksRouting: false },
}
const reasonLabels = { WORK: 'Werkzaamheden', FAIL: 'Storing', EVENT: 'Evenement', CALAM: 'Calamiteit', OTHER: 'Overig' }
const localParts = value => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(value).map(part => [part.type, part.value]))
function localDate(value) {
  const p = localParts(value)
  return `${p.year}-${p.month}-${p.day}`
}
function localTimestamp(date, milliseconds) {
  const [y, m, d] = date.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d) + milliseconds
  let utc = wall
  for (let i = 0; i < 3; i++) {
    const p = localParts(utc)
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
    utc += wall - represented
  }
  return utc
}
function timeOfDay(value, fallback) {
  if (value == null) return fallback
  // The public client displays these epoch-based time values in local time.
  const p = localParts(Number(value))
  return (+p.hour * 3600 + +p.minute * 60 + +p.second) * 1000
}
const days = { SUN: [0], MON: [1], TUE: [2], WED: [3], THU: [4], FRI: [5], SAT: [6], WRD: [1,2,3,4,5], WKN: [0,6] }

export function periodWindows(period, now, horizon = now + LOOKAHEAD_DAYS * DAY) {
  const from = Number(period.startDate ?? now - DAY)
  const until = Number(period.endDate ?? Date.parse('9999-12-31T00:00:00Z'))
  const interval = period.interval || 'CON'
  if (interval === 'CON') return [[
    period.startTimeMs == null ? from : localTimestamp(localDate(from), timeOfDay(period.startTimeMs, 0)),
    period.endTimeMs == null ? until : localTimestamp(localDate(until), timeOfDay(period.endTimeMs, DAY)),
  ]]
  const allowedDays = days[interval]
  const windows = []
  // Include yesterday for overnight periods.
  const horizonDays = Math.min(62, Math.max(2, Math.ceil((horizon - now) / DAY) + 1))
  for (let offset = -1; offset <= horizonDays; offset++) {
    const date = localDate(now + offset * DAY)
    const midnight = localTimestamp(date, 0)
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay()
    if (allowedDays && !allowedDays.includes(weekday)) continue
    if (date < localDate(from) || date > localDate(until)) continue
    const startClock = timeOfDay(period.startTimeMs, 0)
    const endClock = timeOfDay(period.endTimeMs, DAY)
    const start = localTimestamp(date, startClock)
    const end = localTimestamp(date, endClock <= startClock ? endClock + DAY : endClock)
    windows.push([start, end])
  }
  return windows
}

export function normalizeClosureMessage(message, now = Date.now()) {
  const number = message.ntsNumber
  const key = `${number.organisation}-${number.year}-${number.number}`
  const features = []
  for (const [subjectIndex, subject] of (message.subjectLimitations || []).entries()) {
    const object = subject.geoObject || {}
    const coordinates = (object.coordinates || []).filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat)).map(p => [p.lon, p.lat])
    if (!coordinates.some(([lon, lat]) => lon >= AMSTERDAM_BOUNDS.west && lon <= AMSTERDAM_BOUNDS.east && lat >= AMSTERDAM_BOUNDS.south && lat <= AMSTERDAM_BOUNDS.north)) continue
    for (const [limitationIndex, limitation] of (subject.limitations || []).entries()) {
      const limitationType = limitationTypes[limitation.limitationCode]
      if (!limitationType) continue
      const periods = limitation.limitationPeriods?.length ? limitation.limitationPeriods : [{
        startDate: message.validityStart, endDate: message.validityEnd, interval: 'CON',
      }]
      for (const [periodIndex, period] of periods.entries()) {
        for (const [start, end] of periodWindows(period, now, now + LOOKAHEAD_DAYS * DAY)) {
          if (end <= now || start > now + LOOKAHEAD_DAYS * DAY) continue
          features.push({
            type: 'Feature', id: `${key}:${subjectIndex}:${limitationIndex}:${periodIndex}:${start}`,
            geometry: { type: coordinates.length === 1 ? 'Point' : 'LineString', coordinates: coordinates.length === 1 ? coordinates[0] : coordinates },
            properties: {
              name: object.name || object.fairwayName || 'Scheepvaartbeperking',
              network: object.fairwayName || '', waterway: object.fairwayName || '',
              type: limitationType.label,
              category: limitationType.category,
              limitationCode: limitation.limitationCode,
              blocksRouting: limitationType.blocksRouting,
              description: message.contents || '',
              reason: reasonLabels[message.reasonCode] || '',
              direction: limitation.positionCode || '',
              value: Number.isFinite(Number(limitation.value)) ? Number(limitation.value) : null,
              unit: limitation.unit || '',
              indication: limitation.indicationCode || '',
              state: start <= now && end > now ? 'active' : 'upcoming',
              start: new Date(start).toISOString(), end: new Date(end).toISOString(),
              source: 'Rijkswaterstaat Vaarweginformatie',
              sourceUrl: `https://vaarweginformatie.nl/frp/nts/FTM/${encodeURIComponent(key)}`,
              noticeNumber: key,
            },
          })
        }
      }
    }
  }
  const selected = new Map()
  for (const feature of features) {
    // Recurring notices may produce the same marker for every day. Show only
    // the active occurrence, or otherwise the next occurrence on the map.
    const occurrenceKey = String(feature.id).split(':').slice(0, -2).join(':')
    const previous = selected.get(occurrenceKey)
    if (!previous
      || (feature.properties.state === 'active' && previous.properties.state !== 'active')
      || (feature.properties.state === previous.properties.state && Date.parse(feature.properties.start) < Date.parse(previous.properties.start))) {
      selected.set(occurrenceKey, feature)
    }
  }
  return [...selected.values()]
}

export async function loadCurrentClosures({ fetchImpl = fetch, now = Date.now() } = {}) {
  const json = async url => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Vaarweginformatie returned ${response.status}`)
    const data = await response.json()
    if (!data || data.error) throw new Error('Invalid Vaarweginformatie response')
    return data
  }
  const query = new URLSearchParams({ validFrom: String(now), validUntil: String(now + LOOKAHEAD_DAYS * DAY), ntsTypes: 'FTM', limitationGroup: 'ALL' })
  const summaries = await json(`${API}/nts/summaries?${query}`)
  if (!Array.isArray(summaries)) throw new Error('Invalid closure summary list')
  const keys = [...new Set(summaries.filter(row => row.location?.some(p => p.lon >= AMSTERDAM_BOUNDS.west && p.lon <= AMSTERDAM_BOUNDS.east && p.lat >= AMSTERDAM_BOUNDS.south && p.lat <= AMSTERDAM_BOUNDS.north))
    .map(row => `${row.ntsNumber.organisation}-${row.ntsNumber.year}-${row.ntsNumber.number}`))]
  const features = []
  let failedDetails = 0
  // Detail calls are bounded so Vaarweginformatie is not overloaded. A single
  // broken notice no longer hides every other current notice from the map.
  for (let i = 0; i < keys.length; i += 8) {
    const results = await Promise.allSettled(keys.slice(i, i + 8).map(key => json(`${API}/ftm/${encodeURIComponent(key)}`)))
    for (const result of results) {
      if (result.status === 'rejected') { failedDetails += 1; continue }
      const message = result.value
      if (!message.ntsNumber || !Array.isArray(message.subjectLimitations)) throw new Error('Incomplete closure detail')
      features.push(...normalizeClosureMessage(message, now))
    }
  }
  if (keys.length && failedDetails === keys.length) throw new Error('No Vaarweginformatie details could be loaded')
  return {
    type: 'FeatureCollection', features, fetchedAt: new Date(now).toISOString(), stale: false,
    partial: failedDetails > 0, failedDetails, noticeCount: keys.length,
  }
}
