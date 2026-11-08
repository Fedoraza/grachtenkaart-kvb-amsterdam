import L from 'leaflet'

export async function loadNavigationLayer(id) {
  const query = new URLSearchParams({ layer: id })
  const response = await fetch(`/api/map/navigation-layer?${query}`, { cache: 'no-cache' })
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
      const fillColor = id === 'closures' ? closureColor(feature.properties) : colors[id]
      return L.circleMarker(latlng, { pane: 'navigation-pane', radius, color: '#fff', weight: 2, fillColor, fillOpacity: 0.95 })
    },
    style(feature) {
      const color = id === 'closures' ? closureColor(feature.properties) : colors[id]
      return { pane: 'navigation-pane', color, weight: id === 'closures' ? 6 : 3, opacity: 0.95, fillColor: color, fillOpacity: 0.35, dashArray: id === 'closures' && feature.properties?.state === 'upcoming' ? '8 7' : null }
    },
    onEachFeature(feature, layer) {
      const properties = feature.properties || {}
      layer.bindPopup(`${popupFor(id, properties)}${options.adminObjectHtml?.(feature) || ''}`, { maxWidth: 360 })
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
      movementRules: p.movementRules,
      routeNames: Array.isArray(p.routeNames) ? p.routeNames : [],
      _mapObjectKey: p._mapObjectKey,
      _mapObjectSource: p._mapObjectSource,
    })
  }
  for (const location of locations.values()) {
    location.calls.sort((a, b) => Number(a.number) - Number(b.number))
    const names = [...location.names]
    let movementPreview = null
    L.marker([location.latitude, location.longitude], {
      pane: 'markerPane',
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
      .on('popupopen', () => {
        movementPreview?.remove()
        movementPreview = reportingMovementPreview(location)
        movementPreview?.addTo(group)
      })
      .on('popupclose', () => { movementPreview?.remove(); movementPreview = null })
      .addTo(group)
  }
  return group
}

function reportingPointIcon(callCount) {
  return L.divIcon({
    className: 'reporting-point-icon',
    html: `<span class="reporting-point-icon__main"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 27V6m0 0-5 5m5-5 5 5M16 18l-8-7m0 0v6m0-6h6m2 7 8-7m0 0v6m0-6h-6"/></svg><b>VHF</b></span><span class="reporting-point-icon__count">${escapeHtml(callCount)}</span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20],
  })
}

function reportingMovementPreview(location) {
  const layers = [], seen = new Set()
  for (const call of location.calls) for (const rule of call.movementRules || []) {
    if (rule.kind !== 'map-passage' || !rule.from || !rule.to) continue
    const key = [rule.from.latitude, rule.from.longitude, rule.to.latitude, rule.to.longitude].join(':')
    if (seen.has(key)) continue
    seen.add(key)
    const color = ({ left: '#8b5cf6', right: '#f97316', uturn: '#ef4444', straight: '#0ea5e9' })[rule.maneuver] || '#0ea5e9'
    const line = L.polyline([
      [rule.from.latitude, rule.from.longitude],
      [location.latitude, location.longitude],
      [rule.to.latitude, rule.to.longitude],
    ], { pane: 'navigation-pane', color, weight: 5, opacity: 0.9, interactive: false })
    layers.push(line)
    if (L.polylineDecorator) layers.push(L.polylineDecorator(line, { patterns: [{ offset: '88%', symbol: L.Symbol.arrowHead({ pixelSize: 11, polygon: true, pathOptions: { color, fillColor: color, fillOpacity: 1, interactive: false } }) }] }))
  }
  return layers.length ? L.layerGroup(layers) : null
}

function reportingMovementSummary(call) {
  if (!Array.isArray(call.movementRules)) return escapeHtml(call.call)
  if (!call.movementRules.length) return 'Nog geen vaarbeweging ingesteld'
  return call.movementRules.map(rule => {
    const from = rule.from?.lineName || rule.incomingLine || 'Aankomstkant'
    const to = rule.to?.lineName || rule.outgoingLine || 'Vervolgrichting'
    const maneuver = ({ left: 'Linksaf', right: 'Rechtsaf', straight: 'Rechtdoor / kruisen', uturn: 'Keren' })[rule.maneuver]
    return `<span class="reporting-popup__movement"><em>${escapeHtml(maneuver || 'Vaarbeweging')}</em><strong>${escapeHtml(from)} → ${escapeHtml(to)}</strong><span><b>Meld:</b> ${escapeHtml(rule.call)}</span></span>`
  }).join('')
}

function reportingPointPopup(location, options = {}) {
  const locationName = location.names.join(' / ')
  const names = location.names.map(escapeHtml).join('<br>')
  const calls = location.calls.map((call) => `
    <li>
      <span class="reporting-popup__number">${escapeHtml(call.number)}</span>
      <span class="reporting-popup__text">${reportingMovementSummary(call)}${options.routeLinkPopupHtml ? options.routeLinkPopupHtml(call, { latitude: location.latitude, longitude: location.longitude }) : ''}${options.adminObjectHtml ? options.adminObjectHtml({ type: 'Feature', geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] }, properties: call }) : ''}</span>
    </li>
  `).join('')
  const hasDirectionalRules = location.calls.some(call => Array.isArray(call.movementRules) && call.movementRules.length)
  const instruction = location.calls.find((call) => call.instruction)?.instruction || 'Noem eerst de scheepsnaam en daarna de vaarrichting.'
  const obligation = location.calls.find((call) => call.obligation)?.obligation || 'Melden geeft geen voorrang.'
  return `
    <div class="reporting-popup__content">
      <div class="reporting-popup__eyebrow">Marifoonmeldpunt</div>
      <strong class="reporting-popup__title">${names}</strong>
      ${options.adminLocationHtml ? options.adminLocationHtml({ type: 'Feature', geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] }, properties: { name: locationName, locationName, calls: location.calls } }) : ''}
      ${hasDirectionalRules ? '<div class="reporting-popup__direction-note">Kies hieronder de richting waarin je vaart. Iedere vaarbeweging heeft een eigen melding.</div>' : `<div class="reporting-popup__section"><span>Algemene melding (nog niet per richting ingesteld)</span><b>${escapeHtml(instruction)}</b></div>`}
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
  if (id === 'closures') return closurePopup(properties)
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

