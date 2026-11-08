const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const text = (value, limit = 300) => typeof value === 'string' ? value.slice(0, limit) : ''
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const json = value => JSON.stringify(value).replace(/</g, '\\u003c')
const coordinate = p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(v => typeof v === 'number' && Number.isFinite(v)) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180

// Explicit projection: shared names are data, never HTML or agent instructions.
export function sharedRouteDocument(stored, reporting = []) {
  const route = JSON.parse(stored.route_json)
  const result = route.result || {}
  const coordinates = (Array.isArray(result.coordinates) ? result.coordinates : []).filter(coordinate).slice(0, 5000).map(p => [p[1], p[0]])
  const status = ['ok', 'partial', 'no-route'].includes(result.status) ? result.status : 'unknown'
  return {
    name: text(route.name, 100) || 'Gedeelde vaarroute', status, complete: status === 'ok',
    createdAt: new Date(stored.created_at).toISOString(), expiresAt: new Date(stored.expires_at).toISOString(),
    distanceMeters: number(result.distanceMeters), durationMinutes: number(result.durationMinutes),
    speedKmh: number(result.speedKmh),
    virtualSegmentCount: number(result.virtualSegmentCount),
    geometry: { type: 'LineString', coordinates },
    points: (Array.isArray(route.points) ? route.points : []).slice(0, 50).filter(p => p && coordinate([p.latitude,p.longitude])).map(p => ({name:text(p.name,120),role:['start','end','waypoint'].includes(p.role)?p.role:'waypoint',latitude:p.latitude,longitude:p.longitude})),
    steps: (Array.isArray(result.steps) ? result.steps : []).slice(0,500).map(s => ({name:text(s?.name,120),distanceMeters:number(s?.distanceMeters)})),
    warnings: (Array.isArray(result.warnings) ? result.warnings : []).slice(0,50).map(w => text(w)),
    boatProfile: Object.fromEntries(['heightMeters','widthMeters','lengthMeters','draftMeters','safetyMarginMeters'].map(k => [k, number(route.settings?.boatProfile?.[k])])),
    reportingPoints: reporting.slice(0,500).map(p => ({name:text(p.name,120),number:text(String(p.number ?? ''),40),call:text(p.call,500),source:text(p.source),routeMeters:number(p.routeMeters),latitude:p.latitude,longitude:p.longitude})),
    reportingNote: 'Meldpunten zijn bij het lezen gekoppeld aan de opgeslagen vaarlijn met de huidige Boottracker-kaartgegevens. Dit is geen volledige of juridisch geverifieerde lijst van verplichte VTS-meldingen.',
    reportingCalculatedAt: new Date().toISOString(),
    snapshotNote: 'Opgeslagen route, geen nieuwe routeberekening. Actuele stremmingen, waterstanden, vergunningen en brugbediening zijn niet opnieuw gecontroleerd.',
  }
}

