import { readFleetStatistics } from './fleet-statistics.mjs'
import { calculateAgentRoute } from './agent-routing.mjs'
import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'

const database = new DatabaseSync(workerData.databasePath, { readOnly: true })
database.exec('PRAGMA busy_timeout = 5000')
const history = database.prepare(`
  SELECT latitude, longitude, speed, course, heading, received_at AS receivedAt
  FROM positions
  WHERE mmsi = ? AND received_at >= ? AND received_at <= ?
  ORDER BY received_at ASC
  LIMIT 10000
`)

parentPort.on('message', ({ id, task, args }) => {
  try {
    if (task === 'agent-route') {
      parentPort.postMessage({ id, result: calculateAgentRoute(args) })
      return
    }
    if (task === 'fleet-statistics') {
      parentPort.postMessage({ id, result: readFleetStatistics(database, args) })
      return
    }
    if (task !== 'history') throw new Error('Unknown database read task')
    parentPort.postMessage({ id, result: history.all(args.mmsi, args.since, args.until) })
  } catch (error) {
    parentPort.postMessage({ id, error: { message: error.message } })
  }
})
