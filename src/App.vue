<template>
  <div v-if="auth.loading" class="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-300">Loading secure workspace…</div>
  <AuthScreen v-else-if="!auth.user" :needs-setup="auth.needsSetup" @authenticated="setAuthenticatedUser" />
  <LeafletMap v-else />
</template>

<script setup>
import { onBeforeUnmount, onMounted, provide, reactive } from 'vue'
import AuthScreen from './components/AuthScreen.vue'
import LeafletMap from './components/LeafletMap.vue'

const auth = reactive({
  loading: true,
  needsSetup: false,
  user: null,
  refresh: loadAuth,
  logout,
})
let authTimer
provide('auth', auth)

async function loadAuth() {
  try {
    const response = await fetch('/api/auth/status')
    const data = await response.json()
    auth.needsSetup = Boolean(data.needsSetup)
    auth.user = data.authenticated ? data.user : null
  } catch {
    auth.user = null
  } finally {
    auth.loading = false
  }
}

function setAuthenticatedUser(user) {
  auth.user = user
  auth.needsSetup = false
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  auth.user = null
}

onMounted(() => {
  loadAuth()
  authTimer = window.setInterval(loadAuth, 60_000)
})
onBeforeUnmount(() => window.clearInterval(authTimer))
</script>
