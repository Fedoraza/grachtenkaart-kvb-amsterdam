<template>
  <details ref="menu" class="site-navigation" @keydown.esc.prevent.stop="closeMenu">
    <summary aria-label="Over Boottracker en informatiepagina’s"><Info :size="16" aria-hidden="true" /><span>Boottracker</span></summary>
    <div class="site-navigation-panel">
      <p class="site-navigation-eyebrow">Over Boottracker</p>
      <h1>Amsterdam routeplanner voor de boot</h1>
      <p>Plan je vaarroute door de Amsterdamse grachten en bekijk bruggen en ontvangen AIS-bootposities.</p>
      <nav aria-label="Informatiepagina’s van Boottracker">
        <button type="button" class="map-settings-trigger" @click="closeMenu(); $emit('open-settings')"><span>Instellingen<small>Voorkeuren en dataverbruik</small></span><span aria-hidden="true">⚙</span></button>
        <a href="/kennisbank"><span>Kennisbank<small>Vaarregels, bruggen, marifoon en praktische uitleg</small></span><span aria-hidden="true">↗</span></a>
        <a href="/amsterdam-routeplanner"><span>Amsterdam routeplanner<small>Uitleg over routes en bruggegevens</small></span><span aria-hidden="true">↗</span></a>
        <a href="/vaarroutes-amsterdam"><span>Voorbeeldvaarroutes<small>Trajecten openen in de planner</small></span><span aria-hidden="true">↗</span></a>
        <a href="/bruggen-amsterdam"><span>Bruggen Amsterdam<small>Hoogtes, breedtes en brongegevens</small></span><span aria-hidden="true">↗</span></a>
        <a href="/grachten-amsterdam"><span>Grachten en vaarprofielen<small>Maximale bootlengte en breedte</small></span><span aria-hidden="true">↗</span></a>
        <a href="/rederijen-amsterdam"><span>Rederijen en boten<small>Boten en beschikbare AIS-posities</small></span><span aria-hidden="true">↗</span></a>
        <a href="/vlootstatistieken"><span>Vlootstatistieken<small>Vergelijk rederijen, vaaruren en drukte</small></span><span aria-hidden="true">↗</span></a>
        <a href="/km-leaderboard"><span>Kilometerklassement<small>De dagelijkse stand van de vloot</small></span><span aria-hidden="true">↗</span></a>
      </nav>
    </div>
  </details>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { Info } from '@lucide/vue'
defineEmits(['open-settings'])
const menu = ref(null)
function closeMenu() { if (menu.value) menu.value.open = false }
function closeOutside(event) { if (!menu.value?.contains(event.target)) closeMenu() }
onMounted(() => document.addEventListener('pointerdown', closeOutside))
onUnmounted(() => document.removeEventListener('pointerdown', closeOutside))
</script>

<style scoped>
.site-navigation{position:absolute;right:16px;bottom:30px;z-index:1050;color:#e2e8f0;font-size:12px}
.site-navigation>summary{display:flex;align-items:center;gap:7px;min-height:36px;padding:8px 12px;cursor:pointer;list-style:none;border:1px solid #ffffff24;border-radius:12px;background:#0f172aeb;box-shadow:0 4px 18px #0002;backdrop-filter:blur(12px);font-size:11px;font-weight:650}
.site-navigation>summary::-webkit-details-marker{display:none}
.site-navigation>summary:hover,.site-navigation[open]>summary{background:#1e293b;color:white}
.site-navigation>summary:focus-visible,.site-navigation a:focus-visible{outline:2px solid #7dd3fc;outline-offset:3px}
.site-navigation-panel{position:absolute;bottom:calc(100% + 10px);right:0;width:min(290px,calc(100vw - 32px));max-height:65dvh;overflow:auto;padding:18px;border:1px solid #ffffff20;border-radius:18px;background:#0b1425f5;box-shadow:0 16px 50px #0005;backdrop-filter:blur(16px)}
.site-navigation-eyebrow{margin:0!important;color:#7dd3fc!important;font-size:9px!important;font-weight:750;text-transform:uppercase;letter-spacing:1.5px}
.site-navigation h1{margin:9px 0;font-size:16px;line-height:1.35;font-weight:750;letter-spacing:-.25px}
.site-navigation p{margin:0 0 12px;font-size:11px;line-height:1.7;color:#94a3b8}
.site-navigation nav{display:grid;border-top:1px solid #ffffff12;padding-top:7px}
.site-navigation a,.map-settings-trigger{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 7px;border-radius:9px;color:#e2e8f0;text-decoration:none;font-size:12px;font-weight:650}
.site-navigation a:hover,.map-settings-trigger:hover{background:#ffffff08;color:#7dd3fc}
.site-navigation small{display:block;margin-top:3px;color:#94a3b8;font-size:10px;font-weight:400}
.map-settings-trigger{width:100%;border:0;background:transparent;text-align:left;cursor:pointer}
@media(max-width:639px){.site-navigation{right:calc(.75rem + env(safe-area-inset-right));bottom:calc(var(--mobile-nav-height,4.5rem) + .75rem + env(safe-area-inset-bottom))}.site-navigation>summary{min-height:40px;padding:9px 11px}.site-navigation-panel{max-height:55dvh}}
</style>
