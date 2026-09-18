import { Worker } from 'node:worker_threads'

export function createDatabaseReadClient(databasePath) {
  let worker
  let sequence = 0
  const pending = new Map()

  function getWorker() {
    if (worker) return worker
    worker = new Worker(new URL('./database-read-worker.mjs', import.meta.url), { workerData: { databasePath } })
    worker.on('message', ({ id, result, error }) => {
      const request = pending.get(id)
      if (!request) return
      pending.delete(id)
      if (error) request.reject(new Error(error.message))
      else request.resolve(result)
    })
    worker.on('error', failPending)
    worker.on('exit', (code) => {
      worker = null
      if (code) failPending(new Error(`Database read worker stopped (${code})`))
    })
    return worker
  }

  function failPending(error) {
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }

  return {
    run(task, args) {
      const id = ++sequence
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        getWorker().postMessage({ id, task, args })
      })
    },
  }
}
