<template>
  <div class="pointer-events-none absolute left-3 top-16 z-[1200] sm:left-4">
    <button v-if="!open" type="button" class="pointer-events-auto rounded-xl border border-white/20 bg-slate-950/75 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md" @click="openPanel">
      Company fleet
    </button>

    <section v-else class="pointer-events-auto flex max-h-[calc(100dvh-5rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950/95 text-slate-50 shadow-2xl backdrop-blur-xl">
      <header class="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p class="m-0 text-[10px] font-bold uppercase tracking-widest text-sky-300">Company database</p>
          <h2 class="m-0 text-lg font-bold">Fleet directory <span class="text-sm font-normal text-slate-400">{{ summary.boats.length }} boats</span></h2>
        </div>
        <button class="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20" type="button" @click="open = false">×</button>
      </header>

      <div class="overflow-auto p-4">
        <WhatsAppSetup v-if="isAdmin" class="mb-4" />
        <div class="flex items-center gap-2">
          <input v-model="boatSearch" class="fleet-input flex-1" placeholder="Search by boat name, MMSI or type" />
          <button v-if="isAdmin" type="button" class="rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold hover:bg-sky-400" @click="startNewBoat">Add boat</button>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-2 sm:grid-cols-5">
          <input v-model="filters.capacity" class="fleet-input" inputmode="numeric" placeholder="Min. capacity" />
          <select v-model="filters.licence" class="fleet-input">
            <option value="">Any licence</option>
            <option v-for="licence in availableLicences" :key="licence" :value="licence">{{ licence }}</option>
          </select>
          <select v-model="filters.toilet" class="fleet-input">
            <option value="">Any toilet</option>
            <option value="yes">Has toilet</option>
            <option value="no">No toilet</option>
          </select>
          <select v-model="filters.rating" class="fleet-input">
            <option value="">Any rating</option>
            <option v-for="rating in ['S', 'A', 'B', 'C', 'D', 'E', 'F']" :key="rating" :value="rating">Rating {{ rating }}</option>
          </select>
          <select v-model="filters.availability" class="fleet-input">
            <option value="">Any AIS freshness</option>
            <option value="working">Report within 15 min</option>
            <option value="stale">Last report 15 min–24h</option>
            <option value="offline">No report for 24h+</option>
          </select>
        </div>
        <div class="mt-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>Showing {{ filteredBoats.length }} of {{ summary.boats.length }} boats</span>
          <button v-if="hasActiveFilters" type="button" class="text-sky-300 hover:text-sky-200" @click="clearFilters">Clear filters</button>
        </div>

        <BoatEditor v-if="isAdmin && creatingBoat" class="mt-3" @save="saveBoat" @cancel="creatingBoat = false" />

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <template v-for="boat in filteredBoats" :key="boat.id">
            <BoatEditor v-if="isAdmin && editingBoatId === boat.id" :boat="boat" @save="saveBoat" @cancel="editingBoatId = null" />

            <article v-else class="overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-white/20">
              <div class="aspect-[16/8] bg-slate-900">
                <img v-if="boat.photoUrl" :src="boat.photoUrl" :alt="boat.name" class="h-full w-full object-cover" />
                <div v-else class="flex h-full items-center justify-center text-3xl text-slate-600">⌁</div>
              </div>
              <div class="p-3">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full" :class="aisStatusStyle(boat).dot"></span>
                  <strong class="min-w-0 flex-1 truncate">{{ boat.name }}</strong>
                  <span v-if="boat.niceness_rating" class="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-black" :class="ratingStyle(boat.niceness_rating)">{{ boat.niceness_rating }}</span>
                  <button v-if="isAdmin" type="button" class="rounded-lg border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-xs font-bold text-sky-200 hover:bg-sky-400/20" @click="editBoat(boat)">Edit details</button>
                </div>
                <button
                  type="button"
                  class="mt-3 w-full rounded-xl border border-orange-300/25 bg-orange-400/10 px-3 py-2 text-xs font-bold text-orange-200 hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="!boat.ais?.latitude || !boat.ais?.longitude"
                  @click="showOnMap(boat)"
                >
                  {{ boat.ais?.latitude && boat.ais?.longitude ? 'Show on map' : 'No position available' }}
                </button>
                <div class="mt-1 flex items-center justify-between gap-2 text-[11px]">
                  <span class="text-slate-400">{{ boat.mmsi ? `MMSI ${boat.mmsi}` : 'No AIS linked' }}</span>
                  <span class="font-semibold" :class="aisStatusStyle(boat).text">{{ aisStatusStyle(boat).label }}</span>
                </div>
                <p class="m-0 mt-1 text-[10px] text-slate-500">{{ aisLastSeenLabel(boat) }}</p>
                <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt>Type</dt><dd>{{ boat.boat_type || (boat.open_boat ? 'Open boat' : 'Covered boat') }}</dd></div>
                  <div><dt>Licence</dt><dd>{{ boat.license_required || 'Not specified' }}</dd></div>
                  <div><dt>Dimensions</dt><dd>{{ dimensionsLabel(boat) }}</dd></div>
                  <div><dt>Capacity</dt><dd>{{ boat.capacity ? `${boat.capacity} passengers` : 'Unknown' }}</dd></div>
                  <div><dt>Propulsion</dt><dd>{{ boat.propulsion || 'Unknown' }}</dd></div>
                  <div><dt>Home dock</dt><dd>{{ boat.home_dock || 'Not set' }}</dd></div>
                  <div><dt>Toilet</dt><dd>{{ boat.has_toilet ? 'Yes' : 'No' }}</dd></div>
                  <div><dt>Niceness</dt><dd>{{ boat.niceness_rating ? `${boat.niceness_rating} rating` : 'Not rated' }}</dd></div>
                </dl>
                <p v-if="boat.notes" class="m-0 mt-3 border-t border-white/10 pt-2 text-xs leading-relaxed text-slate-300">{{ boat.notes }}</p>
              </div>
            </article>
          </template>
        </div>
        <p v-if="error" class="mt-3 rounded-lg bg-red-500/15 p-2 text-xs text-red-200">{{ error }}</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, inject, reactive, ref } from 'vue'
