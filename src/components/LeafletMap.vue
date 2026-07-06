<template>
  <div class="map-shell">
    <AccountMenu />
    <PlanningPanel @show-boat="focusPlanningBoatOnMap" @schedule-updated="loadTodayPlanning" />
    <FleetPanel @show-on-map="focusFleetBoatOnMap" />
    <div class="pointer-events-none absolute bottom-24 left-3 z-[1100] sm:left-4">
      <div class="pointer-events-auto w-72 rounded-2xl border border-white/15 bg-slate-950/90 p-2 text-white shadow-xl backdrop-blur-md">
        <button type="button" class="flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-black hover:bg-white/10" @click="navigationLayersOpen = !navigationLayersOpen"><span>Vaarkaartfilters</span><span>{{ navigationLayersOpen ? '−' : '+' }}</span></button>
        <div v-if="navigationLayersOpen" class="mt-1 grid gap-1 border-t border-white/10 pt-2">
          <label v-for="filter in navigationFilters" :key="filter.id" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/10">
            <input type="checkbox" :checked="activeNavigationLayers.includes(filter.id)" :disabled="loadingNavigationLayers.includes(filter.id)" @change="toggleNavigationLayer(filter.id)" />
            <i class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: filter.color }"></i><span class="min-w-0 flex-1">{{ filter.name }}</span><span v-if="navigationLayerCounts[filter.id] !== undefined" class="text-slate-400">{{ navigationLayerCounts[filter.id] }}</span>
          </label>
          <p v-if="navigationLayerError" class="m-0 rounded-lg bg-red-950/80 px-2 py-1 text-[10px] text-red-200">{{ navigationLayerError }}</p>
        </div>
      </div>
    </div>
    <div
      class="search-control pointer-events-none absolute z-[1100] max-w-[24rem]"
      :class="isSearchOpen ? 'w-[calc(100vw-1.5rem)] sm:w-[24rem]' : 'w-auto'"
    >
      <div class="pointer-events-auto rounded-2xl border border-white/20 bg-slate-950/50 p-1 text-slate-50 shadow-[0_18px_50px_rgba(0,0,0,0.30)] backdrop-blur-md sm:p-2">
        <div v-if="!isSearchOpen">
          <button
            type="button"
            class="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-[14px] font-semibold text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70"
            :aria-expanded="isSearchOpen"
            aria-controls="canal-search-panel"
            @click="toggleSearch"
          >
            <span>Search</span>
            <span v-if="searchQuery" class="max-w-32 truncate text-slate-200/70">{{ searchQuery }}</span>
          </button>
        </div>

        <div id="canal-search-panel" :class="isSearchOpen ? 'block' : 'hidden'">
          <div class="mb-2 flex items-center justify-between gap-3">
            <label class="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-slate-200/70 sm:text-[0.72rem]" for="canal-search-input">Search canals and boats</label>
            <div class="flex gap-2">
              <button type="button" class="rounded-xl border border-white/10 px-3 py-2 text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70" :class="isUserLocationActive ? 'bg-white/30' : 'bg-white/10'" :aria-label="locationButtonLabel" :title="locationButtonLabel" @click="activateUserLocation">
                <component :is="isUserLocationActive ? LocateFixed : Locate" class="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-medium text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70" @click="collapseSearch">Hide</button>
            </div>
          </div>
          <div class="flex gap-2">
            <input
              id="canal-search-input"
              ref="searchInput"
              v-model="searchQuery"
              class="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[14px] text-inherit outline-none placeholder:text-slate-200/40 focus:border-sky-300/70 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70 sm:px-3.5 sm:py-3"
              type="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="Canal, boat name or MMSI"
              @keydown.enter.prevent="selectFirstResult"
            />
            <button v-if="searchQuery" type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-[14px] font-medium text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70 sm:px-3.5 sm:py-3" @click="clearSearch">Clear</button>
          </div>
          <div class="mt-3 grid max-h-[38vh] gap-2 overflow-auto sm:max-h-[340px]">
            <button
              v-for="result in searchResults"
              :key="result.groupKey"
              type="button"
              class="grid gap-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-inherit transition hover:border-sky-400/55 hover:bg-sky-400/10 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70"
              @click="focusSearchResult(result)"
            >
              <span class="flex items-center gap-2 text-[0.9rem] font-semibold leading-tight">
                <span v-if="result.kind === 'vessel'" class="h-2 w-2 rounded-full" :class="searchVesselDotClass(result.mmsi)"></span>
                {{ result.name || (result.kind === 'vessel' ? 'Unnamed vessel' : 'Unnamed canal') }}
              </span>
              <span class="text-[0.72rem] text-slate-200/65">{{ formatResultMeta(result) }}</span>
            </button>

            <p v-if="searchQuery && !searchResults.length" class="m-0 rounded-2xl border border-dashed border-white/10 px-3 py-2 text-[0.84rem] text-slate-200/65">No canals or boats match this query.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="ais-status pointer-events-none absolute z-[1100]">
      <div class="pointer-events-auto w-[calc(100vw-1.5rem)] max-w-80 rounded-xl border border-white/20 bg-slate-950/75 px-3 py-2 text-slate-50 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-2 text-sm font-semibold">
          <span class="h-2.5 w-2.5 rounded-full" :class="aisStatusDotClass"></span>
          <span>Live AIS</span>
          <span class="tabular-nums text-slate-200/80">{{ aisVesselCount }}</span>
          <button
            type="button"
            class="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
            title="Zoom to AIS vessels"
            @click="fitAisVessels"
          >
            Find
          </button>
          <button
            type="button"
            class="ml-auto rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
            @click="isGroupsOpen = !isGroupsOpen"
          >
            {{ isGroupsOpen ? 'Close' : activeGroupLabel }}
          </button>
        </div>
        <p class="m-0 mt-1 max-w-64 text-[11px] leading-snug text-slate-200/70">{{ aisStatusMessage }}</p>
        <a
          v-if="aisStatus === 'not-configured'"
          class="pointer-events-auto mt-1.5 inline-block text-[11px] font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
          href="https://aisstream.io/apikeys"
          target="_blank"
          rel="noopener noreferrer"
        >
          Create free AIS key ↗
        </a>

        <div v-if="isGroupsOpen" class="mt-3 border-t border-white/10 pt-3">
          <label class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Show vessels</label>
          <div class="mt-1 grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2 text-xs">
            <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes('all')" @change="toggleVesselFilter('all')" />
              <span>All AIS vessels</span>
            </label>
            <label v-for="filter in builtInVesselFilters" :key="filter.id" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes(filter.id)" @change="toggleVesselFilter(filter.id)" />
              <i class="h-2 w-2 rounded-full" :class="filter.color"></i>
              <span class="flex-1">{{ filter.name }}</span>
              <span class="text-slate-400">{{ filter.count }}</span>
            </label>
            <div v-for="group in vesselGroups" :key="group.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes(`group:${group.id}`)" @change="toggleVesselFilter(`group:${group.id}`)" />
              <button type="button" class="min-w-0 flex-1 truncate text-left" :disabled="!isAdmin" @click="isAdmin && (editingGroupId = group.id)">{{ group.name }}</button>
              <span class="text-slate-400">{{ group.mmsis.length }}</span>
              <button v-if="isAdmin" type="button" class="text-sky-300" @click="editingGroupId = group.id">Edit</button>
            </div>
          </div>
          <form v-if="isAdmin" class="mt-3 flex gap-2" @submit.prevent="createVesselGroup">
            <input
              v-model="newGroupName"
              class="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm outline-none placeholder:text-slate-400"
              placeholder="New group name"
              maxlength="40"
            />
            <button class="rounded-lg bg-sky-500 px-3 text-sm font-semibold hover:bg-sky-400" type="submit">Add</button>
          </form>

          <div v-if="isAdmin && activeGroup" class="mt-3">
            <div class="flex items-center justify-between gap-2">
              <strong class="truncate text-sm">{{ activeGroup.name }}</strong>
              <button type="button" class="text-xs text-red-300 hover:text-red-200" @click="deleteActiveGroup">Delete group</button>
            </div>

            <form class="mt-2 flex gap-2" @submit.prevent="addManualMmsi">
              <input
                v-model="manualMmsi"
                class="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
                inputmode="numeric"
                maxlength="9"
                placeholder="Add 9-digit MMSI"
              />
              <button class="rounded-lg border border-white/15 bg-white/10 px-2 text-xs hover:bg-white/20" type="submit">Add</button>
            </form>

            <input
              v-model="vesselFilterQuery"
              class="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
              placeholder="Find live vessel or MMSI"
            />

            <div class="mt-2 max-h-52 space-y-1 overflow-auto">
              <label
                v-for="vessel in filteredLiveVessels"
                :key="vessel.mmsi"
                class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/10"
              >
                <input
                  type="checkbox"
                  :checked="activeGroup.mmsis.includes(vessel.mmsi)"
                  @change="toggleVesselInActiveGroup(vessel.mmsi)"
                />
                <span class="min-w-0 flex-1 truncate">{{ vessel.name || 'Unnamed vessel' }}</span>
                <span class="text-slate-400">{{ vessel.mmsi }}</span>
                <button type="button" class="text-sky-300 hover:text-sky-200" @click.prevent="focusVessel(vessel)">View</button>
              </label>
              <p v-if="!filteredLiveVessels.length" class="m-0 py-2 text-xs text-slate-400">No matching live vessels.</p>
            </div>

            <div v-if="offlineGroupMmsis.length" class="mt-2 border-t border-white/10 pt-2">
              <p class="m-0 text-[11px] text-slate-400">Saved, currently offline</p>
              <button
                v-for="mmsi in offlineGroupMmsis"
                :key="mmsi"
                type="button"
                class="mr-1 mt-1 rounded bg-white/10 px-1.5 py-1 text-[11px] hover:bg-red-500/30"
                title="Remove from group"
                @click="toggleVesselInActiveGroup(mmsi)"
              >
                {{ mmsi }} ×
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <aside
      v-if="selectedVessel"
      class="vessel-details absolute z-[1150] w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden rounded-2xl border border-white/20 bg-slate-950/90 text-slate-50 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl"
    >
      <div v-if="selectedVessel.fleet?.photoUrl" class="aspect-[16/7] bg-slate-900">
        <img :src="selectedVessel.fleet.photoUrl" :alt="selectedVessel.fleet.name" class="h-full w-full object-cover" />
      </div>
      <header class="border-b border-white/10 bg-gradient-to-br from-sky-500/25 to-cyan-300/5 px-4 py-3">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-xl">⌁</div>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[10px] font-bold uppercase tracking-[0.16em]" :class="selectedVessel.fleet ? 'text-orange-300' : selectedVessel.serviceGroup === 'nt' ? 'text-purple-300' : 'text-sky-300'">{{ selectedVessel.fleet ? 'Company fleet' : selectedVessel.serviceGroup === 'nt' ? 'Nautical supervision' : selectedVessel.serviceGroup === 'police' ? 'Police vessel' : vesselTypeLabel(selectedVessel.shipType) }}</p>
            <h2 class="m-0 truncate text-lg font-bold">{{ selectedVessel.fleet?.name || selectedVessel.name || 'Unnamed AIS vessel' }}</h2>
            <p class="m-0 text-xs text-slate-300">MMSI {{ selectedVessel.mmsi }}<span v-if="selectedVessel.aisClass"> · Class {{ selectedVessel.aisClass }}</span></p>
          </div>
          <button type="button" class="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20" aria-label="Close details" @click="closeVesselDetails">×</button>
        </div>
      </header>

      <div class="max-h-[58vh] overflow-auto p-4">
        <div class="grid grid-cols-3 gap-2">
          <div v-for="metric in vesselMetrics" :key="metric.label" class="rounded-xl bg-white/5 p-2.5">
            <span class="block text-[10px] uppercase tracking-wide text-slate-400">{{ metric.label }}</span>
            <strong class="mt-0.5 block text-base">{{ metric.value }}</strong>
          </div>
        </div>

        <section v-for="section in vesselDetailSections" :key="section.title" class="mt-4">
          <h3 class="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{{ section.title }}</h3>
          <dl class="vessel-data-list mt-2">
            <div v-for="row in section.rows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
          </dl>
        </section>

        <section v-if="selectedVessel.fleet?.notes" class="mt-4 rounded-xl border border-orange-300/15 bg-orange-400/10 p-3">
          <h3 class="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">Operational notes</h3>
          <p class="m-0 mt-1.5 text-xs leading-relaxed text-slate-200">{{ selectedVessel.fleet.notes }}</p>
        </section>

        <div class="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3">
          <code class="text-xs">{{ formatCoordinate(selectedVessel.latitude) }}, {{ formatCoordinate(selectedVessel.longitude) }}</code>
          <a class="text-xs font-semibold text-sky-300 hover:text-sky-200" :href="vesselMapsUrl" target="_blank" rel="noopener noreferrer">Maps ↗</a>
        </div>

        <section class="mt-4">
          <div class="flex items-center justify-between">
            <h3 class="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Past route</h3>
            <span class="text-[10px] text-slate-400">{{ historyPointCount }} saved points</span>
          </div>
          <div class="mt-2 grid grid-cols-4 gap-1.5">
            <button
              v-for="hours in [1, 6, 24, 168]"
              :key="hours"
              type="button"
              class="rounded-lg border border-white/10 px-2 py-1.5 text-xs hover:bg-white/10"
              :class="historyHours === hours ? 'bg-sky-400/20 text-sky-200' : 'bg-white/5'"
              @click="showVesselHistory(hours)"
            >
              {{ hours === 168 ? '7 days' : `${hours}h` }}
            </button>
          </div>
          <p class="m-0 mt-1.5 text-[10px] text-slate-400">History is recorded by this server from the moment it is running.</p>
          <p v-if="historyOmittedCount" class="m-0 mt-1 text-[10px] text-amber-300">{{ historyOmittedCount }} unreliable segment{{ historyOmittedCount === 1 ? '' : 's' }} omitted.</p>
          <div class="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-300">
            <span class="flex items-center gap-1"><i class="h-2 w-2 rounded-full border-2 border-white bg-cyan-500"></i> Actual AIS report</span>
            <span class="flex items-center gap-1"><i class="h-1.5 w-5 rounded border border-slate-900 bg-yellow-300"></i> Reconstructed canal route</span>
            <span class="flex items-center gap-1"><i class="h-0 w-5 border-t-2 border-dashed border-red-500"></i> Direct fallback</span>
          </div>
        </section>

        <button
          v-if="isAdmin && activeGroup"
          type="button"
          class="mt-3 w-full rounded-xl border border-sky-300/25 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/20"
          @click="toggleVesselInActiveGroup(selectedVessel.mmsi)"
        >
          {{ activeGroup.mmsis.includes(selectedVessel.mmsi) ? `Remove from ${activeGroup.name}` : `Add to ${activeGroup.name}` }}
        </button>
      </div>
    </aside>

    <div ref="mapEl" class="map"></div>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Locate, LocateFixed } from '@lucide/vue'
