<template>
  <section class="usage-panel" aria-labelledby="usage-title">
    <div class="usage-toolbar">
      <div><p class="usage-eyebrow">Applicatiegebruik</p><h2 id="usage-title">Gebruiksstatistieken</h2><p class="usage-muted">Ingelogde gebruikers en bezoekers zonder account.</p></div>
      <div class="usage-controls">
        <label class="sr-only" for="usage-period">Periode</label>
        <select id="usage-period" v-model.number="days"><option :value="1">Vandaag</option><option :value="7">Laatste 7 dagen</option><option :value="30">Laatste 30 dagen</option><option :value="90">Laatste 90 dagen</option></select>
        <button type="button" :disabled="loading" @click="load">{{ loading ? 'Laden…' : 'Vernieuwen' }}</button>
      </div>
    </div>
    <p v-if="error" role="alert" class="usage-error">{{ error }} <button type="button" @click="load">Opnieuw proberen</button></p>
    <p v-if="loading && !data" role="status" class="usage-empty">Gebruiksstatistieken laden…</p>
    <template v-if="data">
      <div class="usage-meta"><span><span class="usage-live-dot"></span>{{ number(data.online.authenticated + data.online.guest) }} nu actief <span class="usage-muted">· {{ number(data.online.authenticated) }} ingelogd / {{ number(data.online.guest) }} gasten</span></span><span class="usage-muted">Bijgewerkt {{ updatedTime }}</span></div>
      <div class="usage-cards">
        <article v-for="card in cards" :key="card.label"><span class="usage-eyebrow">{{ card.label }}</span><strong>{{ card.value }}</strong><span class="usage-muted">{{ card.detail }}</span></article>
      </div>
      <div v-if="!data.total.visits" class="usage-empty"><strong>Nog geen gebruik gemeten in deze periode</strong><p>Bezoeken verschijnen hier zodra iemand de applicatie opent. Eerder gebruik kan niet achteraf worden berekend.</p></div>
      <div class="usage-box">
        <div class="usage-toolbar"><div><h3>Bezoeken per dag</h3><p class="usage-muted">{{ dateLabel(data.from) }} – {{ dateLabel(data.to) }} · tijdzone Amsterdam</p></div><div class="usage-legend"><span><i class="usage-member"></i>Ingelogd</span><span><i class="usage-guest"></i>Niet ingelogd</span></div></div>
        <div class="usage-chart-scroll">
          <div class="usage-chart" :style="{ minWidth: `${Math.max(260, data.daily.length * 24)}px` }" aria-label="Bezoeken per dag, selecteer een dag voor details">
            <button v-for="(day, index) in data.daily" :key="day.day" type="button" class="usage-chart-column" :class="{ 'usage-chart-selected': selectedDay === day.day }" :aria-pressed="selectedDay === day.day" :aria-label="`${dateLabel(day.day)}: ${day.authenticated.visits} ingelogd, ${day.guest.visits} niet ingelogd`" :title="`${dateLabel(day.day)}: ${day.total.visits} bezoeken`" @click="selectedDay = day.day">
              <span class="usage-bar-area"><span class="usage-bar-total">{{ day.total.visits || '' }}</span><span class="usage-bar usage-member" :style="{ height: `${day.authenticated.visits / chartMax * 130}px` }"></span><span class="usage-bar usage-guest" :style="{ height: `${day.guest.visits / chartMax * 130}px` }"></span></span>
              <span class="usage-chart-date">{{ index % Math.max(1, Math.ceil(data.daily.length / 10)) === 0 || index === data.daily.length - 1 ? dateLabel(day.day, true) : '·' }}</span>
            </button>
          </div>
        </div>
        <p v-if="selected" class="usage-chart-detail" aria-live="polite">{{ dateLabel(selected.day) }}: <strong>{{ number(selected.authenticated.visits) }} ingelogde bezoeken</strong> en <strong>{{ number(selected.guest.visits) }} gastbezoeken</strong> · {{ number(selected.total.pageViews) }} paginaweergaven · {{ duration(selected.total.activeSeconds) }} actief</p>
        <p v-else class="usage-muted">Selecteer een dag om de cijfers te bekijken.</p>
      </div>
      <div class="usage-box">
        <h3>Ingelogd en niet ingelogd</h3>
        <div class="usage-table-scroll"><table><thead><tr><th>Groep</th><th>Unieke gebruikers / browsers</th><th>Bezoeken</th><th>Paginaweergaven</th><th>Actieve tijd</th></tr></thead><tbody><tr v-for="group in groups" :key="group.key"><th><span class="usage-group-dot" :class="group.key === 'authenticated' ? 'usage-member' : 'usage-guest'"></span>{{ group.label }}</th><td>{{ number(data[group.key].visitors) }}</td><td>{{ number(data[group.key].visits) }}</td><td>{{ number(data[group.key].pageViews) }}</td><td>{{ duration(data[group.key].activeSeconds) }}</td></tr></tbody></table></div>
      </div>
      <div class="usage-box"><h3>Bekeken pagina’s</h3><div class="usage-table-scroll"><table><thead><tr><th>Pagina</th><th>Ingelogde weergaven</th><th>Gastweergaven</th><th>Totaal</th></tr></thead><tbody><tr v-for="page in data.pages" :key="page.page"><th>{{ ({ knowledge: 'Kennisbank', map: 'Vaarkaart', leaderboard: 'Kilometerklassement', routeplanner: 'Amsterdam routeplanner', fleet: 'Vloot', 'fleet-statistics': 'Vlootstatistieken' })[page.page] || page.page }}</th><td>{{ number(page.authenticated.pageViews) }}</td><td>{{ number(page.guest.pageViews) }}</td><td>{{ number(page.total.pageViews) }}</td></tr></tbody></table></div></div>
      <div class="usage-notes"><strong>Zo worden de cijfers geteld</strong><p>Een bezoek eindigt na 30 minuten zonder activiteit. Inloggen of uitloggen begint een bezoek in de andere groep. Ingelogde gebruikers tellen op accountniveau; gasten per browser met een anonieme cookie. Eén persoon kan daardoor in beide groepen voorkomen.</p><p>Actieve tijd telt alleen voor zichtbare pagina’s met activiteit in de afgelopen 2 minuten. ‘Nu actief’ betekent een signaal in de laatste 90 seconden. Geen IP-adressen, locaties, e-mailadressen of zoekopdrachten worden opgeslagen. Metingen blijven 90 dagen bewaard.</p><p>{{ data.firstRecordedAt ? `Eerste meting: ${new Date(data.firstRecordedAt).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam' })}.` : 'De meting begint zodra de applicatie wordt gebruikt.' }} Geblokkeerde metingen en gewiste cookies kunnen de aantallen beïnvloeden.</p></div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