export function renderSharedRoutePage(template, document, token) {
  const url = `https://boottracker.nl/?route=${token}`
  const api = `/api/shared-routes/${token}`
  const title = `${document.name} · Gedeelde vaarroute | Boottracker`
  const distance = document.distanceMeters === null ? 'onbekend' : `${document.distanceMeters} m`
  const duration = document.durationMinutes === null ? 'onbekend' : `${document.durationMinutes} minuten`
  const description = `Gedeelde vaarroute: ${document.name}. Afstand ${distance}, geschatte vaartijd ${duration}. Vaarlijn, routepunten en vaarwegen zonder JavaScript.`
  const list = (items, render) => items.map(render).join('')
  const summary = `<main id="shared-route-summary" style="padding:24px;max-width:1000px;margin:auto;font-family:system-ui;line-height:1.6;overflow-wrap:anywhere"><h1>${escape(document.name)}</h1><p>Gedeelde vaarroute · ${document.complete ? 'Bestemming bereikt in de opgeslagen berekening' : 'Geen bevestigde volledige route: '+escape(document.status)}</p><dl><dt>Afstand</dt><dd>${escape(distance)}</dd><dt>Geschatte vaartijd</dt><dd>${escape(duration)}</dd><dt>Aangemaakt</dt><dd>${escape(document.createdAt)}</dd><dt>Beschikbaar tot</dt><dd>${escape(document.expiresAt)}</dd></dl><p>${escape(document.snapshotNote)}</p><p>Hieronder staat de opgeslagen route volledig leesbaar zonder JavaScript. De interactieve kaart wordt geladen als JavaScript beschikbaar is. <a href="${api}">Opgeslagen route als JSON</a> · <a href="${api}?format=geojson">Exacte vaarlijn als GeoJSON</a></p>
<h2>Vertrek, tussenpunten en bestemming</h2><ol>${list(document.points,p=>`<li>${escape(p.role)}: ${escape(p.name || 'Routepunt')} — breedtegraad ${p.latitude}, lengtegraad ${p.longitude}</li>`)}</ol>
<h2>Vaarwegen in routevolgorde</h2><ol>${list(document.steps,s=>`<li>${escape(s.name || 'Naamloos water')} — ${s.distanceMeters ?? 'onbekend'} m</li>`)}</ol>
<h2>Opgeslagen bootafmetingen</h2><ul>${list(Object.entries(document.boatProfile),([k,v])=>`<li>${k}: ${v === null ? 'niet opgegeven' : v+' m'}</li>`)}</ul>
<h2>Waarschuwingen uit de route</h2>${document.virtualSegmentCount ? `<p>De opgeslagen vaarlijn bevat ${document.virtualSegmentCount} virtuele kaartverbindingen. Controleer deze overgangen afzonderlijk.</p>` : ''}${document.warnings.length ? `<ul>${list(document.warnings,w=>`<li>${escape(w)}</li>`)}</ul>` : '<p>Geen waarschuwingen opgeslagen; dit bevestigt geen vrije of veilige passage.</p>'}
<h2>Gekoppelde marifoonmeldpunten</h2><p>${escape(document.reportingNote)}</p>${document.reportingPoints.length ? `<ol>${list(document.reportingPoints,p=>`<li>${escape(p.number)} · ${escape(p.name)} · na ${p.routeMeters === null ? '?' : Math.round(p.routeMeters)} m: ${escape(p.call)}. Bron: ${escape(p.source)}</li>`)}</ol>` : '<p>Geen meldpunten gekoppeld in de beschikbare kaartgegevens. Dit betekent niet dat er geen meldplicht geldt.</p>'}
<h2>Exacte vaarlijn (WGS84)</h2><p>Volledige reeks in vaarvolgorde; GeoJSON gebruikt [lengtegraad, breedtegraad]. Deze tabel toont beide assen met hun naam.</p><details><summary>Alle ${document.geometry.coordinates.length} coördinaten</summary><table><thead><tr><th>Punt</th><th>Lengtegraad</th><th>Breedtegraad</th></tr></thead><tbody>${list(document.geometry.coordinates,([lng,lat],i)=>`<tr><td>${i+1}</td><td>${lng}</td><td>${lat}</td></tr>`)}</tbody></table></details><p><a href="/routeplanner-api">API-documentatie</a> · <a href="/over-boottracker">Bronnen</a></p></main>`
  let html = template.replace(/<title>[\s\S]*?<\/title>/gi,'').replace(/<meta[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/gi,'').replace(/<link[^>]*rel="canonical"[^>]*>/gi,'')
  html = html.replace('</head>', () => `<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${escape(url)}"><link rel="alternate" type="application/json" href="${api}"><link rel="alternate" type="application/geo+json" href="${api}?format=geojson"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}"><script type="application/ld+json">${json({'@context':'https://schema.org','@type':'Dataset',name:document.name,description, url,distribution:{'@type':'DataDownload',contentUrl:`https://boottracker.nl${api}?format=geojson`,encodingFormat:'application/geo+json'}})}</script></head>`)
  html = html.replace(/<div id="app">[\s\S]*?<\/div>/, () => `<div id="app">${summary}</div>`)
  return html
}

export function unavailableSharedRoutePage() {
  return '<!doctype html><html lang="nl"><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Gedeelde route niet beschikbaar | Boottracker</title><h1>Gedeelde route niet beschikbaar</h1><p>De link is ongeldig, verlopen of verwijderd. Vraag de afzender om een nieuwe routelink.</p><a href="/">Open de vaarkaart</a></html>'
}