import {
  createMap,
  loadCanals,
  addCanals,
  addDock,
  buildCanalSearchIndex,
  findCanalResultByFeature,
  listCanals,
  searchCanals,
  focusCanalResult,
  clearCanalResultHighlight,
  showUserLocation,
} from '../scripts/leafletMap'
import { showLiveAisVessels } from '../scripts/aisVessels'
import { createBridgeLayer, loadAmsterdamBridges } from '../scripts/bridgeLayer'
import { createNavigationLayer, createRestrictionLayer, loadNavigationLayer } from '../scripts/navigationLayers'
import FleetPanel from './FleetPanel.vue'
import AccountMenu from './AccountMenu.vue'
import PlanningPanel from './PlanningPanel.vue'

const auth = inject('auth')
const isAdmin = computed(() => auth.user?.role === 'admin')

const mapEl = ref(null)
const searchInput = ref(null)
const searchQuery = ref('')
const isSearchOpen = ref(false)
const canalsLayer = ref(null)
const canalSearchIndex = ref(null)
const selectedResult = ref(null)
const isUserLocationActive = ref(false)
const bridgeLayerVisible = ref(false)
const bridgeLayerLoading = ref(false)
const bridgeLayerError = ref('')
const bridgeCount = ref(0)
const navigationLayersOpen = ref(false)
const activeNavigationLayers = ref([])
const loadingNavigationLayers = ref([])
const navigationLayerCounts = ref({})
const navigationLayerError = ref('')
const aisStatus = ref('connecting')
const aisStatusMessage = ref('Connecting to the local AIS gateway…')
const aisVesselCount = ref(0)
const liveVessels = ref([])
const vesselGroups = ref(loadVesselGroups())
const activeVesselFilters = ref(['company', 'nt', 'police'])
const companyMmsis = ref([])
const companyFleetBoats = ref([])
const todayPlanningItems = ref([])
const ntMmsis = ['244035980', '244146144', '244750576', '244374235']
const policeMmsis = ['244615809', '244129388', '244034521', '244044753']
const editingGroupId = ref(null)
const isGroupsOpen = ref(false)
const newGroupName = ref('')
const manualMmsi = ref('')
const vesselFilterQuery = ref('')
const selectedVessel = ref(null)
const historyHours = ref(1)
const historyPointCount = ref(0)
const historyOmittedCount = ref(0)
let map = null
let userLocationController = null
let aisController = null
let planningRefreshTimer = null
let bridgeLayerController = null
let canalsGeoJson = null
const navigationLayerControllers = new Map()
const navigationFilters = [
  { id: 'bridges', name: 'Brughoogtes', color: '#f59e0b' },
  { id: 'bridge-openings', name: 'Geplande brugopeningen', color: '#ef4444' },
  { id: 'water-levels', name: 'Actuele waterstanden', color: '#2563eb' },
  { id: 'locks', name: 'Sluizen en bediening', color: '#8b5cf6' },
  { id: 'moorings', name: 'Aanlegplaatsen en ligplaatsen', color: '#10b981' },
  { id: 'markers', name: 'Boeien en vaarwegmarkeringen', color: '#06b6d4' },
  { id: 'restrictions', name: 'Snelheid en vaarbeperkingen', color: '#f97316' },
]