function closureColor(properties = {}) {
  if (properties.blocksRouting) return '#dc2626'
  return ({ service: '#f97316', dimensions: '#ea580c', delay: '#f59e0b', warning: '#eab308', mooring: '#8b5cf6', traffic: '#d97706', information: '#0ea5e9' })[properties.category] || '#f43f5e'
}

function closurePopup(properties) {
  const isUpcoming = properties.state === 'upcoming'
  const end = properties.end && Date.parse(properties.end) < Date.parse('2100-01-01') ? formatDate(properties.end) : 'Tot nader bericht'
  const value = limitationValue(properties)
  const sourceUrl = /^https:\/\/vaarweginformatie\.nl\//.test(properties.sourceUrl || '') ? properties.sourceUrl : null
  return `<div class="closure-popup">
    <div class="closure-popup__top"><span class="closure-popup__badge" style="background:${closureColor(properties)}">${isUpcoming ? 'GEPLAND' : 'ACTUEEL'}</span><span>${escapeHtml(properties.type || 'Scheepvaartbericht')}</span></div>
    <strong class="closure-popup__title">${escapeHtml(properties.name || 'Scheepvaartbeperking')}</strong>
    ${properties.waterway ? `<div class="closure-popup__waterway">${escapeHtml(properties.waterway)}</div>` : ''}
    <div class="closure-popup__period"><b>${isUpcoming ? 'Vanaf' : 'Geldig'}</b><span>${escapeHtml(formatDate(properties.start) || 'Nu')} – ${escapeHtml(end)}</span></div>
    ${value ? `<div class="closure-popup__impact"><b>Beperking</b><span>${escapeHtml(value)}</span></div>` : ''}
    ${properties.reason ? `<div class="closure-popup__impact"><b>Reden</b><span>${escapeHtml(properties.reason)}</span></div>` : ''}
    ${properties.sourceStale ? '<p>Dit bericht kon niet worden vernieuwd. De laatst bekende gegevens worden getoond.</p>' : ''}
    ${properties.description ? `<p>${escapeHtml(properties.description)}</p>` : ''}
    <div class="closure-popup__route">${properties.blocksRouting ? 'Routeplanner vermijdt deze locatie.' : 'Informatie en waarschuwing; route blijft beschikbaar.'}</div>
    ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Open officieel bericht bij Vaarweginformatie ↗</a>` : ''}
  </div>`
}

function limitationValue(properties) {
  if (properties.value === null || properties.value === undefined) return properties.direction ? `Richting ${properties.direction}` : ''
  const units = { H: 'uur', M: 'm', CM: 'cm', MIN: 'min' }
  const indication = properties.indication === 'MAX' ? 'maximaal ' : properties.indication === 'MIN' ? 'minimaal ' : ''
  return `${indication}${properties.value} ${units[properties.unit] || properties.unit || ''}${properties.direction ? ` · richting ${properties.direction}` : ''}`.trim()
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
