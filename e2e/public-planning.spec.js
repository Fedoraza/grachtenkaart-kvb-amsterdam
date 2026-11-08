import { test, expect } from '@playwright/test'

test('planning endpoints require sign-in', async ({ request }) => {
  for (const path of ['/api/planning/day', '/api/planning/day?date=invalid', '/api/planning/options', '/api/planning/imports']) {
    expect((await request.get(path)).status()).toBe(401)
  }
  for (const path of ['/api/planning/analyze', '/api/planning/manual-import']) {
    expect((await request.post(path, { data: {} })).status()).toBe(401)
  }
})

test('guests cannot see planning or request schedules', async ({ page }) => {
  const requests = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/planning/')) requests.push(request.url())
  })
  await page.route('**/api/auth/status', route => route.fulfill({ json: { authenticated: false } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.locator('.mobile-nav-planning')).toHaveCount(0)
  expect(requests).toEqual([])
})

test('Flagship employees can open, expand and navigate the schedule without import controls', async ({ page }) => {
  await page.route('**/api/auth/status', route => route.fulfill({ json: { authenticated: true, user: { id: 1, role: 'flagship_employee' } } }))
  const dates = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/planning/day?*', route => {
    const date = new URL(route.request().url()).searchParams.get('date')
    dates.push(date)
    return route.fulfill({ json: {
      date, locations: [{ name: 'Central Station' }], staff: [], items: [
        { id: 1, boat_id: 1, boat_name: 'Testboot', service_date: date, group_location: 'Central Station', person_name: 'Testschipper', role: 'skipper', event_type: 'shift', start_time: '09:00', end_time: '17:00' },
        { id: 2, boat_id: 1, boat_name: 'Testboot', service_date: date, group_location: 'Central Station', event_type: 'tour', start_time: '10:00', end_time: '11:00', from_location: 'Central Station', to_location: 'Central Station', tour_status: 'scheduled' },
      ],
    } })
  })
  await page.goto('/')
  await page.locator('.mobile-nav-planning > button').click()
  const panel = page.locator('.mobile-nav-planning > section')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: /Central Station/ }).click()
  await panel.getByRole('button', { name: /Testboot/ }).click()
  await expect(panel).toContainText('Testschipper')
  await expect(panel).toContainText('10:00')
  await expect(panel.getByRole('button', { name: /Import a schedule image|Rescan/ })).toHaveCount(0)
  await expect(panel).not.toContainText('Upload an image')
  const firstDate = dates.at(-1)
  await panel.getByRole('button', { name: 'Next day' }).click()
  await expect.poll(() => dates.at(-1)).not.toBe(firstDate)
  await panel.getByRole('button', { name: 'Planning sluiten' }).click()
  await expect(panel).toHaveCount(0)
  expect(errors).toEqual([])
})