const aisStatusDotClass = computed(() => ({
  'bg-emerald-400 shadow-[0_0_10px_rgb(52_211_153/0.8)]': aisStatus.value === 'live',
  'bg-amber-400': ['connecting', 'reconnecting'].includes(aisStatus.value),
  'bg-slate-400': aisStatus.value === 'not-configured',
  'bg-red-400': ['error', 'disconnected'].includes(aisStatus.value),
}))

const activeGroup = computed(() => {
  return vesselGroups.value.find((group) => group.id === editingGroupId.value) || null
})
const activeGroupLabel = computed(() => {
  if (activeVesselFilters.value.includes('all')) return 'All vessels'
  const count = activeVesselFilters.value.length
  return `${count} group${count === 1 ? '' : 's'}`
})
const builtInVesselFilters = computed(() => [
  { id: 'company', name: 'Company fleet', count: companyMmsis.value.length, color: 'bg-orange-400' },
  { id: 'nt', name: 'Nautical supervision / NT', count: ntMmsis.length, color: 'bg-purple-500' },
  { id: 'police', name: 'Police vessels', count: policeMmsis.length, color: 'bg-blue-500' },
])
const filteredLiveVessels = computed(() => {
  const query = vesselFilterQuery.value.trim().toLowerCase()
  if (!query) return liveVessels.value
  return liveVessels.value.filter((vessel) =>
    `${vessel.name || ''} ${vessel.mmsi}`.toLowerCase().includes(query),
  )
})
const offlineGroupMmsis = computed(() => {
  if (!activeGroup.value) return []
  const liveMmsis = new Set(liveVessels.value.map((vessel) => vessel.mmsi))
  return activeGroup.value.mmsis.filter((mmsi) => !liveMmsis.has(mmsi))
})
const vesselMapsUrl = computed(() => {
  if (!selectedVessel.value) return '#'
  return `https://www.google.com/maps/search/?api=1&query=${selectedVessel.value.latitude},${selectedVessel.value.longitude}`
})
const vesselMetrics = computed(() => {
  const vessel = selectedVessel.value
  if (!vessel) return []
  return [
    { label: 'Speed', value: Number.isFinite(vessel.speed) ? `${vessel.speed.toFixed(1)} kn` : '—' },
    { label: 'Course', value: formatDegrees(vessel.course) },
    { label: 'Heading', value: formatDegrees(vessel.heading) },
  ]
})
const vesselDetailSections = computed(() => {
  const vessel = selectedVessel.value
  if (!vessel) return []
  const sections = [
    {
      title: 'Voyage',
      rows: [
        { label: 'Status', value: navigationStatusLabel(vessel.navigationStatus) },
        { label: 'Destination', value: vessel.destination || 'Not transmitted' },
        { label: 'Last signal', value: formatSignalTime(vessel.receivedAt) },
      ],
    },
    {
      title: 'Vessel',
      rows: [
        { label: 'Call sign', value: vessel.callSign || 'Unknown' },
        { label: 'IMO', value: vessel.imo || 'Not available' },
        { label: 'Dimensions', value: formatDimensions(vessel) },
        { label: 'Draught', value: vessel.draught ? `${vessel.draught} m` : 'Unknown' },
      ],
    },
  ]

  if (vessel.fleet) {
    sections.unshift({
      title: 'Company details',
      rows: [
        { label: 'Boat type', value: vessel.fleet.boat_type || (vessel.fleet.open_boat ? 'Open boat' : 'Covered boat') },
        { label: 'Required licence', value: vessel.fleet.license_required || 'Not specified' },
        { label: 'Open boat', value: vessel.fleet.open_boat ? 'Yes' : 'No' },
        { label: 'Toilet', value: vessel.fleet.has_toilet ? 'Yes' : 'No' },
        { label: 'Niceness rating', value: vessel.fleet.niceness_rating || 'Not rated' },
        { label: 'Dimensions', value: formatFleetDimensions(vessel.fleet) },
        { label: 'Capacity', value: vessel.fleet.capacity ? `${vessel.fleet.capacity} passengers` : 'Unknown' },
        { label: 'Propulsion', value: vessel.fleet.propulsion || 'Unknown' },
        { label: 'Home dock', value: vessel.fleet.home_dock || 'Not set' },
        { label: 'Registration', value: vessel.fleet.registration || 'Not set' },
      ],
    })
    const planning = planningForVessel(vessel)
    const drivers = uniquePeople(planning, ['skipper', 'solo'])
    const hosts = uniquePeople(planning, ['host'])
    const shifts = planning.filter((item) => item.event_type === 'shift' && item.start_time)
      .map((item) => `${item.start_time}${item.end_time ? `–${item.end_time}` : ''}`)
    const locations = [...new Set(planning.flatMap((item) => [item.from_location, item.to_location]).filter(Boolean))]
    sections.unshift({
      title: "Today's schedule",
      rows: [
        { label: 'Driver', value: drivers.length ? drivers.join(', ') : 'Not scheduled / not recognized' },
        { label: 'Host', value: hosts.length ? hosts.join(', ') : 'Not scheduled' },
        { label: 'Shift', value: shifts.length ? [...new Set(shifts)].join(', ') : 'No shift time' },
        { label: 'Location', value: locations.length ? locations.join(' → ') : 'Not specified' },
      ],
    })
  }

  return sections
})

