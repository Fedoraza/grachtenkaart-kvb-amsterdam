const STORAGE_KEY = 'boottracker:data-saver'

function storageKey(userId) { return userId == null ? STORAGE_KEY : `${STORAGE_KEY}:user-${userId}` }

export function defaultDataSaver(environment = globalThis, userId = null) {
  try {
    const stored = environment.localStorage?.getItem(storageKey(userId))
    if (stored === 'on' || stored === 'off') return stored === 'on'
  } catch { /* Private browsing may disable storage. */ }
  if (userId != null) return false
  return Boolean(environment.matchMedia?.('(max-width: 639px)').matches
    || environment.navigator?.connection?.saveData
    || /(^|-)2g$/.test(environment.navigator?.connection?.effectiveType || ''))
}

export function saveDataSaver(enabled, userId = null, environment = globalThis) {
  try { environment.localStorage.setItem(storageKey(userId), enabled ? 'on' : 'off') } catch { /* Keep this session usable without storage. */ }
}

// Polls resume immediately when the user returns, without background requests.
export function visibleInterval(callback, milliseconds, environment = globalThis) {
  const run = () => { if (environment.document.visibilityState !== 'hidden') callback() }
  const timer = environment.setInterval(run, milliseconds)
  environment.document.addEventListener('visibilitychange', run)
  return () => {
    environment.clearInterval(timer)
    environment.document.removeEventListener('visibilitychange', run)
  }
}
