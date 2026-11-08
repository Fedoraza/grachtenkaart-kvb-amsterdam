import test from 'node:test'
import assert from 'node:assert/strict'
import { createMobilePanelCoordinator, mobileRoutePadding, mobileViewportMetrics } from './mobileMapLayout.js'

test('mobile panels close other panels without losing the new selection through synchronous watchers', () => {
  let active
  const coordinator = createMobilePanelCoordinator(() => true, key => { active = key })
  let search = true
  coordinator.register('search', () => { search = false; coordinator.release('search') })
  coordinator.register('route', () => coordinator.release('route'))
  coordinator.claim('search')
  coordinator.claim('route')
  assert.equal(search, false)
  assert.equal(active, 'route')
  coordinator.close()
  assert.equal(active, null)
})
test('desktop panels remain independent', () => {
  let closed = false
  const coordinator = createMobilePanelCoordinator(() => false)
  coordinator.register('search', () => { closed = true })
  coordinator.claim('route')
  assert.equal(closed, false)
})
test('keyboard metrics accommodate both overlay and resized layout viewports', () => {
  assert.equal(mobileViewportMetrics({ width: 390, height: 844, visibleHeight: 480, editing: true }).keyboardOpen, true)
  assert.equal(mobileViewportMetrics({ width: 390, height: 480, baselineHeight: 844, editing: true }).keyboardOpen, true)
  assert.equal(mobileViewportMetrics({ width: 390, height: 844, visibleHeight: 760 }).keyboardOpen, false)
  assert.equal(mobileViewportMetrics({ width: 390, height: 844, visibleHeight: 480, offsetTop: 40 }).bottom, 324)
})
test('route fits between the search toolbar and measured bottom sheet', () => {
  const padding = mobileRoutePadding({ top: 0, left: 0, right: 390, bottom: 844, height: 844 }, { top: 0, left: 0, right: 390, bottom: 844 }, { toolbar: { bottom: 64 }, sheet: { top: 480 }, bottomSpace: 90 })
  assert.deepEqual(padding, { paddingTopLeft: [16, 80], paddingBottomRight: [16, 380] })
})
test('landscape route fit retains a positive map rectangle', () => {
  const padding = mobileRoutePadding({ top: 0, left: 0, right: 844, bottom: 390, height: 390 }, { top: 0, left: 0, right: 844, bottom: 390 }, { toolbar: { bottom: 70 }, sheet: { top: 120 } })
  assert.ok(390 - padding.paddingTopLeft[1] - padding.paddingBottomRight[1] >= 99)
})
