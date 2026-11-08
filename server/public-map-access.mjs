const publicMapPaths = new Set([
  '/api/map/bridges',
  '/api/map/operator-groups',
  '/api/map/route-links',
  '/api/map/navigation-layer',
  '/api/map/objects',
  '/api/fleet/summary',
  '/api/fleet/leaderboard',
  '/api/fleet/statistics',
  '/api/water-level/surinamekade',
])

export function isPublicMapRead(method, pathname) {
  return method === 'GET' && (
    publicMapPaths.has(pathname)
    || /^\/api\/fleet\/boats\/\d+\/photo$/.test(pathname)
    || /^\/api\/ais\/vessels\/[^/]+\/history$/.test(pathname)
  )
}
