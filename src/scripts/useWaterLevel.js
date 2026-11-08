import { computed, onMounted, onUnmounted, ref } from 'vue'
import { visibleInterval } from './networkUsage.js'
import { waterLevelCorrection } from '../../shared/water-level-correction.mjs'

// One Surinamekade request and refresh timer shared by every component that
// shows or uses the water level (the map card and the route planner).
const level = ref(null)
const error = ref('')
const loading = ref(true)
const now = ref(Date.now())
let subscribers = 0
let stopTimer = null
let pending = null

async function loadLevel() {
  if (pending) return pending
  loading.value = true
  error.value = ''
  pending = (async () => {
    try {
      const response = await fetch('/api/water-level/surinamekade')
      if (!response.ok) throw new Error('Actuele waterstand niet beschikbaar')
      level.value = await response.json()
    } catch (loadError) {
      error.value = loadError.message || 'Actuele waterstand niet beschikbaar'
    } finally {
      now.value = Date.now()
      loading.value = false
      pending = null
    }
  })()
  return pending
}

const correction = computed(() => waterLevelCorrection(level.value, now.value))

export function useWaterLevel() {
  onMounted(() => {
    subscribers += 1
    if (subscribers === 1) {
      loadLevel()
      stopTimer = visibleInterval(loadLevel, 5 * 60_000)
    }
  })
  onUnmounted(() => {
    subscribers -= 1
    if (subscribers === 0) {
      stopTimer?.()
      stopTimer = null
    }
  })
  return { level, error, loading, correction, reload: loadLevel }
}
