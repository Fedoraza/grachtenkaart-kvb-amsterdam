<template>
  <main class="flex min-h-full items-center justify-center bg-[radial-gradient(circle_at_top,_#164e63,_#020617_55%)] p-4 text-white">
    <section class="w-full max-w-md rounded-3xl border border-white/15 bg-slate-950/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      <p class="m-0 text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Boat Tracker</p>
      <h1 class="mb-1 mt-2 text-2xl font-black">{{ heading }}</h1>
      <p class="m-0 text-sm leading-relaxed text-slate-400">{{ description }}</p>

      <div v-if="!needsSetup && !challenge" class="mt-5 grid grid-cols-2 rounded-xl bg-white/5 p-1 text-xs font-bold">
        <button type="button" class="rounded-lg px-3 py-2" :class="mode === 'login' ? 'bg-white/10 text-white' : 'text-slate-400'" @click="mode = 'login'; error = ''">Password login</button>
        <button type="button" class="rounded-lg px-3 py-2" :class="mode === 'phone' ? 'bg-white/10 text-white' : 'text-slate-400'" @click="mode = 'phone'; error = ''">Verify employment</button>
      </div>

      <form v-if="needsSetup || (mode === 'login' && !challenge)" class="mt-6 space-y-3" @submit.prevent="submitPasswordForm">
        <label v-if="needsSetup && setupTokenRequired" class="auth-label">Setup token<input v-model="form.setupToken" class="auth-input mt-1" type="password" autocomplete="off" required placeholder="From the deployment configuration" /></label>
        <label v-if="needsSetup" class="auth-label">Name<input v-model="form.name" class="auth-input mt-1" autocomplete="name" required minlength="2" /></label>
        <label class="auth-label">{{ needsSetup ? 'Email' : 'Email or phone number' }}<input v-model="form.email" class="auth-input mt-1" :type="needsSetup ? 'email' : 'text'" autocomplete="username" required :placeholder="needsSetup ? '' : 'name@example.com or 06…'" /></label>
        <label class="auth-label">Password
          <span class="relative mt-1 block"><input v-model="form.password" class="auth-input pr-16" :type="showPassword ? 'text' : 'password'" :autocomplete="needsSetup ? 'new-password' : 'current-password'" required :minlength="needsSetup ? 12 : undefined" /><button type="button" class="password-toggle" @click="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button></span>
        </label>
        <label v-if="needsSetup" class="auth-label">Confirm password<input v-model="form.confirmPassword" class="auth-input mt-1" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" required minlength="12" /></label>
        <p v-if="needsSetup" class="m-0 text-[11px]" :class="passwordsMatch ? 'text-emerald-400' : 'text-slate-500'">At least 12 characters{{ form.confirmPassword ? passwordsMatch ? ' · passwords match' : ' · passwords do not match' : '' }}.</p>
        <p v-if="error" class="auth-error">{{ error }}</p>
        <button class="auth-primary" :disabled="submitting">{{ submitting ? 'Please wait…' : needsSetup ? 'Create administrator' : 'Sign in' }}</button>
      </form>

      <form v-else-if="mode === 'phone' && !challenge" class="mt-6 space-y-3" @submit.prevent="startPhoneVerification">
        <label class="auth-label">Full name<input v-model="phoneForm.name" class="auth-input mt-1" autocomplete="name" required minlength="2" placeholder="Your name as colleagues know it" /></label>
        <label class="auth-label">WhatsApp phone number<input v-model="phoneForm.phone" class="auth-input mt-1" type="tel" autocomplete="tel" required placeholder="+31 6 12345678" /></label>
        <p v-if="error" class="auth-error">{{ error }}</p>
        <button class="auth-primary" :disabled="submitting">{{ submitting ? 'Checking day-chat membership…' : 'Continue with WhatsApp' }}</button>
      </form>

      <div v-else-if="challenge" class="mt-6">
        <template v-if="!passwordStage">
        <div class="rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-4">
          <p class="m-0 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Membership found</p>
          <h2 class="mb-1 mt-2 text-base font-bold">Send one private WhatsApp message</h2>
          <p class="m-0 text-xs leading-relaxed text-slate-300">From <strong>{{ phoneForm.phone }}</strong>, privately message the linked Boat Tracker number. Do not send this in a day chat.</p>
        </div>

        <div class="mt-3 grid gap-2">
          <div class="rounded-xl bg-white/5 p-3"><span class="block text-[10px] uppercase tracking-wider text-slate-500">Send privately to</span><div class="mt-1 flex items-center justify-between gap-2"><strong class="text-base">{{ challenge.destinationPhone }}</strong><button type="button" class="copy-button" :class="{ 'copy-button--copied': copiedField === 'phone' }" @click="copy(challenge.destinationPhone, 'phone')">{{ copiedField === 'phone' ? 'Copied ✓' : 'Copy' }}</button></div></div>
          <div class="rounded-xl bg-white/5 p-3"><span class="block text-[10px] uppercase tracking-wider text-slate-500">Exact message</span><div class="mt-1 flex items-center justify-between gap-2"><code class="text-lg font-black tracking-wider text-sky-200">{{ challenge.code }}</code><button type="button" class="copy-button" :class="{ 'copy-button--copied': copiedField === 'code' }" @click="copy(challenge.code, 'code')">{{ copiedField === 'code' ? 'Copied ✓' : 'Copy' }}</button></div></div>
        </div>

        <div class="mt-4 flex items-center gap-3 rounded-xl bg-black/20 p-3"><span class="h-3 w-3 animate-pulse rounded-full bg-amber-400"></span><div class="min-w-0 flex-1"><strong class="block text-xs">Waiting for your message…</strong><span class="text-[11px] text-slate-400">This page checks automatically · expires in {{ timeRemaining }}</span></div></div>
        <p class="mt-3 text-center text-[11px] text-slate-500">No confirmation message will be sent through WhatsApp. Success appears only on this website.</p>
        <p v-if="error" class="auth-error mt-3">{{ error }}</p>
        <button type="button" class="mt-3 w-full rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10" @click="cancelChallenge">Use a different number</button>
        </template>

        <form v-else class="space-y-3" @submit.prevent="setPhonePassword">
          <div class="rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-4">
            <p class="m-0 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Phone verified</p>
            <h2 class="mb-1 mt-2 text-base font-bold">Secure your account</h2>
            <p class="m-0 text-xs leading-relaxed text-slate-300">Set a password for future sign-ins with <strong>{{ verifiedPhone }}</strong>. WhatsApp is not needed again for normal login.</p>
          </div>
          <label class="auth-label">Password<span class="relative mt-1 block"><input v-model="phonePassword.password" class="auth-input pr-16" :type="showPhonePassword ? 'text' : 'password'" autocomplete="new-password" required minlength="12" /><button type="button" class="password-toggle" @click="showPhonePassword = !showPhonePassword">{{ showPhonePassword ? 'Hide' : 'Show' }}</button></span></label>
          <label class="auth-label">Confirm password<input v-model="phonePassword.confirmPassword" class="auth-input mt-1" :type="showPhonePassword ? 'text' : 'password'" autocomplete="new-password" required minlength="12" /></label>
          <p class="m-0 text-[11px]" :class="phonePasswordsMatch ? 'text-emerald-300' : 'text-slate-500'">At least 12 characters{{ phonePassword.confirmPassword ? phonePasswordsMatch ? ' · passwords match' : ' · passwords do not match' : '' }}.</p>
          <p v-if="error" class="auth-error">{{ error }}</p>
          <button class="auth-primary" :disabled="submitting">{{ submitting ? 'Creating account…' : 'Set password and sign in' }}</button>
        </form>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'

