import L from 'leaflet'

export async function loadNavigationLayer(id) {
  const response = await fetch(`/api/map/navigation-layer?layer=${encodeURIComponent(id)}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Could not load ${id}`)
  return data
}

export function createNavigationLayer(id, data) {
  const colors = { locks: '#8b5cf6', markers: '#06b6d4', 'bridge-openings': '#ef4444', moorings: '#10b981', 'water-levels': '#2563eb' }
  return L.geoJSON(data, {
    pane: 'navigation-pane',
    pointToLayer(feature, latlng) {
      const radius = id === 'markers' ? 5 : id === 'moorings' ? 6 : 9
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
  if (id === 'water-levels') return properties.name || 'Watermeetpunt'
  if (id === 'locks') return properties.name || 'Sluis'
  return properties.name || properties.obj_naam || properties.type || properties.category || 'Vaarwegmarkering'
}

function popupFor(id, properties) {
  if (id === 'locks') return popupRows(properties.name || 'Sluis', [
    ['Nummer', properties.number], ['Type', properties.type], ['Bediening', properties.operation], ['Bedienaar', properties.operator],
  ])
  if (id === 'bridge-openings') return popupRows(properties.name || 'Brugopening', [
    ['Locatiecode', properties.code], ['Start', formatDate(properties.start)], ['Einde', formatDate(properties.end)],
  ])
  if (id === 'moorings') return popupRows(properties.name || 'Openbare aanlegplaats', [
    ['Nummer', properties.number], ['Type', properties.type], ['Laden en lossen', properties.loading],
    ['Elektrisch laadpunt', properties.charging], ['Beheerder', properties.operator],
  ])
  if (id === 'water-levels') return popupRows(properties.name || 'Watermeetpunt', [['Waterstand', properties.value === null ? null : `${properties.value} ${properties.unit || ''}`], ['Gemeten', formatDate(properties.observedAt)]])
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
