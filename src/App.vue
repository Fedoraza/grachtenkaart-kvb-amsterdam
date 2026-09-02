<template>
  <div ref="appRoot" class="h-full w-full">
    <div v-if="auth.loading" class="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-300">Loading secure workspace…</div>
    <AuthScreen v-else-if="!auth.user" :needs-setup="auth.needsSetup" @authenticated="setAuthenticatedUser" />
    <LeafletMap v-else />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, provide, reactive, ref } from 'vue'
import AuthScreen from './components/AuthScreen.vue'
import LeafletMap from './components/LeafletMap.vue'
import { createLanguage, installDomTranslations } from './i18n.js'

const appRoot = ref(null)
const language = createLanguage()

const auth = reactive({
  loading: true,
  needsSetup: false,
  user: null,
  refresh: loadAuth,
  logout,
})
let authTimer
let stopTranslations
provide('auth', auth)
provide('language', language)

async function loadAuth() {
  try {
    const response = await fetch('/api/auth/status')
    const data = await response.json()
    auth.needsSetup = Boolean(data.needsSetup)
    auth.user = data.authenticated ? data.user : null
    language.setUser(auth.user)
  } catch {
    auth.user = null
  } finally {
    auth.loading = false
  }
}

function setAuthenticatedUser(user) {
  auth.user = user
  auth.needsSetup = false
  language.setUser(user)
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  auth.user = null
  language.setUser(null)
}

onMounted(() => {
  stopTranslations = installDomTranslations(appRoot.value, language)
  loadAuth()
  authTimer = window.setInterval(loadAuth, 60_000)
})
onBeforeUnmount(() => { window.clearInterval(authTimer); stopTranslations?.() })
</script>
