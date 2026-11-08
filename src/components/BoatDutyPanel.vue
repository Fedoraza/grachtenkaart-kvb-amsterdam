<template>
  <div class="mobile-nav-item mobile-nav-duty pointer-events-none absolute bottom-3 left-44 z-[1550] sm:left-52">
    <button v-if="!open" type="button" class="mobile-nav-button pointer-events-auto rounded-2xl border border-amber-300/25 bg-slate-950/90 px-3 py-2 text-xs font-black text-amber-100 shadow-xl" @click="openPanel"><span class="mobile-nav-icon hidden">✓</span><span>Mijn boot</span><span class="hidden sm:inline"> & lijst</span></button>
    <section v-else class="pointer-events-auto fixed inset-2 flex flex-col overflow-hidden rounded-3xl border border-amber-300/20 bg-slate-950/98 text-white shadow-2xl sm:inset-5">
      <header class="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div class="flex-1"><span class="text-[10px] font-black uppercase tracking-wider text-amber-300">Dagelijkse boot</span><h2 class="m-0 text-lg font-black">Boottoewijzingen en lijsten</h2></div>
        <input v-model="date" type="date" class="duty-input w-auto" @change="load" />
        <button type="button" class="rounded-xl bg-white/10 px-3 py-2" @click="open = false">×</button>
      </header>

      <div class="flex-1 overflow-auto p-4 sm:p-6">
        <form v-if="isAdmin" class="mb-5 grid gap-2 rounded-2xl border border-amber-300/20 bg-amber-400/5 p-3 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="assignBoat">
          <div class="duty-label relative"><label for="duty-user-search">Persoon zoeken</label>
            <input id="duty-user-search" v-model="assignment.userQuery" class="duty-input" type="search" inputmode="search" autocomplete="off" required placeholder="Typ een naam…" @focus="activePicker = 'user'" @input="assignment.userId = ''" @keydown.escape="activePicker = ''" />
            <div v-if="activePicker === 'user' && filteredUsers.length" class="picker-results">
              <button v-for="user in filteredUsers" :key="user.id" type="button" @click.stop="selectUser(user)"><strong>{{ user.name }}</strong><span>{{ roleLabel(user.role) }}</span></button>
            </div>
          </div>
          <div class="duty-label relative"><label for="duty-boat-search">Boot zoeken</label>
            <input id="duty-boat-search" v-model="assignment.boatQuery" class="duty-input" type="search" inputmode="search" autocomplete="off" required placeholder="Typ een bootnaam…" @focus="activePicker = 'boat'" @input="assignment.boatId = ''" @keydown.escape="activePicker = ''" />
            <div v-if="activePicker === 'boat' && filteredBoats.length" class="picker-results">
              <button v-for="boat in filteredBoats" :key="boat.id" type="button" @click.stop="selectBoat(boat)"><strong>{{ boat.name }}</strong></button>
            </div>
          </div>
          <button class="self-end rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950">Toewijzen</button>
        </form>

        <div v-if="canManageStatus" class="mb-3 flex items-center gap-2">
          <input v-model="boatSearch" class="duty-input" type="search" inputmode="search" autocomplete="off" placeholder="Zoek op boot of persoon…" />
          <span class="shrink-0 text-[11px] text-slate-400">{{ visibleAssignments.length }} boten</span>
        </div>
        <div v-if="canManageStatus" class="mb-3 flex flex-wrap gap-2 text-[10px] font-bold"><span class="rounded-full border border-red-400/60 bg-red-950/80 px-2 py-1 text-red-300">● Niet ingestuurd</span><span class="rounded-full border border-amber-300/70 bg-amber-400/25 px-2 py-1 text-amber-200">● Ingestuurd, niet bijgevuld</span><span class="rounded-full border border-emerald-300/50 bg-emerald-500/20 px-2 py-1 text-emerald-200">● Geweest</span></div>

        <p v-if="loading" class="text-sm text-slate-400">Laden…</p>
        <div v-else class="grid gap-3 lg:grid-cols-2">
          <article v-for="item in visibleAssignments" :key="item.id" class="rounded-2xl border p-4 transition-colors" :class="assignmentStatusStyle(item)">
            <div class="flex flex-wrap items-start gap-3" :class="canManageStatus && 'cursor-pointer'" @click="canManageStatus && toggleAssignment(item.id)">
              <span class="mt-1.5 h-3 w-3 shrink-0 rounded-full" :class="assignmentStatusDot(item)"></span>
              <div class="min-w-0 flex-1"><span class="text-[10px] font-black uppercase tracking-wider text-slate-400">{{ item.user_name }}</span><h3 class="m-0 truncate text-base font-black" :class="item.serviced_at ? 'text-emerald-100' : item.submitted_at ? 'text-amber-200' : 'text-red-300'">{{ item.boat_name }}</h3><div class="mt-1 flex flex-wrap items-center gap-1.5"><span class="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">Dock: {{ item.home_dock || 'Not set' }}</span><span class="text-[10px] text-slate-300">{{ assignmentStatusLabel(item) }}</span></div></div>
              <button v-if="canManageStatus" type="button" class="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold" :class="item.serviced_at ? 'bg-white/10 text-slate-200' : 'bg-emerald-500 text-white'" @click.stop="toggleServiced(item)">{{ item.serviced_at ? 'Ongedaan maken' : 'Markeer geweest' }}</button>
              <button v-if="isAdmin" type="button" class="rounded-lg bg-red-500/15 px-2 py-1 text-xs text-red-200" @click.stop="removeAssignment(item)">Verwijder</button>
              <span v-if="canManageStatus" class="mt-1 text-slate-300 transition-transform" :class="isAssignmentExpanded(item.id) && 'rotate-180'">⌄</span>
            </div>
            <div v-show="isAssignmentExpanded(item.id)">
            <div class="mt-4 rounded-2xl border border-sky-300/15 bg-sky-400/[0.04] p-3">
              <div><span class="text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">{{ isEh(item) ? 'Requested boat inventory · EH' : isStaverno(item) ? 'Inventory on board · Staverno' : 'Inventory on board' }}</span><p class="m-0 mt-1 text-xs text-slate-400">{{ isEh(item) ? 'Choose what this boat needs.' : 'Count and enter what is currently on board.' }}</p></div>
              <input v-model="item.inventorySearch" class="duty-input mt-3" type="search" inputmode="search" placeholder="Search inventory products…" />
              <div class="mt-2 flex gap-1.5 overflow-x-auto pb-1"><button type="button" class="shrink-0 rounded-full border px-3 py-2 text-[10px] font-black" :class="item.inventoryCategory==='all'?'border-violet-300 bg-violet-500/30 text-white':'border-white/10 text-slate-300'" @click="item.inventoryCategory='all'">All</button><button v-for="category in inventoryCategories" :key="category.id" type="button" class="shrink-0 rounded-full border px-3 py-2 text-[10px] font-black" :class="item.inventoryCategory===category.id?'border-violet-300 bg-violet-500/30 text-white':'border-white/10 text-slate-300'" @click="item.inventoryCategory=category.id">{{ category.name }}</button><button type="button" class="shrink-0 rounded-full border px-3 py-2 text-[10px] font-black" :class="item.inventoryCategory==='uncategorized'?'border-violet-300 bg-violet-500/30 text-white':'border-white/10 text-slate-300'" @click="item.inventoryCategory='uncategorized'">Other</button></div>
              <div class="mt-2 grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">
                <article v-for="product in inventoryFor(item)" :key="product.id" class="flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 p-2" :class="inventoryQuantity(item,product.id)>0&&'border-sky-300/40 bg-sky-400/10'"><div class="min-w-0 flex-1"><span v-if="!product.show_on_boat_menu" class="mb-0.5 inline-block rounded-full bg-slate-700 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-300">Hidden</span><strong class="block truncate text-xs">{{ product.name }}</strong><span class="text-[10px] text-slate-500">{{ product.unit }}</span></div><div class="grid grid-cols-[44px_2.5rem_44px] items-center overflow-hidden rounded-xl border border-white/10"><button type="button" class="text-lg font-black" @click="changeInventory(item,product.id,-1)">−</button><output class="text-center text-xs font-black">{{ inventoryQuantity(item,product.id) }}</output><button type="button" class="text-lg font-black" @click="changeInventory(item,product.id,1)">+</button></div></article>
              </div>
              <button v-if="canEdit(item)" type="button" class="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black" @click="saveBoatInventory(item)">{{ isEh(item) ? 'Send inventory request' : 'Save inventory on board' }}</button>
            </div>
            </div>
          </article>
          <p v-if="!visibleAssignments.length" class="m-0 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500 lg:col-span-2">{{ boatSearch ? 'Geen boten gevonden.' : 'Geen boottoewijzingen voor deze datum.' }}</p>
        </div>
      </div>
      <footer class="border-t border-white/10 px-4 py-3 text-xs" :class="error ? 'text-red-300' : 'text-emerald-300'">{{ error || message || 'Kies een datum om de toegewezen boten en lijsten te bekijken.' }}</footer>
    </section>
  </div>
