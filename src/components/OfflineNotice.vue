<template>
  <p v-if="offline" class="offline-notice" role="status">
    <span class="offline-dot" aria-hidden="true"></span>
    Offline. The map and route planner use saved data; live boats, notices and water level may be out of date.
  </p>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const offline = ref(typeof navigator !== 'undefined' && navigator.onLine === false)
const update = () => { offline.value = navigator.onLine === false }

onMounted(() => {
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
})
onUnmounted(() => {
  window.removeEventListener('online', update)
  window.removeEventListener('offline', update)
})
</script>

<style scoped>
.offline-notice {
  align-items: center;
  background: rgb(120 53 15 / .95);
  border: 1px solid rgb(251 191 36 / .5);
  border-radius: .9rem;
  /* Above the bottom map controls (fleet, account, locate) on phones. */
  bottom: calc(5.75rem + env(safe-area-inset-bottom));
  box-shadow: 0 12px 30px rgb(0 0 0 / .3);
  color: #fef3c7;
  display: flex;
  font-size: .8rem;
  gap: .5rem;
  left: 50%;
  line-height: 1.35;
  margin: 0;
  max-width: min(30rem, calc(100vw - 2rem));
  padding: .6rem .85rem;
  pointer-events: none;
  position: fixed;
  transform: translateX(-50%);
  z-index: 2500;
}
.offline-dot { background: #fbbf24; border-radius: 999px; flex: none; height: .55rem; width: .55rem; }
</style>
