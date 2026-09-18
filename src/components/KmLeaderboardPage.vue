<template>
  <main class="leaderboard-page h-full overflow-y-auto bg-slate-950 text-white">
    <div class="leaderboard-glow leaderboard-glow--one"></div>
    <div class="leaderboard-glow leaderboard-glow--two"></div>

    <header class="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-8">
      <a href="/" class="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-slate-200 backdrop-blur hover:bg-white/10">← Naar de kaart</a>
      <span class="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Boat Tracker</span>
    </header>

    <div class="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">
      <section class="pt-5 text-center sm:pt-10">
        <div class="mb-4 text-5xl sm:text-7xl" aria-hidden="true">🏆</div>
        <p class="m-0 text-xs font-black uppercase tracking-[0.28em] text-amber-300">Het dagelijkse vloottoernooi</p>
        <h1 class="mx-auto mt-3 max-w-4xl text-4xl font-black leading-none tracking-tight sm:text-7xl">De grote kilometerstrijd</h1>
        <p class="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">Welke boot verslindt vandaag de meeste Amsterdamse waterkilometers? AIS houdt de stand bij. Geen jury, geen fotofinish en teleporteren levert geen punten op.</p>
      </section>

      <section class="mx-auto mt-8 max-w-3xl rounded-3xl border border-white/10 bg-white/[0.06] p-3 shadow-2xl backdrop-blur-xl sm:mt-12 sm:p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <button type="button" class="date-button" aria-label="Vorige dag" @click="shiftDate(-1)">←</button>
          <div class="min-w-0 flex-1 text-center">
            <span class="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Stand van</span>
            <strong class="block truncate text-lg capitalize sm:text-xl">{{ formattedDate }}</strong>
          </div>
          <input v-model="selectedDate" type="date" class="date-input" :max="todayAmsterdam" aria-label="Kies een datum" @change="loadLeaderboard" />
          <button type="button" class="date-button" :disabled="selectedDate >= todayAmsterdam" aria-label="Volgende dag" @click="shiftDate(1)">→</button>
        </div>
      </section>

      <section v-if="loading" class="mt-16 text-center">
        <div class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-amber-300"></div>
        <p class="mt-4 text-sm text-slate-400">Kilometers uit het water vissen…</p>
      </section>

      <template v-else-if="entries.length">
        <section class="mt-10 grid items-end gap-4 sm:mt-14 sm:grid-cols-3">
          <article v-for="(entry, index) in podium" :key="entry.id" class="podium-card" :class="`podium-card--${index + 1}`">
            <span class="podium-medal">{{ ['🥇', '🥈', '🥉'][index] }}</span>
            <span class="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Plaats {{ index + 1 }}</span>
            <h2 class="m-0 mt-1 truncate text-xl font-black sm:text-2xl">{{ entry.name }}</h2>
            <strong class="mt-3 block text-3xl font-black tabular-nums text-amber-300 sm:text-4xl">{{ formatDistance(entry.distanceKm) }}</strong>
            <span class="text-xs text-slate-500">gemeten vandaag</span>
          </article>
        </section>

        <section class="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl">
          <header class="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
            <div><p class="m-0 text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Volledige uitslag</p><h2 class="m-0 mt-1 text-xl font-black">Kilometervreters</h2></div>
            <span class="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">{{ entries.length }} fleetboten</span>
          </header>
          <div class="border-b border-white/10 p-3 sm:px-6">
            <label class="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-slate-400 focus-within:border-sky-300/40">
              <span class="shrink-0" aria-hidden="true">⌕</span>
              <input v-model.trim="boatSearch" type="search" class="min-w-0 flex-1 bg-transparent font-bold text-white outline-none placeholder:font-normal placeholder:text-slate-500" placeholder="Zoek je boot op naam…" aria-label="Zoek je boot op naam" />
              <button v-if="boatSearch" type="button" class="rounded-full bg-white/10 px-2 py-1 text-[10px] text-slate-300" aria-label="Zoekopdracht wissen" @click="boatSearch = ''">Wissen</button>
            </label>
          </div>
          <ol class="m-0 divide-y divide-white/10 p-0">
            <li v-for="entry in displayedEntries" :id="`leaderboard-boat-${entry.id}`" :key="entry.id" class="grid scroll-mt-4 grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-white/5 sm:px-6 sm:py-4">
              <span class="rank-number" :class="entry.rank <= 3 && 'rank-number--top'">{{ entry.rank }}</span>
              <div class="min-w-0"><strong class="block truncate text-sm sm:text-base">{{ entry.name }}</strong><span class="text-[10px] text-slate-500">{{ entry.samples ? `${entry.samples} AIS-metingen` : (entry.mmsi ? 'Geen AIS-metingen deze dag' : 'Geen AIS gekoppeld') }}</span></div>
              <strong class="text-base font-black tabular-nums text-amber-200 sm:text-lg">{{ formatDistance(entry.distanceKm) }}</strong>
            </li>
          </ol>
          <p v-if="boatSearch && !displayedEntries.length" class="m-0 border-t border-white/10 px-4 py-8 text-center text-sm text-slate-400">Geen fleetboot gevonden voor “{{ boatSearch }}”.</p>
          <button v-if="!boatSearch && !showAll && entries.length > initialVisibleCount" type="button" class="w-full border-t border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-black text-sky-300 hover:bg-white/[0.07]" @click="showAll = true">See more · bekijk alle {{ entries.length }} boten ↓</button>
          <p class="m-0 border-t border-white/10 bg-sky-400/[0.05] px-4 py-3 text-center text-xs text-slate-400">👻 Zie je je boot niet? Misschien vaart hij in stealthmodus — check even of de AIS het wel doet.</p>
        </section>
      </template>

      <section v-else class="mx-auto mt-14 max-w-xl rounded-3xl border border-white/10 bg-white/5 px-6 py-12 text-center">
        <div class="text-5xl" aria-hidden="true">⚓</div>
        <h2 class="mt-4 text-xl font-black">Nog geen boot van de kant</h2>
        <p class="m-0 mt-2 text-sm text-slate-400">Voor deze dag zijn nog geen geldige kilometers gemeten.</p>
      </section>

      <section v-if="coverage !== null" class="mt-8 rounded-3xl border p-5 sm:p-6" :class="complete ? 'border-emerald-300/20 bg-emerald-300/[0.06]' : 'border-amber-300/25 bg-amber-300/[0.08]'">
        <div class="flex items-end justify-between gap-4"><div><span class="text-[10px] font-black uppercase tracking-[0.2em]" :class="complete ? 'text-emerald-300' : 'text-amber-300'">Betrouwbaarheid van de stand</span><h2 class="m-0 mt-1 text-xl font-black">{{ complete ? 'AIS-ontvangst ziet er goed uit' : 'Dit is een gedeeltelijke dagstand' }}</h2></div><strong class="text-3xl font-black tabular-nums" :class="complete ? 'text-emerald-300' : 'text-amber-300'">{{ coverage }}%</strong></div>
        <div class="mt-4 h-3 overflow-hidden rounded-full bg-black/30"><div class="h-full rounded-full transition-all duration-500" :class="complete ? 'bg-emerald-400' : 'bg-amber-400'" :style="{ width: `${coverage}%` }"></div></div>
        <p class="m-0 mt-3 text-sm leading-relaxed text-slate-300">{{ complete ? 'De AIS-gateway heeft vrijwel de hele dag meegeluisterd. De ranglijst geeft daardoor een bruikbaar beeld.' : 'De AIS-gateway heeft een deel van de dag gemist. Afstanden zijn dan lager dan werkelijk gevaren en gelden alleen voor ontvangen meetmomenten.' }}</p>
      </section>

      <section class="mt-8 grid gap-4 sm:grid-cols-3">
        <article class="rule-card"><span>📡</span><strong>AIS is de scheidsrechter</strong><p>Alleen geldige bewegingen van boten uit de fleet tellen mee.</p></article>
        <article class="rule-card"><span>🌙</span><strong>Om 02:00 een nieuwe race</strong><p>Nachtelijke uitlopers tellen nog mee voor de vorige vaardag. Om twee uur springt iedereen terug naar nul.</p></article>
        <article class="rule-card"><span>🛸</span><strong>Geen teleportbonus</strong><p>GPS-sprongen en onrealistische snelheden worden uit de uitslag gevist.</p></article>
      </section>

      <p v-if="error" class="mt-6 rounded-2xl bg-red-500/15 p-4 text-center text-sm text-red-200">{{ error }}</p>
    </div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const todayAmsterdam = currentRaceDate()
