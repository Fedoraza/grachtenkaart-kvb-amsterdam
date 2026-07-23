<template>
  <div class="pointer-events-none absolute left-3 top-3 z-[1250] sm:left-4">
    <button v-if="!open" type="button" class="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/20 bg-slate-950/80 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md" @click="openPanel">
      <CalendarDays class="h-4 w-4 text-emerald-300" /> Schedule
      <span v-if="todayCount" class="rounded-full bg-emerald-400/15 px-1.5 text-[10px] text-emerald-200">{{ todayCount }}</span>
    </button>

    <section v-else class="pointer-events-auto fixed inset-2 flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-950/97 text-white shadow-2xl backdrop-blur-xl sm:inset-5">
      <header class="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
        <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/15"><CalendarDays class="h-5 w-5 text-emerald-300" /></span>
        <div class="min-w-0 flex-1"><p class="m-0 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Manual image import</p><h1 class="m-0 text-lg font-black">Boat schedule</h1></div>
        <button type="button" class="rounded-xl bg-white/10 p-2 text-slate-300 hover:bg-white/20" @click="open = false"><X class="h-5 w-5" /></button>
      </header>

      <div class="border-b border-white/10 px-4 py-3 sm:px-6">
        <div class="mx-auto flex max-w-2xl items-center gap-2">
          <button type="button" class="schedule-nav" aria-label="Previous day" @click="changeDate(-1)"><ChevronLeft class="h-4 w-4" /></button>
          <button type="button" class="min-w-0 flex-1 rounded-xl bg-white/5 px-3 py-2 text-center hover:bg-white/10" @click="setToday"><strong class="block text-sm">{{ dateHeading }}</strong><span class="text-[10px] text-slate-400">{{ selectedDate === today ? 'Today' : 'Click to return to today' }}</span></button>
          <button type="button" class="schedule-nav" aria-label="Next day" @click="changeDate(1)"><ChevronRight class="h-4 w-4" /></button>
          <button v-if="isAdmin" type="button" class="flex h-[2.6rem] items-center gap-2 rounded-xl bg-sky-400/10 px-3 text-xs font-bold text-sky-200 hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60" :disabled="rescanning" @click="rescanWhatsApp"><RotateCw class="h-4 w-4" :class="rescanning && 'animate-spin'" /> {{ rescanning ? 'Scanning…' : 'Rescan' }}</button>
        </div>
        <p v-if="rescanMessage" class="mx-auto mb-0 mt-2 max-w-2xl text-right text-[10px]" :class="rescanError ? 'text-red-300' : 'text-sky-300'">{{ rescanMessage }}</p>
      </div>

      <div class="schedule-scroll flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
        <section v-if="isAdmin" class="mx-auto mb-5 max-w-5xl overflow-hidden rounded-3xl border border-sky-300/15 bg-sky-400/[0.04]">
          <button type="button" class="flex w-full items-center gap-3 p-4 text-left" @click="uploadOpen = !uploadOpen">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15"><ImageUp class="h-5 w-5 text-sky-200" /></span>
            <span class="min-w-0 flex-1"><strong class="block text-sm">Import a schedule image</strong><span class="text-xs text-slate-400">Upload, review what was recognized, then choose its date and location.</span></span>
            <ChevronDown class="h-4 w-4 text-slate-400 transition" :class="uploadOpen && 'rotate-180'" />
          </button>

          <div v-if="uploadOpen" class="border-t border-white/10 p-4">
            <div v-if="!analysis" class="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
              <div class="space-y-3"><label class="block text-xs font-bold text-slate-300">WhatsApp message text <span class="font-normal text-slate-500">(optional)</span><textarea v-model="contextText" class="planning-input mt-1 min-h-24 resize-y" placeholder="Boat name&#10;@driver&#10;@host&#10;@second host"></textarea></label><label class="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-black/10 p-6 text-center hover:border-sky-300/50 hover:bg-sky-400/5">
                <ImageUp class="h-8 w-8 text-sky-300" />
                <strong class="mt-3 text-sm">Choose a schedule screenshot</strong>
                <span class="mt-1 text-xs text-slate-400">JPEG, PNG, or WebP · maximum 12 MB</span>
                <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" :disabled="analyzing" @change="selectImage" />
              </label></div>
              <div class="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <img v-if="previewUrl" :src="previewUrl" alt="Selected schedule" class="h-full max-h-64 w-full object-contain" />
                <div v-else class="flex h-full min-h-44 items-center justify-center px-6 text-center text-xs text-slate-500">The selected image will appear here.</div>
              </div>
            </div>

            <div v-if="analyzing" class="mt-4 flex items-center gap-3 rounded-2xl bg-sky-400/10 p-4 text-sm text-sky-100"><LoaderCircle class="h-5 w-5 animate-spin" /> Reading the image. Large screenshots can take a minute…</div>

            <div v-if="analysis" class="space-y-4">
              <div class="flex flex-wrap items-start gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-400/5 p-4">
                <ScanText class="mt-0.5 h-5 w-5 text-emerald-300" />
                <div class="min-w-0 flex-1"><strong class="text-sm">What I found in the picture</strong><p class="mb-0 mt-1 text-xs leading-relaxed text-slate-300">{{ analysis.summary }}</p></div>
                <button type="button" class="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20" @click="resetUpload">Use another image</button>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs font-bold text-slate-300">Schedule date<input v-model="importDate" type="date" class="planning-input mt-1" /></label>
                <label class="text-xs font-bold text-slate-300">Import at location<input v-model.trim="importLocation" class="planning-input mt-1" list="planning-locations" placeholder="Choose or type a location" /><datalist id="planning-locations"><option v-for="location in locations" :key="location" :value="location" /></datalist></label>
              </div>

              <div>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-3"><div><h3 class="m-0 text-xs font-black uppercase tracking-wider text-slate-300">Recognized schedule rows</h3><p class="mb-0 mt-1 text-[10px] text-slate-500">For tagged driver messages, select the boat, crew name, and Driver role. Times may be left empty for a full-day assignment.</p></div><div class="flex gap-3"><button type="button" class="text-xs font-bold text-orange-300" @click="addDriver">+ Add driver</button><button type="button" class="text-xs font-bold text-sky-300" @click="addItem">+ Add row</button></div></div>
                <div v-if="editableItems.length" class="space-y-2">
                  <div v-for="(item, index) in editableItems" :key="item.key" class="grid gap-2 rounded-xl border border-white/10 bg-black/15 p-2 sm:grid-cols-[1.2fr_.8fr_.8fr_.65fr_.65fr_1fr_auto]">
                    <input v-model.trim="item.boat" class="planning-input" placeholder="Boat" aria-label="Boat" />
                    <select v-model="item.eventType" class="planning-input" aria-label="Type"><option value="preparation">Preparation</option><option value="movement">Movement</option><option value="tour">Tour</option><option value="private">Private</option><option value="break">Break</option><option value="shift">Shift</option><option value="other">Other</option></select>
                    <select v-model="item.role" class="planning-input" aria-label="Crew role"><option value="">No crew role</option><option value="skipper">Driver</option><option value="host">Host</option></select>
                    <input v-model="item.startTime" type="time" class="planning-input" aria-label="Start time" />
                    <input v-model="item.endTime" type="time" class="planning-input" aria-label="End time" />
                    <input v-model.trim="item.person" class="planning-input" placeholder="Crew name" aria-label="Person" />
                    <button type="button" class="rounded-lg px-2 text-red-300 hover:bg-red-400/10" aria-label="Remove row" @click="editableItems.splice(index, 1)"><Trash2 class="h-4 w-4" /></button>
                  </div>
                </div>
                <p v-else class="m-0 rounded-xl border border-dashed border-amber-300/20 p-4 text-xs text-amber-100">No boat rows were recognized. Check the extracted text below and add the rows that should be imported.</p>
              </div>

              <div v-if="editableStaff.length">
                <h3 class="mb-2 mt-0 text-xs font-black uppercase tracking-wider text-slate-300">Recognized location staff</h3>
                <div class="space-y-2"><div v-for="(member, index) in editableStaff" :key="member.key" class="grid gap-2 rounded-xl border border-white/10 bg-black/15 p-2 sm:grid-cols-[1fr_.7fr_auto]"><input v-model.trim="member.person" class="planning-input" placeholder="Name" aria-label="Staff name" /><select v-model="member.role" class="planning-input" aria-label="Staff role"><option value="runner">Runner</option><option value="ops">Operations</option><option value="kade">Kade</option></select><button type="button" class="rounded-lg px-2 text-red-300 hover:bg-red-400/10" aria-label="Remove staff assignment" @click="editableStaff.splice(index, 1)"><Trash2 class="h-4 w-4" /></button></div></div>
              </div>

              <details class="rounded-xl border border-white/10 bg-black/15 p-3"><summary class="cursor-pointer text-xs font-bold text-slate-300">Full text read from the image</summary><pre class="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-400">{{ analysis.text }}</pre></details>
              <label class="flex items-center gap-2 text-xs text-slate-300"><input v-model="replaceExisting" type="checkbox" /> This is a complete replacement; remove all previously imported image parts for this date and location</label>
              <div class="flex flex-wrap items-center justify-end gap-3"><span v-if="importError" class="mr-auto text-xs text-red-200">{{ importError }}</span><span v-else-if="importBlocker" class="mr-auto text-xs text-amber-200">{{ importBlocker }}</span><button type="button" class="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50" :title="importBlocker" :disabled="importing || !canImport" @click="importAnalysis">{{ importing ? 'Importing…' : 'Import schedule' }}</button></div>
            </div>
            <p v-if="uploadError" class="mb-0 mt-3 rounded-xl bg-red-500/15 p-3 text-xs text-red-200">{{ uploadError }}</p>
          </div>
        </section>

        <div v-if="loading" class="flex h-40 items-center justify-center text-sm text-slate-400">Loading schedule…</div>
        <div v-else-if="error" class="mx-auto max-w-xl rounded-2xl bg-red-500/15 p-4 text-sm text-red-200">{{ error }}</div>
        <div v-else-if="!locationSchedules.length" class="mx-auto max-w-xl rounded-3xl border border-dashed border-white/15 p-10 text-center"><CalendarDays class="mx-auto h-8 w-8 text-slate-600" /><h2 class="mb-1 mt-3 text-base font-bold">No schedule for this day</h2><p class="m-0 text-xs text-slate-400">Upload an image above and assign it to a location.</p></div>
        <div v-else class="mx-auto max-w-5xl space-y-2 pb-8">
          <section class="rounded-3xl border border-violet-300/15 bg-violet-400/[0.06] p-4">
            <div class="flex items-center gap-3"><span class="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/15 text-violet-200">OPS</span><div><span class="block text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Day operations</span><strong class="text-sm">OPS for {{ dateHeading }}</strong></div></div>
            <div v-if="globalOps.length" class="mt-3 flex flex-wrap gap-2"><span v-for="member in globalOps" :key="`ops-${member.id}`" class="rounded-lg bg-black/20 px-2.5 py-1.5 text-xs"><strong>{{ member.person_name }}</strong><span v-if="member.start_time" class="ml-1 text-slate-400">{{ staffTime(member) }}</span></span></div>
            <p v-else class="mb-0 mt-2 text-[10px] text-slate-400">No OPS recognized for this day.</p>
          </section>
          <section v-for="location in locationSchedules" :key="location.name" class="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025]">
            <button type="button" class="flex w-full items-center gap-3 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10" :aria-expanded="isLocationExpanded(location.name)" @click="toggleLocation(location.name)"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-200">⌖</span><span class="min-w-0 flex-1"><span class="block text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Location</span><strong class="block truncate text-base">{{ location.name }}</strong></span><span class="shrink-0 text-right text-[11px] text-slate-400"><strong class="block text-slate-200">{{ location.boats.length }}</strong> boats</span><ChevronDown class="h-4 w-4 shrink-0 text-slate-400 transition-transform" :class="isLocationExpanded(location.name) && 'rotate-180'" /></button>
            <div v-if="isLocationExpanded(location.name)" class="grid gap-2 border-t border-white/10 p-2 sm:p-3 lg:grid-cols-2">
              <div class="rounded-2xl border border-sky-300/15 bg-sky-400/5 p-3 lg:col-span-2 2xl:col-span-3"><h3 class="m-0 text-xs font-black uppercase tracking-wider text-sky-200">Kade · {{ location.name }}</h3><div v-if="location.kade.length" class="mt-2 flex flex-wrap gap-2"><span v-for="member in location.kade" :key="`kade-${member.id}`" class="rounded-lg bg-black/20 px-2.5 py-1.5 text-xs"><strong>{{ member.person_name }}</strong><span v-if="member.start_time" class="ml-1 text-slate-400">{{ staffTime(member) }}</span></span></div><p v-else class="mb-0 mt-2 text-[10px] text-slate-400">No Kade recognized for this location.</p></div>
              <div v-if="location.otherStaff.length" class="rounded-2xl border border-emerald-300/15 bg-emerald-400/5 p-3 lg:col-span-2 2xl:col-span-3"><h3 class="m-0 text-xs font-black uppercase tracking-wider text-emerald-200">Other location team</h3><div class="mt-2 flex flex-wrap gap-2"><span v-for="member in location.otherStaff" :key="member.id" class="rounded-lg bg-black/20 px-2.5 py-1.5 text-xs"><strong class="capitalize">{{ member.role }}</strong> · {{ member.person_name }}</span></div></div>
              <p v-if="!location.boats.length && !location.staff.length" class="m-0 rounded-2xl border border-dashed border-amber-300/20 p-5 text-center text-xs text-amber-100 lg:col-span-2 2xl:col-span-3">No valid planning image was found for this location and date.</p>
              <article v-for="schedule in location.boats" :key="schedule.boatName" class="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <button type="button" class="flex w-full items-center gap-3 p-3 text-left transition hover:bg-white/5" :aria-expanded="isBoatExpanded(location.name, schedule.boatName)" @click="toggleBoat(location.name, schedule.boatName)"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-400/15 text-lg text-orange-200">⌁</span><span class="min-w-0 flex-1"><strong class="block truncate text-sm">{{ schedule.boatName }}</strong><span class="mt-0.5 block truncate text-[11px] text-slate-400">{{ driverSummary(schedule) }}</span></span><span class="shrink-0 text-[10px] text-slate-500">{{ schedule.items.length }} rows</span><span v-if="schedule.mmsi" role="button" tabindex="0" class="rounded-lg bg-orange-400/10 px-2.5 py-1.5 text-[11px] font-bold text-orange-200 hover:bg-orange-400/20" @click.stop="showOnMap(schedule)" @keydown.enter.stop="showOnMap(schedule)">Map</span><ChevronDown class="h-4 w-4 shrink-0 text-slate-400 transition-transform" :class="isBoatExpanded(location.name, schedule.boatName) && 'rotate-180'" /></button>
                <div v-if="isBoatExpanded(location.name, schedule.boatName)" class="max-h-[30rem] space-y-2 overflow-y-auto overscroll-contain border-t border-white/10 p-3">
                  <div class="rounded-xl border border-orange-300/15 bg-orange-400/[0.06] p-3">
                    <div class="flex items-center justify-between gap-3"><strong class="text-xs text-orange-100">Crew & boat day</strong><span class="text-[10px] font-bold text-orange-200">{{ boatDaySummary(schedule) }}</span></div>
                    <div v-if="crewShifts(schedule).length" class="mt-2 grid gap-1.5 sm:grid-cols-2">
                      <div v-for="crew in crewShifts(schedule)" :key="`crew-${crew.id}`" class="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-[11px]"><span><strong>{{ crew.person_name }}</strong><span class="ml-1 capitalize text-slate-400">{{ crewRole(crew.role) }}</span></span><span class="shrink-0 tabular-nums text-slate-300">{{ shiftSpan(crew) }}</span></div>
                    </div>
                    <p v-else class="mb-0 mt-2 text-[10px] text-amber-200">No crew shift recognized for this boat.</p>
                  </div>
                  <div v-for="item in schedule.items.filter((row) => row.event_type !== 'shift')" :key="item.id" class="grid grid-cols-[4rem_1fr] gap-2 rounded-xl border border-white/5 bg-black/15 p-2.5"><div class="text-xs font-bold tabular-nums text-slate-300">{{ item.start_time || '—' }}<span v-if="item.end_time" class="block text-[10px] font-normal text-slate-500">{{ durationLabel(item) }}</span></div><div><div class="flex flex-wrap items-center gap-1.5"><strong class="text-xs">{{ itemTitle(item) }}</strong><span class="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" :class="eventStyle(item.event_type)">{{ item.event_type }}</span><span v-if="item.event_type === 'tour'" class="rounded px-1.5 py-0.5 text-[9px] font-bold" :class="tourStatusStyle(item)">{{ tourStatusLabel(item) }}</span><button v-if="canShowTourRoute(item)" type="button" class="rounded bg-cyan-400/15 px-2 py-0.5 text-[9px] font-bold text-cyan-200 hover:bg-cyan-400/25" @click="showTourRoute(schedule, item)">AIS route</button></div><p v-if="itemLocation(item)" class="m-0 mt-1 text-[10px] text-slate-400">{{ itemLocation(item) }}</p><p v-if="item.notes" class="m-0 mt-1 text-[10px] text-slate-500">{{ item.notes }}</p></div></div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, inject, onUnmounted, ref } from 'vue'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ImageUp, LoaderCircle, RotateCw, ScanText, Trash2, X } from '@lucide/vue'

