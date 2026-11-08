import { test, expect } from '@playwright/test'
import { calculateFleetStatistics, statisticsRange, waterwayIndex } from '../server/fleet-statistics.mjs'
import { readFile } from 'node:fs/promises'
const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Amsterdam', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date())
const roster = [
  { id:'mmsi:244123456', name:'Fixture Lovely', mmsi:'244123456', operatorId:'lovers' },
  { id:'mmsi:244123457', name:'Fixture Flagship', mmsi:'244123457', operatorId:'flagship' },
  { id:'name:kinboat:KIN12', name:'KIN12', mmsi:null, operatorId:'kinboat' },
]
const waterways = waterwayIndex({features:[{geometry:{type:'LineString',coordinates:[[4.9,52.369],[4.9,52.383]]},properties:{name:'Herengracht'}}]})
function fixture(input) {
  const positions=[]
  for (const boat of roster.filter((b)=>b.mmsi)) for(let day=0;day<3;day++){
    const base=Date.parse(`${today}T08:00:00Z`)-day*86400000
    for(let minute=0;minute<=35;minute++){
      const moving=minute>6 && minute<=27
      const latitude=52.37+Math.min(21,Math.max(0,minute-6))*.0002
      positions.push({mmsi:boat.mmsi,latitude,longitude:4.9,speed:moving?2:0,received_at:base+minute*60000})
    }
  }
  positions.sort((a,b)=>a.mmsi.localeCompare(b.mmsi)||a.received_at-b.received_at)
  return calculateFleetStatistics({roster,positions,range:statisticsRange(input),waterways,available:{earliest:Date.parse(`${today}T08:00:00Z`)-2*86400000,latest:Date.parse(`${today}T08:35:00Z`)},zones:[{id:'fixture',name:'Magere Brug',type:'brug',latitude:52.37,longitude:4.9,radius:45}]})
}
async function mock(page,mode='data') {
  await page.route('**/api/auth/status',r=>r.fulfill({json:{authenticated:false,needsSetup:false}}))
  await page.route('**/api/fleet/statistics?*',r=>{
    const input=Object.fromEntries(new URL(r.request().url()).searchParams)
    if(mode==='error')return r.fulfill({status:503,json:{error:'Ontvangstoverzicht tijdelijk niet beschikbaar.'}})
    const report=fixture(input)
    if(mode==='empty'){report.summary.samples=0;report.summary.activeBoats=0;report.trips=[]}
    return r.fulfill({json:report})
  })
  await page.route('https://tile.openstreetmap.org/**',r=>r.abort())
}
test('detailed fleet dashboard filters, charts, map, vessel drilldown and CSV work',async({page,isMobile})=>{
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await mock(page)
  if(!isMobile)await page.setViewportSize({width:1440,height:1800})
  await page.goto('/vlootstatistieken')
  await expect(page.getByRole('heading',{name:'Vlootstatistieken',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Activiteit per dag'})).toBeVisible()
  await expect(page.locator('.kpi-card')).toHaveCount(8)
  await expect(page.locator('.quality-banner')).toContainText('Gedeeltelijk waargenomen')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`/tmp/boottracker-statistics-${isMobile?'mobile':'desktop'}.png`})
  const nav=page.getByRole('navigation',{name:'Statistiekonderdelen'})
  await nav.getByRole('button',{name:'Rederijen',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Rederijvergelijking'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Dagtrend per rederij'})).toBeVisible()
  await nav.getByRole('button',{name:'Dagen & uren',exact:true}).click()
  await expect(page.locator('.time-grid button')).toHaveCount(168)
  await nav.getByRole('button',{name:'Kaart & vaarwegen',exact:true}).click()
  await expect(page.locator('.density-map .leaflet-container').or(page.locator('.density-map.leaflet-container'))).toBeVisible()
  await expect(page.getByRole('rowheader',{name:'Herengracht',exact:true})).toBeVisible()
  await nav.getByRole('button',{name:'Stops & locaties',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Gemeten verblijf nabij meetlocaties'})).toBeVisible()
  await nav.getByRole('button',{name:'Boten & vaarten',exact:true}).click()
  await page.getByLabel('Zoek bootstatistieken').fill('Fixture Lovely')
  await page.getByRole('button',{name:'Fixture Lovely',exact:true}).click()
  await expect(page).toHaveURL(/mmsi=244123456/)
  const downloadEvent=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download bootstatistieken CSV ↓'}).click()
  const download=await downloadEvent
  const csv=await readFile(await download.path(),'utf8')
  expect(csv).toContain('Fixture Lovely')
  expect(csv).not.toContain('Fixture Flagship')
  await nav.getByRole('button',{name:'Datakwaliteit',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Wat betekenen deze cijfers?'})).toBeVisible()
  expect(errors).toEqual([])
})
test('dashboard distinguishes empty reception from request failures',async({page})=>{
  await mock(page,'empty')
  await page.goto('/vlootstatistieken')
  await expect(page.getByText('Geen AIS-metingen voor deze selectie.',{exact:true})).toBeVisible()
  await mock(page,'error')
  await page.getByRole('button',{name:'Toon statistieken',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Ontvangstoverzicht tijdelijk niet beschikbaar.')
})