const searchResults = computed(() => {
  const query = searchQuery.value.trim()

  if (!canalSearchIndex.value) {
    return []
  }

  if (!query) {
    return listCanals(canalSearchIndex.value)
  }

  const normalizedQuery = query.toLowerCase()
  const vesselResults = liveVessels.value
    .filter((vessel) => `${vessel.name || ''} ${vessel.mmsi}`.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      const aExact = a.mmsi === query || a.name?.toLowerCase() === normalizedQuery
      const bExact = b.mmsi === query || b.name?.toLowerCase() === normalizedQuery
      return Number(bExact) - Number(aExact) || (a.name || a.mmsi).localeCompare(b.name || b.mmsi)
    })
    .slice(0, 20)
    .map((vessel) => ({
      kind: 'vessel',
      groupKey: `vessel:${vessel.mmsi}`,
      name: vessel.name,
      mmsi: vessel.mmsi,
      receivedAt: vessel.receivedAt,
    }))

  return [...vesselResults, ...searchCanals(canalSearchIndex.value, query)]
})

const locationButtonLabel = computed(() => {
  if (isUserLocationActive.value) {
    return 'Hide live location'
  }

  return 'Show live location'
})

function clearSearch() {
  clearSelectedResult()
  searchQuery.value = ''
}

function loadVesselGroups() {
  try {
    const groups = JSON.parse(localStorage.getItem('ais-vessel-groups') || '[]')
    return Array.isArray(groups) ? groups : []
  } catch {
    return []
  }
}