const emit = defineEmits(['show-boat', 'show-tour-route', 'schedule-updated'])
const auth = inject('auth')
const isAdmin = computed(() => auth.user?.role === 'admin')
const open = ref(false)
const uploadOpen = ref(false)
const today = localDateString(new Date())
const selectedDate = ref(today)
const items = ref([])
const staff = ref([])
const availableLocations = ref([])
const locations = ref([])
const loading = ref(false)
const error = ref('')
const todayCount = ref(0)
const analyzing = ref(false)
const importing = ref(false)
const uploadError = ref('')
const importError = ref('')
const previewUrl = ref('')
const contextText = ref('')
const analysis = ref(null)
const editableItems = ref([])
const editableStaff = ref([])
const importDate = ref(today)
const importLocation = ref('')
const replaceExisting = ref(false)
const rescanning = ref(false)
const rescanMessage = ref('')
const rescanError = ref(false)
const expandedLocations = ref(new Set())
const expandedBoats = ref(new Set())
let scheduleRequestId = 0
const scheduleRefreshTimer = window.setInterval(() => { if (open.value && !loading.value) loadSchedule({ silent: true }) }, 30_000)
onUnmounted(() => window.clearInterval(scheduleRefreshTimer))

const dateHeading = computed(() => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: selectedDate.value.slice(0, 4) !== today.slice(0, 4) ? 'numeric' : undefined }).format(new Date(`${selectedDate.value}T12:00:00`)))
const importBlocker = computed(() => {
  if (!importDate.value) return 'Choose the schedule date before importing.'
  if (!importLocation.value) return 'Choose the location where this schedule belongs.'
  if (!editableItems.value.length && !editableStaff.value.length) return 'Add at least one schedule row before importing.'
  return ''
})
const canImport = computed(() => !importBlocker.value)
const globalOps = computed(() => staff.value.filter((member) => member.role === 'ops'))
const locationSchedules = computed(() => {
  const grouped = new Map()
  function ensureLocation(name) { if (!grouped.has(name)) grouped.set(name, { boats: new Map(), staff: [] }); return grouped.get(name) }
  for (const location of availableLocations.value) ensureLocation(location.name)
  for (const item of items.value) {
    const locationName = item.group_location || item.from_location || 'Location unknown'
    const boats = ensureLocation(locationName).boats
    const key = item.boat_id ? `id:${item.boat_id}` : item.boat_name.toLowerCase()
    if (!boats.has(key)) boats.set(key, { boatName: item.boat_name, mmsi: item.mmsi, items: [] })
    boats.get(key).items.push(item)
  }
  for (const member of staff.value) ensureLocation(member.location || 'Location unknown').staff.push(member)
  return [...grouped].map(([name, location]) => ({ name, boats: [...location.boats.values()], staff: location.staff,
    kade: location.staff.filter((member) => member.role === 'kade'),
    otherStaff: location.staff.filter((member) => !['kade', 'ops'].includes(member.role)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

function localDateString(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
async function request(url, options) { const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed'); return data }
async function loadSchedule({ silent = false } = {}) {
  const requestedDate = selectedDate.value
  const requestId = ++scheduleRequestId
  if (!silent) { loading.value = true; error.value = '' }
  try {
    const day = await request(`/api/planning/day?date=${requestedDate}`)
    // A slower response for a previously selected day must never replace the
    // schedule the user is currently viewing.
    if (requestId !== scheduleRequestId || requestedDate !== selectedDate.value) return
    items.value = day.items
    staff.value = day.staff || []
    availableLocations.value = day.locations || []
    if (requestedDate === today) todayCount.value = day.items.length + staff.value.length
  } catch (caught) {
    if (!silent && requestId === scheduleRequestId) error.value = caught.message
  } finally {
    if (!silent && requestId === scheduleRequestId) loading.value = false
  }
}
async function openPanel() { open.value = true; const tasks = [loadSchedule()]; if (isAdmin.value && !locations.value.length) tasks.push(request('/api/planning/options').then((data) => { locations.value = data.locations })); await Promise.all(tasks) }
function setToday() { selectedDate.value = today; collapseSchedule(); loadSchedule() }
function changeDate(amount) { const date = new Date(`${selectedDate.value}T12:00:00`); date.setDate(date.getDate() + amount); selectedDate.value = localDateString(date); collapseSchedule(); loadSchedule() }
function showOnMap(schedule) { open.value = false; emit('show-boat', schedule) }
function showTourRoute(schedule, item) { open.value = false; emit('show-tour-route', { mmsi: schedule.mmsi, boatName: schedule.boatName, from: item.route_from, to: item.route_to, startTime: item.start_time, endTime: item.end_time }) }
function canShowTourRoute(item) { return item.mmsi && item.route_from && item.route_to && item.ais_point_count > 1 }
function tourStatusLabel(item) {
  const departureDelay = Math.abs(item.delay_minutes || 0)
  const returnDelay = Math.abs(item.return_delay_minutes || 0)
  const duration = item.round_duration_minutes ? ` · ${item.round_duration_minutes}m` : ''
  return ({
    'scheduled': 'Scheduled', 'waiting-ais': 'Waiting for AIS', 'no-ais': 'No AIS confirmation',
    'no-mmsi': 'No MMSI', 'invalid-time': 'Invalid time', 'active-on-time': 'Sailing · on time',
    'active-late': `Sailing · ${departureDelay}m late`, 'completed-on-time': `Returned · on time${duration}`,
    'completed-late': `Returned · ${returnDelay}m late${duration}`, 'completed-early': `Returned · ${returnDelay}m early${duration}`,
  })[item.tour_status] || 'AIS unknown'
}
function tourStatusStyle(item) { return ['active-on-time', 'completed-on-time'].includes(item.tour_status) ? 'bg-emerald-400/15 text-emerald-200' : ['active-late', 'completed-late', 'no-ais'].includes(item.tour_status) ? 'bg-red-400/15 text-red-200' : 'bg-slate-400/15 text-slate-300' }
function boatExpansionKey(location, boat) { return `${location}\u0000${boat}` }
function isLocationExpanded(location) { return expandedLocations.value.has(location) }
function isBoatExpanded(location, boat) { return expandedBoats.value.has(boatExpansionKey(location, boat)) }
function toggleLocation(location) { const next = new Set(expandedLocations.value); next.has(location) ? next.delete(location) : next.add(location); expandedLocations.value = next }
function toggleBoat(location, boat) { const key = boatExpansionKey(location, boat); const next = new Set(expandedBoats.value); next.has(key) ? next.delete(key) : next.add(key); expandedBoats.value = next }
function collapseSchedule() { expandedLocations.value = new Set(); expandedBoats.value = new Set() }
function driverSummary(schedule) { const people = schedule.items.filter((item) => item.role === 'skipper').map((item) => item.person_name).filter(Boolean); return people.length ? `Driver: ${[...new Set(people)].join(', ')}` : 'No driver recognized' }
function crewShifts(schedule) { return schedule.items.filter((item) => item.event_type === 'shift' && item.person_name).sort((a, b) => timeMinutes(a.start_time) - timeMinutes(b.start_time)) }
function crewRole(role) { return ({ skipper: 'driver', solo: 'host', host: 'host' })[role] || role }
function shiftSpan(item) { return item.start_time && item.end_time ? `${item.start_time}–${item.end_time} · ${formatMinutes(spanMinutes(item.start_time, item.end_time))}` : 'whole day' }
function staffTime(item) { return item.start_time && item.end_time ? `${item.start_time}–${item.end_time}` : '' }
function boatDaySummary(schedule) { const timed = schedule.items.filter((item) => item.event_type !== 'shift' && item.start_time && item.end_time); if (!timed.length) return 'Times unknown'; const start = timed.reduce((best, item) => timeMinutes(item.start_time) < timeMinutes(best.start_time) ? item : best).start_time; const ends = timed.map((item) => ({ value: item.end_time, minutes: adjustedEnd(item.start_time, item.end_time) })); const end = ends.sort((a, b) => b.minutes - a.minutes)[0].value; return `${start}–${end} · out ${formatMinutes(spanMinutes(start, end))}` }
function timeMinutes(value) { if (!value) return 9999; const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
function adjustedEnd(start, end) { let value = timeMinutes(end); if (value <= timeMinutes(start)) value += 24 * 60; return value }
function spanMinutes(start, end) { return adjustedEnd(start, end) - timeMinutes(start) }
function formatMinutes(value) { const hours = Math.floor(value / 60); const minutes = value % 60; return `${hours ? `${hours}h` : ''}${minutes ? ` ${minutes}m` : ''}`.trim() }
function itemTitle(item) { const label = ({ preparation: 'Prepare boat', movement: 'Sail to location', tour: 'Canal tour', private: 'Private tour', break: 'Break', shift: 'Crew shift' })[item.event_type] || item.event_type; return item.person_name ? `${label} · ${item.person_name}` : label }
function itemLocation(item) { if (item.from_location && item.to_location) return `${item.from_location} → ${item.to_location}`; return item.from_location || item.to_location || '' }
function durationLabel(item) { if (!item.end_time) return ''; const [sh, sm] = item.start_time.split(':').map(Number); const [eh, em] = item.end_time.split(':').map(Number); const minutes = (eh * 60 + em) - (sh * 60 + sm); return minutes > 0 ? `${item.end_time} · ${minutes} min` : `to ${item.end_time}` }
function eventStyle(type) { return ({ preparation: 'bg-amber-400/15 text-amber-200', movement: 'bg-violet-400/15 text-violet-200', tour: 'bg-emerald-400/15 text-emerald-200', private: 'bg-fuchsia-400/15 text-fuchsia-200', break: 'bg-sky-400/15 text-sky-200', shift: 'bg-orange-400/15 text-orange-200' })[type] || 'bg-white/10 text-slate-300' }
function addItem() { editableItems.value.push({ key: crypto.randomUUID(), boat: '', eventType: 'tour', startTime: '', endTime: '', person: '', role: '' }) }
function addDriver() { editableItems.value.push({ key: crypto.randomUUID(), boat: '', eventType: 'shift', startTime: '', endTime: '', person: '', role: 'skipper' }) }
async function rescanWhatsApp() {
  rescanning.value = true; rescanMessage.value = ''; rescanError.value = false
  try {
    const result = await request('/api/whatsapp/rescan', { method: 'POST' })
    rescanMessage.value = `Read-only scan requested for ${result.requested} of ${result.total} groups.`
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await loadSchedule()
    setTimeout(() => loadSchedule(), 4000)
    emit('schedule-updated')
  } catch (caught) { rescanError.value = true; rescanMessage.value = caught.message } finally { rescanning.value = false }
}

async function selectImage(event) {
  const file = event.target.files?.[0]
  if (!file) return
  uploadError.value = ''
  if (file.size > 12 * 1024 * 1024) { uploadError.value = 'The image must be 12 MB or smaller.'; return }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
  analyzing.value = true
  try {
    const image = await readAsDataUrl(file)
    analysis.value = await request('/api/planning/analyze', { method: 'POST', body: JSON.stringify({ image, contextText: contextText.value }) })
    editableItems.value = analysis.value.items.map((item) => ({ ...item, key: crypto.randomUUID(), startTime: item.startTime || '', endTime: item.endTime || '', person: item.person || '', role: item.role || '' }))
    editableStaff.value = analysis.value.staff.map((member) => ({ ...member, key: crypto.randomUUID() }))
    importDate.value = analysis.value.suggestedDate || selectedDate.value
    if (!importLocation.value) importLocation.value = suggestedImportLocation(analysis.value.items)
  } catch (caught) { uploadError.value = caught.message; analysis.value = null } finally { analyzing.value = false; event.target.value = '' }
}
function readAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read the selected image')); reader.readAsDataURL(file) }) }
function suggestedImportLocation(importItems) { const counts = new Map(); for (const item of importItems) { if (!item.to) continue; counts.set(item.to, (counts.get(item.to) || 0) + 1) } return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] || '' }
function resetUpload() { analysis.value = null; editableItems.value = []; editableStaff.value = []; contextText.value = ''; replaceExisting.value = false; uploadError.value = ''; importError.value = ''; if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); previewUrl.value = '' }
async function importAnalysis() {
  importing.value = true; importError.value = ''
  try {
    await request('/api/planning/manual-import', { method: 'POST', body: JSON.stringify({ serviceDate: importDate.value, location: importLocation.value, replaceExisting: replaceExisting.value, items: editableItems.value.map(({ key, ...item }) => item), staff: editableStaff.value.map(({ key, ...member }) => member), sourceText: analysis.value.text, sourceImageHash: analysis.value.imageHash }) })
    selectedDate.value = importDate.value
    await loadSchedule()
    emit('schedule-updated')
    resetUpload()
    uploadOpen.value = false
  } catch (caught) { importError.value = caught.message } finally { importing.value = false }
}
</script>

<style scoped>
.schedule-nav { display: flex; height: 2.6rem; width: 2.6rem; align-items: center; justify-content: center; border-radius: 0.75rem; background: rgb(255 255 255 / 0.07); }
.schedule-nav:hover { background: rgb(255 255 255 / 0.13); }
.planning-input { width: 100%; min-width: 0; border-radius: .65rem; border: 1px solid rgb(255 255 255 / .13); background: rgb(255 255 255 / .06); padding: .55rem .65rem; color: white; font-size: .75rem; outline: none; }
.planning-input:focus { border-color: rgb(125 211 252 / .7); }
.schedule-scroll { scrollbar-gutter: stable; -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
.schedule-scroll::-webkit-scrollbar { width: .65rem; }
.schedule-scroll::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgb(148 163 184 / .35); background-clip: padding-box; }
</style>
