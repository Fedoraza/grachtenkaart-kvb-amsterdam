<template>
  <main lang="nl" translate="no" class="flex min-h-full items-center justify-center bg-slate-950 p-4 text-white">
    <section class="w-full max-w-md rounded-3xl border border-white/15 bg-slate-950/85 p-6 shadow-2xl sm:p-8">
      <p class="m-0 text-xs font-bold uppercase tracking-widest text-sky-300">Boottracker</p>
      <h1 class="mb-1 mt-2 text-2xl font-black">{{ needsSetup ? 'Eerste beheerder aanmaken' : mode === 'register' ? 'Account aanmaken' : 'Inloggen' }}</h1>
      <p class="m-0 text-sm text-slate-400">{{ needsSetup ? 'Rond de eenmalige installatie af.' : 'Iedereen kan een account aanmaken. Flagship-planning en personeelsgegevens zijn alleen zichtbaar voor Flagship employees en beheerders.' }}</p>
      <div v-if="!needsSetup" class="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
        <button type="button" class="rounded-lg px-3 py-2 text-sm" :class="mode === 'login' ? 'bg-white/10' : 'text-slate-400'" @click="mode = 'login'; error = ''">Inloggen</button>
        <button type="button" class="rounded-lg px-3 py-2 text-sm" :class="mode === 'register' ? 'bg-white/10' : 'text-slate-400'" @click="mode = 'register'; error = ''">Account aanmaken</button>
      </div>
      <form class="mt-6 space-y-3" @submit.prevent="submit">
        <label v-if="needsSetup && setupTokenRequired" class="auth-label">Setup token<input v-model="form.setupToken" class="auth-input" type="password" autocomplete="off" required /></label>
        <label v-if="creating" class="auth-label">Naam<input v-model="form.name" class="auth-input" autocomplete="name" required minlength="2" maxlength="100" /></label>
        <label class="auth-label">{{ creating ? 'E-mailadres' : 'E-mailadres of bestaand telefoonnummer' }}<input v-model="form.email" class="auth-input" :type="creating ? 'email' : 'text'" autocomplete="username" required /></label>
        <label class="auth-label">Wachtwoord<div class="relative"><input aria-label="Wachtwoord" v-model="form.password" class="auth-input pr-20" :type="showPassword ? 'text' : 'password'" :autocomplete="creating ? 'new-password' : 'current-password'" required :minlength="creating ? 12 : undefined" maxlength="200" /><button type="button" class="absolute right-3 top-3 text-xs text-sky-300" @click="showPassword = !showPassword">{{ showPassword ? 'Verbergen' : 'Tonen' }}</button></div></label>
        <label v-if="creating" class="auth-label">Herhaal wachtwoord<input v-model="form.confirmPassword" class="auth-input" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" required minlength="12" maxlength="200" /></label>
        <p v-if="creating" class="m-0 text-xs text-slate-400">Minimaal 12 tekens. Je hoeft geen dienstverband te verifiëren.</p>
        <p v-if="error" role="alert" class="rounded-xl bg-red-400/10 p-3 text-sm text-red-200">{{ error }}</p>
        <button class="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold disabled:opacity-50" :disabled="submitting">{{ submitting ? 'Even geduld…' : needsSetup ? 'Beheerder aanmaken' : creating ? 'Account aanmaken en inloggen' : 'Inloggen' }}</button>
      </form>
    </section>
  </main>
</template>
<script setup>
import { computed, reactive, ref } from 'vue'
const props = defineProps({ needsSetup: Boolean, setupTokenRequired: Boolean })
const emit = defineEmits(['authenticated'])
const mode = ref('login')
const form = reactive({ setupToken:'', name:'', email:'', password:'', confirmPassword:'' })
const creating = computed(() => props.needsSetup || mode.value === 'register')
const submitting = ref(false)
const showPassword = ref(false)
const error = ref('')
async function submit() {
  submitting.value = true; error.value = ''
  try {
    if (creating.value && form.password !== form.confirmPassword) throw new Error('De wachtwoorden komen niet overeen.')
    const response = await fetch(props.needsSetup ? '/api/auth/setup' : creating.value ? '/api/auth/register' : '/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json', ...(props.needsSetup ? {'X-Setup-Token':form.setupToken} : {})}, body:JSON.stringify(form),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Inloggen of registreren is mislukt.')
    emit('authenticated', data.user)
  } catch (e) { error.value = e.message }
  finally { submitting.value = false }
}
</script>
<style scoped>
.auth-label{display:block;font-size:12px;font-weight:600;color:#cbd5e1}.auth-input{display:block;box-sizing:border-box;width:100%;margin-top:4px;border:1px solid #ffffff26;border-radius:12px;background:#ffffff08;color:white;padding:10px 12px;font-size:14px}.auth-input:focus{outline:2px solid #38bdf8;outline-offset:1px}
</style>
