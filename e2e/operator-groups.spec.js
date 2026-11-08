import { test, expect } from '@playwright/test'
import { groupVesselsByOperator, VESSEL_OPERATORS } from '../shared/vessel-operators.mjs'

async function mockOperators(page) {
  const now = new Date().toISOString()
  const vessels = [
    { mmsi: '244123456', name: 'LOVERS 1', latitude: 52.37, longitude: 4.9, receivedAt: now },
    { mmsi: '244123457', name: 'STROMMA 1', latitude: 52.371, longitude: 4.901, receivedAt: now },
  ]
  await page.route('**/api/auth/status', (route) => route.fulfill({ json: { authenticated: false, needsSetup: false } }))
  await page.route('**/api/map/operator-groups', (route) => route.fulfill({ json: { assignments: {}, groups: groupVesselsByOperator(vessels) } }))
  await page.route('**/api/fleet/summary*', (route) => route.fulfill({ json: { boats: [], assignments: [], planning: [] } }))
  await page.route('**/api/map/bridges', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: [] } }))
  await page.route('**/api/map/navigation-layer?*', (route) => route.fulfill({ json: { type: 'FeatureCollection', features: [] } }))
  await page.route('**/api/water-level/*', (route) => route.fulfill({ status: 503, json: { error: 'test unavailable' } }))
}

