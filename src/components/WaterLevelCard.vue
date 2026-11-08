<template>
  <aside class="water-level-card pointer-events-auto" :class="{ 'water-level-card--open': open }" aria-label="Waterstand Surinamekade">
    <button class="water-level-summary" type="button" :aria-expanded="open" @click="open = !open">
      <span class="water-level-icon" aria-hidden="true"><Waves /></span>
      <span class="water-level-summary-text">
        <small>Surinamekade</small>
        <strong v-if="level">{{ formatLevel(level.valueCmNap) }} <span>cm NAP</span></strong>
        <strong v-else>{{ loading ? 'Laden…' : 'Niet beschikbaar' }}</strong>
      </span>
      <span v-if="level" class="water-level-dot" :class="`water-level-dot--${level.status}`" aria-hidden="true"></span>
      <span class="water-level-chevron" aria-hidden="true">{{ open ? '−' : '+' }}</span>
    </button>

    <div v-if="open && !props.routePlannerOpen" class="water-level-detail">
      <div class="water-level-heading">
        <div><small>Leidende waterstand</small><h2>Amsterdam, Surinamekade</h2></div>
        <div class="water-level-heading-actions">
          <span v-if="level" :class="`water-level-status water-level-status--${level.status}`">{{ statusLabel }}</span>
          <button class="water-level-close" type="button" aria-label="Waterstand sluiten" @click="open = false">×</button>
        </div>
      </div>

      <template v-if="level">
        <div class="water-level-value">{{ formatLevel(level.valueCmNap) }} <small>cm NAP</small></div>
        <div class="water-level-scale" aria-label="Waterstand ten opzichte van de normale beheerband">
          <div class="water-level-scale-zones"><i></i><i></i><i></i></div>
          <span class="water-level-marker" :style="{ left: `${markerPosition}%` }"><b>{{ formatLevel(level.valueCmNap) }}</b></span>
        </div>
        <div class="water-level-labels"><span>−60</span><span>−55</span><span>−40</span><span>−30</span><span>−20</span></div>
        <p class="water-level-explanation">Normale beheerband: <strong>−55 tot −30 cm NAP</strong>. Streefpeil: <strong>−40 cm NAP</strong>.</p>
        <p class="water-level-time">Gemeten {{ formattedTime }}<span v-if="isStale"> · mogelijk verouderd</span></p>
      </template>
      <p v-else class="water-level-error">{{ error || 'De actuele waterstand wordt geladen…' }}</p>

      <div class="water-level-footer">
        <a href="https://rijkswaterstaatdata.nl/waterdata/" target="_blank" rel="noopener">Bron: Rijkswaterstaat</a>
        <button type="button" :disabled="loading" @click="loadLevel">{{ loading ? 'Laden…' : 'Vernieuwen' }}</button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { visibleInterval } from '../scripts/networkUsage.js'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { Waves } from '@lucide/vue'

const language = inject('language')
const props = defineProps({ routePlannerOpen: { type: Boolean, default: false } })
const displayLocale = computed(() => language?.locale === 'nl' ? 'nl-NL' : 'en-GB')
const open = ref(false)
watch(() => props.routePlannerOpen, (plannerOpen) => {
  if (plannerOpen) open.value = false
})
const loading = ref(true)
const error = ref('')
const level = ref(null)
let refreshTimer

const markerPosition = computed(() => Math.max(0, Math.min(100, ((level.value?.valueCmNap + 60) / 40) * 100)))
const statusLabel = computed(() => ({ low: 'Laag', normal: 'Normaal', high: 'Boven beheerband' }[level.value?.status] || 'Onbekend'))
const isStale = computed(() => level.value?.stale || !level.value?.measuredAt || Date.now() - Date.parse(level.value.measuredAt) > 90 * 60_000)
const formattedTime = computed(() => new Intl.DateTimeFormat(displayLocale.value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(level.value.measuredAt)))

function formatLevel(value) {
  return new Intl.NumberFormat(displayLocale.value, { maximumFractionDigits: 1 }).format(value)
}

async function loadLevel() {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch('/api/water-level/surinamekade')
    if (!response.ok) throw new Error('Actuele waterstand niet beschikbaar')
    level.value = await response.json()
  } catch (loadError) {
    error.value = loadError.message || 'Actuele waterstand niet beschikbaar'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadLevel()
  refreshTimer = visibleInterval(loadLevel, 5 * 60_000)
})
onUnmounted(() => refreshTimer?.())
</script>