function saveVesselGroups() {
  localStorage.setItem('ais-vessel-groups', JSON.stringify(vesselGroups.value))
}

function createVesselGroup() {
  const name = newGroupName.value.trim()
  if (!name) return

  const group = {
    id: crypto.randomUUID(),
    name,
    mmsis: [],
  }
  vesselGroups.value.push(group)
  editingGroupId.value = group.id
  activeVesselFilters.value = [...activeVesselFilters.value.filter((filter) => filter !== 'all'), `group:${group.id}`]
  newGroupName.value = ''
  saveVesselGroups()
}

function deleteActiveGroup() {
  if (!activeGroup.value) return
  const filterId = `group:${activeGroup.value.id}`
  vesselGroups.value = vesselGroups.value.filter((group) => group.id !== activeGroup.value.id)
  activeVesselFilters.value = activeVesselFilters.value.filter((filter) => filter !== filterId)
  editingGroupId.value = null
  saveVesselGroups()
}

function toggleVesselInActiveGroup(mmsi) {
  if (!activeGroup.value) return
  const normalizedMmsi = String(mmsi)
  const current = activeGroup.value.mmsis
  activeGroup.value.mmsis = current.includes(normalizedMmsi)
    ? current.filter((value) => value !== normalizedMmsi)
    : [...current, normalizedMmsi]
  saveVesselGroups()
  applyVesselGroupFilter()
}

function addManualMmsi() {
  const mmsi = manualMmsi.value.trim()
  if (!activeGroup.value || !/^\d{9}$/.test(mmsi)) return
  if (!activeGroup.value.mmsis.includes(mmsi)) activeGroup.value.mmsis.push(mmsi)
  manualMmsi.value = ''
  saveVesselGroups()
  applyVesselGroupFilter()
}

function applyVesselGroupFilter() {
  if (activeVesselFilters.value.includes('all')) {
    aisController?.setVisibleMmsis(null)
    return
  }

  const visibleMmsis = new Set()
  if (activeVesselFilters.value.includes('company')) companyMmsis.value.forEach((mmsi) => visibleMmsis.add(mmsi))
  if (activeVesselFilters.value.includes('nt')) ntMmsis.forEach((mmsi) => visibleMmsis.add(mmsi))
  if (activeVesselFilters.value.includes('police')) policeMmsis.forEach((mmsi) => visibleMmsis.add(mmsi))
  for (const filter of activeVesselFilters.value) {
    if (!filter.startsWith('group:')) continue
    const group = vesselGroups.value.find((candidate) => candidate.id === filter.slice(6))
    group?.mmsis.forEach((mmsi) => visibleMmsis.add(mmsi))
  }
  aisController?.setVisibleMmsis(visibleMmsis)
}

function toggleVesselFilter(filter) {
  if (filter === 'all') {
    activeVesselFilters.value = activeVesselFilters.value.includes('all') ? [] : ['all']
    return
  }

  const withoutAll = activeVesselFilters.value.filter((value) => value !== 'all')
  activeVesselFilters.value = withoutAll.includes(filter)
    ? withoutAll.filter((value) => value !== filter)
    : [...withoutAll, filter]
}

function fitAisVessels() {
  aisController?.fitVisibleVessels()
}

function focusVessel(vessel) {
  aisController?.focusVessel(vessel.mmsi)
}

function focusFleetBoatOnMap(boat) {
  if (!boat?.ais || !map) return

  activeVesselFilters.value = ['all']
  applyVesselGroupFilter()
  const focused = aisController?.focusVessel(String(boat.mmsi))

  if (!focused && Number.isFinite(boat.ais.latitude) && Number.isFinite(boat.ais.longitude)) {
    map.setView([boat.ais.latitude, boat.ais.longitude], Math.max(map.getZoom(), 16))
    selectedVessel.value = { ...boat.ais, mmsi: String(boat.mmsi), fleet: boat }
  }
}

