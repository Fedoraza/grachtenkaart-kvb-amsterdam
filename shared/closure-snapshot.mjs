// Re-evaluate time windows even when the upstream feed is temporarily unavailable.
export function closureSnapshot(data, now = Date.now()) {
  return { ...data, features: (data.features || []).filter(feature => {
    const end = Date.parse(feature.properties?.end)
    return !Number.isFinite(end) || end > now
  }).map(feature => {
    const start = Date.parse(feature.properties?.start)
    return { ...feature, properties: { ...feature.properties,
      state: Number.isFinite(start) && start > now ? 'upcoming' : 'active' } }
  }) }
}
