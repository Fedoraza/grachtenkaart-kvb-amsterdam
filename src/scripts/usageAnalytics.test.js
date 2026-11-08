import test from 'node:test'
import assert from 'node:assert/strict'
import { startUsageAnalytics } from './usageAnalytics.js'

function environment(t, visibility = 'visible') {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  const requests = []
  const listeners = new Map()
  let timer
  let timestamp = 100_000
  const target = {
    addEventListener(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener) },
    removeEventListener(event, listener) { listeners.get(event)?.delete(listener) },
    fire(event) { for (const listener of [...(listeners.get(event) || [])]) listener() },
  }
  globalThis.document = { ...target, visibilityState: visibility }
  globalThis.window = { ...target, setInterval(fn) { timer = fn; return 1 }, clearInterval() { timer = null } }
  globalThis.fetch = async (url, options) => { requests.push({ url, ...JSON.parse(options.body) }); return { ok: true } }
  t.mock.method(Date, 'now', () => timestamp)
  t.after(() => Object.assign(globalThis, original))
  return { requests, listeners, advance(ms) { timestamp += ms }, tick() { timer?.() }, flush: () => new Promise(resolve => setImmediate(resolve)) }
}

test('counts one page view, sends foreground heartbeats, ignores hidden and idle time, and cleans up', async t => {
  const env = environment(t)
  const tracker = startUsageAnalytics('map')
  await env.flush()
  assert.deepEqual(env.requests.map(r => r.type), ['view'])
  env.advance(30_000); env.tick(); await env.flush()
  assert.equal(env.requests.at(-1).activeSeconds, 30)
  document.visibilityState = 'hidden'; document.fire('visibilitychange')
  env.advance(30_000); env.tick(); await env.flush()
  assert.equal(env.requests.length, 2)
  document.visibilityState = 'visible'; document.fire('visibilitychange'); await env.flush()
  assert.equal(env.requests.at(-1).activeSeconds, 0)
  env.advance(150_000); env.tick(); await env.flush()
  assert.equal(env.requests.length, 3)
  window.fire('pointerdown'); env.advance(30_000); env.tick(); await env.flush()
  assert.equal(env.requests.at(-1).type, 'heartbeat')
  tracker.identityChanged(); await env.flush()
  assert.equal(env.requests.filter(r => r.type === 'view').length, 1)
  tracker.stop()
  assert.ok([...env.listeners.values()].every(set => set.size === 0))
})

test('does not record a background tab as a page view until it becomes visible', async t => {
  const env = environment(t, 'hidden')
  const tracker = startUsageAnalytics('leaderboard')
  await env.flush()
  assert.equal(env.requests.length, 0)
  document.visibilityState = 'visible'; document.fire('visibilitychange'); await env.flush()
  document.fire('visibilitychange'); await env.flush()
  assert.equal(env.requests.filter(r => r.type === 'view').length, 1)
  tracker.stop()
})