function focusPlanningBoatOnMap(schedule) {
  const boat = companyFleetBoats.value.find((candidate) => String(candidate.mmsi) === String(schedule.mmsi)
    || normalizeBoatLabel(candidate.name) === normalizeBoatLabel(schedule.boatName))
  if (boat) focusFleetBoatOnMap(boat)
  else if (schedule.mmsi) aisController?.focusVessel(String(schedule.mmsi))
}

function planningForVessel(vessel) {
  const mmsi = String(vessel.mmsi || vessel.fleet?.mmsi || '')
  const name = normalizeBoatLabel(vessel.fleet?.name || vessel.name)
  return todayPlanningItems.value.filter((item) => (mmsi && String(item.mmsi || '') === mmsi)
    || normalizeBoatLabel(item.boat_name) === name)
}

function uniquePeople(items, roles) {
  const people = []
  for (const name of items.filter((item) => roles.includes(item.role)).map((item) => item.person_name).filter(Boolean)) {
    const existing = people.findIndex((candidate) => personNameSimilarity(candidate, name) >= 0.72)
    if (existing < 0) people.push(name)
    else if (name.length > people[existing].length) people[existing] = name
  }
  return people
}

function personNameSimilarity(left, right) {
  const a = normalizeBoatLabel(left).replace(/\s/g, '')
  const b = normalizeBoatLabel(right).replace(/\s/g, '')
  if (!a || !b || a[0] !== b[0]) return 0
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous.splice(0, previous.length, ...current)
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length)
}

function normalizeBoatLabel(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

async function loadTodayPlanning() {
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
    const response = await fetch(`/api/planning/day?date=${today}`)
    if (response.ok) todayPlanningItems.value = (await response.json()).items
  } catch {
    // The map and AIS remain usable when planning is temporarily unavailable.
  }
}

function closeVesselDetails() {
  selectedVessel.value = null
  aisController?.clearSelection()
}

function showVesselHistory(hours) {
  if (!selectedVessel.value) return
  historyHours.value = hours
  aisController?.showHistory(selectedVessel.value.mmsi, hours)
}

function formatDegrees(value) {
  return Number.isFinite(value) ? `${Math.round(value)}°` : '—'
}

function formatDimensions(vessel) {
  if (vessel.length && vessel.width) return `${vessel.length} × ${vessel.width} m`
  if (vessel.length) return `${vessel.length} m long`
  if (vessel.width) return `${vessel.width} m wide`
  return 'Unknown'
}

function formatFleetDimensions(boat) {
  if (boat.length_m && boat.width_m) return `${boat.length_m} × ${boat.width_m} m`
  if (boat.length_m) return `${boat.length_m} m long`
  return 'Unknown'
}

function enrichVesselWithFleetData(vessel) {
  const fleet = companyFleetBoats.value.find((boat) => String(boat.mmsi) === String(vessel.mmsi)) || null
  const mmsi = String(vessel.mmsi)
  const serviceGroup = ntMmsis.includes(mmsi) ? 'nt' : policeMmsis.includes(mmsi) ? 'police' : null
  return { ...vessel, fleet, serviceGroup }
}

function searchVesselDotClass(mmsi) {
  const value = String(mmsi)
  if (policeMmsis.includes(value)) return 'bg-blue-500'
  if (ntMmsis.includes(value)) return 'bg-purple-500'
  if (companyMmsis.value.includes(value)) return 'bg-orange-400'
  return 'bg-sky-400'
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(5) : '—'
}

function formatSignalTime(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  return minutes < 1 ? 'Less than 1 minute ago' : `${minutes} minute${minutes === 1 ? '' : 's'} ago`
}

function navigationStatusLabel(status) {
  return {
    0: 'Under way using engine',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted manoeuvrability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Fishing',
    8: 'Under way sailing',
    14: 'AIS-SART active',
    15: 'Not defined',
  }[status] || 'Unknown'
}

function vesselTypeLabel(type) {
  if (!Number.isFinite(type)) return 'AIS vessel'
  if (type === 30) return 'Fishing vessel'
  if (type >= 31 && type <= 32) return 'Towing vessel'
  if (type === 33) return 'Dredger'
  if (type === 35) return 'Military vessel'
  if (type === 36) return 'Sailing vessel'
  if (type === 37) return 'Pleasure craft'
  if (type >= 40 && type <= 49) return 'High-speed craft'
  if (type === 50) return 'Pilot vessel'
  if (type === 51) return 'Search and rescue'
  if (type === 52) return 'Tug'
  if (type === 53) return 'Port tender'
  if (type >= 60 && type <= 69) return 'Passenger vessel'
  if (type >= 70 && type <= 79) return 'Cargo vessel'
  if (type >= 80 && type <= 89) return 'Tanker'
  return 'AIS vessel'
}

async function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value

  if (isSearchOpen.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}

function collapseSearch() {
  isSearchOpen.value = false
}

function focusResult(result) {
  if (!map || !canalsLayer.value) return

  clearSelectedResult()

  const focused = focusCanalResult(map, canalsLayer.value, result)

  if (focused) {
    selectedResult.value = result
  }

  if (focused && result.name) {
    searchQuery.value = result.name
  }
}

function focusSearchResult(result) {
  if (result.kind !== 'vessel') {
    focusResult(result)
    return
  }

  activeVesselFilters.value = ['all']
  applyVesselGroupFilter()
  aisController?.focusVessel(result.mmsi)
  searchQuery.value = result.name || result.mmsi
}

function selectFirstResult() {
  if (searchResults.value.length === 0) return

  focusSearchResult(searchResults.value[0])
}