<style scoped>
.water-level-card { color: white; position: absolute; top: calc(.75rem + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); width: 13.5rem; z-index: 1160; }
.water-level-card--open { width: min(22rem, calc(100vw - 1rem)); }
.water-level-summary { align-items: center; backdrop-filter: blur(12px); background: rgb(2 6 23 / .9); border: 1px solid rgb(255 255 255 / .18); border-radius: 1rem; box-shadow: 0 12px 30px rgb(0 0 0 / .28); color: inherit; cursor: pointer; display: flex; gap: .55rem; min-height: 3.35rem; padding: .45rem .7rem; width: 100%; }
.water-level-icon { align-items: center; background: rgb(14 165 233 / .2); border-radius: .7rem; color: #7dd3fc; display: flex; height: 2.35rem; justify-content: center; width: 2.35rem; }
.water-level-icon svg { height: 1.35rem; width: 1.35rem; }
.water-level-summary-text { display: grid; flex: 1; line-height: 1.1; text-align: left; }
.water-level-summary-text small { color: #bae6fd; font-size: .65rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.water-level-summary-text strong { font-size: 1rem; margin-top: .2rem; }
.water-level-summary-text strong span { color: #cbd5e1; font-size: .7rem; }
.water-level-dot { border-radius: 50%; height: .55rem; width: .55rem; }
.water-level-dot--normal { background: #34d399; box-shadow: 0 0 8px #34d399; }
.water-level-dot--low, .water-level-dot--high { background: #fbbf24; box-shadow: 0 0 8px #fbbf24; }
.water-level-chevron { color: #94a3b8; font-weight: 900; }
.water-level-detail { background: rgb(2 6 23 / .95); border: 1px solid rgb(255 255 255 / .15); border-radius: 1rem; box-shadow: 0 18px 45px rgb(0 0 0 / .4); margin-top: .4rem; padding: .9rem; }
.water-level-heading { align-items: start; display: flex; gap: .5rem; justify-content: space-between; }
.water-level-heading small { color: #7dd3fc; font-size: .62rem; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; }
.water-level-heading h2 { font-size: .95rem; margin: .15rem 0 0; }
.water-level-heading-actions { align-items: center; display: flex; gap: .35rem; }
.water-level-close { background: rgb(255 255 255 / .08); border: 0; border-radius: .5rem; color: white; cursor: pointer; display: none; font-size: 1.2rem; height: 2rem; line-height: 1; width: 2rem; }
.water-level-status { border-radius: 999px; font-size: .65rem; font-weight: 900; padding: .3rem .5rem; white-space: nowrap; }
.water-level-status--normal { background: rgb(16 185 129 / .2); color: #a7f3d0; }
.water-level-status--low, .water-level-status--high { background: rgb(245 158 11 / .2); color: #fde68a; }
.water-level-value { font-size: 2rem; font-weight: 900; margin-top: .75rem; }
.water-level-value small { color: #bae6fd; font-size: .75rem; }
.water-level-scale { height: 1rem; margin: 1.6rem .2rem .2rem; position: relative; }
.water-level-scale-zones { border-radius: 999px; display: grid; grid-template-columns: 12.5% 62.5% 25%; height: 100%; overflow: hidden; }
.water-level-scale-zones i:nth-child(1), .water-level-scale-zones i:nth-child(3) { background: #f59e0b; }
.water-level-scale-zones i:nth-child(2) { background: #10b981; }
.water-level-marker { bottom: -.25rem; position: absolute; transform: translateX(-50%); }
.water-level-marker::after { background: white; border: 2px solid #0f172a; border-radius: 50%; content: ''; display: block; height: 1.5rem; width: 1.5rem; }
.water-level-marker b { background: white; border-radius: .3rem; bottom: 1.7rem; color: #0f172a; font-size: .65rem; left: 50%; padding: .15rem .3rem; position: absolute; transform: translateX(-50%); }
.water-level-labels { color: #94a3b8; display: flex; font-size: .58rem; justify-content: space-between; }
.water-level-explanation { color: #cbd5e1; font-size: .72rem; line-height: 1.45; margin: .75rem 0 .25rem; }
.water-level-time { color: #94a3b8; font-size: .66rem; margin: 0; }
.water-level-time span { color: #fbbf24; }
.water-level-error { background: rgb(239 68 68 / .12); border-radius: .6rem; color: #fecaca; font-size: .75rem; padding: .65rem; }
.water-level-footer { align-items: center; border-top: 1px solid rgb(255 255 255 / .1); display: flex; justify-content: space-between; margin-top: .75rem; padding-top: .65rem; }
.water-level-footer a, .water-level-footer button { color: #7dd3fc; font-size: .68rem; font-weight: 800; }
.water-level-footer button { background: rgb(14 165 233 / .15); border: 0; border-radius: .5rem; cursor: pointer; padding: .35rem .55rem; }
@media (max-width: 639px) {
  .water-level-card, .water-level-card--open { left: calc(.55rem + env(safe-area-inset-left)); top: calc(5rem + env(safe-area-inset-top)); transform: none; width: auto; z-index: 1050; }
  .water-level-summary { border-radius: .85rem; min-height: 2.75rem; padding: .25rem .5rem .25rem .25rem; width: auto; }
  .water-level-icon { background: transparent; height: 2.2rem; width: 2.2rem; }
  .water-level-summary-text { flex: 0 0 auto; }
  .water-level-summary-text small, .water-level-summary-text strong span, .water-level-dot, .water-level-chevron { display: none; }
  .water-level-summary-text strong { font-size: .82rem; margin: 0; white-space: nowrap; }
  .water-level-detail { bottom: calc(var(--mobile-nav-height, 4.6rem) + .5rem + env(safe-area-inset-bottom)); left: calc(.5rem + env(safe-area-inset-left)); margin: 0; max-height: calc(100dvh - var(--mobile-nav-height, 4.6rem) - 1rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow-y: auto; position: fixed; right: calc(.5rem + env(safe-area-inset-right)); }
  .water-level-close { align-items: center; display: flex; justify-content: center; }
}
</style>
