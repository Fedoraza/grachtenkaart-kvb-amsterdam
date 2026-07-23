import L from 'leaflet'

export async function loadNavigationLayer(id) {
  const response = await fetch(`/api/map/navigation-layer?layer=${encodeURIComponent(id)}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Could not load ${id}`)
  return data
}

export function createNavigationLayer(id, data, canals = null, options = {}) {
  if (id === 'reporting-points') return createReportingPointLayer(data, canals, options)
  const colors = { locks: '#8b5cf6', markers: '#06b6d4', 'bridge-openings': '#ef4444', closures: '#f43f5e', moorings: '#10b981', 'water-levels': '#2563eb', 'reporting-points': '#e11d48' }
  return L.geoJSON(data, {
    pane: 'navigation-pane',
    pointToLayer(feature, latlng) {
      const radius = id === 'markers' ? 5 : id === 'moorings' ? 6 : id === 'reporting-points' ? 11 : 9
      return L.circleMarker(latlng, { pane: 'navigation-pane', radius, color: '#fff', weight: 2, fillColor: colors[id], fillOpacity: 0.95 })
    },
    style: { pane: 'navigation-pane', color: colors[id], weight: 3, opacity: 0.95, fillColor: colors[id], fillOpacity: 0.35 },
    onEachFeature(feature, layer) {
      const properties = feature.properties || {}
      layer.bindPopup(popupFor(id, properties), { maxWidth: 300 })
      layer.bindTooltip(featureTitle(id, properties), { sticky: true, direction: 'top' })
    },
  })
}

function createReportingPointLayer(data, canals, options = {}) {
  const group = L.layerGroup()
  const locations = new Map()
  for (const feature of data.features || []) {
    const p = feature.properties || {}
    const override = options.positionOverrideFor?.(p)
    const [sourceLongitude, sourceLatitude] = feature.geometry?.coordinates || []
    const latitude = Number.isFinite(Number(override?.latitude)) ? Number(override.latitude) : sourceLatitude
    const longitude = Number.isFinite(Number(override?.longitude)) ? Number(override.longitude) : sourceLongitude
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    const snapped = override ? null : snapPointToWater([latitude, longitude], canals)
    const markerLatitude = snapped?.[0] ?? latitude
    const markerLongitude = snapped?.[1] ?? longitude
    const locationKey = `${markerLatitude.toFixed(6)},${markerLongitude.toFixed(6)}`
    if (!locations.has(locationKey)) {
      locations.set(locationKey, {
        latitude: markerLatitude,
        longitude: markerLongitude,
        names: new Set(),
        calls: [],
        source: p.source,
      })
    }
    const location = locations.get(locationKey)
    location.names.add(p.locationName || p.name || 'Marifoonmeldpunt')
    location.calls.push({
      number: p.number,
      name: p.name,
      locationName: p.locationName,
      call: p.call,
      instruction: p.instruction,
      obligation: p.obligation,
      bearing: p.bearing,
      routeNames: Array.isArray(p.routeNames) ? p.routeNames : [],
    })
  }
  for (const location of locations.values()) {
    location.calls.sort((a, b) => Number(a.number) - Number(b.number))
    const names = [...location.names]
    L.marker([location.latitude, location.longitude], {
      pane: 'navigation-pane',
      icon: reportingPointIcon(location.calls.length),
      zIndexOffset: 650,
      draggable: Boolean(options.draggablePositions),
    })
      .on('dragend', (event) => {
        const latlng = event.target.getLatLng()
        for (const call of location.calls) options.onPositionDragEnd?.(call, latlng)
      })
      .bindTooltip(`${names.join(' / ')} · ${location.calls.length} melding${location.calls.length === 1 ? '' : 'en'}`, { sticky: true, direction: 'top' })
      .bindPopup(() => reportingPointPopup({ ...location, names }, options), { maxWidth: 420, className: 'reporting-popup' })
      .addTo(group)
  }
  return group
}

