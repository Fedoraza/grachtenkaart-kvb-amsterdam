/* Boottracker service worker: installable app and offline route planning.
 *
 * Route calculation runs in the browser, so with the canal network, bridge
 * data and app code cached, the planner keeps working without a connection.
 *
 * What is cached:
 *  - the app shell (index.html) and the hashed /assets/ bundles it references
 *  - static files: canal network (export.geojson), icons, public page CSS
 *  - an allow-list of PUBLIC map data reads (bridges, notices, water level)
 * What is never cached:
 *  - account, admin, planning, fleet or any other API response
 *  - WebSocket traffic, non-GET requests, other origins (map tiles: the
 *    OpenStreetMap tile policy does not permit offline use)
 *
 * URLs are resolved against the registration scope, so the same file works
 * at the site root and under a GitHub Pages base path.
 */
const VERSION = 'v1'
const SHELL_CACHE = `bt-shell-${VERSION}`
const ASSET_CACHE = `bt-assets-${VERSION}`
const DATA_CACHE = `bt-data-${VERSION}`
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE]
const MAX_ASSET_ENTRIES = 80
const NAVIGATION_TIMEOUT_MS = 4000
const DATA_TIMEOUT_MS = 8000

const STATIC_FILES = ['export.geojson', 'favicon.svg', 'forbidden.svg', 'public-pages.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']
const SPA_ROUTES = ['km-leaderboard', 'vlootstatistieken']
const PUBLIC_DATA_PATHS = ['api/map/bridges', 'api/map/navigation-layer', 'api/map/route-links', 'api/map/objects', 'api/map/operator-groups', 'api/water-level/surinamekade']

// Pure decision function, exported to tests through self.__boottrackerStrategy.
function requestStrategy(method, url, mode, scope) {
  if (method !== 'GET') return 'network'
  const target = new URL(url)
  const base = new URL(scope)
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return 'network'
  const path = target.pathname.slice(base.pathname.length)
  if (path.startsWith('api/')) return PUBLIC_DATA_PATHS.includes(path) ? 'data' : 'network'
  if (path === 'ws' || path.startsWith('ws/') || path === 'sw.js') return 'network'
  if (mode === 'navigate') return 'navigation'
  if (path.startsWith('assets/')) return 'asset'
  if (STATIC_FILES.includes(path) || path.startsWith('icons/') || path.startsWith('boat-photos/')) return 'static'
  return 'network'
}

const scopeUrl = (path = '') => new URL(path, self.registration.scope).href

async function precache() {
  const shell = await caches.open(SHELL_CACHE)
  const response = await fetch(scopeUrl(), { cache: 'no-cache' })
  if (!response.ok) return
  const html = await response.clone().text()
  await shell.put(scopeUrl(), response)
  // Cache the bundles the shell needs now, so the very first visit is already
  // usable offline instead of only the second one.
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((match) => new URL(match[1], scopeUrl()).href))]
  const statics = STATIC_FILES.map((file) => scopeUrl(file))
  await Promise.allSettled([
    caches.open(ASSET_CACHE).then((cache) => cache.addAll(assets)),
    caches.open(SHELL_CACHE).then((cache) => Promise.allSettled(statics.map((file) => cache.add(file)))),
  ])
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((name) => name.startsWith('bt-') && !CURRENT_CACHES.includes(name)).map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

async function trimCache(name, maxEntries) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)))
}

const offlinePage = () => new Response(`<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline | Boottracker</title><body style="margin:0;padding:24px;font-family:system-ui;background:#091422;color:#f8fafc"><h1>Geen verbinding</h1><p>Deze pagina is nog niet offline opgeslagen. Open de vaarkaart één keer met verbinding om hem offline te kunnen gebruiken.</p><p lang="en">No connection. Open the map once while online to use it offline.</p><p><a style="color:#67e8f9" href="${scopeUrl()}">Vaarkaart openen</a></p></body></html>`, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

// Network first so a deploy is picked up immediately; cached copy when offline.
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE)
  const url = new URL(request.url)
  const isAppShell = url.pathname === new URL(scopeUrl()).pathname
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS)
    // Only plain shell requests and public pages are stored; a query string
    // can carry a shared-route token or a personal selection.
    if (response.ok && !url.search) cache.put(isAppShell ? scopeUrl() : request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    // The map and the app's own routes render from the shell; an uncached
    // server-rendered information page gets an honest offline notice instead.
    const appRoute = isAppShell || SPA_ROUTES.includes(url.pathname.slice(new URL(scopeUrl()).pathname.length))
    return (appRoute && await cache.match(scopeUrl())) || offlinePage()
  }
}

// Hashed file names never change content, so the cache is authoritative.
async function handleAsset(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES)
  }
  return response
}

// Serve the stored copy at once and refresh it in the background.
async function handleStatic(event) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(event.request)
  const refresh = fetch(event.request).then((response) => {
    if (response.ok) cache.put(event.request, response.clone())
    return response
  })
  if (cached) {
    event.waitUntil(refresh.catch(() => {}))
    return cached
  }
  return refresh
}

// Live data must be current when the network works; the cached copy keeps its
// own fetchedAt/measuredAt, so the app can show how old it is when offline.
async function handleData(request) {
  const cache = await caches.open(DATA_CACHE)
  const cached = await cache.match(request)
  try {
    const response = await (cached ? withTimeout(fetch(request), DATA_TIMEOUT_MS) : fetch(request))
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const strategy = requestStrategy(request.method, request.url, request.mode, self.registration.scope)
  if (strategy === 'navigation') event.respondWith(handleNavigation(request))
  else if (strategy === 'asset') event.respondWith(handleAsset(request))
  else if (strategy === 'static') event.respondWith(handleStatic(event))
  else if (strategy === 'data') event.respondWith(handleData(request))
})

self.__boottrackerStrategy = requestStrategy
