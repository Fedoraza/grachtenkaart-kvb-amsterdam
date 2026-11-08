export function createRouteLinkStore(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS route_link_overrides (
    bucket TEXT NOT NULL, item_id TEXT NOT NULL, value_json TEXT NOT NULL,
    PRIMARY KEY (bucket, item_id)
  )`)
  return {
    read() {
      const result = { bridges: {}, reporting: {} }
      for (const row of database.prepare('SELECT * FROM route_link_overrides').all()) {
        Object.defineProperty(result[row.bucket], row.item_id, { value: JSON.parse(row.value_json), enumerable: true })
      }
      return result
    },
    write(bucket, id, value) {
      if (!['bridges', 'reporting'].includes(bucket) || typeof id !== 'string' || !id.trim() || id.length > 200
        || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid route link')
      database.prepare('INSERT INTO route_link_overrides VALUES (?, ?, ?) ON CONFLICT(bucket, item_id) DO UPDATE SET value_json = excluded.value_json')
        .run(bucket, id.trim(), JSON.stringify(value))
    },
  }
}
