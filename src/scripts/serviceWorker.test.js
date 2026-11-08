import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Load public/sw.js in a sandbox and read back its pure routing decision.
function loadStrategy() {
  const self = { addEventListener() {}, registration: { scope: 'https://boottracker.nl/' } }
  vm.runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), { self, URL, caches: {}, fetch() {}, Response: class {}, setTimeout, clearTimeout })
  return self.__boottrackerStrategy
}
const strategy = loadStrategy()
const root = 'https://boottracker.nl/'

test('service worker caches the shell, hashed assets and static files', () => {
  assert.equal(strategy('GET', root, 'navigate', root), 'navigation')
  assert.equal(strategy('GET', `${root}bruggen-amsterdam`, 'navigate', root), 'navigation')
  assert.equal(strategy('GET', `${root}assets/app-CIk_yXxe.js`, 'cors', root), 'asset')
  assert.equal(strategy('GET', `${root}export.geojson`, 'cors', root), 'static')
  assert.equal(strategy('GET', `${root}icons/icon-192.png`, 'no-cors', root), 'static')
})

test('service worker only caches public map data, never account or operational APIs', () => {
  for (const path of ['api/map/bridges', 'api/map/navigation-layer', 'api/water-level/surinamekade', 'api/map/route-links']) {
    assert.equal(strategy('GET', `${root}${path}?layer=closures`, 'cors', root), 'data', path)
  }
  for (const path of ['api/auth/status', 'api/planning/day', 'api/fleet/summary', 'api/admin/usage', 'api/inventory', 'api/shared-routes/abc', 'api/ais/vessels/1/history']) {
    assert.equal(strategy('GET', `${root}${path}`, 'cors', root), 'network', path)
  }
  assert.equal(strategy('POST', `${root}api/map/bridges`, 'cors', root), 'network')
  assert.equal(strategy('GET', `${root}ws`, 'websocket', root), 'network')
  assert.equal(strategy('GET', `${root}sw.js`, 'same-origin', root), 'network')
})

test('service worker leaves other origins alone, including map tiles', () => {
  assert.equal(strategy('GET', 'https://tile.openstreetmap.org/15/16834/10770.png', 'no-cors', root), 'network')
  assert.equal(strategy('GET', 'https://nominatim.openstreetmap.org/search?q=x', 'cors', root), 'network')
})

test('service worker respects a GitHub Pages base path', () => {
  const scope = 'https://example.github.io/boottracker/'
  assert.equal(strategy('GET', `${scope}assets/app.js`, 'cors', scope), 'asset')
  assert.equal(strategy('GET', `${scope}api/map/bridges`, 'cors', scope), 'data')
  assert.equal(strategy('GET', 'https://example.github.io/other-site/assets/app.js', 'cors', scope), 'network')
})

test('manifest is installable: name, start URL, standalone display and 192/512 icons', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.ok(manifest.name && manifest.short_name)
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, './')
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some((icon) => icon.sizes === size && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'))
  for (const icon of manifest.icons) assert.ok(readFileSync(new URL(`../../public/${icon.src}`, import.meta.url)).length > 0)
})
