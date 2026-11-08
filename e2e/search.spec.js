import { test, expect } from '@playwright/test'

const runtimeErrors = new WeakMap()
test.beforeEach(async ({ page }) => {
  const errors = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (/\[Vue warn\]|Invalid Teleport|Failed to locate Teleport/.test(message.text())) errors.push(message.text())
  })
  await page.goto('/')
  await expect(page.locator('.search-ais-control')).toBeVisible()
})
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), 'No Vue mount errors or JavaScript exceptions').toEqual([])
})

async function openSearch(page, isMobile) {
  const input = page.locator(isMobile ? '#mobile-canal-search-input' : '#canal-search-input')
  if (isMobile) await input.tap()
  else await page.locator('.desktop-search-trigger > button').first().click()
  await expect(input).toBeFocused()
  await expect(page.locator('#canal-search-panel')).toBeVisible()
  return input
}

test('cold load, touch, typing and selecting a canal work', async ({ page, isMobile }, testInfo) => {
  // Open through a real touch/click, then type through browser keyboard events.
  const input = await openSearch(page, isMobile)
  await input.pressSequentially('Herengracht')
  const canal = page.locator('#canal-search-panel button').filter({ hasText: 'Herengracht' }).filter({ hasText: /way\// }).first()
  await expect(canal).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('search-results.png') })
  if (isMobile) await canal.tap()
  else await canal.click()
  await expect(input).toHaveValue('Herengracht')
  if (isMobile) {
    await expect(page.locator('.mobile-map-sheet')).toBeHidden()
    await expect(input).not.toBeFocused()
    await expect(page.locator('.mobile-place-card')).toContainText('Herengracht')
    // A second tap must reopen the same search, with native input focus.
    await input.tap()
    await expect(input).toBeFocused()
    await expect(page.locator('#canal-search-panel')).toBeVisible()
  }
})

test('mobile search can switch to route, layers and AIS and reopen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile panel coordination')
  const input = await openSearch(page, true)
  for (const selector of ['.mobile-map-route-trigger', '.mobile-map-layers-trigger', '.mobile-map-ais-trigger']) {
    await page.locator(selector).tap()
    await expect(page.locator('#canal-search-panel')).toBeHidden()
    await expect(input).not.toBeFocused()
    await expect(page.locator('.mobile-map-sheet')).toBeVisible()
    await input.tap()
    await expect(input).toBeFocused()
    await expect(page.locator('#canal-search-panel')).toBeVisible()
    await expect(page.locator('.mobile-route-panel')).toHaveCount(0)
    await expect(page.locator('.mobile-layers-panel')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Paneel sluiten', exact: true }).tap()
  await expect(input).not.toBeFocused()
  await expect(page.locator('.mobile-map-sheet')).toBeHidden()
})

test('search and results stay usable when the keyboard reduces the visible viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile keyboard viewport')
  const input = await openSearch(page, true)
  await page.evaluate(() => {
    // Emulate the visualViewport event emitted by an overlay software keyboard.
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 380 })
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('.map-shell')).toHaveClass(/mobile-keyboard-open/)
  await input.pressSequentially('Prinsengracht')
  await expect(page.locator('#canal-search-panel button').filter({ hasText: 'Prinsengracht' }).first()).toBeVisible()
  const sheet = await page.locator('.mobile-map-sheet').boundingBox()
  const search = await input.boundingBox()
  expect(sheet.y).toBeGreaterThanOrEqual(search.y + search.height)
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(381)
  await expect(input).toBeFocused()
})

test('search survives desktop to mobile breakpoint changes', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop resize regression')
  const input = await openSearch(page, false)
  await input.fill('Herengracht')
  await page.setViewportSize({ width: 390, height: 700 })
  const mobileInput = page.locator('#mobile-canal-search-input')
  await mobileInput.click()
  await expect(mobileInput).toBeFocused()
  await expect(mobileInput).toHaveValue('Herengracht')
  await expect(page.locator('#canal-search-panel')).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(input).toBeVisible()
  await expect(input).toHaveValue('Herengracht')
})


test('clearing the native search and submitting with Enter work', async ({ page, isMobile }) => {
  const input = await openSearch(page, isMobile)
  await input.fill('Herengracht')
  await expect(page.locator('#canal-search-panel button').filter({ hasText: 'Herengracht' }).first()).toBeVisible()
  await input.press('Enter')
  await expect(page.locator('.leaflet-popup-content').last()).toContainText('Herengracht')
  if (isMobile) {
    await expect(page.locator('.mobile-map-sheet')).toBeHidden()
    await expect(input).not.toBeFocused()
    await input.tap()
  }
  await input.fill('')
  await expect(input).toHaveValue('')
  await expect(page.locator('#canal-search-panel button').filter({ hasText: /way\// }).first()).toBeVisible()
})