</template>

<script setup>
import { useMobileMapPanel } from '../scripts/useMobileMapPanel.js'
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const auth = inject('auth')
const language = inject('language')
const open = ref(false)
useMobileMapPanel('duty', open)
const loading = ref(false)
const date = ref(new Date().toLocaleDateString('sv-SE'))
const assignments = ref([])
const users = ref([])
const boats = ref([])
const inventoryProducts = ref([])
const inventoryCategories = computed(() => [...new Map(inventoryProducts.value.filter((product) => product.category_id).map((product) => [product.category_id, { id: product.category_id, name: product.category_name }])).values()])
const error = ref('')
const message = ref('')
const assignment = reactive({ userId: '', userQuery: '', boatId: '', boatQuery: '' })
const activePicker = ref('')
const boatSearch = ref('')
const expandedAssignmentIds = ref(new Set())
let liveUpdateTimer
const isAdmin = computed(() => auth.user?.role === 'admin')
const canManageStatus = computed(() => ['admin', 'harbour'].includes(auth.user?.role))
const visibleAssignments = computed(() => {
  const query = boatSearch.value.trim().toLocaleLowerCase('nl-NL')
  return assignments.value.filter((item) => !query || `${item.boat_name} ${item.user_name} ${item.home_dock || ''}`.toLocaleLowerCase('nl-NL').includes(query))
})
const filteredUsers = computed(() => filterPickerItems(users.value, assignment.userQuery, (user) => `${user.name} ${roleLabel(user.role)}`))
const filteredBoats = computed(() => filterPickerItems(boats.value, assignment.boatQuery, (boat) => boat.name))

