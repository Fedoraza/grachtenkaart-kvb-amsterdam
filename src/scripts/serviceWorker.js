// Registers public/sw.js in production builds only. In development a cached
// shell would hide fresh code, so no worker is registered there.
export function registerServiceWorker(environment = globalThis) {
  const navigator = environment.navigator
  if (!import.meta.env.PROD || !navigator?.serviceWorker) return
  const base = import.meta.env.BASE_URL || '/'
  const register = () => navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {})
  if (environment.document?.readyState === 'complete') register()
  else environment.addEventListener?.('load', register, { once: true })
}
