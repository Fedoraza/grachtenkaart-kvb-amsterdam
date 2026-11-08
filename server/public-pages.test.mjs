import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { PUBLIC_PAGES, SITE_ORIGIN, pageHead, publicFleetEntries, renderPublicPage, robotsTxt, sitemapXml } from './public-pages.mjs'
import { existsSync, statSync } from 'node:fs'
// A link to a real file in public/ (stylesheet, icon, manifest, docs) is valid.
const isPublicAsset = (href) => { const file = new URL(`../public${href}`, import.meta.url); return existsSync(file) && statSync(file).isFile() }

const now = Date.parse('2026-10-17T10:00:00Z')
test('public search pages have distinct titles, descriptions and canonical URLs', () => {
  const titles = new Set()
  for (const [path, page] of Object.entries(PUBLIC_PAGES)) {
    titles.add(page.title)
    const head = pageHead(path)
    assert.ok(head.includes(`href="${SITE_ORIGIN}${path}"`))
    assert.ok(head.includes('index,follow'))
    assert.ok(head.includes('name="description"'))
    assert.ok(head.includes('property="og:url"'))
  }
  assert.equal(titles.size, Object.keys(PUBLIC_PAGES).length)
  assert.throws(() => pageHead('/not-a-page'))
})

test('sitemap lists real public pages and robots leaves pages and assets crawlable', () => {
  const sitemap = sitemapXml()
  for (const path of Object.keys(PUBLIC_PAGES)) assert.ok(sitemap.includes(`<loc>https://boottracker.nl${path}</loc>`))
  assert.ok(!sitemap.includes('/api/'))
  assert.ok(robotsTxt().includes('Sitemap: https://boottracker.nl/sitemap.xml'))
  assert.ok(robotsTxt().includes('Disallow: /api/'))
  assert.ok(!robotsTxt().includes('Disallow: /assets'))
})

test('route planner information is readable without JavaScript and links to the actual planner', () => {
  const html = renderPublicPage('/amsterdam-routeplanner', { now })
  assert.ok(html.includes('Jouw route door de Amsterdamse grachten.'))
  assert.ok(html.includes('href="/?planner=1"'))
  assert.ok(html.includes('doorvaarthoogtes'))
  assert.ok(html.includes('href="/rederijen-amsterdam"'))
  assert.equal((html.match(/<h1>/g) || []).length, 1)
  assert.ok(html.includes('<html lang="nl">'))
})

test('fleet names are in the initial HTML; HTML and structured data escape stored content safely', () => {
  const maliciousName = 'Roos </script><img src=x onerror=alert(1)>'
  const html = renderPublicPage('/flagship-vloot', { now, boats: [{ name: maliciousName, mmsi: '244070458', capacity: 35, recent: true, lastSeen: now, mapUrl: '/?boat=244070458' }] })
  assert.ok(html.includes('Roos &lt;/script&gt;&lt;img'))
  assert.ok(!html.includes(maliciousName))
  assert.ok(html.includes('href="/?boat=244070458"'))
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])
  assert.equal(data['@type'], 'CollectionPage')
  assert.equal(data.mainEntity.itemListElement[0].item.name, maliciousName)
  assert.equal(data.isPartOf.name, 'Boottracker')
  assert.ok(html.includes('officiële website van Flagship Amsterdam'))
})

