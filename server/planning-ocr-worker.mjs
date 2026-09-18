import { parentPort } from 'node:worker_threads'
import { analyzePlanningImage } from './planning-upload.mjs'

parentPort.on('message', async ({ id, image, knownBoats, contextText }) => {
  try {
    const result = await analyzePlanningImage(image, knownBoats, contextText)
    parentPort.postMessage({ id, result })
  } catch (error) {
    parentPort.postMessage({ id, error: { message: error.message, statusCode: error.statusCode } })
  }
})
