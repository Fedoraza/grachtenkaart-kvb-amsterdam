import L from 'leaflet'

export async function loadAmsterdamBridges() {
  const response = await fetch('/api/map/bridges')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not load bridge heights')
  return data
}

export function createBridgeLayer(map, data) {
  const group = L.layerGroup()
  const labels = L.layerGroup()
  const shapes = L.geoJSON(data, {
    pane: 'navigation-pane',
    style(feature) {
      const known = hasHeight(feature.properties || {})
      return { color: known ? '#f59e0b' : '#64748b', weight: 2, fillColor: known ? '#fbbf24' : '#94a3b8', fillOpacity: known ? 0.22 : 0.12 }
    },
    onEachFeature(feature, layer) {
      const properties = feature.properties || {}
      layer.bindPopup(bridgePopup(properties), { maxWidth: 300 })
      layer.bindTooltip(`${bridgeTitle(properties)} · ${displayHeight(properties)}`, { sticky: true })
      const center = layer.getBounds?.().getCenter()
      if (!center || !hasHeight(properties)) return
      L.marker(center, {
        pane: 'navigation-pane',
        interactive: true,
        icon: L.divIcon({
          className: 'bridge-height-marker',
          html: `<span>${escapeHtml(displayHeight(properties))}</span>`,
          iconSize: [48, 22],
          iconAnchor: [24, 11],
        }),
      }).bindPopup(bridgePopup(properties), { maxWidth: 300 }).addTo(labels)
    },
  }).addTo(group)

  function updateLabels() {
    if (map.getZoom() >= 15) {
      if (!group.hasLayer(labels)) labels.addTo(group)
    } else if (group.hasLayer(labels)) group.removeLayer(labels)
  }
  map.on('zoomend', updateLabels)
  updateLabels()

  return {
    layer: group,
    count: data.features?.length || 0,
    destroy() {
      map.off('zoomend', updateLabels)
      group.removeLayer(shapes)
      group.removeLayer(labels)
    },
  }
}

function bridgePopup(properties) {
  const calculated = calculatedClearance(properties)
  const rows = [
    ['Brugnummer', properties.number],
    ['Onderkant t.o.v. NAP', formatMeters(properties.clearanceNap)],
    ['Hoogte bij 4 m breedte t.o.v. NAP', formatMeters(properties.clearanceAt4mNap)],
    ['Winterwaterpeil t.o.v. NAP', formatMeters(properties.winterWaterLevelNap)],
    ['Berekende vrije hoogte bij winterpeil', calculated === null ? null : formatMeters(calculated)],
    ['Doorvaartbreedte', formatMeters(properties.passageWidth)],
    ['Type', properties.bridgeType],
    ['Vaarroute', properties.route],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')
  return `<div class="bridge-popup"><strong>${escapeHtml(bridgeTitle(properties))}</strong>${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}<small>Bron: Gemeente Amsterdam · hoogtes zijn bronwaarden t.o.v. NAP.</small></div>`
}

function bridgeTitle(properties) {
  return [properties.name, properties.number].filter(Boolean).join(' · ') || 'Brug'
}

function displayHeight(properties) {
  const calculated = calculatedClearance(properties)
  const value = calculated ?? properties.clearanceNap ?? properties.clearanceAt4mNap
  return value === null || value === undefined ? 'hoogte onbekend' : `${Number(value).toFixed(2)} m`
}

function hasHeight(properties) {
  return properties.clearanceNap !== null && properties.clearanceNap !== undefined
    || properties.clearanceAt4mNap !== null && properties.clearanceAt4mNap !== undefined
}

function calculatedClearance(properties) {
  if (properties.clearanceNap === null || properties.clearanceNap === undefined
    || properties.winterWaterLevelNap === null || properties.winterWaterLevelNap === undefined) return null
  return Number(properties.clearanceNap) - Number(properties.winterWaterLevelNap)
}

function formatMeters(value) {
  return value === null || value === undefined ? null : `${Number(value).toFixed(2)} m`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}