function roleLabel(role) { return ({ admin: 'Admin', harbour: 'Harbour', viewer: 'Viewer' })[role] || role }
function canEdit(item) { return isAdmin.value || item.user_id === auth.user?.id }
function isAssignmentExpanded(id) { return !canManageStatus.value || expandedAssignmentIds.value.has(id) }
function toggleAssignment(id) {
  const next = new Set(expandedAssignmentIds.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expandedAssignmentIds.value = next
}
function assignmentStatusLabel(item) {
  if (item.serviced_at) return `Geweest · ${formatTime(item.serviced_at)}`
  if (item.submitted_at) return `Ingestuurd ${formatTime(item.submitted_at)} · nog niet bijgevuld`
  return 'Nog niet ingestuurd'
}
function assignmentStatusStyle(item) {
  if (item.serviced_at) return 'border-emerald-300/60 border-l-4 border-l-emerald-400 bg-emerald-500/20 shadow-[inset_0_0_28px_rgb(16_185_129/0.08)]'
  if (item.submitted_at) return 'border-amber-300/80 border-l-4 border-l-amber-300 bg-amber-400/25 shadow-[inset_0_0_28px_rgb(251_191_36/0.12)]'
  return 'border-red-400/80 border-l-4 border-l-red-500 bg-red-950/75 shadow-[inset_0_0_28px_rgb(239_68_68/0.14)]'
}
function assignmentStatusDot(item) { return item.serviced_at ? 'bg-emerald-300 ring-4 ring-emerald-400/20' : item.submitted_at ? 'bg-amber-300 ring-4 ring-amber-300/25' : 'bg-red-500 ring-4 ring-red-500/25' }
function formatTime(value) { return new Date(value).toLocaleString(language?.locale === 'nl' ? 'nl-NL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) }
function isStaverno(item) { return item.home_dock?.trim().toLowerCase() === 'staverno' }
function isEh(item) { return item.home_dock?.trim().toLowerCase() === 'eh' }
function inventoryFor(item) { const query=(item.inventorySearch||'').trim().toLocaleLowerCase(); return inventoryProducts.value.filter(product=>(query||product.show_on_boat_menu)&&(item.inventoryCategory==='all'||(item.inventoryCategory==='uncategorized'?!product.category_id:product.category_id===item.inventoryCategory))&&(!query||`${product.name} ${product.unit} ${product.category_name||''}`.toLocaleLowerCase().includes(query))) }
function inventoryQuantity(item,productId) { return Number(item.inventoryEditor?.[productId]||0) }
function changeInventory(item,productId,delta) { item.inventoryEditor[productId]=Math.max(0,inventoryQuantity(item,productId)+delta) }
function emptyRestock() { return { tourType: '', beer: '', wine: '', soda: '', smallSilverBowl: '', smallSilverBowlComplete: '', bigSilverBowl: '', bigSilverBowlComplete: '', merlot: 6, water: '', extraStock: '' } }
function restockComplete(restock) { return ['tourType', 'beer', 'wine', 'soda', 'smallSilverBowl', 'smallSilverBowlComplete', 'bigSilverBowl', 'bigSilverBowlComplete', 'water', 'extraStock'].every((field) => String(restock?.[field] ?? '').trim()) }
function restockRows(item) {
  const value = item.restock || {}
  return [
    ['Type of tour done', value.tourType], ['Beer boxes remaining', value.beer], ['Wine boxes remaining', value.wine], ['Soda boxes remaining', value.soda],
    ['Small silver bowl', value.smallSilverBowl], ['Small bowl complete', value.smallSilverBowlComplete], ['Big silver bowl', value.bigSilverBowl], ['Big bowl complete', value.bigSilverBowlComplete],
    ['Merlot', value.merlot], ['Water', value.water], ['Extra stock needed', value.extraStock],
  ].map(([label, rowValue]) => ({ label, value: rowValue }))
}
function filterPickerItems(items, query, label) {
  const needle = String(query || '').trim().toLocaleLowerCase('nl-NL')
  return items.filter((item) => !needle || label(item).toLocaleLowerCase('nl-NL').includes(needle)).slice(0, 8)
}
function selectUser(user) { assignment.userId = user.id; assignment.userQuery = user.name; activePicker.value = '' }
function selectBoat(boat) { assignment.boatId = boat.id; assignment.boatQuery = boat.name; activePicker.value = '' }
function resolvePickerSelection() {
  if (!assignment.userId) assignment.userId = users.value.find((user) => user.name.toLocaleLowerCase('nl-NL') === assignment.userQuery.trim().toLocaleLowerCase('nl-NL'))?.id || ''
  if (!assignment.boatId) assignment.boatId = boats.value.find((boat) => boat.name.toLocaleLowerCase('nl-NL') === assignment.boatQuery.trim().toLocaleLowerCase('nl-NL'))?.id || ''
  if (!assignment.userId) throw new Error('Kies een persoon uit de zoekresultaten.')
  if (!assignment.boatId) throw new Error('Kies een boot uit de zoekresultaten.')
}

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Verzoek mislukt')
  return data
}

async function openPanel() { open.value = true; await load() }
async function load({ silent = false } = {}) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const data = await request(`/api/boat-duty?date=${encodeURIComponent(date.value)}`)
    inventoryProducts.value = data.inventoryProducts || []
    assignments.value = (data.assignments || []).map((item) => ({ ...item, text: (item.items || []).join('\n'), restock: item.restock || emptyRestock(), inventorySearch: '', inventoryCategory: 'all', inventoryEditor: Object.fromEntries((item.inventory||[]).map(row=>[row.product_id, item.home_dock?.trim().toLowerCase()==='eh'?row.requested_quantity:row.onboard_quantity])) }))
    users.value = data.users || []
    boats.value = data.boats || []
    if (canManageStatus.value && !silent) expandedAssignmentIds.value = new Set()
  } catch (requestError) { error.value = requestError.message } finally { loading.value = false }
}

