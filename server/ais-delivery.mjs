import { mergeAisState } from '../shared/ais-state.mjs'
export const DATA_SAVER_INTERVAL_MS = 5_000

export function queueLatestAis(pending, messages) {
  for (const message of messages) {
    // Position and static metadata must both survive the slower delivery interval.
    const key = `${message.type}:${message.mmsi}`
    pending.set(key, mergeAisState(pending.get(key), message))
  }
}

export function takeAisBatch(pending) {
  const messages = [...pending.values()]
  pending.clear()
  return { type: 'ais-batch', messages }
}