function activateUserLocation() {
  if (!map) return

  if (isUserLocationActive.value) {
    userLocationController?.stop()
    userLocationController = null
    isUserLocationActive.value = false
    return
  }

  isUserLocationActive.value = true
  userLocationController = showUserLocation(map, {
    onError: (error) => {
      userLocationController?.stop()
      userLocationController = null
      isUserLocationActive.value = false
    },
  })
}

async function toggleBridgeLayer() {
  if (!map || bridgeLayerLoading.value) return
  bridgeLayerError.value = ''
  if (bridgeLayerVisible.value) {
    map.removeLayer(bridgeLayerController.layer)
    bridgeLayerVisible.value = false
    return
  }
  bridgeLayerLoading.value = true
  try {
    if (!bridgeLayerController) {
      const data = await loadAmsterdamBridges()
      bridgeLayerController = createBridgeLayer(map, data)
      bridgeCount.value = bridgeLayerController.count
    }
    bridgeLayerController.layer.addTo(map)
    bridgeLayerVisible.value = true
  } catch (error) {
    bridgeLayerError.value = error.message
  } finally {
    bridgeLayerLoading.value = false
  }
}

async function toggleNavigationLayer(id) {
  if (!map || loadingNavigationLayers.value.includes(id)) return
  navigationLayerError.value = ''
  const active = activeNavigationLayers.value.includes(id)
  if (active) {
    const controller = id === 'bridges' ? bridgeLayerController?.layer : navigationLayerControllers.get(id)
    if (controller) map.removeLayer(controller)
    activeNavigationLayers.value = activeNavigationLayers.value.filter((value) => value !== id)
    if (id === 'bridges') bridgeLayerVisible.value = false
    return
  }
  loadingNavigationLayers.value = [...loadingNavigationLayers.value, id]
  try {
    let layer
    if (id === 'bridges') {
      if (!bridgeLayerController) {
        const data = await loadAmsterdamBridges()
        bridgeLayerController = createBridgeLayer(map, data)
        bridgeCount.value = bridgeLayerController.count
      }
      layer = bridgeLayerController.layer
      bridgeLayerVisible.value = true
      navigationLayerCounts.value = { ...navigationLayerCounts.value, bridges: bridgeCount.value }
    } else if (id === 'restrictions') {
      layer = navigationLayerControllers.get(id) || createRestrictionLayer(canalsGeoJson)
      navigationLayerControllers.set(id, layer)
      navigationLayerCounts.value = { ...navigationLayerCounts.value, restrictions: layer.getLayers().length }
    } else {
      if (!navigationLayerControllers.has(id)) {
        const data = await loadNavigationLayer(id)
        navigationLayerControllers.set(id, createNavigationLayer(id, data))
        navigationLayerCounts.value = { ...navigationLayerCounts.value, [id]: data.features?.length || 0 }
      }
      layer = navigationLayerControllers.get(id)
    }
    layer.addTo(map)
    activeNavigationLayers.value = [...activeNavigationLayers.value, id]
  } catch (error) {
    navigationLayerError.value = error.message
  } finally {
    loadingNavigationLayers.value = loadingNavigationLayers.value.filter((value) => value !== id)
  }
}

function formatResultMeta(result) {
  if (result?.kind === 'vessel') {
    const mmsi = String(result.mmsi)
    const groupLabel = policeMmsis.includes(mmsi)
      ? 'Police · '
      : ntMmsis.includes(mmsi)
        ? 'Nautical supervision · '
        : companyMmsis.value.includes(mmsi)
          ? 'Company fleet · '
          : ''
    return `${groupLabel}MMSI ${result.mmsi}`
  }

  if (!result?.wayIds?.length) {
    return ''
  }

  if (result.wayIds.length === 1) {
    return result.wayIds[0]
  }

  return `${result.wayIds[0]} +${result.wayIds.length - 1} more`
}

function clearSelectedResult() {
  if (!canalsLayer.value || !selectedResult.value) {
    selectedResult.value = null
    return
  }

  clearCanalResultHighlight(canalsLayer.value, selectedResult.value)
  selectedResult.value = null
}

function bindCanalClickSelection() {
  if (!canalsLayer.value || !canalSearchIndex.value) return

  canalsLayer.value.eachLayer((featureLayer) => {
    featureLayer.on('click', () => {
      const result = findCanalResultByFeature(canalSearchIndex.value, featureLayer.feature)

      if (!result) return

      focusResult(result)
    })
  })
}

watch(searchQuery, (nextValue, previousValue) => {
  if (previousValue && !nextValue) {
    clearSelectedResult()
  }
})

watch(activeVesselFilters, applyVesselGroupFilter, { deep: true })

