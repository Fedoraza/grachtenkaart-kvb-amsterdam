<template>
  <div class="pointer-events-none absolute bottom-3 left-3 z-[1600]">
    <button v-if="!open" type="button" class="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/20 bg-slate-950/85 p-2 pr-3 text-left text-white shadow-xl backdrop-blur-md hover:bg-slate-900" @click="openPanel">
      <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-xs font-black text-sky-200">{{ initials(auth.user.name) }}</span>
      <span><strong class="block max-w-40 truncate text-xs">{{ auth.user.name }}</strong><span class="text-[10px] capitalize text-slate-400">{{ auth.user.role }}</span></span>
    </button>

    <section v-else class="pointer-events-auto fixed inset-2 flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-950/97 text-white shadow-2xl backdrop-blur-xl sm:inset-5">
      <header class="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
        <span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/20 text-sm font-black text-sky-200">{{ initials(auth.user.name) }}</span>
        <div class="min-w-0 flex-1">
          <p class="m-0 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">Boat Tracker</p>
          <h1 class="m-0 truncate text-lg font-black">{{ isAdmin ? 'User administration' : 'Your account' }}</h1>
        </div>
        <div class="hidden text-right sm:block"><strong class="block text-xs">{{ auth.user.name }}</strong><span class="text-[11px] text-slate-400">{{ accountContact(auth.user) }}</span></div>
        <button type="button" class="rounded-xl bg-white/10 p-2 text-slate-300 hover:bg-white/20 hover:text-white" aria-label="Close" @click="open = false"><X class="h-5 w-5" /></button>
      </header>

      <div class="flex-1 overflow-auto p-4 sm:p-6">
        <template v-if="isAdmin">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div v-for="stat in stats" :key="stat.label" class="rounded-2xl border border-white/10 bg-white/5 p-3">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">{{ stat.label }}</span>
              <strong class="mt-1 block text-2xl">{{ stat.value }}</strong>
            </div>
          </div>

          <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label class="relative min-w-0 flex-1">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input v-model="search" class="admin-input pl-9" type="search" placeholder="Search by name, email or phone" />
            </label>
            <select v-model="roleFilter" class="admin-input sm:w-40"><option value="">All roles</option><option value="admin">Administrators</option><option value="viewer">Viewers</option></select>
            <button type="button" class="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold hover:bg-sky-400" @click="showCreate = !showCreate"><UserPlus class="h-4 w-4" /> Add user</button>
          </div>

          <form v-if="showCreate" class="mt-4 rounded-2xl border border-sky-300/20 bg-sky-400/5 p-4" @submit.prevent="createUser">
            <div class="flex items-start justify-between gap-3"><div><h2 class="m-0 text-sm font-bold">Create an account</h2><p class="m-0 mt-1 text-xs text-slate-400">Viewers are read-only. Administrators can edit fleet data and manage users.</p></div><button type="button" class="text-slate-400 hover:text-white" @click="showCreate = false"><X class="h-4 w-4" /></button></div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <label class="admin-label">Full name<input v-model="newUser.name" class="admin-input mt-1" required minlength="2" /></label>
              <label class="admin-label">Email address<input v-model="newUser.email" class="admin-input mt-1" type="email" autocomplete="off" required /></label>
              <label class="admin-label">Password<span class="relative mt-1 block"><input v-model="newUser.password" class="admin-input pr-16" :type="showCreatePassword ? 'text' : 'password'" minlength="12" autocomplete="new-password" required /><button type="button" class="password-toggle" @click="showCreatePassword = !showCreatePassword">{{ showCreatePassword ? 'Hide' : 'Show' }}</button></span></label>
              <label class="admin-label">Confirm password<input v-model="newUser.confirmPassword" class="admin-input mt-1" :type="showCreatePassword ? 'text' : 'password'" minlength="12" autocomplete="new-password" required /></label>
              <label class="admin-label">Role<select v-model="newUser.role" class="admin-input mt-1"><option value="viewer">Viewer — read only</option><option value="admin">Administrator — full access</option></select></label>
            </div>
            <div class="mt-4 flex items-center justify-between gap-3"><span class="text-[11px]" :class="createPasswordsMatch ? 'text-emerald-300' : 'text-amber-300'">{{ createPasswordHint }}</span><button class="rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold hover:bg-sky-400">Create user</button></div>
          </form>

          <div class="mt-5 flex items-center justify-between"><h2 class="m-0 text-sm font-bold">Accounts <span class="font-normal text-slate-500">{{ filteredUsers.length }}</span></h2><button type="button" class="text-xs text-sky-300 hover:text-sky-200" @click="loadUsers">Refresh</button></div>
          <div class="mt-2 grid gap-2 lg:grid-cols-2">
            <article v-for="user in filteredUsers" :key="user.id" class="rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-white/20">
              <div class="flex items-center gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black" :class="user.role === 'admin' ? 'bg-violet-400/15 text-violet-200' : 'bg-slate-400/15 text-slate-200'">{{ initials(user.name) }}</span>
                <div class="min-w-0 flex-1"><strong class="block truncate text-sm">{{ user.name }}</strong><span class="block truncate text-[11px] text-slate-400">{{ accountContact(user) }}<template v-if="user.phone_verified_at"> · WhatsApp verified</template></span></div>
                <span class="rounded-full px-2 py-1 text-[10px] font-bold" :class="user.role === 'admin' ? 'bg-violet-400/15 text-violet-200' : 'bg-sky-400/15 text-sky-200'">{{ user.role === 'admin' ? 'Admin' : 'Viewer' }}</span>
                <span class="h-2.5 w-2.5 rounded-full" :class="user.active ? 'bg-emerald-400' : 'bg-red-400'" :title="user.active ? 'Active' : 'Disabled'"></span>
                <button type="button" class="rounded-lg bg-white/10 p-2 hover:bg-white/20" :aria-label="`Edit ${user.name}`" @click="editingId = editingId === user.id ? null : user.id"><Pencil class="h-3.5 w-3.5" /></button>
              </div>

              <div v-if="editingId === user.id" class="mt-3 border-t border-white/10 pt-3">
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="admin-label">Name<input v-model="user.name" class="admin-input mt-1" /></label>
                  <label class="admin-label">Role<select v-model="user.role" class="admin-input mt-1" :disabled="user.id === auth.user.id"><option value="viewer">Viewer</option><option value="admin">Administrator</option></select></label>
                </div>
                <label class="mt-3 flex items-center gap-2 text-xs text-slate-300"><input v-model="user.active" type="checkbox" :disabled="user.id === auth.user.id" /> Account active <span v-if="user.id === auth.user.id" class="text-[10px] text-slate-500">You cannot disable yourself here</span></label>
                <div class="mt-3 rounded-xl bg-black/15 p-3">
                  <p class="m-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">Change password <span class="font-normal normal-case">(optional)</span></p>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <input v-model="user.password" class="admin-input" :type="user.showPassword ? 'text' : 'password'" minlength="12" placeholder="New password" autocomplete="new-password" />
                    <input v-model="user.confirmPassword" class="admin-input" :type="user.showPassword ? 'text' : 'password'" minlength="12" placeholder="Confirm new password" autocomplete="new-password" />
                    <input v-if="user.id === auth.user.id && user.password" v-model="user.currentPassword" class="admin-input sm:col-span-2" type="password" placeholder="Your current password" autocomplete="current-password" />
                  </div>
                  <button type="button" class="mt-2 text-[11px] text-sky-300" @click="user.showPassword = !user.showPassword">{{ user.showPassword ? 'Hide new password' : 'Show new password' }}</button>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <button v-if="user.id !== auth.user.id" type="button" class="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/25" @click="deleteUser(user)">Delete account</button>
                  <span class="flex-1"></span>
                  <button type="button" class="rounded-lg bg-white/10 px-3 py-2 text-xs" @click="cancelEdit(user)">Cancel</button>
                  <button type="button" class="rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold hover:bg-sky-400" @click="saveUser(user)">Save changes</button>
                </div>
              </div>
            </article>
            <p v-if="!filteredUsers.length" class="m-0 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500 lg:col-span-2">No accounts match your filters.</p>
          </div>
        </template>

        <div v-else class="mx-auto max-w-lg rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
          <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/15 text-lg font-black text-sky-200">{{ initials(auth.user.name) }}</span>
          <h2 class="mb-0 mt-3 text-lg font-bold">{{ auth.user.name }}</h2><p class="m-0 text-sm text-slate-400">{{ accountContact(auth.user) }}</p><span class="mt-3 inline-block rounded-full bg-sky-400/15 px-3 py-1 text-xs font-bold text-sky-200">Viewer · read only</span>
        </div>
      </div>

      <footer class="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:px-6">
        <div class="min-w-0"><p v-if="success" class="m-0 truncate text-xs text-emerald-300">{{ success }}</p><p v-else-if="error" class="m-0 truncate text-xs text-red-300">{{ error }}</p><p v-else class="m-0 text-[11px] text-slate-500">Changes are protected by administrator permissions.</p></div>
        <button type="button" class="flex shrink-0 items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/25" @click="auth.logout"><LogOut class="h-4 w-4" /> Sign out</button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, inject, reactive, ref } from 'vue'
