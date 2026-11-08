<template>
  <dialog ref="dialog" class="map-settings" aria-labelledby="map-settings-title" @close="open = false" @click="closeOutside">
    <header><h2 id="map-settings-title">Instellingen</h2><button type="button" aria-label="Instellingen sluiten" @click="open = false">×</button></header>
    <label class="data-saver-setting"><input v-model="dataSaver" type="checkbox" /><span><strong>Dataspaarstand</strong><small>Ontvang live bootposities ongeveer elke 5 seconden om data te besparen. Zonder dataspaarstand worden ze vaker bijgewerkt.</small></span></label>
    <p>Standaard aan voor mobiele bezoekers die niet zijn ingelogd. Je keuze wordt op dit apparaat onthouden.</p>
  </dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useMobileMapPanel } from '../scripts/useMobileMapPanel.js'
const open = defineModel('open', { type: Boolean })
const dataSaver = defineModel('dataSaver', { type: Boolean })
const dialog = ref(null)
useMobileMapPanel('settings', open)
watch(open, value => {
  if (value && !dialog.value.open) dialog.value.showModal()
  else if (!value && dialog.value.open) dialog.value.close()
}, { flush: 'post' })
function closeOutside(event) { if (event.target === dialog.value) { const rect = dialog.value.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) open.value = false } }
</script>

<style scoped>
.map-settings{width:min(30rem,calc(100vw - 24px));max-height:calc(100dvh - 24px);margin:auto;padding:20px;border:1px solid #ffffff24;border-radius:22px;background:#0b1425;color:#e2e8f0;overflow:auto;box-shadow:0 20px 80px #0007}
.map-settings::backdrop{background:#02061799}
.map-settings header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
.map-settings h2{margin:0;font-size:20px;font-weight:750}
.map-settings header button{min-width:44px;min-height:44px;border:0;border-radius:10px;background:#ffffff12;color:inherit;font-size:26px}
.data-saver-setting{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid #ffffff20;border-radius:14px;background:#ffffff06;cursor:pointer}
.data-saver-setting input{flex:none;width:22px;height:22px;margin-top:2px;accent-color:#38bdf8}
.data-saver-setting strong{display:block;font-size:15px}
.data-saver-setting small{display:block;margin-top:6px;color:#cbd5e1;font-size:13px;line-height:1.6}
.map-settings p{margin:14px 0 0;color:#94a3b8;font-size:12px;line-height:1.6}
.map-settings button:focus-visible,.map-settings input:focus-visible{outline:2px solid #7dd3fc;outline-offset:3px}
</style>
