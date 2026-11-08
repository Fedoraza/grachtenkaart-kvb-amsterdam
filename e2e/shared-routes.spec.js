import { test, expect } from '@playwright/test'
import { EXAMPLE_ROUTES } from '../shared/example-routes.mjs'
import { buildCanalRoutingNetwork, planCanalRouteVia } from '../src/scripts/canalRouting.js'
import { readFileSync } from 'node:fs'

const example = EXAMPLE_ROUTES[0]
const network = buildCanalRoutingNetwork(JSON.parse(readFileSync(new URL('../public/export.geojson', import.meta.url))), { respectRestrictions: true })
async function createSharedRoute(request) {
  const response = await request.post('/api/shared-routes', { data: { route: {
    name: 'Leesbare gedeelde Herengracht', points: example.points,
    result: planCanalRouteVia(example.points, network, { avoidVirtualEdges:true }),
  } } })
  expect(response.status()).toBe(201)
  return (await response.json()).url
}

test('shared link is readable with JavaScript disabled, including exact route and JSON links', async ({ request, browser, baseURL }) => {
  const url = await createSharedRoute(request)
  const context = await browser.newContext({ javaScriptEnabled:false, baseURL })
  try {
    const page = await context.newPage()
    await page.goto(url + '&utm_source=chatgpt.com')
    await expect(page.getByRole('heading', {name:'Leesbare gedeelde Herengracht',exact:true})).toBeVisible()
    await expect(page.getByRole('heading', {name:'Vaarwegen in routevolgorde'})).toBeVisible()
    await expect(page.getByRole('link', {name:'Exacte vaarlijn als GeoJSON'})).toHaveAttribute('href', /format=geojson/)
    await page.getByText(/^Alle \d+ coördinaten$/).click()
    await expect(page.locator('tbody tr').first()).toBeVisible()
    expect(await page.locator('tbody tr').count()).toBeGreaterThan(2)
  } finally { await context.close() }
})

test('shared route still opens on the interactive map after server rendering', async ({ page, request }) => {
  const url = await createSharedRoute(request)
  const errors=[]
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/auth/status', route => route.fulfill({json:{authenticated:false,needsSetup:false}}))
  await page.route('**/api/map/bridges', route => route.fulfill({json:{type:'FeatureCollection',features:[]}}))
  await page.route('**/api/map/navigation-layer?*', route => route.fulfill({json:{type:'FeatureCollection',features:[]}}))
  await page.route('**/api/fleet/summary*', route => route.fulfill({json:{boats:[],assignments:[],planning:[]}}))
  await page.route('**/api/water-level/*', route => route.fulfill({status:503,json:{error:'test'}}))
  await page.route('**/tile.openstreetmap.org/**', route => route.abort())
  await page.goto(url)
  await expect(page.locator('[class*="leaflet-route-point-pane"] .leaflet-marker-icon')).toHaveCount(2)
  await expect(page.getByText(/Gedeelde route geladen/).first()).toBeVisible()
  expect(errors).toEqual([])
})
