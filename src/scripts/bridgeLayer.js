import L from 'leaflet'
import { waterkaartInfoForBridge } from './waterkaartBridgeInfo'

export async function loadAmsterdamBridges() {
  const response = await fetch('/api/map/bridges')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not load bridge heights')
  return data
}

export function createBridgeLayer(map, data, options = {}) {
  const group = L.layerGroup()
  const labels = L.layerGroup()
  const shapes = L.geoJSON(data, {
    pane: 'navigation-pane',
    style(feature) {
      const properties = feature.properties || {}
      const known = hasHeight(properties)
      const waterkaartInfo = waterkaartInfoForBridge(properties)
      return {
        color: waterkaartInfo ? '#0ea5e9' : known ? '#f59e0b' : '#64748b',
        weight: waterkaartInfo ? 3 : 2,
        fillColor: waterkaartInfo ? '#38bdf8' : known ? '#fbbf24' : '#94a3b8',
        fillOpacity: waterkaartInfo ? 0.28 : known ? 0.22 : 0.12,
      }
    },
    onEachFeature(feature, layer) {
      const properties = feature.properties || {}
      const waterkaartInfo = waterkaartInfoForBridge(properties)
      const center = layer.getBounds?.().getCenter()
      const markerPoint = bridgeMarkerPoint(properties, center, options)
      const routeLinkPoint = markerPoint ? { latitude: markerPoint.lat, longitude: markerPoint.lng } : null
      layer.bindPopup(() => bridgePopup(properties, options.routeLinkPopupHtml?.(properties, routeLinkPoint) || ''), { maxWidth: 380 })
      layer.bindTooltip(`${bridgeTitle(properties)} · ${displayHeight(properties)}${waterkaartInfo?.vhfChannel ? ` · VHF ${waterkaartInfo.vhfChannel}` : ''}`, { sticky: true })
      if (!markerPoint || !hasHeight(properties)) return
      L.marker(markerPoint, {
        pane: 'navigation-pane',
        interactive: true,
        draggable: Boolean(options.draggablePositions),
        icon: L.divIcon({
          className: `bridge-height-marker${waterkaartInfo ? ' bridge-height-marker--waterkaart' : ''}`,
          html: `<span>${escapeHtml(displayHeight(properties))}${waterkaartInfo?.vhfChannel ? `<small>VHF ${escapeHtml(waterkaartInfo.vhfChannel)}</small>` : ''}</span>`,
          iconSize: waterkaartInfo ? [64, 34] : [48, 22],
          iconAnchor: waterkaartInfo ? [32, 17] : [24, 11],
        }),
      })
        .on('dragend', (event) => options.onPositionDragEnd?.(properties, event.target.getLatLng()))
        .bindPopup(() => bridgePopup(properties, options.routeLinkPopupHtml?.(properties, markerLatLngToPoint(markerPoint)) || ''), { maxWidth: 380 })
        .addTo(labels)
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

function bridgeMarkerPoint(properties, center, options) {
  const override = options.positionOverrideFor?.(properties)
  if (Number.isFinite(Number(override?.latitude)) && Number.isFinite(Number(override?.longitude))) {
    return L.latLng(Number(override.latitude), Number(override.longitude))
  }
  return center || null
}

function markerLatLngToPoint(latlng) {
  return latlng ? { latitude: latlng.lat, longitude: latlng.lng } : null
}

function bridgePopup(properties, routeLinkHtml = '') {
  const calculated = calculatedClearance(properties)
  const waterkaartInfo = waterkaartInfoForBridge(properties)
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
  const waterkaartRows = waterkaartInfo ? [
    ['Waterkaart doorvaarthoogte', formatMeters(waterkaartInfo.clearanceHeightMeters)],
    ['Waterkaart breedte', formatMeters(waterkaartInfo.passageWidthMeters)],
    ['Peilreferentie', waterkaartInfo.waterLevelReference],
    ['Marifoonkanaal', waterkaartInfo.vhfChannel],
    ['Telefoon', waterkaartInfo.phone],
    ['Aanvraag lokaal', waterkaartInfo.requestPhone],
    ['Status bronpagina', waterkaartInfo.bridgeStatus],
    ['Beheerder', waterkaartInfo.manager],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '') : []
  const waterkaartHtml = waterkaartInfo ? `
    <section class="bridge-popup__section bridge-popup__section--waterkaart">
      <h3>Waterkaart Live</h3>
      ${waterkaartRows.map(([label, value]) => popupRow(label, value)).join('')}
      ${waterkaartInfo.operatingSummary?.length ? `<div class="bridge-popup__block"><span>Bediening</span><b>${waterkaartInfo.operatingSummary.map(escapeHtml).join('<br>')}</b></div>` : ''}
      ${waterkaartInfo.notes?.length ? `<div class="bridge-popup__block"><span>Let op</span><b>${waterkaartInfo.notes.map(escapeHtml).join('<br>')}</b></div>` : ''}
      <small>Bron: <a href="${escapeHtml(waterkaartInfo.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(waterkaartInfo.sourceName)}</a>${waterkaartInfo.sourceUpdatedAt ? ` · bijgewerkt ${escapeHtml(formatDate(waterkaartInfo.sourceUpdatedAt))}` : ''}</small>
    </section>
  ` : ''
  return `<div class="bridge-popup"><strong>${escapeHtml(bridgeTitle(properties))}</strong>${rows.map(([label, value]) => popupRow(label, value)).join('')}${routeLinkHtml}${waterkaartHtml}<small>Bron: Gemeente Amsterdam · hoogtes zijn bronwaarden t.o.v. NAP.</small></div>`
}

function bridgeTitle(properties) {
  return [properties.name, properties.number].filter(Boolean).join(' · ') || 'Brug'
}

function displayHeight(properties) {
  const waterkaartInfo = waterkaartInfoForBridge(properties)
  const calculated = calculatedClearance(properties)
  const value = waterkaartInfo?.clearanceHeightMeters ?? calculated ?? properties.clearanceNap ?? properties.clearanceAt4mNap
  return value === null || value === undefined ? 'hoogte onbekend' : `${Number(value).toFixed(2)} m`
}

function hasHeight(properties) {
  return Boolean(waterkaartInfoForBridge(properties)?.clearanceHeightMeters)
    || properties.clearanceNap !== null && properties.clearanceNap !== undefined
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

function formatDate(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : value
}

function popupRow(label, value) {
  return `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}