import BoatEditor from './BoatEditor.vue'
import WhatsAppSetup from './WhatsAppSetup.vue'

const emit = defineEmits(['show-on-map'])
const auth = inject('auth')
const isAdmin = computed(() => auth.user?.role === 'admin')

const open = ref(false)
const boatSearch = ref('')
const creatingBoat = ref(false)
const editingBoatId = ref(null)
const summary = reactive({ boats: [] })
const error = ref('')
const filters = reactive({ capacity: '', licence: '', toilet: '', rating: '', availability: '' })

const availableLicences = computed(() => [...new Set(summary.boats.map((boat) => boat.license_required).filter(Boolean))].sort())
const hasActiveFilters = computed(() => Object.values(filters).some(Boolean))

const filteredBoats = computed(() => {
  const query = boatSearch.value.trim().toLowerCase()
  return summary.boats.filter((boat) => {
    if (query && !`${boat.name} ${boat.mmsi || ''} ${boat.boat_type || ''}`.toLowerCase().includes(query)) return false
    if (filters.capacity && Number(boat.capacity || 0) < Number(filters.capacity)) return false
    if (filters.licence && boat.license_required !== filters.licence) return false
    if (filters.toilet === 'yes' && !boat.has_toilet) return false
    if (filters.toilet === 'no' && boat.has_toilet) return false
    if (filters.rating && boat.niceness_rating !== filters.rating) return false
    if (filters.availability && boat.aisStatus !== filters.availability) return false
    return true
  })
})

function clearFilters() {
  boatSearch.value = ''
  Object.assign(filters, { capacity: '', licence: '', toilet: '', rating: '', availability: '' })
}

async function request(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function loadBoats() {
  try {
    const data = await request('/api/fleet/summary')
    summary.boats = data.boats
  } catch (requestError) {
    error.value = requestError.message
  }
}

async function openPanel() {
  open.value = true
  await loadBoats()
}

function startNewBoat() {
  editingBoatId.value = null
  creatingBoat.value = true
}

function editBoat(boat) {
  creatingBoat.value = false
  editingBoatId.value = boat.id
}

function showOnMap(boat) {
  open.value = false
  emit('show-on-map', boat)
}

async function saveBoat(form, photo) {
  try {
    const boat = await request(form.id ? `/api/fleet/boats/${form.id}` : '/api/fleet/boats', {
      method: form.id ? 'PUT' : 'POST',
      body: JSON.stringify(form),
    })
    if (photo) await uploadBoatPhoto(boat.id, photo)
    creatingBoat.value = false
    editingBoatId.value = null
    await loadBoats()
  } catch (requestError) {
    error.value = requestError.message
  }
}

function uploadBoatPhoto(boatId, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try { resolve(await request(`/api/fleet/boats/${boatId}/photo`, { method: 'POST', body: JSON.stringify({ dataUrl: reader.result }) })) }
      catch (uploadError) { reject(uploadError) }
    }
    reader.onerror = () => reject(new Error('Could not read photo'))
    reader.readAsDataURL(file)
  })
}

function dimensionsLabel(boat) {
  if (boat.length_m && boat.width_m) return `${boat.length_m} × ${boat.width_m} m`
  if (boat.length_m) return `${boat.length_m} m long`
  return 'Unknown'
}

function aisStatusStyle(boat) {
  if (!boat.mmsi) return { label: 'No MMSI', dot: 'bg-slate-500', text: 'text-slate-400' }
  if (boat.aisStatus === 'working') return { label: 'Recent AIS report', dot: 'bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.8)]', text: 'text-emerald-300' }
  if (boat.aisStatus === 'stale') return { label: 'Source report stale', dot: 'bg-amber-400', text: 'text-amber-300' }
  return { label: 'Not recently received', dot: 'bg-red-400', text: 'text-red-300' }
}

function aisLastSeenLabel(boat) {
  if (!boat.aisLastSeenAt) return 'No AIS signal recorded'
  const minutes = Math.max(0, Math.floor((Date.now() - boat.aisLastSeenAt) / 60000))
  if (minutes < 1) return 'Last signal less than a minute ago'
  return `Last signal ${minutes} minute${minutes === 1 ? '' : 's'} ago`
}

function ratingStyle(rating) {
  return {
    S: 'bg-fuchsia-400/20 text-fuchsia-200 ring-1 ring-fuchsia-300/35',
    A: 'bg-emerald-400/20 text-emerald-200',
    B: 'bg-lime-400/20 text-lime-200',
    C: 'bg-yellow-400/20 text-yellow-200',
    D: 'bg-orange-400/20 text-orange-200',
    E: 'bg-red-400/20 text-red-200',
    F: 'bg-slate-500/30 text-slate-300',
  }[rating] || 'bg-white/10 text-white'
}
</script>

<style scoped>
.fleet-input { border: 1px solid rgb(255 255 255 / 0.15); border-radius: 0.5rem; background: rgb(255 255 255 / 0.05); color: white; font-size: 0.875rem; outline: none; padding: 0.55rem 0.7rem; width: 100%; }
.fleet-input::placeholder { color: rgb(148 163 184); }
dt { color: rgb(148 163 184); font-size: 0.65rem; text-transform: uppercase; }
dd { margin: 0.1rem 0 0; }
</style>
