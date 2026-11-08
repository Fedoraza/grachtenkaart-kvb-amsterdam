import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultDataSaver, saveDataSaver, visibleInterval } from './networkUsage.js'

test('mobile and metered connections default to data saver while respecting saved preferences', () => {
  const mobile = { matchMedia: () => ({ matches: true }) }
  assert.equal(defaultDataSaver(mobile), true)
  assert.equal(defaultDataSaver({}), false)
  assert.equal(defaultDataSaver({ navigator: { connection: { saveData: true } } }), true)
  assert.equal(defaultDataSaver({ navigator: { connection: { effectiveType: 'slow-2g' } } }), true)
  assert.equal(defaultDataSaver({ ...mobile, localStorage: { getItem: () => 'off' } }), false)
  assert.equal(defaultDataSaver({ localStorage: { getItem: () => 'on' } }), true)
  assert.equal(defaultDataSaver({ ...mobile, get localStorage() { throw Error('Storage blocked') } }), true)
})
test('background polling stops, resumes immediately and removes listeners on cleanup', () => {
  const document = new EventTarget()
  document.visibilityState = 'visible'
  let tick; let count = 0; let cleared = false
  const stop = visibleInterval(() => { count++ }, 60_000, { document, setInterval: callback => { tick = callback; return 42 }, clearInterval: id => { cleared = id === 42 } })
  tick()
  assert.equal(count, 1)
  document.visibilityState = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  tick()
  assert.equal(count, 1)
  document.visibilityState = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(count, 2)
  stop()
  assert.equal(cleared, true)
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(count, 2)
})


test('account defaults are off and guest and account preferences remain separate', () => {
  const values = new Map()
  const environment = { matchMedia: () => ({ matches: true }), localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } }
  assert.equal(defaultDataSaver(environment), true)
  assert.equal(defaultDataSaver(environment, 12), false)
  saveDataSaver(false, null, environment)
  saveDataSaver(true, 12, environment)
  assert.equal(defaultDataSaver(environment), false)
  assert.equal(defaultDataSaver(environment, 12), true)
  assert.equal(defaultDataSaver(environment, 13), false)
})