function handleLiveUpdate(event) {
  if (!open.value || (event.detail?.action !== 'inventory-menu' && event.detail?.serviceDate !== date.value)) return
  window.clearTimeout(liveUpdateTimer)
  liveUpdateTimer = window.setTimeout(async () => {
    await load({ silent: true })
    message.value = event.detail?.action === 'submitted' ? 'Nieuwe lijst live ontvangen.' : 'Lijstoverzicht live bijgewerkt.'
  }, 150)
}

onMounted(() => window.addEventListener('boat-duty-update', handleLiveUpdate))
onBeforeUnmount(() => {
  window.removeEventListener('boat-duty-update', handleLiveUpdate)
  window.clearTimeout(liveUpdateTimer)
})
async function assignBoat() {
  try {
    resolvePickerSelection()
    await request('/api/boat-duty/assignments', { method: 'POST', body: JSON.stringify({ ...assignment, serviceDate: date.value }) })
    message.value = 'Boot toegewezen.'; Object.assign(assignment, { userId: '', userQuery: '', boatId: '', boatQuery: '' }); await load()
  } catch (requestError) { error.value = requestError.message }
}
async function saveList(item, submit) {
  try {
    if (submit && isStaverno(item) && !restockComplete(item.restock)) throw new Error('Vul alle velden van de Staverno restocklijst in voordat je deze instuurt.')
    const items = item.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    await request(`/api/boat-duty/assignments/${item.id}/list`, { method: 'PUT', body: JSON.stringify({ items, restock: isStaverno(item) ? item.restock : null, submit }) })
    message.value = submit ? 'Lijst ingestuurd.' : 'Concept bewaard.'; await load()
  } catch (requestError) { error.value = requestError.message }
}
async function saveBoatInventory(item) {
  try { const lines=inventoryProducts.value.map(product=>({productId:product.id,quantity:inventoryQuantity(item,product.id)})); await request(`/api/boat-duty/assignments/${item.id}/inventory`,{method:'PUT',body:JSON.stringify({lines})}); message.value=isEh(item)?'Voorraadaanvraag ingestuurd.':'Voorraad aan boord opgeslagen.'; await load({silent:true}) } catch(requestError){error.value=requestError.message}
}
async function toggleServiced(item) {
  try {
    const serviced = !item.serviced_at
    const data = await request(`/api/boat-duty/assignments/${item.id}/status`, { method: 'PUT', body: JSON.stringify({ serviced }) })
    item.serviced_at = data.servicedAt
    message.value = serviced ? `${item.boat_name} is als geweest gemarkeerd.` : `${item.boat_name} staat weer open.`
  } catch (requestError) { error.value = requestError.message }
}
async function removeAssignment(item) {
  if (!window.confirm(`Toewijzing van ${item.user_name} aan ${item.boat_name} verwijderen?`)) return
  try { await request(`/api/boat-duty/assignments/${item.id}`, { method: 'DELETE' }); message.value = 'Toewijzing verwijderd.'; await load() } catch (requestError) { error.value = requestError.message }
}
</script>

