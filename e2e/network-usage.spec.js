import { test, expect } from '@playwright/test'

const isAis = socket => new URL(socket.url()).pathname === '/ais'

test('data saver defaults on mobile and the chosen setting survives reload', async ({ page, isMobile }) => {
  const sockets = []
  page.on('websocket', socket => { if (isAis(socket)) sockets.push(socket) })
  await page.goto('/')
  await expect.poll(() => sockets.length).toBe(1)
  expect(new URL(sockets[0].url()).searchParams.get('dataSaver')).toBe(isMobile ? '1' : null)
  await page.locator('.site-navigation > summary').click()
  await page.locator('.map-settings-trigger').click()
  await expect(page.getByRole('dialog', { name: 'Instellingen', exact: true })).toBeVisible()
  const setting = page.getByRole('checkbox', { name: /Dataspaarstand/ })
  await expect(setting).toBeChecked({ checked: isMobile })
  if (isMobile) await setting.tap()
  else await setting.click()
  await expect(setting).toBeChecked({ checked: !isMobile })
  await expect.poll(() => sockets.length).toBe(2)
  expect(new URL(sockets[1].url()).searchParams.get('dataSaver')).toBe(isMobile ? null : '1')
  await page.reload()
  await expect.poll(() => sockets.length).toBe(3)
  expect(new URL(sockets[2].url()).searchParams.get('dataSaver')).toBe(isMobile ? null : '1')
})

test('backgrounding closes the AIS stream without reconnecting and returning restores it', async ({ page }) => {
  const sockets = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('websocket', socket => { if (isAis(socket)) sockets.push(socket) })
  await page.goto('/')
  await expect.poll(() => sockets.length).toBe(1)
  const closed = sockets[0].waitForEvent('close')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await closed
  await page.waitForTimeout(1500) // Longer than the first reconnect delay.
  expect(sockets.length).toBe(1)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => sockets.length).toBe(2)
  expect(errors).toEqual([])
})


test('signed-in users have data saver off by default and can reach settings through Account', async ({ page }) => {
  await page.route('**/api/auth/status', route => route.fulfill({ json: { authenticated: true, needsSetup: false, user: { id: 987654, name: 'Test gebruiker', email: 'test@example.test', role: 'viewer' } } }))
  const sockets = []
  page.on('websocket', socket => { if (isAis(socket)) sockets.push(socket) })
  await page.goto('/')
  await expect.poll(() => sockets.length).toBe(1)
  expect(new URL(sockets[0].url()).searchParams.get('dataSaver')).toBeNull()
  await page.locator('.mobile-nav-account > button').click()
  await page.locator('.mobile-nav-account').getByRole('button', { name: 'Instellingen', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Instellingen', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Dataspaarstand/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Instellingen sluiten' }).click()
  await expect(page.getByRole('dialog', { name: 'Instellingen', exact: true })).toBeHidden()
})