test('all operator groups are available and a direct company link filters the markers', async ({ page, isMobile }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockOperators(page)
  await page.goto('/?operator=lovers')
  await expect(page.locator('.ais-vessel-marker')).toHaveCount(1)
  const button = page.locator('.ais-status button').first()
  await expect(button).toHaveText('LOVERS / Lovely Cruises')
  if (isMobile) await page.getByRole('button', { name: 'AIS-groepen kiezen', exact: true }).click()
  else await button.click()
  for (const operator of VESSEL_OPERATORS) await expect(page.getByRole('checkbox', { name: new RegExp(operator.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveCount(1)
  await page.getByRole('checkbox', { name: /Stromma/ }).check()
  await expect(page.locator('.ais-vessel-marker')).toHaveCount(2)
  await expect(page.locator('.ais-vessel--operator-lovers')).toHaveCSS('--operator-color', '#f87171')
  await expect(page.locator('.ais-vessel--operator-stromma')).toHaveCSS('--operator-color', '#f472b6')
  await page.getByRole('checkbox', { name: /LOVERS/ }).uncheck()
  await expect(page.locator('.ais-vessel-marker')).toHaveCount(1)
  expect(errors).toEqual([])
})


test('fleet directory selects companies and lists KIN12 without inventing an AIS position', async ({ page }) => {
  await mockOperators(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Fleet/ }).click()
  await page.getByLabel('Fleet directory per rederij').selectOption('kinboat')
  await expect(page.locator('strong').filter({ hasText: /^KIN12$/ })).toHaveCount(1)
  await expect(page.locator('article').filter({ has: page.locator('strong').filter({ hasText: /^KIN12$/ }) }).getByRole('button', { name: 'No position available', exact: true })).toBeDisabled()
  await page.getByLabel('Fleet directory per rederij').selectOption('lovers')
  await expect(page.locator('strong').filter({ hasText: /^LOVERS 1$/ })).toHaveCount(1)
})


test('leaderboard defaults to all companies and can select any operator', async ({ page }) => {
  await mockOperators(page)
  await page.route('**/api/fleet/leaderboard?*', async (route) => {
    const operator = new URL(route.request().url()).searchParams.get('operator')
    const entries = [{ id: 'mmsi:244123456', name: 'LOVERS 1', operatorId: 'lovers', operatorName: 'LOVERS / Lovely Cruises', distanceKm: 12, samples: 20 }, { id: 'mmsi:244123457', name: 'STROMMA 1', operatorId: 'stromma', operatorName: 'Stromma', distanceKm: 10, samples: 20 }].filter((entry) => operator === 'all' || entry.operatorId === operator)
    await route.fulfill({ json: { entries, coveragePercent: 50, complete: false } })
  })
  await page.goto('/km-leaderboard')
  const selector = page.getByLabel('Rederij klassement')
  await expect(selector).toHaveValue('all')
  await expect(page.locator('.podium-card')).toHaveCount(2)
  await selector.selectOption('stromma')
  await expect(page.locator('.podium-card')).toHaveCount(1)
  await expect(page.locator('.podium-card')).toContainText('STROMMA 1')
  await selector.selectOption('kinboat')
  await expect(page.locator('.podium-card')).toHaveCount(0)
})


test('administrators can enrich a boat from any directory and choose its operator without MMSI', async ({ page }) => {
  await mockOperators(page)
  await page.route('**/api/auth/status', (route) => route.fulfill({ json: { authenticated: true, needsSetup: false, user: { id: 12345, name: 'Test admin', role: 'admin' } } }))
  await page.goto('/')
  await page.getByRole('button', { name: /Fleet/ }).click()
  await page.getByLabel('Fleet directory per rederij').selectOption('kinboat')
  await page.locator('article').filter({ has: page.locator('strong').filter({ hasText: /^KIN12$/ }) }).getByRole('button', { name: 'Edit details', exact: true }).click()
  await expect(page.getByLabel('Rederij van de boot')).toHaveValue('kinboat')
  await expect(page.getByPlaceholder('MMSI', { exact: true })).toHaveValue('')
  await page.getByLabel('Rederij van de boot').selectOption('pure-boats')
  await expect(page.getByLabel('Rederij van de boot')).toHaveValue('pure-boats')
})


test('partial class-B static messages do not remove a boat from its company filter', async ({ page }) => {
  await mockOperators(page)
  let stream
  await page.routeWebSocket(/\/ais(?:\?.*)?$/, (socket) => {
    stream = socket
    socket.send(JSON.stringify({ type: 'status', status: 'live', configured: true, message: 'Test feed' }))
  })
  await page.goto('/?operator=lovers')
  await expect(page.locator('.ais-vessel--operator-lovers')).toHaveCount(1)
  await expect.poll(() => Boolean(stream)).toBe(true)
  stream.send(JSON.stringify({ type: 'vessel-static', mmsi: '244123456', name: '', callSign: 'TEST' }))
  stream.send(JSON.stringify({ type: 'vessel-position', mmsi: '244123456', name: null, latitude: 52.3702, longitude: 4.9002, receivedAt: new Date().toISOString() }))
  await expect(page.locator('.ais-vessel--operator-lovers')).toHaveCount(1)
  await expect(page.locator('.ais-vessel--operator-lovers .ais-vessel__name')).toHaveText('LOVERS 1')
})


test('AIS boats without an operator remain visible by default', async ({ page }) => {
  await mockOperators(page)
  await page.routeWebSocket(/\/ais(?:\?.*)?$/, (socket) => {
    socket.send(JSON.stringify({ type: 'snapshot', vessels: [{ mmsi: '244999999', name: 'UNASSIGNED TEST', latitude: 52.372, longitude: 4.902, receivedAt: new Date().toISOString() }] }))
  })
  await page.goto('/')
  await expect(page.locator('.ais-vessel-marker')).toHaveCount(3)
  await expect(page.locator('.ais-status button').first()).toHaveText('All vessels')
})

test('only verified boat photos load; unconfirmed photos and fleet fallbacks stay hidden', async ({ page }) => {
  await mockOperators(page)
  await page.goto('/')
  await page.getByRole('button', { name: /Fleet/ }).click()
  await page.getByLabel('Fleet directory per rederij').selectOption('lovers')
  const spartacus = page.locator('article').filter({ has: page.locator('strong').filter({ hasText: /^Spartacus$/ }) })
  await spartacus.scrollIntoViewIfNeeded()
  await expect(spartacus.getByRole('img')).toHaveAttribute('alt', 'Foto van Spartacus')
  await expect.poll(() => spartacus.getByRole('img').evaluate((element) => element.naturalWidth)).toBeGreaterThan(0)
  await page.getByLabel('Fleet directory per rederij').selectOption('kinboat')
  const kin = page.locator('article').filter({ has: page.locator('strong').filter({ hasText: /^KIN12$/ }) })
  await expect(kin.getByRole('img')).toHaveCount(0)
})

test('Apsara has exactly one verified photo in boat details', async ({ page }) => {
  await mockOperators(page)
  const ais = { mmsi: '244090957', name: 'APSARA', latitude: 52.37, longitude: 4.9, receivedAt: new Date().toISOString() }
  const photoUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXiAAAAAASUVORK5CYII='
  await page.route('**/api/fleet/summary*', (route) => route.fulfill({ json: { boats: [{ id: 15, name: 'APSARA', mmsi: ais.mmsi, ais, photoUrl, photoVerified: true }], planning: [] } }))
  await page.goto('/')
  await page.getByRole('button', { name: /Fleet/ }).click()
  await page.getByLabel('Fleet directory per rederij').selectOption('flagship')
  const apsara = page.locator('article').filter({ has: page.locator('strong').filter({ hasText: /^APSARA$/ }) })
  await apsara.getByRole('button', { name: 'Show on map', exact: true }).click()
  await expect(page.locator('.vessel-details img')).toHaveCount(1)
})