<style scoped>
.duty-label { display: grid; gap: .3rem; color: rgb(203 213 225); font-size: .7rem; font-weight: 700; }
.duty-input { width: 100%; border: 1px solid rgb(255 255 255 / .14); border-radius: .7rem; background: rgb(15 23 42); padding: .65rem .75rem; color: white; font-size: .8rem; outline: none; }
.picker-results { position: absolute; z-index: 30; top: 100%; left: 0; right: 0; display: grid; max-height: 15rem; overflow-y: auto; margin-top: .3rem; padding: .3rem; border: 1px solid rgb(255 255 255 / .16); border-radius: .75rem; background: rgb(2 6 23 / .98); box-shadow: 0 16px 35px rgb(0 0 0 / .45); }
.picker-results button { display: flex; align-items: center; justify-content: space-between; gap: .75rem; width: 100%; border-radius: .55rem; padding: .65rem .7rem; color: white; text-align: left; }
.picker-results button:hover, .picker-results button:focus { background: rgb(255 255 255 / .1); outline: none; }
.picker-results span { color: rgb(148 163 184); font-size: .65rem; }
@media (max-width: 639px) {
  .picker-results { position: static; max-height: min(40dvh, 18rem); margin-top: 0; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  .picker-results button { min-height: 48px; }
}
</style>