const selectedDate = ref(todayAmsterdam)
const entries = ref([])
const coverage = ref(null)
const complete = ref(false)
const loading = ref(true)
const error = ref('')
const showAll = ref(false)
const boatSearch = ref('')
const initialVisibleCount = 10
let refreshTimer

const podium = computed(() => entries.value.slice(0, 3))
const rankedEntries = computed(() => entries.value.map((entry, index) => ({ ...entry, rank: index + 1 })))
const displayedEntries = computed(() => {
  const query = boatSearch.value.toLocaleLowerCase('nl-NL')
  if (query) return rankedEntries.value.filter((entry) => entry.name.toLocaleLowerCase('nl-NL').includes(query))
  return showAll.value ? rankedEntries.value : rankedEntries.value.slice(0, initialVisibleCount)
})
const formattedDate = computed(() => new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(new Date(`${selectedDate.value}T12:00:00Z`)))

async function loadLeaderboard() {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`/api/fleet/leaderboard?date=${encodeURIComponent(selectedDate.value)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Het klassement kon niet worden geladen.')
    entries.value = Array.isArray(data.entries) ? data.entries : []
    showAll.value = false
    boatSearch.value = ''
    coverage.value = Number.isFinite(Number(data.coveragePercent)) ? Number(data.coveragePercent) : null
    complete.value = Boolean(data.complete)
  } catch (requestError) {
    error.value = requestError.message
    entries.value = []
    coverage.value = null
  } finally {
    loading.value = false
  }
}

function shiftDate(days) {
  const next = new Date(`${selectedDate.value}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  selectedDate.value = next.toISOString().slice(0, 10)
  loadLeaderboard()
}

function currentRaceDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const date = `${values.year}-${values.month}-${values.day}`
  if (Number(values.hour) >= 2) return date
  const previous = new Date(`${date}T12:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return new Date(previous).toISOString().slice(0, 10)
}

function formatDistance(value) {
  return `${Number(value || 0).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km`
}

onMounted(() => {
  document.title = 'Kilometerstrijd · Boat Tracker'
  loadLeaderboard()
  refreshTimer = window.setInterval(() => { if (selectedDate.value === todayAmsterdam) loadLeaderboard() }, 60_000)
})
onBeforeUnmount(() => window.clearInterval(refreshTimer))
</script>

<style scoped>
.leaderboard-page { font-family: Inter, ui-sans-serif, system-ui, sans-serif; position: relative; }
.leaderboard-glow { border-radius: 999px; filter: blur(100px); opacity: .16; pointer-events: none; position: fixed; }
.leaderboard-glow--one { background: #f59e0b; height: 28rem; right: -8rem; top: -10rem; width: 28rem; }
.leaderboard-glow--two { background: #0ea5e9; bottom: -10rem; height: 25rem; left: -9rem; width: 25rem; }
.date-button { align-items: center; background: rgb(255 255 255 / .08); border: 1px solid rgb(255 255 255 / .12); border-radius: 999px; display: flex; font-weight: 900; height: 2.6rem; justify-content: center; width: 2.6rem; }
.date-button:hover { background: rgb(255 255 255 / .14); }
.date-button:disabled { cursor: not-allowed; opacity: .3; }
.date-input { background: rgb(15 23 42 / .8); border: 1px solid rgb(255 255 255 / .14); border-radius: .8rem; color: white; font-size: .75rem; padding: .65rem; }
.podium-card { background: rgb(15 23 42 / .86); border: 1px solid rgb(255 255 255 / .12); border-radius: 1.5rem; min-width: 0; padding: 1.4rem; text-align: center; }
.podium-card--1 { border-color: rgb(252 211 77 / .5); box-shadow: 0 20px 60px rgb(245 158 11 / .12); padding-bottom: 2rem; padding-top: 2rem; }
.podium-medal { display: block; font-size: 2.8rem; line-height: 1; }
.podium-card--1 .podium-medal { font-size: 4rem; }
.rank-number { align-items: center; background: rgb(255 255 255 / .07); border-radius: 999px; color: #94a3b8; display: flex; font-size: .75rem; font-weight: 900; height: 2rem; justify-content: center; width: 2rem; }
.rank-number--top { background: rgb(251 191 36 / .15); color: #fcd34d; }
.rule-card { background: rgb(255 255 255 / .04); border: 1px solid rgb(255 255 255 / .1); border-radius: 1.5rem; padding: 1.25rem; }
.rule-card span { display: block; font-size: 1.75rem; margin-bottom: .7rem; }
.rule-card strong { display: block; font-size: .9rem; }
.rule-card p { color: #94a3b8; font-size: .75rem; line-height: 1.55; margin: .4rem 0 0; }
@media (min-width: 640px) { .podium-card--1 { transform: translateY(-1.25rem); } }
</style>
