<template>
  <section ref="sheet" v-show="open" class="mobile-map-sheet" :class="{ 'mobile-map-sheet--expanded': expanded }" aria-labelledby="mobile-map-sheet-title" @keydown.esc.stop.prevent="$emit('close')">
    <div class="mobile-map-sheet-heading" @pointerdown="startDrag" @pointerup="endDrag" @pointercancel="dragStart = null">
      <button type="button" class="mobile-map-sheet-handle" :aria-label="expanded ? 'Paneel verkleinen' : 'Paneel vergroten'" :aria-expanded="expanded" @click="toggleSize"><span></span></button>
      <div class="mobile-map-sheet-title-row"><h2 id="mobile-map-sheet-title">{{ title }}</h2><button type="button" :aria-expanded="expanded" @click="toggleSize">{{ expanded ? 'Kleiner' : 'Groter' }}</button><button type="button" aria-label="Paneel sluiten" @click="$emit('close')">×</button></div>
    </div>
    <div id="mobile-map-sheet-body" ref="body" class="mobile-map-sheet-body" @focusin="revealField"></div>
  </section>
</template>

<script setup>
import { nextTick, ref } from 'vue'
const props = defineProps({ open: Boolean, expanded: Boolean, title: String })
const emit = defineEmits(['close', 'update:expanded'])
const sheet = ref(null)
const body = ref(null)
let dragStart = null
let ignoreClickUntil = 0
function toggleSize() { if (Date.now() > ignoreClickUntil) emit('update:expanded', !props.expanded) }
function startDrag(event) {
  if (event.pointerType === 'mouse' || event.target.closest('.mobile-map-sheet-title-row')) return
  dragStart = event.clientY
  event.currentTarget.setPointerCapture?.(event.pointerId)
}
function endDrag(event) {
  if (dragStart === null) return
  const delta = event.clientY - dragStart
  dragStart = null
  if (Math.abs(delta) < 35) return
  ignoreClickUntil = Date.now() + 300
  if (delta < 0) emit('update:expanded', true)
  else if (props.expanded) emit('update:expanded', false)
  else emit('close')
}
async function revealField(event) {
  if (!event.target.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [contenteditable="true"]')) return
  emit('update:expanded', true)
  await nextTick()
  event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
defineExpose({ element: sheet })
</script>

<style scoped>
.mobile-map-sheet{display:none}
@media(max-width:639px){
.mobile-map-sheet{position:fixed;display:flex;flex-direction:column;left:8px;right:8px;bottom:calc(var(--mobile-viewport-bottom,0px) + var(--mobile-bottom-space,5.1rem));height:min(38dvh,calc(var(--mobile-visible-height,100dvh) - var(--mobile-bottom-space,5.1rem) - 80px));max-height:calc(var(--mobile-visible-height,100dvh) - var(--mobile-bottom-space,5.1rem) - 80px);min-height:100px;z-index:1500;overflow:hidden;border:1px solid #ffffff26;border-radius:22px;background:#071222f5;color:#f1f5f9;box-shadow:0 -8px 40px #0003;backdrop-filter:blur(16px)}
.mobile-map-sheet--expanded{height:calc(var(--mobile-visible-height,100dvh) - var(--mobile-bottom-space,5.1rem) - 80px)}
.mobile-map-sheet-heading{flex:none;border-bottom:1px solid #ffffff12;touch-action:none}
.mobile-map-sheet-handle{display:flex;align-items:center;justify-content:center;width:100%;height:22px;border:0;background:transparent;cursor:ns-resize}
.mobile-map-sheet-handle span{width:38px;height:4px;border-radius:4px;background:#64748b}
.mobile-map-sheet-title-row{display:flex;align-items:center;gap:8px;padding:0 12px 6px}
.mobile-map-sheet-title-row h2{flex:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:750}
.mobile-map-sheet-title-row button{min-height:44px;min-width:44px;border:0;border-radius:10px;padding:0 10px;background:#ffffff08;color:#bae6fd;font-size:12px;font-weight:650}
.mobile-map-sheet-title-row button:last-child{font-size:24px;color:#e2e8f0}
.mobile-map-sheet-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scroll-padding:14px;padding:12px;-webkit-overflow-scrolling:touch}
.mobile-map-sheet button:focus-visible{outline:2px solid #7dd3fc;outline-offset:-2px}
}
</style>