test('public fleet projection excludes private operations and inactive boats, handles missing AIS', t => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE fleet_boats(name TEXT, mmsi TEXT, capacity INTEGER, boat_type TEXT, length_m REAL, width_m REAL, active INTEGER, notes TEXT);
    CREATE TABLE vessels(mmsi TEXT, data TEXT);
    INSERT INTO fleet_boats VALUES ('Roos','244070458',35,'Sloep',12,3,1,'PRIVATE CREW NOTE');
    INSERT INTO fleet_boats VALUES ('Hidden','244070459',35,'Sloep',12,3,0,'PRIVATE CREW NOTE');
    INSERT INTO fleet_boats VALUES ('Missing AIS','244070460',NULL,NULL,NULL,NULL,1,'PRIVATE CREW NOTE');`)
  db.prepare('INSERT INTO vessels VALUES (?, ?)').run('244070458', JSON.stringify({ receivedAt: new Date(now - 60_000).toISOString(), latitude: 52.37, longitude: 4.9, privateField: 'PRIVATE AIS DATA' }))
  const boats = publicFleetEntries(db, now)
  assert.equal(boats.length, 2)
  const roos = boats.find(boat => boat.name === 'Roos')
  assert.equal(roos.recent, true)
  assert.equal(roos.mapUrl, '/?boat=244070458')
  assert.equal(boats.find(boat => boat.name === 'Missing AIS').recent, false)
  assert.equal(boats.find(boat => boat.name === 'Missing AIS').mapUrl, null)
  assert.ok(!JSON.stringify(boats).includes('PRIVATE'))
  const stale = publicFleetEntries(db, now + 16 * 60_000).find(boat => boat.name === 'Roos')
  assert.equal(stale.recent, false)
})

test('empty fleet page states that no data is available instead of inventing boats', () => {
  const html = renderPublicPage('/flagship-vloot', { now })
  assert.ok(html.includes('geen boten beschikbaar'))
  assert.ok(!html.includes('data-boat-name='))
})

test('all navigation pages render useful initial HTML, metadata and valid breadcrumbs', async () => {
  const { NAVIGATION_PAGES, BRIDGE_GUIDES } = await import('./public-navigation.mjs')
  for (const path of Object.keys(NAVIGATION_PAGES)) {
    const html = renderPublicPage(path, { bridgeCollection: { fetchedAt: now, features: [{ properties: { number: 'BRU0487', fisClearanceMeters: 3.94, fisPassageWidthMeters: 12 } }] } })
    assert.equal((html.match(/<h1>/g) || []).length, 1, path)
    assert.ok(html.includes(`href="${SITE_ORIGIN}${path}"`), path)
    assert.ok(html.includes('aria-label="Kruimelpad"'))
    const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])
    assert.equal(data.breadcrumb.itemListElement.at(-1).item, `${SITE_ORIGIN}${path}`)
    assert.ok(sitemapXml().includes(`<loc>${SITE_ORIGIN}${path}</loc>`))
  }
  const html = renderPublicPage(BRIDGE_GUIDES[0].path, { bridgeCollection: { fetchedAt: now, features: [{ properties: { number: 'BRU0487', fisClearanceMeters: 3.94, fisPassageWidthMeters: 12 } }] } })
  assert.ok(html.includes('3,94 m'))
  assert.ok(html.includes('12 m'))
  assert.ok(html.includes('href="/?bridge=BRU0487"'))
})

test('public bridge projection never invents missing measurements or renders unsafe sources', async () => {
  const { bridgePageData } = await import('./public-navigation.mjs')
  const input = { properties: { clearanceNap: 1.6, winterWaterLevelNap: -0.4, passageWidth: null, fisSourceUrl: 'javascript:alert(1)', notes: 'PRIVATE' } }
  const data = bridgePageData(input, now)
  assert.equal(data.height, 2)
  assert.equal(data.width, null)
  assert.equal(data.heightSource, null)
  assert.ok(!JSON.stringify(data).includes('PRIVATE'))
  const html = renderPublicPage('/bruggen-amsterdam/kortjewantsbrug', { bridgeCollection: { features: [{ properties: { number: 'BRU0487', fisOpeningName: '<script>alert(1)</script>', fisSourceUrl: 'javascript:alert(1)', fisClearanceMeters: 3.94 } }] } })
  assert.ok(!html.includes('href="javascript:'))
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('Onbekend'))
  assert.ok(renderPublicPage('/bruggen-amsterdam/kortjewantsbrug').includes('tijdelijk niet beschikbaar'))
})

test('all local information links lead to registered pages, actual map links or assets', async () => {
  const { NAVIGATION_PAGES } = await import('./public-navigation.mjs')
  for (const path of ['/amsterdam-routeplanner', '/flagship-vloot', ...Object.keys(NAVIGATION_PAGES)]) {
    const html = renderPublicPage(path)
    for (const [, href] of html.matchAll(/href="(\/[^"?#]*)[^"]*"/g)) {
      assert.ok(Object.hasOwn(PUBLIC_PAGES, href) || isPublicAsset(href), `${path} -> ${href}`)
    }
  }
})

test('sample routes expose indicative facts, recalculation links and genuine copyable links', async () => {
  const { EXAMPLE_PAGES } = await import('./public-example-routes.mjs')
  for (const path of Object.keys(EXAMPLE_PAGES)) {
    const html = renderPublicPage(path)
    assert.equal((html.match(/<h1>/g) || []).length, 1)
    assert.ok(html.includes(`href="${SITE_ORIGIN}${path}"`))
    assert.ok(sitemapXml().includes(`<loc>${SITE_ORIGIN}${path}</loc>`))
    for (const [, href] of html.matchAll(/href="(\/[^"?#]*)[^"]*"/g)) assert.ok(Object.hasOwn(PUBLIC_PAGES, href) || isPublicAsset(href), `${path} -> ${href}`)
  }
  const route = renderPublicPage('/vaarroutes-amsterdam/herengracht-noord-zuid')
  assert.ok(route.includes('2,22 km'))
  assert.ok(route.includes('22 minuten'))
  assert.ok(route.includes('planner=1&amp;voorbeeld=herengracht-noord-zuid'))
  assert.ok(route.includes('Dit zijn voorbeeldmaten'))
  assert.ok(route.includes('geen aangewezen opstap- of afmeerplaatsen'))
  const sharing = renderPublicPage('/boottracker-delen')
  assert.ok(sharing.includes('&lt;a href=&quot;https://boottracker.nl/vaarroutes-amsterdam&quot;&gt;'))
})

test('operator pages cover all requested companies without inventing a live fleet', async () => {
  const { OPERATOR_PAGES } = await import('./public-operators.mjs')
  for (const path of Object.keys(OPERATOR_PAGES)) {
    const html = renderPublicPage(path)
    assert.equal((html.match(/<h1>/g) || []).length, 1)
    assert.ok(html.includes(`href="${SITE_ORIGIN}${path}"`))
    assert.ok(sitemapXml().includes(`<loc>${SITE_ORIGIN}${path}</loc>`))
  }
  const html = renderPublicPage('/rederijen-amsterdam/lovers')
  assert.ok(html.includes('LOVERS / Lovely Cruises'))
  assert.ok(html.includes('geen AIS-posities beschikbaar'))
  assert.ok(html.includes('Gemeente Amsterdam'))
  const populated = renderPublicPage('/rederijen-amsterdam/stromma', { operatorGroups: [{ id: 'stromma', vessels: [{ name: '<script>', mmsi: '244123456', operatorMethod: 'manual' }] }] })
  assert.ok(populated.includes('&lt;script&gt;'))
  assert.ok(populated.includes('door beheerder gekoppeld'))
})

test('English editions declare reciprocal hreflang alternates with a Dutch x-default', async () => {
  const { ENGLISH_PAGES } = await import('./public-pages-en.mjs')
  assert.ok(Object.keys(ENGLISH_PAGES).length >= 20)
  for (const [path, page] of Object.entries(ENGLISH_PAGES)) {
    assert.ok(PUBLIC_PAGES[page.nlPath], `${path} points at a real Dutch page`)
    for (const head of [pageHead(path), pageHead(page.nlPath)]) {
      assert.ok(head.includes(`hreflang="en" href="${SITE_ORIGIN}${path}"`))
      assert.ok(head.includes(`hreflang="nl" href="${SITE_ORIGIN}${page.nlPath}"`))
      assert.ok(head.includes(`hreflang="x-default" href="${SITE_ORIGIN}${page.nlPath}"`))
    }
    assert.ok(pageHead(path).includes('content="en_GB"'))
  }
  // Dutch-only pages must not claim an English edition.
  assert.ok(!pageHead('/kennisbank').includes('hreflang'))
})

test('English pages render in English without Dutch chrome and link back to Dutch', () => {
  const html = renderPublicPage('/en/amsterdam-boat-route-planner', { now })
  assert.ok(html.includes('<html lang="en">'))
  assert.ok(html.includes('Your route through the Amsterdam canals.'))
  assert.ok(html.includes('href="/amsterdam-routeplanner" hreflang="nl"'))
  assert.equal((html.match(/<h1>/g) || []).length, 1)
  for (const dutch of ['Naar de inhoud', 'Hoofdnavigatie', 'Kruimelpad', 'Open kaart']) assert.ok(!html.includes(dutch), dutch)
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])
  assert.equal(data.inLanguage, 'en-GB')
  const dutch = renderPublicPage('/amsterdam-routeplanner', { now })
  assert.ok(dutch.includes('href="/en/amsterdam-boat-route-planner" hreflang="en"'))
})

test('English bridge pages translate source labels and never estimate missing data', () => {
  const bridgeCollection = { fetchedAt: now, features: [{ properties: { number: 'BRU0487', bridgeType: 'Beweegbare brug', clearanceNap: 1.2, winterWaterLevelNap: -0.4, passageWidth: 6 } }] }
  const html = renderPublicPage('/en/amsterdam-bridges/kortjewantsbrug', { now, bridgeCollection })
  assert.ok(html.includes('Movable bridge'))
  assert.ok(html.includes('Calculated at the municipal winter water level'))
  assert.ok(html.includes('1.6 m'))
  assert.ok(html.includes('href="/?bridge=BRU0487"'))
  assert.ok(html.includes('<a href="/en/amsterdam-bridges">Amsterdam bridges</a>'))
  const missing = renderPublicPage('/en/amsterdam-bridges/kortjewantsbrug', { now, bridgeCollection: { features: [] } })
  assert.ok(missing.includes('No dimensions are estimated.'))
})

test('sitemap lists both editions with xhtml alternates', () => {
  const sitemap = sitemapXml()
  assert.ok(sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'))
  assert.ok(sitemap.includes('<loc>https://boottracker.nl/en/amsterdam-canals/prinsengracht</loc><xhtml:link rel="alternate" hreflang="nl" href="https://boottracker.nl/grachten-amsterdam/prinsengracht"/>'))
})