onMounted(async () => {
  if (!mapEl.value) return

  map = createMap(mapEl.value)
  loadTodayPlanning()
  planningRefreshTimer = window.setInterval(loadTodayPlanning, 60_000)

  const canals = await loadCanals()
  canalsGeoJson = canals
  canalSearchIndex.value = buildCanalSearchIndex(canals)
  canalsLayer.value = await addCanals(map, canals)
  bindCanalClickSelection()

  try {
    const fleetSummary = await fetch('/api/fleet/summary').then((response) => response.json())
    companyFleetBoats.value = fleetSummary.boats
    companyMmsis.value = fleetSummary.boats.map((boat) => String(boat.mmsi)).filter(Boolean)

    aisController = showLiveAisVessels(map, {
      canals,
      onStatus: ({ status, message }) => {
        aisStatus.value = status
        aisStatusMessage.value = message
      },
      onCount: (count) => {
        aisVesselCount.value = count
      },
      onVessels: (vessels) => {
        liveVessels.value = vessels.map((vessel) => ({
          ...vessel,
          mmsi: String(vessel.mmsi),
        }))
      },
      onSelect: (vessel) => {
        const isNewSelection = selectedVessel.value?.mmsi !== vessel.mmsi
        selectedVessel.value = enrichVesselWithFleetData(vessel)
        if (isNewSelection) {
          historyHours.value = 1
          aisController?.showHistory(vessel.mmsi, 1)
        }
      },
      onHistory: ({ hours, pointCount, omittedCount = 0 }) => {
        if (hours) historyHours.value = hours
        historyPointCount.value = pointCount
        historyOmittedCount.value = omittedCount
      },
      onHistoryError: () => {
        historyPointCount.value = 0
        historyOmittedCount.value = 0
      },
      onSnapshot: (count) => {
        aisStatusMessage.value = `Loaded ${count} recent vessel positions; faded markers have not reported for 15+ minutes`
      },
    })
    aisController.setCompanyMmsis(companyMmsis.value)
    aisController.setSpecialVesselMmsis({ nt: ntMmsis, police: policeMmsis })
    applyVesselGroupFilter()
  } catch (error) {
    console.error('Failed to start AIS layer', error)
    aisStatus.value = 'error'
    aisStatusMessage.value = 'AIS failed to start; canal routes remain available.'
  }

  addDock(map, 52.375226, 4.883823, "Anne Frank (AF)")
  addDock(map, 52.360915, 4.885641, "Rijksmuseum (Rijks)")
  addDock(map, 52.377867, 4.897888, "Centraal Station (CS)")
  addDock(map, 52.3692092, 4.8998606, "Zwanenburgwal (ZWA)")
  addDock(map, 52.376064, 4.905688, "Sea Palace (SP)")
  addDock(map, 52.3829488, 4.8594078, "Staverno")
  addDock(map, 52.335300, 4.917648, "E-Harbour (E-H)")
  addDock(map, 52.3415982, 4.8864876, "Strandzuid")
  addDock(map, 52.3433485, 4.8525659, "Olympisch Stadion")
})

onUnmounted(() => {
  userLocationController?.stop()
  aisController?.stop()
  window.clearInterval(planningRefreshTimer)
  bridgeLayerController?.destroy()
  for (const layer of navigationLayerControllers.values()) layer.remove()
  navigationLayerControllers.clear()
})
</script>

<style scoped>
.map-shell {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
}

.map {
  height: 100%;
  width: 100%;
}

.search-control {
  right: calc(0.75rem + env(safe-area-inset-right));
  top: calc(0.75rem + env(safe-area-inset-top));
}

.ais-status {
  bottom: calc(0.75rem + env(safe-area-inset-bottom));
  right: calc(0.75rem + env(safe-area-inset-right));
}

.vessel-details {
  bottom: calc(5.5rem + env(safe-area-inset-bottom));
  left: calc(0.75rem + env(safe-area-inset-left));
}

.vessel-data-list {
  display: grid;
  gap: 0.45rem;
}

.vessel-data-list > div {
  align-items: baseline;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
}

.vessel-data-list dt {
  color: rgb(148 163 184);
  font-size: 0.75rem;
}

.vessel-data-list dd {
  font-size: 0.78rem;
  font-weight: 600;
  margin: 0;
  max-width: 65%;
  text-align: right;
}

:deep(.leaflet-top) {
  top: env(safe-area-inset-top);
}

:deep(.leaflet-bottom) {
  bottom: env(safe-area-inset-bottom);
}

:deep(.leaflet-left) {
  left: env(safe-area-inset-left);
}

:deep(.leaflet-right) {
  right: env(safe-area-inset-right);
}

.search-control button {
  cursor: pointer;
}

@media (min-width: 640px) {
  .search-control {
    right: calc(1rem + env(safe-area-inset-right));
    top: calc(1rem + env(safe-area-inset-top));
  }

  .vessel-details {
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
  }
}

:deep(.combined-scale-control) {
  color: rgb(15 23 42);
  display: grid;
  grid-template-areas:
    "label label"
    "vertical ."
    "corner horizontal";
  grid-template-columns: auto auto;
  grid-template-rows: auto auto auto;
  justify-items: start;
  margin-left: 10px;
  margin-bottom: 10px;
  pointer-events: none;
}

:deep(.combined-scale-control__label) {
  grid-area: label;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 2px;
  text-shadow:
    0 1px 0 rgb(255 255 255 / 0.75),
    1px 0 0 rgb(255 255 255 / 0.75),
    0 -1px 0 rgb(255 255 255 / 0.75),
    -1px 0 0 rgb(255 255 255 / 0.75);
}

:deep(.combined-scale-control__horizontal) {
  align-self: end;
  border-bottom: 2px solid rgb(15 23 42 / 0.75);
  border-right: 2px solid rgb(15 23 42 / 0.75);
  grid-area: horizontal;
  height: 7px;
}

:deep(.combined-scale-control__vertical) {
  align-self: end;
  border-left: 2px solid rgb(15 23 42 / 0.75);
  border-top: 2px solid rgb(15 23 42 / 0.75);
  grid-area: vertical;
  justify-self: start;
  width: 7px;
}

:deep(.combined-scale-control__corner) {
  border-bottom: 2px solid rgb(15 23 42 / 0.75);
  border-left: 2px solid rgb(15 23 42 / 0.75);
  grid-area: corner;
  height: 7px;
  width: 7px;
}

:deep(.bridge-height-marker) {
  background: transparent;
  border: 0;
}

:deep(.bridge-height-marker span) {
  background: rgb(120 53 15 / 0.92);
  border: 1px solid rgb(251 191 36 / 0.8);
  border-radius: 999px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.35);
  color: white;
  display: block;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 5px;
  text-align: center;
  white-space: nowrap;
}

:deep(.bridge-popup > strong) {
  display: block;
  font-size: 14px;
  margin-bottom: 7px;
}

:deep(.bridge-popup > div) {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-top: 3px;
}

:deep(.bridge-popup > div span) { color: #64748b; }
:deep(.bridge-popup small) { display: block; margin-top: 8px; color: #64748b; }
</style>
