import L from 'leaflet'
import { waterkaartInfoForBridge } from './waterkaartBridgeInfo'
import { bridgeNavigationWarning } from './bridgeNavigationRules'

export async function loadAmsterdamBridges() {
  const response = await fetch('/api/map/bridges')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not load bridge heights')
  return data
}

export function createBridgeLayer(map, data, options = {}) {
  const group = L.layerGroup()
  const labels = L.layerGroup()
  const heightMarkers = []
  const popupOptions = { maxWidth: Math.min(380, map.getSize().x - 70), maxHeight: Math.min(360, map.getSize().y * 0.45), autoPanPaddingTopLeft: L.point(12, 140), autoPanPaddingBottomRight: L.point(12, 100) }
  const shapes = L.geoJSON(data, {
    pane: 'navigation-pane',
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 7, pane: 'navigation-pane' }),
    style(feature) {
      const properties = feature.properties || {}
      const unlinked = options.isLinked?.(properties) === false
      const known = hasHeight(properties)
      const waterkaartInfo = waterkaartInfoForBridge(properties)
      const navigationBlocked = Boolean(bridgeNavigationWarning(properties))
      return {
        color: navigationBlocked || unlinked ? '#ef4444' : waterkaartInfo ? '#0ea5e9' : known ? '#f59e0b' : '#64748b',
        weight: waterkaartInfo ? 3 : 2,
        fillColor: navigationBlocked || unlinked ? '#ef4444' : waterkaartInfo ? '#38bdf8' : known ? '#fbbf24' : '#94a3b8',
        fillOpacity: waterkaartInfo ? 0.28 : known ? 0.22 : 0.12,
      }
    },
    onEachFeature(feature, layer) {
      const properties = feature.properties || {}
      const waterkaartInfo = waterkaartInfoForBridge(properties)
      const navigationBlocked = Boolean(bridgeNavigationWarning(properties))
      const center = layer.getBounds?.().getCenter() || layer.getLatLng?.()
      const markerPoint = bridgeMarkerPoint(properties, center, options)
      const routeLinkPoint = markerPoint ? { latitude: markerPoint.lat, longitude: markerPoint.lng } : null
      layer.bindPopup(() => bridgePopup(properties, `${options.routeLinkPopupHtml?.(properties, routeLinkPoint) || ''}${options.adminObjectHtml?.(feature, routeLinkPoint) || ''}`), popupOptions)
      layer.bindTooltip(`${bridgeTitle(properties)} · ${displayHeight(properties)}${waterkaartInfo?.vhfChannel ? ` · VHF ${waterkaartInfo.vhfChannel}` : ''}`, { sticky: true })
      if (!markerPoint || (!hasHeight(properties) && !navigationBlocked && !/beweeg/i.test(properties.bridgeType || '') && !properties.fisBridgeId)) return
      const marker = L.marker(markerPoint, {
        pane: 'navigation-pane',
        interactive: true,
        draggable: Boolean(options.draggablePositions),
        icon: L.divIcon({
          className: `bridge-height-marker${waterkaartInfo ? ' bridge-height-marker--waterkaart' : ''}${navigationBlocked ? ' bridge-height-marker--blocked' : ''}${options.isLinked?.(properties) === false ? ' bridge-height-marker--unlinked' : ''}`,
          html: `<span>${escapeHtml(hasHeight(properties) || navigationBlocked ? displayHeight(properties) : '?')}${waterkaartInfo?.vhfChannel ? `<small>VHF ${escapeHtml(waterkaartInfo.vhfChannel)}</small>` : ''}</span>`,
          iconSize: navigationBlocked ? [100, 20] : waterkaartInfo ? [64, 34] : [48, 22],
          iconAnchor: navigationBlocked ? [50, 10] : waterkaartInfo ? [32, 17] : [24, 11],
        }),
      })
        .on('dragend', (event) => options.onPositionDragEnd?.(properties, event.target.getLatLng()))
        .bindPopup(() => bridgePopup(properties, `${options.routeLinkPopupHtml?.(properties, markerLatLngToPoint(markerPoint)) || ''}${options.adminObjectHtml?.(feature, markerLatLngToPoint(markerPoint)) || ''}`), popupOptions)
        .addTo(labels)
      heightMarkers.push({ marker, properties })
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
    refreshLinkStyles() {
      shapes.setStyle(shapes.options.style)
      for (const { marker, properties } of heightMarkers) {
        const icon = marker.options.icon
        const className = icon.options.className.replace(' bridge-height-marker--unlinked', '')
        marker.setIcon(L.divIcon({
          ...icon.options,
          className: className + (options.isLinked?.(properties) === false ? ' bridge-height-marker--unlinked' : ''),
        }))
      }
    },
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
  const navigationWarning = bridgeNavigationWarning(properties)
  const rows = [
    ['Brugnummer', properties.number],
    ['Onderkant t.o.v. NAP', formatMeters(properties.clearanceNap)],
    ['Hoogte bij 4 m breedte t.o.v. NAP', formatMeters(properties.clearanceAt4mNap)],
    ['Winterwaterpeil t.o.v. NAP', formatMeters(properties.winterWaterLevelNap)],
    ['Berekende vrije hoogte bij winterpeil', calculated === null ? null : formatMeters(calculated)],
    ['Doorvaartbreedte', formatMeters(properties.passageWidth) || (properties.fisPassageWidthMeters || waterkaartInfo?.passageWidthMeters ? null : 'Onbekend')],
    ['Doorvaarthoogte', hasHeight(properties) ? null : 'Onbekend'],
    ['Type', properties.bridgeType],
    ['Vaarroute', properties.route],
    ['Telefoon bediening (FIS-bron)', properties.fisPhone],
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
  const fisRows = [
    ['Doorvaarthoogte gesloten', properties.fisClearanceMeters, properties.fisSourceUrl, properties.fisOpeningName],
    ['Doorvaartbreedte', properties.fisPassageWidthMeters, properties.fisWidthSourceUrl, properties.fisWidthOpeningName],
  ].filter(([, value]) => Number(value) > 0)
  const fisHtml = fisRows.length ? `<section class="bridge-popup__section"><h3>Rijkswaterstaat FIS</h3>${fisRows.map(([label, value, url, openingName]) => `${popupRow(label, formatMeters(value))}<small>${escapeHtml(openingName || '')} · <a href="${escapeHtml(url || 'https://www.vaarweginformatie.nl/')}" target="_blank" rel="noopener noreferrer">Bronrecord</a></small>`).join('')}<small>Nominale maten; werkelijke vrije hoogte kan door de waterstand afwijken. Bij meerdere openingen wordt per maat de kleinste bronwaarde getoond.</small></section>` : ''

  const waterkaartHtml = waterkaartInfo ? `
    <section class="bridge-popup__section bridge-popup__section--waterkaart">
      <h3>Waterkaart Live</h3>
      ${waterkaartRows.map(([label, value]) => popupRow(label, value)).join('')}
      ${waterkaartInfo.operatingSummary?.length ? `<div class="bridge-popup__block"><span>Bediening</span><b>${waterkaartInfo.operatingSummary.map(escapeHtml).join('<br>')}</b></div>` : ''}
      ${waterkaartInfo.notes?.length ? `<div class="bridge-popup__block"><span>Let op</span><b>${waterkaartInfo.notes.map(escapeHtml).join('<br>')}</b></div>` : ''}
      <small>Bron: <a href="${escapeHtml(waterkaartInfo.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(waterkaartInfo.sourceName)}</a>${waterkaartInfo.sourceUpdatedAt ? ` · bijgewerkt ${escapeHtml(formatDate(waterkaartInfo.sourceUpdatedAt))}` : ''}</small>
    </section>
  ` : ''
  const openingsHtml = properties.fisOpenings?.length ? `<section class="bridge-popup__section"><h3>Afzonderlijke doorvaartopeningen</h3>${properties.fisOpenings.map(opening => `<p><b>${escapeHtml(opening.name)}</b><br>Hoogte gesloten: ${escapeHtml(formatMeters(opening.heightMeters) || 'Onbekend')} · Breedte: ${escapeHtml(formatMeters(opening.widthMeters) || 'Onbekend')}<br><a href="${escapeHtml(opening.sourceUrl)}" target="_blank" rel="noopener noreferrer">Rijkswaterstaat bronrecord</a></p>`).join('')}<small>De samenvatting combineert conservatieve minima. Vergelijk hoogte en breedte altijd binnen dezelfde opening. Bediening en vrije hoogte zijn niet live bevestigd.</small></section>` : ''
  return `<div class="bridge-popup"><strong>${escapeHtml(bridgeTitle(properties))}</strong>${navigationWarning ? `<p class="bridge-popup__navigation-warning">${escapeHtml(navigationWarning)} De routeplanner vermijdt deze brug altijd.</p>` : ''}${rows.map(([label, value]) => popupRow(label, value)).join('')}${routeLinkHtml}${waterkaartHtml}${fisHtml}${openingsHtml}<small>Bron: ${escapeHtml(properties.source || 'Gemeente Amsterdam')}${properties.fisBridgeSourceUrl ? ` · <a href="${escapeHtml(properties.fisBridgeSourceUrl)}" target="_blank" rel="noopener noreferrer">Brugrecord Rijkswaterstaat</a>` : ''}. NAP-bronhoogtes en vrije doorvaarthoogtes zijn verschillende maten.</small></div>`
}

function bridgeTitle(properties) {
  return [properties.name, properties.number].filter(Boolean).join(' · ') || 'Brug'
}

function displayHeight(properties) {
  if (bridgeNavigationWarning(properties)) return 'geen doorgaande route'
  const waterkaartInfo = waterkaartInfoForBridge(properties)
  const calculated = calculatedClearance(properties)
  const value = calculated ?? properties.fisClearanceMeters ?? waterkaartInfo?.clearanceHeightMeters
  if (value !== null && value !== undefined) return `${Number(value).toFixed(2)} m`
  const nap = properties.clearanceNap ?? properties.clearanceAt4mNap
  return nap === null || nap === undefined ? 'hoogte onbekend' : `${Number(nap).toFixed(2)} m NAP`
}

function hasHeight(properties) {
  return Boolean(waterkaartInfoForBridge(properties)?.clearanceHeightMeters)
    || Number(properties.fisClearanceMeters) > 0
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
