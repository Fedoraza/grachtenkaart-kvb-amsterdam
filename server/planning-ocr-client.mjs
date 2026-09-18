import { Worker } from 'node:worker_threads'

let worker
let sequence = 0
let active = 0
const pending = new Map()

export function analyzePlanningImage(image, knownBoats, contextText = '') {
  const currentWorker = getWorker()
  const id = ++sequence
  active += 1
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    currentWorker.postMessage({ id, image, knownBoats, contextText })
  }).finally(() => { active = Math.max(0, active - 1) })
}

export function getOcrQueueStats() {
  return { active, queued: Math.max(0, active - 1) }
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./planning-ocr-worker.mjs', import.meta.url))
  worker.on('message', ({ id, result, error }) => {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    if (error) {
      const failure = new Error(error.message)
      failure.statusCode = error.statusCode
      request.reject(failure)
    } else request.resolve(result)
  })
  worker.on('error', failPending)
  worker.on('exit', (code) => {
    worker = null
    if (code) failPending(new Error(`OCR worker stopped (${code})`))
  })
  return worker
}

function failPending(error) {
  for (const request of pending.values()) request.reject(error)
  pending.clear()
}
