import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { combineBridgeSources } from '../server/bridge-catalog.mjs'
const source=JSON.parse(readFileSync(new URL('../src/scripts/fixtures/oosterdok-rws-bridges.json',import.meta.url)))
const catalog=combineBridgeSources({features:[]},{features:[]},source)
async function mock(page,data) {
  await page.route('**/api/auth/status',r=>r.fulfill({json:{authenticated:false,needsSetup:false}}))
  await page.route('**/api/map/bridges',r=>r.fulfill({json:data}))
  await page.route('**/api/map/navigation-layer?*',r=>r.fulfill({json:{type:'FeatureCollection',features:[]}}))
  await page.route('**/api/water-level/*',r=>r.fulfill({status:503,json:{error:'test'}}))
  await page.route('**/tile.openstreetmap.org/**',r=>r.abort())
}
test('Oosterdoksspoorbrug appears as a real point with distinct opening dimensions and sources',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await mock(page,catalog)
  await page.goto('/?bridge=FIS-38832')
  const marker=page.locator('.bridge-height-marker').filter({hasText:'5.10 m'})
  await expect(marker).toHaveCount(1)
  await page.getByRole('button',{name:'Close popup'}).click()
  await marker.click()
  const popup=page.locator('.leaflet-popup-content').last()
  await expect(popup).toContainText('Oosterdoksspoorbrug')
  await expect(popup).toContainText('Doorvaartopening 1 (vast)')
  await expect(popup).toContainText('Doorvaartopening 2 (beweegbaar)')
  await expect(popup).toContainText('17.00 m')
  await expect(popup).toContainText('19.00 m')
  await expect(popup.getByRole('link',{name:'Rijkswaterstaat bronrecord'})).toHaveCount(2)
  await expect(popup).toBeVisible()
  await expect(popup.locator('..').locator('..')).toHaveCSS('opacity','1')
  expect(errors).toEqual([])
  await page.screenshot({path:`/tmp/boottracker-oosterdok-${info.project.name}.png`})
})
test('RWS bridge stays visible when the source has no dimensions',async({page})=>{
  const unknown=structuredClone(catalog)
  const rail=unknown.features.find(f=>f.properties.fisBridgeId===38832)
  for(const key of ['fisClearanceMeters','fisPassageWidthMeters'])delete rail.properties[key]
  for(const opening of rail.properties.fisOpenings){opening.heightMeters=null;opening.widthMeters=null}
  await mock(page,unknown)
  await page.goto('/?bridge=FIS-38832')
  await expect(page.locator('.bridge-height-marker').filter({hasText:'?'})).toHaveCount(1)
})