const days = ref(7)
const data = ref(null)
const loading = ref(false)
const error = ref('')
const selectedDay = ref(null)
let controller
let timer
const number = value => new Intl.NumberFormat('nl-NL').format(value || 0)
function duration(seconds) { const minutes = Math.round(seconds / 60); return minutes >= 60 ? `${number(Math.floor(minutes / 60))} u ${minutes % 60} min` : `${number(minutes)} min` }
function dateLabel(day, short = false) { return new Date(`${day}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: short ? 'numeric' : 'short', timeZone: 'Europe/Amsterdam' }) }
const groups = [{ key: 'authenticated', label: 'Ingelogd' }, { key: 'guest', label: 'Niet ingelogd' }]
const updatedTime = computed(() => new Date(data.value.generatedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }))
const chartMax = computed(() => Math.max(1, ...data.value.daily.map(day => day.total.visits)))
const selected = computed(() => data.value.daily.find(day => day.day === selectedDay.value))
const cards = computed(() => [
  { label: 'Bezoeken', value: number(data.value.total.visits), detail: `${number(data.value.authenticated.visits)} ingelogd · ${number(data.value.guest.visits)} gasten` },
  { label: 'Ingelogde gebruikers', value: number(data.value.authenticated.visitors), detail: 'Unieke accounts in deze periode' },
  { label: 'Gastbrowsers', value: number(data.value.guest.visitors), detail: 'Unieke browsers zonder login' },
  { label: 'Paginaweergaven', value: number(data.value.total.pageViews), detail: `${duration(data.value.total.activeSeconds)} actieve gebruikstijd` },
])
async function load() {
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`/api/admin/usage?days=${days.value}`, { signal: request.signal })
    if (!response.ok) throw new Error(response.status === 403 || response.status === 401 ? 'Alleen beheerders kunnen deze statistieken bekijken.' : 'De statistieken konden niet worden geladen.')
    data.value = await response.json()
  } catch (err) { if (err.name !== 'AbortError') error.value = err.message }
  finally { if (controller === request) loading.value = false }
}
watch(days, () => { selectedDay.value = null; data.value = null; load() })
onMounted(() => { load(); timer = window.setInterval(() => { if (document.visibilityState === 'visible') load() }, 60_000) })
onUnmounted(() => { controller?.abort(); window.clearInterval(timer) })
</script>

<style scoped>
.usage-panel{max-width:1100px;margin:auto;color:#f8fafc}.usage-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.usage-panel h2{margin:4px 0;font-size:24px;font-weight:850;letter-spacing:-.6px}.usage-panel h3{margin:0;font-size:14px;font-weight:750}.usage-panel p{margin:6px 0;font-size:12px;line-height:1.6}.usage-eyebrow{font-size:10px!important;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:750}.usage-muted{color:#94a3b8;font-size:11px}.usage-controls{display:flex;gap:8px}.usage-controls select,.usage-controls button,.usage-error button{border:1px solid #ffffff20;border-radius:10px;padding:9px 12px;background:#ffffff09;color:#e2e8f0;font-size:12px}.usage-controls select{color-scheme:dark}.usage-controls button:disabled{opacity:.5}.usage-panel button:focus-visible,.usage-panel select:focus-visible{outline:2px solid #38bdf8;outline-offset:3px}.usage-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;margin:24px 0 12px;font-size:12px}.usage-live-dot,.usage-group-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px}.usage-live-dot{background:#34d399}.usage-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.usage-cards article{display:flex;flex-direction:column;gap:8px;padding:18px;border:1px solid #ffffff13;border-radius:16px;background:linear-gradient(135deg,#0c4a6e30,#ffffff05)}.usage-cards strong{font-size:30px;font-weight:800;letter-spacing:-1px}.usage-box{border:1px solid #ffffff15;border-radius:16px;background:#ffffff03;padding:20px;margin-top:16px}.usage-legend{display:flex;gap:14px;font-size:11px;color:#cbd5e1}.usage-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px}.usage-member{background:#38bdf8}.usage-guest{background:#a78bfa}.usage-chart-scroll,.usage-table-scroll{overflow-x:auto}.usage-chart{display:flex;gap:4px;margin-top:24px;align-items:flex-end}.usage-chart-column{flex:1;min-width:20px;border:0;background:transparent;color:#94a3b8;padding:0 2px 4px;border-radius:5px}.usage-chart-column:hover,.usage-chart-selected{background:#ffffff0c}.usage-bar-area{height:157px;display:flex;flex-direction:column;justify-content:flex-end;border-bottom:1px solid #ffffff20;gap:1px}.usage-bar{display:block;width:100%;max-width:44px;align-self:center;min-height:0;border-radius:2px}.usage-bar-total{font-size:10px;color:#cbd5e1;margin-bottom:4px}.usage-chart-date{display:block;font-size:9px;white-space:nowrap;margin-top:8px;min-height:14px}.usage-chart-detail{color:#cbd5e1}.usage-panel table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px;white-space:nowrap}.usage-panel th,.usage-panel td{padding:12px 10px;border-bottom:1px solid #ffffff0d;text-align:right}.usage-panel th:first-child{text-align:left;padding-left:0}.usage-panel thead th{color:#94a3b8;font-weight:500;font-size:10px}.usage-panel tbody th{font-weight:650}.usage-notes{margin:20px 0 0;color:#94a3b8;font-size:11px}.usage-notes strong{color:#cbd5e1;font-size:12px}.usage-notes p{font-size:11px}.usage-empty{padding:28px;margin-top:16px;border:1px dashed #ffffff25;border-radius:16px;color:#94a3b8;text-align:center;font-size:13px}.usage-empty strong{color:#e2e8f0}.usage-error{padding:12px;border:1px solid #f8717140;border-radius:12px;color:#fca5a5;background:#f871710a}@media(max-width:700px){.usage-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.usage-cards article{padding:12px}.usage-cards strong{font-size:25px}.usage-box{padding:14px}.usage-controls{width:100%}.usage-controls select{flex:1}.usage-panel h2{font-size:21px}}
</style>
