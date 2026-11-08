// Partial static messages (notably class-B part B) must not erase a known
// vessel name or position. Shared by persistence and the browser stream.
export function mergeAisState(existing, update) {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(update || {})) {
    if (value !== null && value !== undefined && value !== '') merged[key] = value
  }
  return merged
}