import { LogOut, Pencil, Search, UserPlus, X } from '@lucide/vue'

const auth = inject('auth')
const open = ref(false)
const users = ref([])
const search = ref('')
const roleFilter = ref('')
const editingId = ref(null)
const showCreate = ref(false)
const showCreatePassword = ref(false)
const error = ref('')
const success = ref('')
const newUser = reactive({ name: '', email: '', password: '', confirmPassword: '', role: 'viewer' })
const isAdmin = computed(() => auth.user?.role === 'admin')
const stats = computed(() => [
  { label: 'Total users', value: users.value.length },
  { label: 'Active', value: users.value.filter((user) => user.active).length },
  { label: 'Administrators', value: users.value.filter((user) => user.role === 'admin').length },
  { label: 'Viewers', value: users.value.filter((user) => user.role === 'viewer').length },
])
const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase()
  return users.value.filter((user) => (!roleFilter.value || user.role === roleFilter.value)
    && (!query || `${user.name} ${user.email || ''} ${user.phone_e164 || ''}`.toLowerCase().includes(query)))
})
const createPasswordsMatch = computed(() => Boolean(newUser.password && newUser.password === newUser.confirmPassword))
const createPasswordHint = computed(() => {
  if (!newUser.password) return 'Use at least 12 characters.'
  if (newUser.password.length < 12) return 'Password is too short.'
  if (!newUser.confirmPassword) return 'Confirm the password.'
  return createPasswordsMatch.value ? 'Passwords match.' : 'Passwords do not match.'
})

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function accountContact(user) {
  return user?.email || user?.phone_e164 || 'No contact identifier'
}

