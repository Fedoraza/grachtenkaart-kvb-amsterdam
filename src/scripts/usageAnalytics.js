// Only foreground activity is measured. API polling, AIS messages and hidden
// tabs do not count as page views or active use.
export function startUsageAnalytics(page) {
  let lastInteraction = Date.now()
  let lastTick = Date.now()
  let cleanupFirstVisible
  let pending = Promise.resolve()
  const send = (type, activeSeconds = 0) => {
    pending = pending.then(() => fetch('/api/analytics/usage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, type, activeSeconds }), keepalive: true,
    })).catch(() => {})
  }
  const interact = () => { lastInteraction = Date.now() }
  const tick = () => {
    const now = Date.now()
    const seconds = Math.min(30, Math.max(0, (now - lastTick) / 1000))
    lastTick = now
    if (document.visibilityState === 'visible' && now - lastInteraction <= 120_000) send('heartbeat', seconds)
  }
  const visibility = () => { lastTick = Date.now(); if (document.visibilityState === 'visible') { interact(); send('heartbeat') } }
  const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart']
  for (const event of events) window.addEventListener(event, interact, { passive: true })
  document.addEventListener('visibilitychange', visibility)
  if (document.visibilityState === 'visible') send('view')
  else {
    const firstVisible = () => {
      if (document.visibilityState !== 'visible') return
      send('view')
      document.removeEventListener('visibilitychange', firstVisible)
    }
    document.addEventListener('visibilitychange', firstVisible)
    // Also remove this listener when the application is unmounted.
    cleanupFirstVisible = () => document.removeEventListener('visibilitychange', firstVisible)
  }
  const timer = window.setInterval(tick, 30_000)
  return {
    identityChanged() { lastTick = Date.now(); if (document.visibilityState === 'visible') send('heartbeat') },
    stop() {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      for (const event of events) window.removeEventListener(event, interact)
      cleanupFirstVisible?.()
    },
  }
}
