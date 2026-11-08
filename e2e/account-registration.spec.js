import { test, expect } from '@playwright/test'

test('any visitor can register without employment verification and receives no planning access', async ({ page, request }) => {
  const status = await (await request.get('/api/auth/status')).json()
  if (status.needsSetup) {
    const setup=await request.post('/api/auth/setup',{headers:{'X-Setup-Token':'e2e-setup-secret'},data:{name:'Test administrator',email:'e2e-admin@example.invalid',password:'e2e-administrator-password'}})
    expect(setup.status()).toBe(201)
  }
  await page.route('**/api/map/bridges',r=>r.fulfill({json:{type:'FeatureCollection',features:[]}}))
  await page.route('**/api/map/navigation-layer?*',r=>r.fulfill({json:{type:'FeatureCollection',features:[]}}))
  await page.route('**/api/water-level/*',r=>r.fulfill({status:503,json:{error:'test'}}))
  await page.route('**/tile.openstreetmap.org/**',r=>r.abort())
  const inventoryRequests=[]
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/inventory'))inventoryRequests.push(r.url())})
  const planningRequests=[]
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/planning/'))planningRequests.push(r.url())})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('/')
  await page.locator('.guest-sign-in-control button').click()
  await page.getByRole('button',{name:'Account aanmaken',exact:true}).click()
  await expect(page.getByText('Verify employment',{exact:true})).toHaveCount(0)
  await page.getByLabel('Naam',{exact:true}).fill('Nieuwe publieke gebruiker')
  await page.getByLabel('E-mailadres',{exact:true}).fill(`public-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`)
  await page.getByLabel('Wachtwoord',{exact:true}).fill('my-long-test-password')
  await page.getByLabel('Herhaal wachtwoord',{exact:true}).fill('my-long-test-password')
  await page.getByRole('button',{name:'Account aanmaken en inloggen',exact:true}).click()
  await expect(page.getByRole('button',{name:'Account aanmaken en inloggen',exact:true})).not.toBeVisible()
  await expect(page.locator('.mobile-nav-account')).toContainText('Nieuwe publieke gebruiker')
  await expect(page.locator('.mobile-nav-planning')).toHaveCount(0)
  await expect(page.locator('.mobile-nav-duty')).toHaveCount(0)
  await expect(page.locator('.mobile-nav-inventory')).toHaveCount(0)
  expect(inventoryRequests).toEqual([])
  expect((await (await page.request.get('/api/auth/status')).json()).user.role).toBe('viewer')
  expect((await page.request.get('/api/planning/day')).status()).toBe(403)
  expect((await page.request.get('/api/inventory')).status()).toBe(403)
  expect(planningRequests).toEqual([])
  expect(errors).toEqual([])
})
