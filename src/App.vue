<template>
  <div ref="appRoot" class="h-full w-full">
    <FleetStatisticsPage v-if="isStatisticsPage" />
    <KmLeaderboardPage v-else-if="isLeaderboardPage" />
    <div v-else-if="auth.loading" class="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-300">Loading map…</div>
    <LeafletMap v-else :key="mapSession" />
    <OfflineNotice />
    <dialog ref="loginDialog" class="fixed inset-0 z-[3000] m-auto max-h-[95dvh] w-[min(32rem,95vw)] overflow-auto rounded-3xl border border-white/20 bg-slate-950 p-0 text-white backdrop:bg-black/60" @close="loginRequested = false">
      <template v-if="loginRequested">
        <div class="flex items-center justify-between gap-3 px-5 pt-4">
          <p class="m-0 text-sm">{{ loginReason }}</p>
          <button type="button" class="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-sm" @click="loginDialog.close()">Continue as guest</button>
        </div>
        <AuthScreen :needs-setup="auth.needsSetup" :setup-token-required="auth.setupTokenRequired" @authenticated="setAuthenticatedUser" />
      </template>
    </dialog>
  </div>
</template>

<script setup>
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import { visibleInterval } from './scripts/networkUsage.js'
import { startUsageAnalytics } from './scripts/usageAnalytics.js'
const AuthScreen = defineAsyncComponent(() => import('./components/AuthScreen.vue'))
import LeafletMap from './components/LeafletMap.vue'
import OfflineNotice from './components/OfflineNotice.vue'
const FleetStatisticsPage = defineAsyncComponent(() => import('./components/FleetStatisticsPage.vue'))
const KmLeaderboardPage = defineAsyncComponent(() => import('./components/KmLeaderboardPage.vue'))
import { createLanguage, installDomTranslations } from './i18n.js'

const appRoot = ref(null)
const isStatisticsPage = window.location.pathname.replace(/\/+$/, '') === '/vlootstatistieken'
const isLeaderboardPage = window.location.pathname.replace(/\/+$/, '') === '/km-leaderboard'
const isTestEnvironment = import.meta.env.DEV
const loginDialog = ref(null)
const loginRequested = ref(false)
const loginReason = ref('')
const mapSession = ref(0)

function requireLogin(reason = 'Sign in to save your data.') {
  if (auth.user) return true
  loginReason.value = reason
  loginRequested.value = true
  nextTick(() => loginDialog.value?.showModal())
  return false
}
const language = createLanguage()

const auth = reactive({
  loading: true,
  needsSetup: false,
  setupTokenRequired: false,
  user: null,
  refresh: loadAuth,
  logout,
  requireLogin,
})
let usageTracker
let authTimer
let stopTranslations
provide('auth', auth)
provide('language', language)

async function loadAuth() {
  try {
    const response = await fetch('/api/auth/status')
    const data = await response.json()
    auth.needsSetup = Boolean(data.needsSetup)
    auth.setupTokenRequired = Boolean(data.setupTokenRequired)
    if (auth.user && (!data.authenticated || auth.user.role !== data.user?.role || auth.user.id !== data.user?.id)) mapSession.value++
    auth.user = data.authenticated ? data.user : null
    language.setUser(auth.user)
  } catch {
    // An unreachable server (offline, flaky mobile data) says nothing about
    // the session. Keep the current user so a periodic check does not remount
    // the map and drop the planned route; only the first check falls back to guest.
    if (auth.loading) {
      auth.user = null
      language.setUser(null)
    }
  } finally {
    auth.loading = false
  }
}

function setAuthenticatedUser(user) {
  loginDialog.value?.close()
  auth.user = user
  auth.needsSetup = false
  auth.setupTokenRequired = false
  language.setUser(user)
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  auth.user = null
  mapSession.value++
  language.setUser(null)
}

watch(() => auth.user?.id, () => usageTracker?.identityChanged())

onMounted(async () => {
  if (isTestEnvironment && !isLeaderboardPage && !isStatisticsPage) document.title = 'Boottracker · Testversie'
  stopTranslations = installDomTranslations(appRoot.value, language)
  await loadAuth()
  usageTracker = startUsageAnalytics(isStatisticsPage ? 'fleet-statistics' : isLeaderboardPage ? 'leaderboard' : 'map')
  authTimer = visibleInterval(loadAuth, 60_000)
})
onBeforeUnmount(() => { usageTracker?.stop(); authTimer?.(); stopTranslations?.() })
</script>
