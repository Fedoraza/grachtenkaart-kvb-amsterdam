import { KNOWLEDGE_PAGES, knowledgeContent, knowledgeStructuredData } from './knowledge-base.mjs'
import { AGENT_PAGES, agentRoutingContent } from './agent-routing-docs.mjs'
import { OPERATOR_PAGES, operatorPageContent } from './public-operators.mjs'
import { EXAMPLE_PAGES, exampleRouteContent } from './public-example-routes.mjs'
import { NAVIGATION_PAGES, navigationContent } from './public-navigation.mjs'
import { ENGLISH_PAGES, ENGLISH_PARENTS, ENGLISH_NAV_LINKS, ENGLISH_HOME, englishPageContent } from './public-pages-en.mjs'
export const SITE_ORIGIN = 'https://boottracker.nl'
export const PUBLIC_PAGES = {
  ...KNOWLEDGE_PAGES,
  ...AGENT_PAGES,
  ...NAVIGATION_PAGES,
  ...EXAMPLE_PAGES,
  ...OPERATOR_PAGES,
  '/': { title: 'Amsterdam routeplanner voor de boot & live vaarkaart | Boottracker', description: 'Plan een vaarroute door Amsterdam met Boottracker. Bekijk grachten, bruggen, doorvaarthoogtes en live AIS-bootposities op de interactieve vaarkaart.' },
  '/amsterdam-routeplanner': { title: 'Amsterdam routeplanner voor boot en grachten | Boottracker', description: 'Een vaarroute plannen in Amsterdam? Ontdek de routeplanner van Boottracker met bruggen, bootafmetingen, vaartijd en AIS op de Amsterdamse grachten.' },
  '/flagship-vloot': { title: 'Flagship-vloot Amsterdam volgen met AIS | Boottracker', description: 'Bekijk de in Boottracker opgenomen Flagship-vloot in Amsterdam. Zoek boten op naam, bekijk de beschikbare AIS-status en open de vaarkaart.' },
  '/vlootstatistieken': { title: 'Vlootstatistieken Amsterdam: rederijen en AIS-activiteit | Boottracker', description: 'Vergelijk actieve boten, kilometers, vaaruren, vaarwegen en AIS-ontvangst van Amsterdamse rederijen in het statistiekdashboard.' },
  ...ENGLISH_PAGES,
  '/km-leaderboard': { title: 'Amsterdamse vloot: kilometerklassement met AIS | Boottracker', description: 'Bekijk het dagelijkse kilometerklassement van de Amsterdamse bedrijfsvloot in Boottracker, berekend met ontvangen AIS-posities.' },
}
// Dutch path -> English path for every page that has a full English edition.
const ENGLISH_BY_DUTCH = Object.fromEntries(Object.entries(ENGLISH_PAGES).map(([path, page]) => [page.nlPath, path]))
export const isEnglishPage = path => Object.hasOwn(ENGLISH_PAGES, path)
// Both editions of a translated page, or null when the page is Dutch-only.
export function pageAlternates(path) {
  if (isEnglishPage(path)) return { nl: ENGLISH_PAGES[path].nlPath, en: path }
  return ENGLISH_BY_DUTCH[path] ? { nl: path, en: ENGLISH_BY_DUTCH[path] } : null
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const json = value => JSON.stringify(value).replace(/</g, '\\u003c')

export function pageHead(path) {
  const page = PUBLIC_PAGES[path]
  if (!page) throw new Error('Unknown public page')
  const url = `${SITE_ORIGIN}${path}`
  const english = isEnglishPage(path)
  const alternates = pageAlternates(path)
  // x-default points at the Dutch edition, the site's primary language.
  const hreflang = alternates ? `<link rel="alternate" hreflang="nl" href="${SITE_ORIGIN}${alternates.nl}">
<link rel="alternate" hreflang="en" href="${SITE_ORIGIN}${alternates.en}">
<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${alternates.nl}">
` : ''
  return `<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
${hreflang}<link rel="service-desc" type="application/json" href="/openapi.json">
<meta property="og:type" content="website"><meta property="og:site_name" content="Boottracker">
<meta property="og:locale" content="${english ? 'en_GB' : 'nl_NL'}">${alternates ? `<meta property="og:locale:alternate" content="${english ? 'nl_NL' : 'en_GB'}">` : ''}<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(page.title)}">
<meta name="twitter:description" content="${escape(page.description)}">`
}

export function isPublicInformationPage(path) {
  return isEnglishPage(path) || Object.hasOwn(KNOWLEDGE_PAGES, path) || Object.hasOwn(AGENT_PAGES, path) || Object.hasOwn(OPERATOR_PAGES, path) || Object.hasOwn(EXAMPLE_PAGES, path) || Object.hasOwn(NAVIGATION_PAGES, path) || ['/amsterdam-routeplanner', '/flagship-vloot'].includes(path)
}

export function sitemapXml() {
  const alternateLinks = path => {
    const alternates = pageAlternates(path)
    return alternates ? ['nl', 'en'].map(lang => `<xhtml:link rel="alternate" hreflang="${lang}" href="${SITE_ORIGIN}${alternates[lang]}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${alternates.nl}"/>` : ''
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${Object.keys(PUBLIC_PAGES).map(path => `<url><loc>${SITE_ORIGIN}${path}</loc>${alternateLinks(path)}</url>`).join('')}</urlset>`
}
export function robotsTxt() {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/routeplanner/route\nAllow: /api/shared-routes/\nDisallow: /healthz\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`
}

// A deliberate public projection: operational notes, crew and schedules never
// enter the page model, even when an administrator requests the same URL.
export function publicFleetEntries(database, now = Date.now()) {
  return database.prepare(`SELECT b.name, b.mmsi, b.capacity, b.boat_type,
    b.length_m, b.width_m, v.data AS ais_data
    FROM fleet_boats b LEFT JOIN vessels v ON v.mmsi = b.mmsi
    WHERE b.active = 1 ORDER BY b.name`).all().map(boat => {
    let ais
    try { ais = JSON.parse(boat.ais_data || 'null') } catch { ais = null }
    const raw = ais?.sourceReceivedAt || ais?.receivedAt
    const parsed = typeof raw === 'number' ? raw : Date.parse(raw)
    const lastSeen = Number.isFinite(parsed) && parsed <= now ? parsed : null
    const located = Number.isFinite(ais?.latitude) && Number.isFinite(ais?.longitude)
      && Math.abs(ais.latitude) <= 90 && Math.abs(ais.longitude) <= 180
    return {
      name: boat.name, mmsi: boat.mmsi, capacity: boat.capacity,
      type: boat.boat_type, length: boat.length_m, width: boat.width_m,
      lastSeen, recent: lastSeen !== null && now - lastSeen <= 15 * 60_000,
      mapUrl: located && /^\d{9}$/.test(boat.mmsi || '') ? `/?boat=${boat.mmsi}` : null,
    }
  })
}

const links = `<a href="/kennisbank">Kennisbank</a><a href="/vaarroutes-amsterdam">Vaarroutes</a><a href="/bruggen-amsterdam">Bruggen</a><a href="/grachten-amsterdam">Grachten</a><a href="/over-boottracker">Bronnen</a><a href="/amsterdam-routeplanner">Amsterdam routeplanner</a><a href="/rederijen-amsterdam">Rederijen en boten</a><a href="/km-leaderboard">Kilometerklassement</a><a href="/vlootstatistieken">Vlootstatistieken</a>`
function routeContent() {
  return `<section class="hero"><div><p class="eyebrow">Amsterdam · Vaarrouteplanner</p><h1>Jouw route door de Amsterdamse grachten.</h1><p class="lead">Plan een vaarroute in Amsterdam met een kaart die bruggen, doorvaarthoogtes en bootposities samenbrengt. Van een tocht over de Prinsengracht tot een verbinding via de Nieuwe Herengracht.</p><div class="actions"><a class="button" href="/?planner=1">Plan je vaarroute <span aria-hidden="true">↗</span></a><a class="text-link" href="/">Open de vaarkaart →</a></div><p class="caption">De vaarkaart en routeplanner zijn zonder account te openen.</p></div><div class="canal-graphic" aria-hidden="true"><span class="canal-label label-a">Prinsengracht</span><span class="canal-label label-b">Herengracht</span><svg viewBox="0 0 400 400" fill="none"><path d="M-50 90Q200 40 240 450M-20 160Q140 90 160 450M-50 240Q80 160 80 450" stroke="#93c5fd" stroke-opacity=".28" stroke-width="32"/><path d="M400 50Q150 120 20 340" stroke="#93c5fd" stroke-opacity=".28" stroke-width="26"/><path d="M38 313Q120 200 205 143Q223 220 230 296" stroke="#22d3ee" stroke-width="5" stroke-linecap="round" stroke-dasharray="8 10"/><circle cx="38" cy="313" r="10" fill="#22d3ee" stroke="#0b1625" stroke-width="4"/><circle cx="230" cy="296" r="10" fill="#fcd34d" stroke="#0b1625" stroke-width="4"/></svg><span class="graphic-note">Je volgende vaartocht begint hier</span></div></section>
<section class="feature-grid" aria-label="Mogelijkheden"><article><span class="feature-number">01 / ROUTE</span><h2>Van vertrek tot bestemming</h2><p>Kies punten op de kaart of zoek een adres. Bekijk de afstand en een schatting van de vaartijd op basis van je ingestelde snelheid.</p></article><article><span class="feature-number">02 / BRUGGEN</span><h2>Een route die bij je boot past</h2><p>Vul je bootafmetingen in en bekijk de beschikbare bruggegevens langs je route. De planner houdt rekening met de beperkingen die in de kaartdata zijn opgenomen.</p></article><article><span class="feature-number">03 / LIVE AIS</span><h2>Meer zicht op het water</h2><p>Bekijk ontvangen AIS-bootposities op de vaarkaart. De zichtbaarheid hangt af van AIS-uitzendingen en de ontvangst van die signalen.</p></article></section>
<section class="split-section"><div><p class="eyebrow">Zo werkt het</p><h2>Een vaarroute plannen in Amsterdam</h2><p>Boottracker is bedoeld voor het plannen en bekijken van routes over het water. De kaart combineert Amsterdamse vaarlijnen met de beschikbare bruggegevens en AIS-informatie.</p><a class="text-link" href="/?planner=1">Open de Amsterdam routeplanner →</a></div><ol class="steps"><li><strong>Kies je vertrek- en eindpunt</strong><span>Zoek een locatie of prik de punten op de kaart.</span></li><li><strong>Vul je boot en snelheid in</strong><span>Gebruik de afmetingen van de boot waarmee je gaat varen.</span></li><li><strong>Bekijk de route en bruggen</strong><span>Controleer de beschikbare doorvaarthoogtes, afstand en geschatte vaartijd.</span></li></ol></section>
<section class="guide-section"><h2>Bereid je vaartocht voor</h2><p>Bekijk <a href="/vaarroutes-amsterdam">voorbeeldvaarroutes</a>, <a href="/bruggen-amsterdam">brughoogtes en breedtes</a>, vergelijk <a href="/grachten-amsterdam">grachtprofielen</a> en lees hoe <a href="/doorvaarthoogte-amsterdam">waterstand en doorvaarthoogte</a> samenhangen.</p></section><section class="faq"><p class="eyebrow">Goed om te weten</p><h2>Vragen over de vaarrouteplanner</h2><details open><summary>Kan ik de routeplanner zonder account gebruiken?</summary><p>Ja. De vaarkaart en routeplanner zijn openbaar. Voor accountfuncties, zoals het bewaren van persoonlijke gegevens, kun je inloggen.</p></details><details><summary>Welke grachten kan ik op de kaart vinden?</summary><p>Onder andere de Prinsengracht, Keizersgracht, Herengracht en Nieuwe Herengracht. Welke route mogelijk is, hangt af van de opgenomen vaarlijnen, beperkingen en je bootinstellingen.</p></details><details><summary>Zijn alle brughoogtes en stremmingen bekend?</summary><p>Niet alle bruggen hebben volledige gegevens. Controleer de aangegeven beperkingen en de situatie ter plaatse; borden, actuele aanwijzingen en de werkelijke waterstand blijven bepalend.</p></details><details><summary>Kan ik boten van verschillende rederijen volgen?</summary><p>Het <a href="/rederijen-amsterdam">rederijenoverzicht</a> bevat onder meer Flagship, LOVERS/Lovely, Smidtje, Stromma, P. Kooij, Blue Boat, Plas, Pure Boats en KINboat. Als een AIS-positie beschikbaar is, kun je die op de kaart openen.</p></details></section>`
}
function boatCard(boat) {
  const facts = [boat.type, Number(boat.capacity) > 0 ? `${boat.capacity} personen` : null,
    Number(boat.length) > 0 ? `${boat.length} m lang` : null].filter(Boolean)
  return `<article class="boat-card" data-boat-name="${escape(boat.name.toLocaleLowerCase('nl'))}"><div class="boat-heading"><span class="boat-icon" aria-hidden="true">⚓</span><span class="status ${boat.recent ? 'status-live' : ''}">${boat.recent ? 'Recent AIS-signaal' : 'Geen recent AIS-signaal'}</span></div><h3>${escape(boat.name)}</h3>${facts.length ? `<p>${facts.map(escape).join(' · ')}</p>` : '<p>Opgenomen in de Boottracker-vloot</p>'}${boat.mmsi ? `<span class="caption">MMSI ${escape(boat.mmsi)}</span>` : ''}${boat.lastSeen ? `<p class="caption">Laatste signaal: ${escape(new Date(boat.lastSeen).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' }))}</p>` : ''}${boat.mapUrl ? `<a class="text-link" href="${escape(boat.mapUrl)}">Bekijk laatst bekende positie →</a>` : '<span class="caption">Nog geen AIS-positie beschikbaar</span>'}</article>`
}
function fleetContent(boats, now) {
  const count = boats.length
  return `<section class="fleet-hero"><p class="eyebrow">Amsterdam · Vlootoverzicht</p><h1>De Flagship-vloot.<br><span>In beeld met Boottracker.</span></h1><p class="lead">Zoek een boot op naam, bekijk de beschikbare AIS-status en open de laatst bekende positie op de Amsterdamse vaarkaart. Dit overzicht toont de bedrijfsvloot zoals die in Boottracker is opgenomen.</p><div class="actions"><a class="button" href="/">Open de live vaarkaart ↗</a><a class="text-link" href="/km-leaderboard">Bekijk het kilometerklassement →</a></div></section>
<section class="fleet-stats" aria-label="Vlootcijfers"><div><strong>${count}</strong><span>Boten in Boottracker</span></div><div><strong>${boats.filter(boat => boat.recent).length}</strong><span>Recent AIS-signaal</span></div><div><strong>Amsterdam</strong><span>Grachten en vaarwater</span></div></section>
<section class="fleet-directory"><div class="section-heading"><div><p class="eyebrow">Boten vinden</p><h2>Flagship-vloot in Amsterdam</h2></div><a class="text-link" href="/flagship-vloot">Vernieuw overzicht ↻</a></div><p class="caption">Stand bij laden: ${escape(new Date(now).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'long', timeStyle: 'short' }))}. Een recent AIS-signaal is maximaal 15 minuten oud.</p><label class="boat-search" hidden data-search-label>Zoek op bootnaam<input type="search" data-boat-search placeholder="Bijvoorbeeld Roos, Old Queen of Iris" autocomplete="off"></label><p class="caption" data-result-count aria-live="polite">${count} boten opgenomen</p><div class="boat-grid">${boats.map(boatCard).join('')}</div><p data-no-results hidden>Geen boot gevonden. Probeer een andere naam.</p>${!count ? '<p class="empty-state">Er zijn op dit moment geen boten beschikbaar in het openbare overzicht. Bekijk de <a href="/">vaarkaart</a> of probeer het later opnieuw.</p>' : ''}</section>
<section class="split-section"><div><p class="eyebrow">Boottracker op het water</p><h2>Van bootnaam naar vaarkaart</h2><p>AIS geeft inzicht in ontvangen bootposities. Een boot zonder recent signaal hoeft niet stil te liggen: de zender kan uitstaan, het signaal kan ontbreken of de ontvangst kan vertraagd zijn. Het overzicht is geen volledige of gegarandeerd actuele inventaris van Flagship Amsterdam.</p></div><div><h2>Ook een route plannen?</h2><p>Gebruik de <a href="/amsterdam-routeplanner">Amsterdam routeplanner</a> voor een vaarroute met afstand, geschatte vaartijd en beschikbare bruggegevens.</p><p class="caption">Je bekijkt Boottracker, een vaarkaart en vloottracker. Voor rondvaarten, beschikbaarheid en boekingen ga je naar de <a href="https://flagshipamsterdam.com/our-boats/" rel="external">officiële website van Flagship Amsterdam</a>.</p></div></section>`
}

export function renderPublicPage(path, { boats = [], scriptUrl = '/src/publicPages.js', now = Date.now(), bridgeCollection, operatorGroups, searchParams } = {}) {
  if (!isPublicInformationPage(path)) throw new Error('Unknown public page')
  if (isEnglishPage(path)) return renderEnglishPage(path, { scriptUrl, bridgeCollection })
  const fleet = path === '/flagship-vloot'
  const navigation = Object.hasOwn(NAVIGATION_PAGES, path)
  const knowledge = Object.hasOwn(KNOWLEDGE_PAGES, path)
  const content = knowledge ? knowledgeContent(path, { searchParams }) : Object.hasOwn(AGENT_PAGES, path) ? agentRoutingContent() : Object.hasOwn(OPERATOR_PAGES, path) ? operatorPageContent(path, { operatorGroups }) : Object.hasOwn(EXAMPLE_PAGES, path) ? exampleRouteContent(path) : navigation ? navigationContent(path, { bridgeCollection }) : fleet ? fleetContent(boats, now) : routeContent()
  const parent = path.startsWith('/kennisbank/') ? '/kennisbank' : path.startsWith('/rederijen-amsterdam/') ? '/rederijen-amsterdam' : path.startsWith('/vaarroutes-amsterdam/') ? '/vaarroutes-amsterdam' : path.startsWith('/bruggen-amsterdam/') ? '/bruggen-amsterdam' : path.startsWith('/grachten-amsterdam/') ? '/grachten-amsterdam' : null
  const crumbs = [{ path: '/', name: 'Boottracker' }, ...(parent ? [{ path: parent, name: parent === '/kennisbank' ? 'Kennisbank' : parent === '/rederijen-amsterdam' ? 'Rederijen Amsterdam' : parent === '/vaarroutes-amsterdam' ? 'Voorbeeldvaarroutes' : parent === '/bruggen-amsterdam' ? 'Bruggen Amsterdam' : 'Grachten Amsterdam' }] : []), { path, name: PUBLIC_PAGES[path].title.split(' | ')[0] }]
  const breadcrumbHtml = `<nav class="breadcrumbs" aria-label="Kruimelpad">${crumbs.map((item, index) => index === crumbs.length - 1 ? `<span aria-current="page">${escape(item.name)}</span>` : `<a href="${item.path}">${escape(item.name)}</a>`).join(' <span aria-hidden="true">/</span> ')}</nav>`
  const structuredData = {
    '@context': 'https://schema.org', '@type': fleet ? 'CollectionPage' : 'WebPage',
    name: PUBLIC_PAGES[path].title, description: PUBLIC_PAGES[path].description,
    url: `${SITE_ORIGIN}${path}`, inLanguage: 'nl-NL',
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: crumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: `${SITE_ORIGIN}${item.path}` })) },
    isPartOf: { '@type': 'WebSite', name: 'Boottracker', url: `${SITE_ORIGIN}/` },
    ...(knowledge ? knowledgeStructuredData(path) : {}),
    ...(fleet && boats.length ? { mainEntity: { '@type': 'ItemList', itemListElement: boats.map((boat, index) => ({ '@type': 'ListItem', position: index + 1, item: { '@type': 'Thing', name: boat.name } })) } } : {}),
  }
  return `<!doctype html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${pageHead(path)}<meta name="theme-color" content="#091422"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/public-pages.css"><script type="application/ld+json">${json(structuredData)}</script><script type="module" src="${escape(scriptUrl)}"></script></head><body data-usage-page="${knowledge ? 'knowledge' : fleet ? 'fleet' : 'routeplanner'}"><a class="skip-link" href="#content">Naar de inhoud</a><header class="site-header"><a class="brand" href="/" aria-label="Boottracker vaarkaart"><span class="brand-mark" aria-hidden="true">↗</span>Boottracker<span class="brand-city">Amsterdam</span></a><nav aria-label="Hoofdnavigatie">${links}${languageLink(path)}<a class="nav-map" href="/">Open kaart ↗</a></nav></header><main id="content">${breadcrumbHtml}${content}</main><footer><a class="brand" href="/">Boottracker</a><p>Een beter overzicht van de Amsterdamse waterwegen.</p><nav aria-label="Voetnavigatie">${links}</nav><span class="caption">Kaartgegevens en ontvangen AIS-signalen kunnen onvolledig of vertraagd zijn.</span></footer></body></html>`
}

function languageLink(path) {
  const alternates = pageAlternates(path)
  if (!alternates) return ''
  return isEnglishPage(path)
    ? `<a href="${alternates.nl}" hreflang="nl" lang="nl">Nederlands</a>`
    : `<a href="${alternates.en}" hreflang="en" lang="en">English</a>`
}

function renderEnglishPage(path, { scriptUrl, bridgeCollection }) {
  const page = PUBLIC_PAGES[path]
  const content = englishPageContent(path, { bridgeCollection })
  const parent = ENGLISH_PARENTS.find(([prefix]) => path.startsWith(prefix))
  const crumbs = [{ path: ENGLISH_HOME, name: 'Boottracker' }, ...(parent ? [{ path: parent[1], name: parent[2] }] : []), ...(path === ENGLISH_HOME ? [] : [{ path, name: page.title.split(' | ')[0] }])]
  const breadcrumbHtml = `<nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs.map((item, index) => index === crumbs.length - 1 ? `<span aria-current="page">${escape(item.name)}</span>` : `<a href="${item.path}">${escape(item.name)}</a>`).join(' <span aria-hidden="true">/</span> ')}</nav>`
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: page.title, description: page.description, url: `${SITE_ORIGIN}${path}`, inLanguage: 'en-GB',
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: crumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: `${SITE_ORIGIN}${item.path}` })) },
    isPartOf: { '@type': 'WebSite', name: 'Boottracker', url: `${SITE_ORIGIN}/` },
  }
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${pageHead(path)}<meta name="theme-color" content="#091422"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/public-pages.css"><script type="application/ld+json">${json(structuredData)}</script><script type="module" src="${escape(scriptUrl)}"></script></head><body data-usage-page="routeplanner"><a class="skip-link" href="#content">Skip to content</a><header class="site-header"><a class="brand" href="${ENGLISH_HOME}" aria-label="Boottracker Amsterdam"><span class="brand-mark" aria-hidden="true">↗</span>Boottracker<span class="brand-city">Amsterdam</span></a><nav aria-label="Main navigation">${ENGLISH_NAV_LINKS}${languageLink(path)}<a class="nav-map" href="/">Open map ↗</a></nav></header><main id="content">${breadcrumbHtml}${content}</main><footer><a class="brand" href="${ENGLISH_HOME}">Boottracker</a><p>A clearer view of Amsterdam's waterways.</p><nav aria-label="Footer navigation">${ENGLISH_NAV_LINKS}${languageLink(path)}</nav><span class="caption">Map data and received AIS signals can be incomplete or delayed.</span></footer></body></html>`
}