function reportingPointIcon(callCount) {
  return L.divIcon({
    className: 'reporting-point-icon',
    html: `<span class="reporting-point-icon__main">VHF</span><span class="reporting-point-icon__count">${escapeHtml(callCount)}</span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20],
  })
}

function reportingPointPopup(location, options = {}) {
  const names = location.names.map(escapeHtml).join('<br>')
  const calls = location.calls.map((call) => `
    <li>
      <span class="reporting-popup__number">${escapeHtml(call.number)}</span>
      <span class="reporting-popup__text">${escapeHtml(call.call)}${options.routeLinkPopupHtml ? options.routeLinkPopupHtml(call, { latitude: location.latitude, longitude: location.longitude }) : ''}</span>
    </li>
  `).join('')
  const instruction = location.calls.find((call) => call.instruction)?.instruction || 'Noem eerst de scheepsnaam en daarna de vaarrichting.'
  const obligation = location.calls.find((call) => call.obligation)?.obligation || 'Melden geeft geen voorrang.'
  return `
    <div class="reporting-popup__content">
      <div class="reporting-popup__eyebrow">Marifoonmeldpunt</div>
      <strong class="reporting-popup__title">${names}</strong>
      <div class="reporting-popup__section">
        <span>Wat zeg je?</span>
        <b>${escapeHtml(instruction)}</b>
      </div>
      <ol class="reporting-popup__calls">${calls}</ol>
      <div class="reporting-popup__note">${escapeHtml(obligation)}</div>
      ${location.source ? `<div class="reporting-popup__source">${escapeHtml(location.source)}</div>` : ''}
    </div>
  `
}

function snapPointToWater([latitude, longitude], canals) {
  let best = null
  for (const feature of canals?.features || []) {
    const geometry = feature.geometry
    const lines = geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : []
    for (const line of lines) {
      for (let index = 1; index < line.length; index += 1) {
        const candidate = projectOnSegment([latitude, longitude], line[index - 1], line[index])
        if (candidate.distance > 120) continue
        if (!best || candidate.distance < best.distance) best = candidate
      }
    }
  }
  return best?.point || null
}

function projectOnSegment([latitude, longitude], a, b) {
  const scale = Math.cos(latitude * Math.PI / 180)
  const px = longitude * scale; const py = latitude
  const ax = a[0] * scale; const ay = a[1]; const bx = b[0] * scale; const by = b[1]
  const dx = bx - ax; const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  const point = [ay + t * dy, (ax + t * dx) / scale]
  return { t, point, distance: distanceMeters([longitude, latitude], [point[1], point[0]]) }
}

function distanceMeters(a, b) { const latitude = (a[1] + b[1]) / 2 * Math.PI / 180; return Math.hypot((a[0] - b[0]) * Math.cos(latitude), a[1] - b[1]) * 111_320 }

export function createRestrictionLayer(canals) {
  const features = (canals?.features || []).filter((feature) => {
    const p = feature.properties || {}
    return p.maxspeed || p.oneway || p.boat === 'no' || p.motorboat === 'no' || p.maxwidth
  })
  return L.geoJSON({ type: 'FeatureCollection', features }, {
    pane: 'navigation-pane',
    style(feature) {
      const p = feature.properties || {}
      const forbidden = p.boat === 'no' || p.motorboat === 'no'
      return { pane: 'navigation-pane', color: forbidden ? '#ef4444' : p.oneway ? '#d946ef' : '#f97316', weight: 5, opacity: 0.9 }
    },
    onEachFeature(feature, layer) {
      const p = feature.properties || {}
      const rows = [
        ['Vaarweg', p.name], ['Maximumsnelheid', p.maxspeed], ['Eenrichting', p.oneway],
        ['Boottoegang', p.boat], ['Motorboottoegang', p.motorboat], ['Maximale breedte', p.maxwidth],
      ].filter(([, value]) => value !== null && value !== undefined && value !== '')
      layer.bindPopup(popupRows('Vaarwegbeperking', rows))
    },
  })
}

function featureTitle(id, properties) {
  if (id === 'moorings') return properties.name || (properties.type === 'pier' ? 'Steiger' : 'Aanlegplaats')
  if (id === 'bridge-openings') return properties.name || 'Geplande brugopening'
  if (id === 'closures') return properties.name || 'Scheepvaartbeperking'
  if (id === 'water-levels') return properties.name || 'Watermeetpunt'
  if (id === 'locks') return properties.name || 'Sluis'
  if (id === 'reporting-points') return `${properties.number}. ${properties.call}`
  return properties.name || properties.obj_naam || properties.type || properties.category || 'Vaarwegmarkering'
}

function popupFor(id, properties) {
  if (id === 'locks') return popupRows(properties.name || 'Sluis', [
    ['Nummer', properties.number], ['Type', properties.type], ['Bediening', properties.operation], ['Bedienaar', properties.operator],
  ])
  if (id === 'bridge-openings') return popupRows(properties.name || 'Brugopening', [
    ['Locatiecode', properties.code], ['Start', formatDate(properties.start)], ['Einde', formatDate(properties.end)],
  ])
  if (id === 'closures') return popupRows(properties.name || 'Scheepvaartbeperking', [
    ['Type', properties.type], ['Netwerk', properties.network], ['Omschrijving', properties.description], ['Bron', properties.source],
  ])
  if (id === 'moorings') return popupRows(properties.name || 'Openbare aanlegplaats', [
    ['Nummer', properties.number], ['Type', properties.type], ['Laden en lossen', properties.loading],
    ['Elektrisch laadpunt', properties.charging], ['Beheerder', properties.operator],
  ])
  if (id === 'water-levels') return popupRows(properties.name || 'Watermeetpunt', [['Waterstand', properties.value === null ? null : `${properties.value} ${properties.unit || ''}`], ['Gemeten', formatDate(properties.observedAt)]])
  if (id === 'reporting-points') return popupRows(properties.name || 'Marifoonmeldpunt', [
    ['Kaartnummer', properties.number], ['Melding', properties.call],
    ['Werkwijze', properties.instruction], ['Verplichting', properties.obligation], ['Bron', properties.source],
  ])
  const title = properties.name || properties.obj_naam || properties.type || properties.category || 'Vaarwegmarkering'
  return popupRows(title, [
    ['Type', properties.type || properties.category || properties.obj_type],
    ['Kenmerk', properties.code || properties.id || properties.objectid],
  ])
}

function popupRows(title, rows) {
  return `<div class="bridge-popup"><strong>${escapeHtml(title)}</strong>${rows.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : value
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}
