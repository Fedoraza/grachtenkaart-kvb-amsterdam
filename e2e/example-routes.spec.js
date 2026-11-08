import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { EXAMPLE_ROUTES } from '../shared/example-routes.mjs'
const bridges = JSON.parse(readFileSync(new URL('../src/scripts/fixtures/nieuwe-herengracht-bridges.json', import.meta.url)))

for (const example of EXAMPLE_ROUTES) {
  test(`example ${example.slug} opens route points without assuming boat dimensions`, async ({ page }) => {
    const errors = []
    const scripts = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()) })
    await page.route('**/api/auth/status', (route) => route.fulfill({ json: { authenticated: false, needsSetup: false } }))
    await page.route('**/api/map/bridges', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: bridges } }))
    await page.route('**/api/map/navigation-layer?*', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: [] } }))
    await page.route('**/api/water-level/*', (route) => route.fulfill({ status: 503, json: { error: 'test unavailable' } }))
    await page.goto(example.plannerUrl)
    await expect(page.locator('[class*="leaflet-route-point-pane"] .leaflet-marker-icon')).toHaveCount(example.points.length)
    const dimensions = page.locator('input[type=number][step="0.05"]')
    for (let index = 0; index < await dimensions.count(); index++) await expect(dimensions.nth(index)).toHaveValue('')
    expect(scripts.filter((url) => /\/(?:AccountMenu|BoatDutyPanel|InventoryPanel|PlanningPanel|AuthScreen)-/.test(url))).toEqual([])
    expect(errors).toEqual([])
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.locator('dialog[open]')).toBeVisible()
    await expect.poll(() => scripts.some((url) => /\/AuthScreen-/.test(url))).toBe(true)
  })
}

test('signed-in users still load the deferred account and operational panels', async ({ page }) => {
  const errors = []
  const scripts = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()) })
  await page.route('**/api/auth/status', (route) => route.fulfill({ json: { authenticated: true, needsSetup: false, user: { id: 12345, name: 'Test gebruiker', role: 'viewer' } } }))
  await page.route('**/api/map/bridges', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: bridges } }))
  await page.route('**/api/map/navigation-layer?*', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: [] } }))
  await page.route('**/api/water-level/*', (route) => route.fulfill({ status: 503, json: { error: 'test unavailable' } }))
  await page.goto('/')
  for (const name of ['AccountMenu', 'BoatDutyPanel', 'InventoryPanel', 'PlanningPanel']) {
    await expect.poll(() => scripts.some((url) => url.includes(`/${name}-`))).toBe(true)
  }
  expect(errors).toEqual([])
})
