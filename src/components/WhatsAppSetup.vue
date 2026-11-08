<template>
  <section class="rounded-2xl border border-emerald-300/15 bg-emerald-400/5">
    <button type="button" class="flex w-full items-center gap-2 px-3 py-2.5 text-left" @click="open = !open">
      <span class="h-2.5 w-2.5 rounded-full" :class="statusDot"></span>
      <span class="min-w-0 flex-1">
        <strong class="block text-sm">WhatsApp read-only sync</strong>
        <span class="block truncate text-[11px] text-slate-400">{{ status.message || 'Loading connector…' }}</span>
      </span>
      <span class="text-xs text-slate-400">{{ open ? 'Hide' : 'Setup' }}</span>
    </button>

    <div v-if="open" class="border-t border-white/10 p-3">
      <div v-if="status.qrDataUrl" class="grid gap-3 sm:grid-cols-[180px_1fr]">
        <img :src="status.qrDataUrl" alt="WhatsApp linked-device QR code" class="w-[180px] rounded-xl bg-white p-1" />
        <div class="text-xs leading-relaxed text-slate-300">
          <strong class="text-white">Pair this computer</strong>
          <ol class="mt-2 list-decimal space-y-1 pl-4">
            <li>Open WhatsApp on your phone.</li>
            <li>Open Settings → Linked devices.</li>
            <li>Choose Link a device and scan this code.</li>
          </ol>
          <p class="mt-2 text-amber-200">This is an unofficial WhatsApp Web connection. Re-pairing may occasionally be required.</p>
        </div>
      </div>

      <div v-else-if="status.status === 'connected'">
        <div class="flex items-center justify-between gap-2">
          <p class="m-0 text-xs text-emerald-200">Connected as {{ status.account || 'linked device' }}</p>
          <button type="button" class="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20" @click="refreshGroups">Refresh groups</button>
        </div>
        <p class="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Employee communities</p>
        <div class="max-h-56 space-y-1 overflow-auto rounded-xl border border-white/10 bg-black/10 p-1.5">
          <div v-for="community in communities" :key="community.id" class="rounded-lg bg-white/5 px-2 py-2">
            <label class="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" :checked="community.enabled" @change="setChatEnabled(community, $event.target.checked)" />
              <span class="min-w-0 flex-1 truncate font-semibold">{{ community.title }}</span>
              <span class="text-[10px] text-slate-400">Community</span>
            </label>
            <p class="mb-0 ml-5 mt-1 text-[10px] text-slate-400">
              {{ childGroups(community.id).length }} linked groups found. Enabled groups can supply planning images.
            </p>
            <div v-if="community.enabled && childGroups(community.id).length" class="ml-5 mt-1 flex flex-wrap gap-1">
              <span v-for="group in childGroups(community.id).slice(0, 8)" :key="group.id" class="max-w-36 truncate rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-200">{{ group.title }}</span>
              <span v-if="childGroups(community.id).length > 8" class="px-1 text-[10px] text-slate-400">+{{ childGroups(community.id).length - 8 }}</span>
            </div>
          </div>

          <template v-if="standaloneGroups.length">
            <p class="m-0 px-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Groups outside communities</p>
            <label v-for="chat in standaloneGroups" :key="chat.id" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/10">
              <input type="checkbox" :checked="chat.enabled" @change="setChatEnabled(chat, $event.target.checked)" />
              <span class="min-w-0 flex-1 truncate">{{ chat.title }}</span>
            </label>
          </template>
          <p v-if="!communities.length && !standaloneGroups.length" class="m-0 px-2 py-3 text-xs text-slate-400">No communities or groups loaded yet.</p>
        </div>
        <p class="mb-0 mt-2 text-[11px] text-slate-400">Enabled day groups are read for schedule images. The connector has no message-sending workflow and never posts replies.</p>
      </div>

      <p v-if="status.lastError" class="rounded-lg bg-red-500/15 p-2 text-xs text-red-200">{{ status.lastError }}</p>
      <p v-if="error" class="rounded-lg bg-red-500/15 p-2 text-xs text-red-200">{{ error }}</p>
      <div class="mt-3 flex gap-2">
        <button type="button" :disabled="reconnecting" class="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold hover:bg-emerald-400 disabled:opacity-50" @click="reconnect">{{ reconnecting ? 'Connecting…' : status.status === 'connected' ? 'Reconnect' : 'Create QR code' }}</button>
        <button v-if="status.status === 'connected'" type="button" class="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/25" @click="logout">Log out device</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const open = ref(false)
const status = ref({ status: 'loading', message: 'Loading connector…' })
const chats = ref([])
const error = ref('')
const reconnecting = ref(false)
let timer

const communities = computed(() => chats.value.filter((chat) => chat.isCommunity))
const standaloneGroups = computed(() => chats.value.filter((chat) => !chat.isCommunity && !chat.linkedParent && !chat.isAnnouncement))

function childGroups(communityId) {
  return chats.value.filter((chat) => chat.linkedParent === communityId && !chat.isAnnouncement)
}

const statusDot = computed(() => ({
  connected: 'bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.8)]',
  'waiting-for-qr': 'bg-amber-400',
  reconnecting: 'bg-amber-400',
  conflict: 'bg-orange-400',
  connecting: 'bg-sky-400',
  'logged-out': 'bg-red-400',
}[status.value.status] || 'bg-slate-500'))

async function request(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options })
  const raw = await response.text()
  let data
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    const summary = raw.replace(/\s+/g, ' ').trim().slice(0, 120)
    throw new Error(`WhatsApp API returned ${response.status} instead of JSON${summary ? `: ${summary}` : ''}. Restart npm run dev.`)
  }
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function loadStatus() {
  try {
    status.value = await request('/api/whatsapp/status')
  } catch (requestError) {
    error.value = requestError.message
  }
}

async function loadChats() {
  try {
    chats.value = await request('/api/whatsapp/chats')
  } catch (requestError) {
    error.value = requestError.message
  }
}

async function refreshGroups() {
  try {
    await request('/api/whatsapp/refresh', { method: 'POST' })
    await loadChats()
  } catch (requestError) {
    error.value = requestError.message
  }
}

async function setChatEnabled(chat, enabled) {
  try {
    await request(`/api/whatsapp/chats/${encodeURIComponent(chat.id)}`, { method: 'PUT', body: JSON.stringify({ enabled }) })
    chat.enabled = enabled
    await loadChats()
  } catch (requestError) {
    error.value = requestError.message
  }
}

async function reconnect() {
  error.value = ''
  reconnecting.value = true
  try {
    await request('/api/whatsapp/reconnect', { method: 'POST' })
    await loadStatus()
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    reconnecting.value = false
  }
}

async function logout() {
  if (!window.confirm('Log this linked WhatsApp device out?')) return
  await request('/api/whatsapp/logout', { method: 'POST' })
  await loadStatus()
}

watch(() => status.value.status, (value) => {
  if (value === 'connected') loadChats()
})

onMounted(() => {
  loadStatus()
  timer = window.setInterval(loadStatus, 2000)
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>
