import { test, expect } from '@playwright/test'

test('official hindrances are visible by default, refresh each minute and report failure', async ({ page }, info) => {
  await page.clock.install()
  let calls = 0
  let unavailable = false
  await page.route('**/api/auth/status', r => r.fulfill({ json: { authenticated: false, needsSetup: false } }))
  await page.route('**/api/map/bridges', r => r.fulfill({ json: { type: 'FeatureCollection', features: [] } }))
  await page.route('**/api/map/navigation-layer?*', r => {
    calls++
    if (unavailable) return r.fulfill({ status: 502, json: { error: 'test outage' } })
    return r.fulfill({ json: { type: 'FeatureCollection', fetchedAt: new Date().toISOString(), features: calls === 1 ? [
      { type: 'Feature', id: 'works', geometry: { type: 'Point', coordinates: [4.9,52.37] }, properties: { name: 'Werkzaamheden', type: 'Volledige stremming', blocksRouting: true, start: '2020-01-01T00:00:00Z', end: '2099-01-01T00:00:00Z' } },
    ] : [] } })
  })
  await page.route('**/api/water-level/*', r => r.fulfill({ status: 503, json: { error: 'test' } }))
  await page.route('**/tile.openstreetmap.org/**', r => r.abort())
  await page.goto('/')
  const status = page.getByRole('complementary', { name: 'Actuele vaarweghinderingen' })
  await expect(status).toContainText('1 actueel')
  await expect(status).toContainText('elke minuut')
  await page.clock.fastForward(60_000)
  await expect(status).toContainText('0 actueel')
  expect(calls).toBeGreaterThanOrEqual(2)
  unavailable = true
  await page.clock.fastForward(60_000)
  await expect(status).toContainText('Vernieuwen mislukt')
  await page.screenshot({ path: `/tmp/boottracker-hindrances-${info.project.name}.png` })
})
