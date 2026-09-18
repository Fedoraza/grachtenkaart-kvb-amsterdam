export function waterwayKey(feature) {
  const id = feature.id || feature.properties?.['@id']
  if (id) return `waterway:${id}`
  let hash = 2166136261
  for (const char of JSON.stringify(feature.geometry)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `waterway:geometry:${hash >>> 0}`
}

export function applyWaterwayEdits(collection, rows) {
  const edits = new Map(rows.map(row => [row.objectKey, row]))
  return {
    ...collection,
    features: collection.features.map(feature => {
      const edit = edits.get(waterwayKey(feature))
      if (!edit) return feature
      if (edit.action === 'delete') return { ...feature, properties: { ...feature.properties, closed: true } }
      return edit.feature || feature
    }),
  }
}
