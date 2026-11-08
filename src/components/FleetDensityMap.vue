<template>
  <div class="density-map-wrap">
    <div ref="container" class="density-map" aria-label="Kaart met gemeten AIS-activiteit per gebied"></div>
    <p class="density-note">{{ metricLabel }} per gebied van ongeveer 100 × 100 meter. Klik op een cirkel voor de meetwaarden. Alleen ontvangen metingen binnen de selectie tellen mee.</p>
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
const props = defineProps({ cells: { type: Array, default: () => [] }, metric: { type: String, default: 'activeBoats' } })
const container = ref(null)
const metricLabel = computed(() => ({ activeBoats: 'Unieke varende boten', movingHours: 'Gemeten vaaruren', stoppedHours: 'Gemeten stilstanduren' }[props.metric]))
let map, layer
function draw() {
  if (!map) return
  layer.clearLayers()
  const highest = Math.max(1, ...props.cells.map((cell) => cell[props.metric] || 0))
  for (const cell of props.cells) {
    const value = cell[props.metric] || 0
    if (!value) continue
    const strength = Math.sqrt(value / highest)
    L.circleMarker([cell.latitude, cell.longitude], { radius: 4 + strength * 14, color: '#67e8f9', weight: .5, fillColor: strength > .65 ? '#fbbf24' : strength > .3 ? '#2dd4bf' : '#38bdf8', fillOpacity: .35 + strength * .5 }).bindPopup(`Varende boten: ${cell.activeBoats}<br>Vaaruren: ${cell.movingHours}<br>Stilstanduren: ${cell.stoppedHours}<br>Waargenomen boten: ${cell.observedBoats}`).addTo(layer)
  }
}
onMounted(() => {
  map = L.map(container.value, { preferCanvas: true, scrollWheelZoom: false }).setView([52.371, 4.899], 13)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map)
  layer = L.layerGroup().addTo(map)
  draw()
})
watch(() => [props.cells, props.metric], draw)
onBeforeUnmount(() => map?.remove())
</script>
<style scoped>
.density-map{height:440px;width:100%;border-radius:12px;background:#13263b}.density-note{font-size:12px;color:#94a3b8;line-height:1.7;margin:12px 0 0}@media(max-width:640px){.density-map{height:340px}}
</style>