function showMessage(type, message) {
  error.value = type === 'error' ? message : ''
  success.value = type === 'success' ? message : ''
}

async function request(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed')
  return data
}

async function openPanel() {
  open.value = true
  if (isAdmin.value) await loadUsers()
}

async function loadUsers() {
  try {
    users.value = (await request('/api/auth/users')).map((user) => ({ ...user, password: '', confirmPassword: '', currentPassword: '', showPassword: false, original: { ...user } }))
    showMessage('success', '')
  } catch (requestError) { showMessage('error', requestError.message) }
}

async function createUser() {
  if (newUser.password.length < 12) return showMessage('error', 'Password must contain at least 12 characters')
  if (!createPasswordsMatch.value) return showMessage('error', 'Passwords do not match')
  try {
    await request('/api/auth/users', { method: 'POST', body: JSON.stringify({ name: newUser.name, email: newUser.email, password: newUser.password, role: newUser.role }) })
    Object.assign(newUser, { name: '', email: '', password: '', confirmPassword: '', role: 'viewer' })
    showCreate.value = false
    await loadUsers()
    showMessage('success', 'Account created successfully.')
  } catch (requestError) { showMessage('error', requestError.message) }
}

function cancelEdit(user) {
  Object.assign(user, user.original, { password: '', confirmPassword: '', currentPassword: '', showPassword: false })
  editingId.value = null
}

async function saveUser(user) {
  if (user.password && user.password.length < 12) return showMessage('error', 'New password must contain at least 12 characters')
  if (user.password && user.password !== user.confirmPassword) return showMessage('error', 'New passwords do not match')
  if (user.id === auth.user.id && user.password && !user.currentPassword) return showMessage('error', 'Enter your current password')
  try {
    const body = { name: user.name, role: user.role, active: user.active }
    if (user.password) Object.assign(body, { password: user.password, currentPassword: user.currentPassword })
    await request(`/api/auth/users/${user.id}`, { method: 'PUT', body: JSON.stringify(body) })
    editingId.value = null
    if (user.password && user.id === auth.user.id) {
      showMessage('success', 'Password changed. Please sign in again.')
      await auth.refresh()
      return
    }
    await loadUsers()
    showMessage('success', 'Account updated successfully.')
    if (user.id === auth.user.id) await auth.refresh()
  } catch (requestError) { showMessage('error', requestError.message) }
}

async function deleteUser(user) {
  if (!window.confirm(`Permanently delete ${user.name}'s account? They will immediately lose access.`)) return
  try {
    await request(`/api/auth/users/${user.id}`, { method: 'DELETE' })
    editingId.value = null
    await loadUsers()
    showMessage('success', `${user.name}'s account was deleted.`)
  } catch (requestError) { showMessage('error', requestError.message) }
}
</script>

<style scoped>
.admin-label { color: rgb(203 213 225); font-size: 0.72rem; font-weight: 650; }
.admin-input { width: 100%; border: 1px solid rgb(255 255 255 / 0.13); border-radius: 0.7rem; background: rgb(255 255 255 / 0.055); padding: 0.65rem 0.75rem; color: white; font-size: 0.8rem; outline: none; }
.admin-input:focus { border-color: rgb(56 189 248 / 0.7); box-shadow: 0 0 0 2px rgb(56 189 248 / 0.12); }
.admin-input:disabled { cursor: not-allowed; opacity: 0.45; }
.password-toggle { position: absolute; right: 0.45rem; top: 50%; transform: translateY(-50%); border-radius: 0.4rem; padding: 0.25rem 0.45rem; color: rgb(125 211 252); font-size: 0.68rem; }
.password-toggle:hover { background: rgb(255 255 255 / 0.1); }
</style>