const props = defineProps({ needsSetup: Boolean, setupTokenRequired: Boolean })
const emit = defineEmits(['authenticated'])
const mode = ref('login')
const form = reactive({ setupToken: '', name: '', email: '', password: '', confirmPassword: '' })
const phoneForm = reactive({ name: '', phone: '' })
const challenge = ref(null)
const passwordStage = ref(false)
const verifiedPhone = ref('')
const phonePassword = reactive({ password: '', confirmPassword: '' })
const error = ref('')
const submitting = ref(false)
const showPassword = ref(false)
const showPhonePassword = ref(false)
const copiedField = ref('')
const now = ref(Date.now())
let pollTimer
let clockTimer
let copiedTimer

const heading = computed(() => props.needsSetup ? 'Create the first administrator' : passwordStage.value ? 'Set your password' : challenge.value ? 'Verify your phone' : mode.value === 'phone' ? 'Create or access your account' : 'Sign in')
const description = computed(() => props.needsSetup ? 'This one-time setup account can manage boats and create viewer accounts.' : passwordStage.value ? 'Your phone is verified. Finish creating your secure account.' : challenge.value ? 'The website will continue after receiving your private message.' : mode.value === 'phone' ? 'Use your day-chat membership to create an account or reset its password.' : 'Sign in with your email or verified phone number and password.')
const passwordsMatch = computed(() => !props.needsSetup || Boolean(form.password && form.password === form.confirmPassword))
const phonePasswordsMatch = computed(() => Boolean(phonePassword.password && phonePassword.password === phonePassword.confirmPassword))
const timeRemaining = computed(() => {
  const seconds = Math.max(0, Math.ceil(((challenge.value?.expiresAt || 0) - now.value) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function submitPasswordForm() {
  submitting.value = true
  error.value = ''
  try {
    if (!passwordsMatch.value) throw new Error('Passwords do not match')
    const headers = props.needsSetup ? { 'X-Setup-Token': form.setupToken } : undefined
    const data = await api(props.needsSetup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', headers, body: JSON.stringify(form) })
    emit('authenticated', data.user)
  } catch (submitError) { error.value = submitError.message }
  finally { submitting.value = false }
}

async function startPhoneVerification() {
  submitting.value = true
  error.value = ''
  try {
    challenge.value = await api('/api/auth/register/start', { method: 'POST', body: JSON.stringify(phoneForm) })
    passwordStage.value = false
    now.value = Date.now()
    pollTimer = window.setInterval(checkVerification, 2000)
    clockTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
  } catch (submitError) { error.value = submitError.message }
  finally { submitting.value = false }
}

async function checkVerification() {
  if (!challenge.value) return
  try {
    const data = await api('/api/auth/register/status', { method: 'POST', body: JSON.stringify({ token: challenge.value.token }) })
    if (data.status === 'password_required') {
      window.clearInterval(pollTimer)
      passwordStage.value = true
      verifiedPhone.value = data.phone
      error.value = ''
    }
  } catch (pollError) {
    error.value = pollError.message
    if (Date.now() >= challenge.value.expiresAt) stopTimers()
  }
}

async function setPhonePassword() {
  if (!phonePasswordsMatch.value) {
    error.value = 'Passwords do not match'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const data = await api('/api/auth/register/set-password', {
      method: 'POST',
      body: JSON.stringify({ token: challenge.value.token, password: phonePassword.password, confirmPassword: phonePassword.confirmPassword }),
    })
    stopTimers()
    emit('authenticated', data.user)
  } catch (submitError) { error.value = submitError.message }
  finally { submitting.value = false }
}

function cancelChallenge() {
  stopTimers()
  challenge.value = null
  passwordStage.value = false
  verifiedPhone.value = ''
  Object.assign(phonePassword, { password: '', confirmPassword: '' })
  error.value = ''
}

function stopTimers() {
  window.clearInterval(pollTimer)
  window.clearInterval(clockTimer)
}

async function copy(value, field) {
  try {
    await navigator.clipboard.writeText(value)
    copiedField.value = field
    window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => { copiedField.value = '' }, 1800)
  } catch {
    error.value = 'Could not access the clipboard. Select and copy the value manually.'
  }
}

onBeforeUnmount(() => {
  stopTimers()
  window.clearTimeout(copiedTimer)
})
</script>

<style scoped>
.auth-label { display: block; color: rgb(203 213 225); font-size: 0.75rem; font-weight: 650; }
.auth-input { width: 100%; border: 1px solid rgb(255 255 255 / 0.15); border-radius: 0.75rem; background: rgb(255 255 255 / 0.06); padding: 0.7rem 0.8rem; color: white; outline: none; }
.auth-input:focus { border-color: rgb(56 189 248 / 0.8); box-shadow: 0 0 0 2px rgb(56 189 248 / 0.15); }
.password-toggle { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); border-radius: 0.4rem; padding: 0.25rem 0.45rem; color: rgb(125 211 252); font-size: 0.68rem; }
.auth-primary { width: 100%; border-radius: 0.75rem; background: rgb(14 165 233); padding: 0.75rem 1rem; font-size: 0.875rem; font-weight: 700; }
.auth-primary:hover { background: rgb(56 189 248); }
.auth-primary:disabled { opacity: 0.5; }
.auth-error { border-radius: 0.75rem; background: rgb(239 68 68 / 0.15); padding: 0.65rem; color: rgb(254 202 202); font-size: 0.75rem; }
.copy-button { border-radius: 0.5rem; background: rgb(255 255 255 / 0.1); padding: 0.35rem 0.6rem; color: rgb(125 211 252); font-size: 0.7rem; font-weight: 700; }
.copy-button--copied { animation: copied-pop 320ms ease-out; background: rgb(52 211 153 / 0.18); color: rgb(167 243 208); }
@keyframes copied-pop { 0% { opacity: 0.55; transform: scale(0.82); } 65% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .copy-button--copied { animation: none; } }
</style>
