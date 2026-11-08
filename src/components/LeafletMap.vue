<template>
  <div class="map-shell" :style="mobileViewportStyle" :class="{ 'mobile-keyboard-open': mobileViewport.keyboardOpen, 'mobile-sheet-open': mobileSheetOpen, 'map-shell--guest': !auth.user, 'map-interaction-active': mobileMapInteractionActive, 'route-placement-active': Boolean(routeMode) }">
    <div v-if="!auth.user" class="guest-sign-in-control mobile-nav-item mobile-nav-account pointer-events-none absolute bottom-3 left-3 z-[1600]">
      <button type="button" class="mobile-nav-button pointer-events-auto rounded-2xl border border-white/20 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white shadow-xl" @click="auth.requireLogin('Sign in to access your account.')">Sign in</button>
    </div>
    <MobileMapSheet ref="mobileSheet" :open="mobileSheetOpen" v-model:expanded="mobileSheetExpanded" :title="mobileSheetTitle" @close="closeMobileSheet" />
    <SiteNavigation @open-settings="settingsOpen = true" />
    <MapSettings v-model:open="settingsOpen" v-model:data-saver="dataSaver" />
    <AccountMenu v-if="auth.user" @open-settings="settingsOpen = true" />
    <BoatDutyPanel v-if="canUseStaffTools" />
    <InventoryPanel v-if="canUseStaffTools" />
    <PlanningPanel v-if="canReadPlanning" @show-boat="focusPlanningBoatOnMap" @show-tour-route="showPlanningTourRoute" @schedule-updated="loadTodayPlanning" />
    <FleetPanel @show-on-map="focusFleetBoatOnMap" />
    <div v-if="isAdmin && mapObjectEditor" class="map-editor-panel pointer-events-none absolute right-3 top-3 z-[1260] w-[min(23rem,calc(100vw-1.5rem))] sm:right-4 sm:top-4">
      <form class="pointer-events-auto grid max-h-[88vh] gap-2 overflow-auto rounded-2xl border border-emerald-300/35 bg-slate-950/95 p-3 text-xs text-white shadow-2xl" @submit.prevent="saveMapObject">
        <div class="flex items-start justify-between"><div><span class="text-[10px] font-black uppercase tracking-wider text-emerald-300">{{ mapObjectEditor.layer === 'reporting-points' ? 'Marifoonpunt instellen' : 'Kaartobject beheren' }}</span><strong class="block text-sm">{{ navigationFilterName(mapObjectEditor.layer) }}</strong></div><button type="button" class="rounded bg-white/10 px-2 py-1 text-lg" @click="closeMapObjectEditor">×</button></div>
        <p v-if="mapObjectEditor.layer === 'reporting-points' && !mapObjectEditor.reportingLocation" class="m-0 rounded-lg bg-sky-400/10 p-2 text-sky-100"><strong class="block">Stap 1 · Plaats het punt</strong>Kies de kruising of bocht op de kaart. Na opslaan teken je per aankomstrichting rechtdoor of een afslag.</p>
        <div class="grid gap-2" :class="mapObjectEditor.reportingLocation ? '' : 'grid-cols-2'"><label class="grid gap-1 text-[10px] text-slate-400">{{ mapObjectEditor.layer === 'reporting-points' ? 'Locatie / kruising' : 'Naam' }}<input v-model.trim="mapObjectEditor.name" class="rounded bg-slate-900 px-2 py-2 text-white" :placeholder="mapObjectEditor.layer === 'reporting-points' ? 'Bijv. Herengracht / Reguliersgracht' : ''" /></label><label v-if="!mapObjectEditor.reportingLocation" class="grid gap-1 text-[10px] text-slate-400">{{ mapObjectEditor.layer === 'reporting-points' ? 'Uniek nummer' : 'Nummer / code' }}<input v-model.trim="mapObjectEditor.number" class="rounded bg-slate-900 px-2 py-2 text-white" /></label></div>
        <label v-if="!mapObjectEditor.reportingLocation && mapObjectEditor.layer !== 'reporting-points'" class="grid gap-1 text-[10px] text-slate-400">Type<input v-model.trim="mapObjectEditor.type" class="rounded bg-slate-900 px-2 py-2 text-white" /></label>
        <label v-if="!mapObjectEditor.reportingLocation && mapObjectEditor.layer !== 'reporting-points'" class="grid gap-1 text-[10px] text-slate-400">Omschrijving / melding<textarea v-model.trim="mapObjectEditor.description" class="min-h-20 rounded bg-slate-900 px-2 py-2 text-white"></textarea></label>
        <div v-if="mapObjectEditor.layer !== 'routing-lines'" class="grid grid-cols-2 gap-2"><label class="grid gap-1 text-[10px] text-slate-400">Latitude<input v-model.trim="mapObjectEditor.latitude" type="text" inputmode="decimal" class="rounded bg-slate-900 px-2 py-2 text-white" placeholder="52.370216" /></label><label class="grid gap-1 text-[10px] text-slate-400">Longitude<input v-model.trim="mapObjectEditor.longitude" type="text" inputmode="decimal" class="rounded bg-slate-900 px-2 py-2 text-white" placeholder="4.895168" /></label></div>
        <button v-if="!['routing-lines', 'closures'].includes(mapObjectEditor.layer) || !mapObjectEditor.feature?.geometry || mapObjectEditor.feature.geometry.type === 'Point'" type="button" class="rounded-lg bg-sky-400/20 px-3 py-2 font-bold text-sky-100" @click="startMapObjectPlacement">{{ mapObjectEditor.layer === 'reporting-points' ? 'Punt op de kaart plaatsen' : 'Kies positie op kaart' }}</button>
        <p v-if="mapObjectPlacement" class="m-0 rounded bg-sky-950 px-2 py-2 text-sky-100">Klik nu de nieuwe positie op de kaart.</p>
        <div v-if="mapObjectEditor.layer === 'routing-lines'" class="grid gap-2 rounded-lg bg-white/5 p-2">
          <label class="flex items-center gap-2"><input v-model="mapObjectEditor.closed" type="checkbox" /> Blijvend afgesloten · niet gebruiken voor routes</label>
          <label class="grid gap-1">Maximumsnelheid (km/u)<input v-model.number="mapObjectEditor.maxspeed" type="number" min="1" max="100" class="rounded bg-slate-900 p-2" /></label>
          <label class="grid gap-1">Vaarrichting<select v-model="mapObjectEditor.oneway" class="rounded bg-slate-900 p-2"><option value="no">Beide richtingen</option><option value="yes">Alleen met de getekende lijn mee</option><option value="-1">Alleen tegen de getekende lijn in</option></select></label>
          <button type="button" class="rounded bg-sky-500/20 p-2" @click="editWaterwayGeometry">Ligging aanpassen: sleep de punten op de kaart</button>
          <button type="button" class="rounded bg-rose-500/20 p-2" @click="addClosureForWaterway(mapObjectEditor.feature)">Tijdelijke stremming op deze lijn toevoegen</button>
        </div>
        <div v-if="mapObjectEditor.layer === 'closures'" class="grid gap-2 rounded-lg bg-rose-500/10 p-2">
          <p class="m-0">Deze stremming wordt door de routeplanner vermeden. Zonder eindtijd blijft hij actief totdat je hem verwijdert.</p>
          <label class="grid gap-1">Begint (lokale tijd)<input v-model="mapObjectEditor.start" type="datetime-local" class="rounded bg-slate-900 p-2" /></label>
          <label class="grid gap-1">Eindigt (optioneel)<input v-model="mapObjectEditor.end" type="datetime-local" class="rounded bg-slate-900 p-2" /></label>
          <p v-if="mapObjectEditor.feature?.geometry?.type === 'LineString'" class="m-0">Geldt voor de hele geselecteerde lijn.</p>
        </div>
        <div v-if="mapObjectEditor.reportingLocation" class="grid gap-2 rounded-lg border border-rose-300/20 bg-rose-400/10 p-2">
          <div class="flex items-center justify-between gap-2"><div><strong class="block text-rose-100">Meldingsnummers op dit punt</strong><span class="text-[10px] text-slate-300">Ieder nummer kan eigen vaarbewegingen en meldteksten hebben.</span></div><button type="button" class="rounded-lg bg-rose-500 px-2 py-2 font-bold" @click="addReportingCallToEditor">+ Nummer</button></div>
          <div v-for="(call, index) in mapObjectEditor.calls" :key="call._editorId || call._mapObjectKey || index" class="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg bg-slate-950/60 p-2">
            <label class="grid gap-1 text-[10px] text-slate-400">Meldingsnummer<input v-model.trim="call.number" class="rounded bg-slate-900 px-2 py-2 text-white" /></label>
            <button type="button" class="min-h-10 rounded bg-red-500/20 px-2 text-red-100" @click="removeReportingCallFromEditor(index)">Verwijder</button>
            <span class="col-span-2 text-[10px] text-slate-400">{{ call.movementRules?.length || 0 }} ingestelde vaarbewegingen</span>
          </div>
          <p v-if="!mapObjectEditor.calls.length" class="m-0 rounded bg-amber-400/10 p-2 text-amber-100">Voeg minimaal één meldingsnummer toe.</p>
        </div>
        <div class="grid grid-cols-2 gap-2"><button type="submit" class="rounded-lg bg-emerald-500 px-3 py-2 font-black">Opslaan voor iedereen</button><button v-if="mapObjectEditor.layer !== 'routing-lines' && (mapObjectEditor.objectKey || mapObjectEditor.reportingLocation)" type="button" class="rounded-lg bg-red-500/20 px-3 py-2 font-bold text-red-100" @click="deleteMapObject">{{ mapObjectEditor.reportingLocation ? 'Punt en meldingen verwijderen' : 'Verwijderen' }}</button></div>
        <p v-if="mapObjectError" class="m-0 rounded bg-red-950 px-2 py-2 text-red-100">{{ mapObjectError }}</p>
      </form>
    </div>
    <div v-if="isAdmin && selectedRouteLinkItem" v-show="!reportingPassagePick" class="route-link-editor-panel pointer-events-none absolute right-3 top-3 z-[1250] w-[min(22rem,calc(100vw-1.5rem))] sm:right-4 sm:top-4">
      <div class="pointer-events-auto grid max-h-[85dvh] gap-3 overflow-y-auto rounded-2xl border border-sky-300/40 bg-slate-950/95 p-3 text-xs text-white shadow-2xl backdrop-blur-md">
        <div class="flex items-start justify-between gap-3">
          <div><span class="block text-[10px] font-black uppercase tracking-wider text-sky-300">{{ selectedRouteLinkItem.kind === 'bridge' ? 'Brug koppelen' : 'Marifoonpunt koppelen' }}</span><strong class="mt-1 block text-sm">{{ routeLinkItemLabel(selectedRouteLinkItem) }}</strong><span class="mt-0.5 block text-[11px] text-slate-400">{{ selectedRouteLinkItem.linkedNames || 'Nog niet aan een blauwe vaarlijn gekoppeld' }}</span></div>
          <button type="button" class="rounded-lg bg-white/10 px-2 py-1 text-lg leading-none hover:bg-white/20" aria-label="Koppelvenster sluiten" @click="cancelRouteLinkSelection">×</button>
        </div>
        <p v-if="selectedRouteLinkItem.kind === 'bridge'" class="m-0 rounded-lg bg-sky-400/10 px-2 py-2 text-[11px] text-sky-100">Het punt blijft op zijn vaste plek staan. Kies hoe je het met het blauwe vaarwegnetwerk wilt verbinden.</p>
        <div v-if="selectedRouteLinkItem.kind === 'bridge'" class="grid grid-cols-2 gap-2">
          <button type="button" class="rounded-xl bg-sky-500 px-3 py-2.5 font-black text-white hover:bg-sky-400" @click="startSelectedRouteLinkPick">+ Koppel blauwe lijn</button>
          <button type="button" class="rounded-xl bg-amber-400/20 px-3 py-2.5 font-black text-amber-100 hover:bg-amber-400/30" @click="startSelectedRouteLinkDrag">Sleep naar lijn</button>
        </div>
        <div v-if="selectedRouteLinkItem.kind === 'bridge' && selectedBridgeNetworkPositions.length" class="grid gap-1 rounded-lg bg-white/5 p-2">
          <strong class="text-[10px] uppercase text-slate-300">Gekoppelde vaarlijnen</strong>
          <div v-for="(position, index) in selectedBridgeNetworkPositions" :key="index" class="flex items-center justify-between gap-2"><span class="truncate">{{ position.lineName || `Vaarlijn ${index + 1}` }}</span><button type="button" class="shrink-0 rounded bg-red-500/20 px-2 py-1 text-red-100" :aria-label="`${position.lineName || 'Vaarlijn'} ontkoppelen`" @click="removeSelectedBridgeNetworkPosition(index)">Verwijder</button></div>
        </div>
        <div v-if="selectedRouteLinkItem.kind === 'reporting'" class="grid gap-2 rounded-xl border border-rose-300/20 bg-rose-400/10 p-2">
          <strong class="text-[10px] uppercase tracking-wider text-rose-200">Van welke kant komt de boot?</strong>
          <p class="m-0 text-xs text-slate-300">Kies twee plekken op de blauwe lijnen: vóór en na het meldpunt. Ook twee kanten van dezelfde gracht krijgen zo hun eigen melding.</p>
          <p v-if="!selectedRouteLinkItem.movementRules?.length" class="m-0 rounded-lg bg-white/5 p-2">Nog geen vaarbeweging ingesteld. Voeg er één toe en wijs beide kanten aan op de kaart.</p>
          <div v-for="(rule, index) in selectedRouteLinkItem.movementRules" :key="index" class="grid gap-2 rounded-lg border bg-slate-950/60 p-2" :class="reportingPreviewIndex === index ? 'border-sky-300' : 'border-white/15'">
            <div class="flex items-center justify-between"><button type="button" class="font-bold text-sky-200" @click="previewReportingMovement(index)">Vaarbeweging {{ index + 1 }} · {{ reportingManeuverLabel(rule) }}</button><button type="button" class="rounded bg-red-500/20 px-2 py-1 text-red-200" @click="removeReportingMovementRule(index)">Verwijderen</button></div>
            <p v-if="rule.kind !== 'map-passage'" class="m-0 text-amber-200">Oude instelling. Wijs beide kanten op de kaart aan om deze om te zetten.</p>
            <button type="button" class="min-h-11 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-2 text-left" @click="startReportingPassagePick(index, 'from')"><strong class="block text-emerald-200">1 · Boot komt vanaf</strong><span>{{ rule.from?.lineName || 'Klik deze kant op de kaart' }}</span></button>
            <button type="button" class="min-h-11 rounded-lg border border-sky-300/30 bg-sky-400/10 p-2 text-left" @click="startReportingPassagePick(index, 'to')"><strong class="block text-sky-200">2 · Boot vaart naar</strong><span>{{ rule.to?.lineName || 'Klik de vervolglijn of de overkant' }}</span></button>
            <label class="grid gap-1">3 · Soort beweging<select v-model="rule.maneuver" class="rounded bg-slate-900 p-2"><option value="straight">Rechtdoor / kruisen</option><option value="left">Linksaf</option><option value="right">Rechtsaf</option><option value="uturn">Keren</option></select></label>
            <label class="grid gap-1">4 · Wat meldt de schipper?<textarea v-model.trim="rule.call" class="min-h-16 rounded bg-slate-900 p-2" placeholder="Bijv. Herengracht, linksaf de Reguliersgracht op"></textarea></label>
            <div class="grid grid-cols-2 gap-1.5"><button type="button" class="rounded bg-sky-400/10 px-2 py-2 text-left disabled:opacity-40" :disabled="!rule.from" @click="addReportingAlternative(index)">+ Afslag vanaf deze kant</button><button type="button" class="rounded bg-white/10 px-2 py-2 text-left disabled:opacity-40" :disabled="!rule.from || !rule.to" @click="reverseReportingMovement(index)">+ Tegengestelde richting</button></div>
          </div>
          <button type="button" class="rounded-lg bg-white/10 px-3 py-2 font-bold" @click="addReportingMovementRule">+ Vaarbeweging op kaart toevoegen</button>
          <button type="button" class="rounded-lg bg-rose-500 px-3 py-2 font-black disabled:opacity-40" :disabled="reportingRulesSaving || Boolean(reportingPassagePick)" @click="saveReportingMovementRules">{{ reportingRulesSaving ? 'Opslaan…' : 'Vaarbewegingen en meldingen opslaan' }}</button>
          <p class="m-0 text-[10px] text-slate-300">Groen is de aankomstkant, blauw is de vervolgrichting. De route moet ze in deze volgorde passeren. Sleep de labels om de plekken te wijzigen.</p>
        </div>
        <button v-if="selectedRouteLinkHasOverride" type="button" class="rounded-lg bg-white/10 px-3 py-2 text-left font-bold text-slate-200 hover:bg-white/15" @click="resetSelectedRouteLink">Verwijder koppeling</button>
        <p v-if="routeLinkMapStatus" class="m-0 rounded-lg bg-slate-900 px-2 py-2 text-[11px] text-sky-100">{{ routeLinkMapStatus }}</p>
      </div>
    </div>
    <WaterLevelCard v-if="!mobileMapInteractionActive" :route-planner-open="routePlannerOpen" />
    <aside v-if="!mobileMapInteractionActive && !mobileSheetOpen && !routePlannerOpen && !navigationLayersOpen" class="waterway-live-status" :class="{ 'waterway-live-status--warning': routeClosureError }" aria-label="Actuele vaarweghinderingen">
      <button type="button" :disabled="routeClosureLoading" @click="loadRouteClosures" title="Officiële vaarweghinderingen opnieuw ophalen">{{ routeClosureLoading && !routeClosureData ? 'Hinderingen ophalen…' : routeClosureError ? 'Hinderingen · controle nodig' : `Hinderingen · ${closureSummary.active} actueel` }}</button>
      <span v-if="routeClosureData">{{ closureSummary.updated }} · elke minuut</span>
      <p v-if="routeClosureError" role="status">{{ routeClosureError }}</p>
      <span v-else-if="!activeNavigationLayers.includes('closures')">Kaartlaag uit; routecontrole blijft aan.</span>
    </aside>
    <div v-if="!selectedVessel && selectedRouteLinkItem?.kind !== 'reporting'" class="mobile-map-tools pointer-events-none absolute bottom-24 left-3 z-[1180] sm:left-4" :class="{ 'mobile-route-active': routePlannerOpen }">
      <div class="mobile-map-tools-inner pointer-events-none grid w-72 gap-2 text-white" :class="{ 'mobile-map-tools-expanded': routePlannerOpen || navigationLayersOpen, 'route-tools-open': routePlannerOpen, 'map-filters-open': navigationLayersOpen }">
      <div class="route-tools-panel rounded-2xl border border-white/15 bg-slate-950/90 p-2 shadow-xl backdrop-blur-md">
        <button type="button" class="flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-black hover:bg-white/10" @click="routePlannerOpen = !routePlannerOpen"><span>Route plannen</span><span>{{ routePlannerOpen ? '−' : '+' }}</span></button>
        <div v-if="routePlannerOpen" class="mt-1 max-h-[58vh] overflow-auto border-t border-white/10 pt-2 text-xs">
          <div class="grid gap-1.5">
            <div class="grid grid-cols-[1fr_auto] gap-1.5">
              <div class="relative min-w-0">
              <input v-model.trim="routeAddressInputs.start" class="w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 outline-none placeholder:text-slate-500" placeholder="Start adres of plek" @input="scheduleRouteSuggestions('start')" @focus="scheduleRouteSuggestions('start')" @keydown.enter.prevent="geocodeRouteAddress('start')" />
              <div v-if="routeSuggestions.start.length" class="absolute left-0 right-0 top-full z-[1300] mt-1 max-h-44 overflow-auto rounded-xl border border-white/15 bg-slate-950 p-1 shadow-xl">
                <button v-for="suggestion in routeSuggestions.start" :key="suggestion.id" type="button" class="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-cyan-400/15" @click="selectRouteSuggestion('start', suggestion)"><strong class="block truncate">{{ suggestion.label }}</strong><span class="block truncate text-[10px] text-slate-400">{{ suggestion.displayName }}</span></button>
              </div>
              </div>
              <button type="button" class="rounded-lg bg-cyan-400/15 px-2 font-bold text-cyan-100 hover:bg-cyan-400/25" @click="geocodeRouteAddress('start')">{{ routeAddressLoading === 'start' ? '...' : 'Zoek' }}</button>
            </div>
            <div class="grid grid-cols-[1fr_auto] gap-1.5">
              <div class="relative min-w-0">
              <input v-model.trim="routeAddressInputs.end" class="w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 outline-none placeholder:text-slate-500" placeholder="Eind adres of plek" @input="scheduleRouteSuggestions('end')" @focus="scheduleRouteSuggestions('end')" @keydown.enter.prevent="geocodeRouteAddress('end')" />
              <div v-if="routeSuggestions.end.length" class="absolute left-0 right-0 top-full z-[1300] mt-1 max-h-44 overflow-auto rounded-xl border border-white/15 bg-slate-950 p-1 shadow-xl">
                <button v-for="suggestion in routeSuggestions.end" :key="suggestion.id" type="button" class="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-cyan-400/15" @click="selectRouteSuggestion('end', suggestion)"><strong class="block truncate">{{ suggestion.label }}</strong><span class="block truncate text-[10px] text-slate-400">{{ suggestion.displayName }}</span></button>
              </div>
              </div>
              <button type="button" class="rounded-lg bg-cyan-400/15 px-2 font-bold text-cyan-100 hover:bg-cyan-400/25" @click="geocodeRouteAddress('end')">{{ routeAddressLoading === 'end' ? '...' : 'Zoek' }}</button>
            </div>
          </div>
          <div class="mt-2 grid grid-cols-3 gap-1.5">
            <button type="button" class="rounded-lg border border-white/10 px-2 py-1.5 font-bold hover:bg-white/10" :class="routeMode === 'start' ? 'bg-cyan-400/25 text-cyan-100' : 'bg-white/5'" @click="setRouteMode('start')">Klik start</button>
            <button type="button" class="rounded-lg border border-white/10 px-2 py-1.5 font-bold hover:bg-white/10" :class="routeMode === 'waypoint' ? 'bg-cyan-400/25 text-cyan-100' : 'bg-white/5'" @click="setRouteMode('waypoint')">+ Punt</button>
            <button type="button" class="rounded-lg border border-white/10 px-2 py-1.5 font-bold hover:bg-white/10" :class="routeMode === 'end' ? 'bg-cyan-400/25 text-cyan-100' : 'bg-white/5'" @click="setRouteMode('end')">Klik eind</button>
          </div>
          <p v-if="routeMode" role="status" class="mt-2 rounded-lg bg-cyan-400/15 p-2 text-cyan-100">Klik op de kaart voor {{ routeMode === 'start' ? 'het startpunt' : 'het nieuwe eindpunt' }}. <button type="button" class="underline" @click="routeMode = null">Annuleren</button></p>
          <div class="mt-2 grid grid-cols-2 gap-1.5">
            <button type="button" class="rounded-lg bg-emerald-400/15 px-2 py-1.5 font-bold text-emerald-100 hover:bg-emerald-400/25" @click="setRouteStartFromUserLocation">Start mijn locatie</button>
            <button v-if="auth.user" type="button" class="rounded-lg bg-orange-400/15 px-2 py-1.5 font-bold text-orange-100 hover:bg-orange-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!routeStartVessel" @click="setRouteStartFromSelectedVessel">{{ routeStartVessel ? `Start ${routeStartVesselLabel}` : 'Klik eerst AIS boot' }}</button>
          </div>
          <p v-if="auth.user" class="m-0 mt-1 text-[10px] text-slate-400">Voor AIS-start: klik een boot op de kaart. Daarna blijft die boot hier beschikbaar als startpunt.</p>
          <div class="mt-2 grid grid-cols-[1fr_auto] gap-1.5 rounded-xl bg-cyan-400/10 p-2">
            <label class="flex items-center justify-between gap-2 text-[11px] text-cyan-100">Rondje binnen
              <select v-model.number="routeLoopMinutes" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white">
                <option :value="20">20 min</option>
                <option :value="30">30 min</option>
                <option :value="45">45 min</option>
                <option :value="60">60 min</option>
                <option :value="90">90 min</option>
                <option :value="120">120 min</option>
              </select>
            </label>
            <button type="button" class="rounded-lg bg-cyan-400/20 px-2 py-1.5 font-bold text-cyan-100 hover:bg-cyan-400/30" @click="generateRandomLoopRoute">Genereer rondje</button>
          </div>
          <div class="mt-2 grid gap-1.5 rounded-xl bg-black/20 p-2">
            <div v-for="(point, index) in routePoints" :key="point.id" class="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
              <span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black" :class="index === 0 ? 'bg-emerald-500' : index === routePoints.length - 1 ? 'bg-red-500' : 'bg-cyan-500'">{{ index + 1 }}</span>
              <span class="min-w-0 truncate"><strong>{{ routePointRole(index) }}</strong><span class="ml-1 text-slate-400">{{ routePointLabel(point) }}</span></span>
              <button type="button" class="rounded px-1 text-red-200 hover:bg-red-400/20" @click="removeRoutePoint(index)">×</button>
            </div>
            <p v-if="!routePoints.length" class="m-0 text-[11px] text-slate-400">Zoek een adres of klik start/eind op de kaart.</p>
            <label class="grid gap-1 text-[10px] text-slate-400">Snelheid (km/u)<input v-model.number="routeSpeedValue" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="1" step="0.1" /></label>
            <div class="grid grid-cols-3 gap-1.5">
              <label class="grid gap-1 text-[10px] text-slate-400">Hoogte m<input v-model.number="routeBoatProfile.heightMeters" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="0" step="0.05" placeholder="bv 1.65" /></label>
              <label class="grid gap-1 text-[10px] text-slate-400">Lengte m<input v-model.number="routeBoatProfile.lengthMeters" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="0" step="0.1" placeholder="bv 12" /></label>
              <label class="grid gap-1 text-[10px] text-slate-400">Breedte m<input v-model.number="routeBoatProfile.widthMeters" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="0" step="0.05" placeholder="bv 2.2" /></label>
              <label class="grid gap-1 text-[10px] text-slate-400">Diepgang m<input v-model.number="routeBoatProfile.draftMeters" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="0" step="0.05" placeholder="bv 0.7" /></label>
            </div>
            <p v-if="missingRouteHeight" class="m-0 rounded-lg border border-amber-300/40 bg-amber-400/15 px-2 py-2 text-[11px] font-semibold text-amber-100" role="alert">⚠ Vul de hoogte van je boot in. Zonder hoogte houdt de route geen rekening met lage bruggen.</p>
            <p v-else-if="bridgeClearanceStatus !== 'ready'" class="m-0 rounded-lg bg-amber-400/15 px-2 py-1.5 text-[10px] text-amber-100">{{ bridgeClearanceStatus === 'error' ? 'Brugmaten niet beschikbaar. De route is niet op alle bruggen gecontroleerd.' : 'Brugmaten laden; de route wordt daarna opnieuw berekend.' }}</p>
            <p v-else-if="routeHasBoatDimensions()" class="m-0 text-[10px] text-slate-400">Ingevulde bootmaten worden getoetst aan bekende brugmaten en vaarprofielen. Bij boothoogte geldt 0,15 m marge. Ontbrekende profielen staan bij de routewaarschuwingen.</p>
            <p v-if="bridgeSourceWarning" class="text-xs text-amber-200">{{ bridgeSourceWarning }}</p>
            <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-[10px] text-slate-300">
              <input v-model="routeAllowZone3" class="mt-0.5" type="checkbox" />
              <span><strong class="block text-cyan-100">Zone 3 / IJ toestaan</strong>Alleen aanzetten als de schipper en boot hier mogen varen.</span>
            </label>
            <p class="m-0 text-[10px] text-slate-400">Standaard 6 km/u voor de grachten. Route vermijdt bekende beperkingen, eenrichting en actieve stremmingspunten. Hoogte gebruikt 15 cm veiligheidsmarge.</p>
          </div>
          <p v-if="routeMessage" class="m-0 mt-2 rounded-lg px-2 py-1.5 text-[11px]" :class="routeResult?.status === 'ok' ? 'bg-emerald-400/10 text-emerald-100' : 'bg-amber-400/10 text-amber-100'">{{ routeMessage }}</p>
          <div v-if="['ok', 'partial'].includes(routeResult?.status)" class="mt-2 grid grid-cols-2 gap-1.5">
            <div class="rounded-lg bg-white/5 p-2"><span class="block text-[10px] uppercase text-slate-400">Afstand</span><strong>{{ formatRouteDistance(routeResult.distanceMeters) }}</strong></div>
            <div class="rounded-lg bg-white/5 p-2"><span class="block text-[10px] uppercase text-slate-400">Vaartijd</span><strong>{{ formatRouteDuration(routeResult.durationMinutes) }}</strong></div>
            <div class="rounded-lg bg-white/5 p-2"><span class="block text-[10px] uppercase text-slate-400">Snelheid</span><strong>{{ formatRouteSpeed(routeResult.speedKmh) }}</strong></div>
          </div>
          <p v-if="routeResult?.status === 'partial'" class="m-0 mt-1.5 rounded-lg bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-100">Laatste stuk naar bestemming: {{ formatRouteDistance(routeResult.partialRoute.distanceToTargetMeters) }} buiten verbonden vaarwater.</p>
          <div v-if="routeResult?.warnings?.length" class="mt-2 rounded-xl bg-amber-400/10 p-2 text-[10px] text-amber-100">
            <strong class="block uppercase tracking-wide">Beperkingen op route</strong>
            <ul class="m-0 mt-1 grid gap-1 p-0 pl-3">
              <li v-for="warning in routeResult.warnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>
          <div v-if="routeResult?.steps?.length" class="mt-2 rounded-xl bg-black/20 p-2">
            <strong class="text-[10px] uppercase tracking-wide text-slate-300">Route</strong>
            <ol class="m-0 mt-1 grid max-h-36 gap-1 overflow-auto p-0">
              <li v-for="(step, index) in routeResult.steps.slice(0, 8)" :key="`${step.name}-${index}`" class="grid grid-cols-[auto_1fr_auto] gap-2 rounded bg-white/5 px-2 py-1"><span class="text-slate-400">{{ index + 1 }}</span><span class="truncate">{{ step.name }}</span><span class="text-slate-400">{{ formatRouteDistance(step.distanceMeters) }}</span></li>
            </ol>
          </div>
          <div v-if="['ok', 'partial'].includes(routeResult?.status)" class="mt-2 rounded-xl bg-black/20 p-2">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-[10px] uppercase tracking-wide text-slate-300">Bruggen onder route</strong>
              <span class="text-[10px] text-slate-400">{{ routeBridgeLoading ? '...' : routeBridgeItems.length }}</span>
            </div>
            <p v-if="routeBridgeError" class="m-0 mt-1 rounded bg-red-400/10 px-2 py-1 text-[10px] text-red-100">{{ routeBridgeError }}</p>
            <ol v-else class="m-0 mt-1 grid max-h-40 gap-1 overflow-auto p-0">
              <li v-for="(bridge, index) in routeBridgeItems.slice(0, 12)" :key="`${bridge.number}-${bridge.name}-${index}`" class="grid grid-cols-[auto_1fr_auto] gap-2 rounded bg-white/5 px-2 py-1">
                <span class="text-slate-400">{{ index + 1 }}</span>
                <span class="min-w-0 truncate">{{ bridge.name }}<span v-if="bridge.number" class="text-slate-400"> · {{ bridge.number }}</span></span>
                <span class="text-slate-400">{{ bridge.height }}</span>
              </li>
              <li v-if="!routeBridgeLoading && !routeBridgeItems.length" class="rounded bg-white/5 px-2 py-1 text-[10px] text-slate-400">Geen bruggen direct onder deze route gevonden.</li>
            </ol>
          </div>
          <div v-if="['ok', 'partial'].includes(routeResult?.status)" class="mt-2 rounded-xl bg-black/20 p-2">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-[10px] uppercase tracking-wide text-slate-300">Meldpunten richting route</strong>
              <span class="text-[10px] text-slate-400">{{ routeReportingLoading ? '...' : routeReportingItems.length }}</span>
            </div>
            <p v-if="routeReportingError" class="m-0 mt-1 rounded bg-red-400/10 px-2 py-1 text-[10px] text-red-100">{{ routeReportingError }}</p>
            <ol v-else class="m-0 mt-1 grid max-h-40 gap-1 overflow-auto p-0">
              <li v-for="point in routeReportingItems.slice(0, 12)" :key="`${point.number}-${point.name}`" class="grid grid-cols-[auto_1fr] gap-2 rounded bg-white/5 px-2 py-1">
                <span class="text-slate-400">{{ point.number }}</span>
                <span class="min-w-0 truncate">{{ point.call }}</span>
              </li>
              <li v-if="!routeReportingLoading && !routeReportingItems.length" class="rounded bg-white/5 px-2 py-1 text-[10px] text-slate-400">Geen meldpunten in deze vaarrichting gevonden.</li>
            </ol>
          </div>
          <div v-if="isAdmin" class="mt-2 rounded-xl border border-sky-300/20 bg-sky-400/10 p-2">
            <div class="grid gap-2">
              <button v-if="['ok', 'partial'].includes(routeResult?.status)" type="button" class="rounded-lg bg-sky-400/25 px-2 py-1.5 text-left font-bold text-sky-100 hover:bg-sky-400/35" :aria-pressed="routeLinkMapMode" @click="toggleRouteLinkMapMode">{{ routeLinkMapMode ? 'Verberg brug- en meldpuntkoppelingen' : 'Toon brug- en meldpuntkoppelingen op de route' }}</button>
              <div v-if="selectedRouteLinkItem" class="grid gap-2 rounded-xl border border-sky-300/25 bg-slate-950/55 p-2">
                <div class="flex items-start justify-between gap-2">
                  <div><span class="block text-[9px] font-black uppercase tracking-wider text-sky-300">Geselecteerd</span><strong>{{ routeLinkItemLabel(selectedRouteLinkItem) }}</strong><span class="block text-[10px] text-slate-400">{{ selectedRouteLinkItem.linkedNames || 'Nog niet gekoppeld' }}</span></div>
                  <button type="button" class="rounded px-1.5 text-slate-300 hover:bg-white/10" aria-label="Selectie sluiten" @click="cancelRouteLinkSelection">×</button>
                </div>
                <p class="m-0 text-[10px] text-slate-300">Koppel dit vaste punt rechtstreeks aan een blauwe vaarlijn op de kaart.</p>
                <div class="grid grid-cols-2 gap-1.5">
                  <button type="button" class="rounded-lg bg-sky-400/25 px-2 py-1.5 font-bold text-sky-100 hover:bg-sky-400/35" @click="startSelectedRouteLinkPick">Klik blauwe lijn</button>
                  <button type="button" class="rounded-lg bg-amber-400/20 px-2 py-1.5 font-bold text-amber-100 hover:bg-amber-400/30" @click="startSelectedRouteLinkDrag">Sleep naar lijn</button>
                </div>
                <button v-if="selectedRouteLinkHasOverride" type="button" class="rounded-lg bg-white/10 px-2 py-1.5 text-left font-bold text-slate-200 hover:bg-white/15" @click="resetSelectedRouteLink">Herstel oorspronkelijke koppeling</button>
              </div>
              <p v-else class="m-0 text-[10px] text-slate-300">Klik op een brug of marifoonpunt en kies <strong>Selecteer</strong>. Een geplande route is niet nodig.</p>
              <p v-if="routeLinkMapStatus" class="m-0 rounded bg-sky-950/60 px-2 py-1.5 text-[10px] text-sky-100">{{ routeLinkMapStatus }}</p>
              <div v-if="routeLinkChanges.length" class="grid gap-1 border-t border-white/10 pt-2">
                <div class="flex items-center justify-between"><strong class="text-[9px] uppercase tracking-wider text-slate-400">Recente wijzigingen</strong><button type="button" class="text-[10px] text-slate-400 hover:text-white" @click="routeLinkChanges = []">Wissen</button></div>
                <div v-for="change in routeLinkChanges.slice(0, 4)" :key="change.id" class="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1.5">
                  <span class="min-w-0 truncate text-[10px]">{{ change.label }}</span>
                  <button type="button" class="shrink-0 rounded bg-white/10 px-2 py-1 text-[10px] font-bold hover:bg-white/20" @click="undoRouteLinkChange(change)">Ongedaan</button>
                </div>
              </div>
            </div>
          </div>
          <p v-if="routeResult?.virtualSegmentCount" class="m-0 mt-1.5 text-[10px] text-amber-200">{{ routeResult.virtualSegmentCount }} korte netwerkverbinding{{ routeResult.virtualSegmentCount === 1 ? '' : 'en' }} gebruikt bij ontbrekende kaartdata.</p>
          <p v-if="waterwayLoadError" role="status" class="m-0 mt-2 text-xs text-amber-200">{{ waterwayLoadError }}</p>
          <p v-if="routeClosureLoading" class="m-0 mt-2 text-xs text-sky-200">Stremmingen controleren… De route wordt daarna opnieuw berekend.</p>
          <p v-else-if="routeClosureError" role="status" class="m-0 mt-2 rounded bg-amber-400/15 p-2 text-xs text-amber-200">{{ routeClosureError }} <button type="button" class="underline" @click="loadRouteClosures">Opnieuw proberen</button></p>
          <p v-else-if="routeClosureData" class="m-0 mt-2 text-xs text-emerald-200">Actuele stremmingen gecontroleerd.</p>
          <p v-if="routeClosurePoints.length" class="m-0 mt-1.5 text-[10px] text-amber-200">Routeplanning vermijdt {{ new Set(routeClosurePoints.map(point => point.name)).size }} scheepvaartbeperking{{ routeClosurePoints.length === 1 ? '' : 'en' }}.</p>
          <div class="mt-2 rounded-xl bg-black/20 p-2">
            <strong class="text-[10px] uppercase tracking-wide text-slate-300">Opgeslagen routes</strong>
            <div v-if="auth.user" class="mt-1 grid grid-cols-[1fr_auto] gap-1.5">
              <input v-model.trim="routeSaveName" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white placeholder:text-slate-500" placeholder="Naam voor deze route" />
              <button type="button" class="rounded-lg bg-emerald-400/15 px-2 py-1.5 font-bold text-emerald-100 hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!canSaveCurrentRoute" @click="saveCurrentRoute">Bewaar</button>
            </div>
            <button v-else type="button" class="mt-1 w-full rounded-lg bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-400/25" @click="auth.requireLogin('Sign in to save routes.')">Sign in to save this route</button>
            <div v-if="savedRoutes.length" class="mt-1 grid max-h-32 gap-1 overflow-auto">
              <div v-for="route in savedRoutes" :key="route.id" class="grid grid-cols-[1fr_auto_auto] items-center gap-1 rounded bg-white/5 px-2 py-1">
                <button type="button" class="min-w-0 truncate text-left text-sky-100 hover:text-sky-200" @click="loadSavedRoute(route)">{{ route.name }}</button>
                <span class="text-[10px] text-slate-400">{{ route.points.length }} pt</span>
                <button type="button" class="rounded px-1 text-red-200 hover:bg-red-400/20" @click="deleteSavedRoute(route.id)">×</button>
              </div>
            </div>
            <p v-else class="m-0 mt-1 text-[10px] text-slate-400">Nog geen routes opgeslagen.</p>
          </div>
          <p v-if="routeExportError" class="m-0 mt-1.5 rounded-lg bg-red-400/10 px-2 py-1.5 text-[10px] text-red-100">{{ routeExportError }}</p>
          <p v-if="routeShareMessage" class="m-0 mt-1.5 rounded-lg bg-sky-400/10 px-2 py-1.5 text-[10px] text-sky-100">{{ routeShareMessage }} <a v-if="routeShareUrl" :href="routeShareUrl" class="font-bold underline" target="_blank" rel="noopener">Open link</a></p>
          <div class="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            <button type="button" class="rounded-lg bg-white/10 px-2 py-1.5 font-bold hover:bg-white/20" @click="swapRoutePoints">Wissel</button>
            <button type="button" class="rounded-lg bg-white/10 px-2 py-1.5 font-bold hover:bg-white/20" @click="fitPlannedRoute">Zoom</button>
            <button type="button" class="rounded-lg bg-cyan-400/15 px-2 py-1.5 font-bold text-cyan-100 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="routeExportLoading || !['ok', 'partial'].includes(routeResult?.status)" @click="exportPlannedRoute('html')">{{ routeExportLoading ? '...' : 'HTML' }}</button>
            <button type="button" class="rounded-lg bg-cyan-400/15 px-2 py-1.5 font-bold text-cyan-100 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="routeExportLoading || !['ok', 'partial'].includes(routeResult?.status)" @click="exportPlannedRoute('pdf')">PDF</button>
            <button type="button" class="rounded-lg bg-violet-400/15 px-2 py-1.5 font-bold text-violet-100 hover:bg-violet-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="routeShareLoading || !canSaveCurrentRoute" @click="sharePlannedRoute">{{ routeShareLoading ? '...' : 'Delen' }}</button>
            <button type="button" class="rounded-lg bg-red-400/15 px-2 py-1.5 font-bold text-red-100 hover:bg-red-400/25" @click="clearPlannedRoute">Clear</button>
          </div>
          <p class="m-0 mt-2 text-[10px] leading-snug text-slate-400">Route gebruikt mapped waterwegen, verboden grachten en oneway-tags. Controleer altijd actuele stremmingen/bruggen.</p>
        </div>
      </div>
      <div class="map-filters-panel flex max-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/90 p-2 shadow-xl backdrop-blur-md">
        <button type="button" class="sticky top-0 z-10 flex w-full shrink-0 items-center justify-between rounded-xl bg-slate-950/95 px-2 py-2 text-xs font-black hover:bg-white/10" @click="navigationLayersOpen = !navigationLayersOpen"><span>Vaarkaartfilters</span><span>{{ navigationLayersOpen ? '−' : '+' }}</span></button>
        <div v-if="navigationLayersOpen" class="mt-1 grid min-h-0 gap-1 overflow-y-auto overscroll-contain border-t border-white/10 pt-2 pr-1">
          <div v-if="isAdmin" class="mb-2 grid grid-cols-2 gap-2"><button type="button" class="rounded-lg bg-rose-500/20 p-2 text-left text-xs font-bold text-rose-100" @click="startNewMapObject('closures')">+ Eigen stremming</button><button type="button" class="rounded-lg bg-sky-500/20 p-2 text-left text-xs font-bold text-sky-100" @click="startNewReportingPoint">+ Marifoonpunt op kaart</button></div>
          <p v-if="isAdmin" class="m-0 mb-2 text-xs text-slate-300">Klik een blauwe lijn voor blijvend afsluiten, ligging aanpassen of een tijdelijke stremming.</p>
          <label v-for="filter in navigationFilters" :key="filter.id" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/10">
            <input type="checkbox" :checked="activeNavigationLayers.includes(filter.id)" :disabled="loadingNavigationLayers.includes(filter.id)" @change="toggleNavigationLayer(filter.id)" />
            <i class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: filter.color }"></i><span class="min-w-0 flex-1">{{ filter.name }}</span><span v-if="navigationLayerCounts[filter.id] !== undefined" class="text-slate-400">{{ navigationLayerCounts[filter.id] }}</span><button v-if="isAdmin" type="button" class="rounded bg-white/10 px-1.5 py-1 text-[9px] font-bold" @click.prevent.stop="filter.id === 'reporting-points' ? startNewReportingPoint() : startNewMapObject(filter.id)">{{ filter.id === 'reporting-points' ? '+ Punt' : 'Nieuw' }}</button>
          </label>
          <div v-if="activeNavigationLayers.includes('closures') && routeClosureData" class="mt-1 rounded-xl border border-white/10 bg-white/5 p-2 text-[10px]">
            <div class="flex items-center justify-between gap-2"><strong class="uppercase tracking-wider text-rose-200">Vaarweginformatie</strong><span class="text-slate-400">{{ closureSummary.updated }}</span></div>
            <div class="mt-2 grid grid-cols-3 gap-1 text-center">
              <div class="rounded-lg bg-red-500/15 p-1.5"><strong class="block text-sm text-red-200">{{ closureSummary.blocked }}</strong><span>stremming</span></div>
              <div class="rounded-lg bg-amber-500/15 p-1.5"><strong class="block text-sm text-amber-200">{{ closureSummary.active }}</strong><span>actueel</span></div>
              <div class="rounded-lg bg-sky-500/15 p-1.5"><strong class="block text-sm text-sky-200">{{ closureSummary.upcoming }}</strong><span>gepland</span></div>
            </div>
            <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-slate-300"><span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-red-600"></i>Afgesloten</span><span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500"></i>Beperkt</span><span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-yellow-500"></i>Waarschuwing</span><span>Gestreept = gepland</span></div>
          </div>
          <p v-if="navigationLayerError" class="m-0 rounded-lg bg-red-950/80 px-2 py-1 text-[10px] text-red-200">{{ navigationLayerError }}</p>
          <div v-if="isAdmin" class="mt-1 grid gap-1.5 border-t border-white/10 pt-2">
            <strong class="text-[10px] uppercase tracking-wider text-sky-200">Eigen routeringslijnen</strong>
            <input v-model.trim="customRouteLineName" class="rounded-lg bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="Naam van de vaarverbinding" />
            <div class="grid grid-cols-2 gap-1.5">
              <label class="grid gap-1 text-[9px] text-slate-400">Type
                <select v-model="customRouteLineType" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white"><option value="corridor">Hoofdcorridor</option><option value="crossing">Oversteek</option><option value="connector">Havenverbinding</option></select>
              </label>
              <label class="grid gap-1 text-[9px] text-slate-400">Vaarrichting
                <select v-model="customRouteLineDirection" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white"><option value="both">Beide richtingen</option><option value="forward">Tekenrichting</option><option value="reverse">Tegen tekenrichting</option></select>
              </label>
              <label class="grid gap-1 text-[9px] text-slate-400">Maximum km/u<input v-model.number="customRouteLineSpeed" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white" type="number" min="1" max="30" step="0.5" /></label>
              <label class="flex items-center gap-2 self-end rounded bg-white/5 px-2 py-1.5 text-[10px]"><input v-model="customRouteLineZone3" type="checkbox" /> Zone 3 / IJ</label>
            </div>
            <button type="button" class="rounded-lg px-2 py-1.5 font-bold" :class="customRouteDrawing ? 'bg-red-400/20 text-red-100' : 'bg-sky-400/20 text-sky-100'" @click="toggleCustomRouteDrawing">{{ customRouteDrawing ? 'Tekenen stoppen' : 'Nieuwe blauwe lijn tekenen' }}</button>
            <p v-if="customRouteDrawing" class="m-0 rounded bg-sky-950/70 px-2 py-1.5 text-[10px] text-sky-100">Klik minimaal twee punten op de kaart. Sluit de lijn aan op bestaand blauw vaarwater.</p>
            <div v-if="customRouteDrawing" class="grid grid-cols-3 gap-1">
              <button type="button" class="rounded bg-white/10 px-2 py-1 text-[10px] font-bold disabled:opacity-40" :disabled="!customRouteDraft.length" @click="undoCustomRoutePoint">Punt terug</button>
              <button type="button" class="rounded bg-emerald-400/20 px-2 py-1 text-[10px] font-bold text-emerald-100 disabled:opacity-40" :disabled="customRouteDraft.length < 2" @click="saveCustomRouteLine">Lijn opslaan</button>
              <button type="button" class="rounded bg-white/10 px-2 py-1 text-[10px]" @click="cancelCustomRouteDrawing">Annuleer</button>
            </div>
            <div v-if="customRouteLines.length" class="grid max-h-28 gap-1 overflow-auto">
              <div v-for="line in customRouteLines" :key="line.id" class="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1">
                <span class="min-w-0 truncate text-[10px]"><i class="mr-1 inline-block h-2 w-2 rounded-full" :class="line.connected === false ? 'bg-red-400' : 'bg-emerald-400'"></i>{{ line.name }} · {{ customRouteTypeLabel(line.type) }}</span>
                <button type="button" class="text-[10px] text-red-200 hover:text-red-100" @click="deleteCustomRouteLine(line.id)">Verwijder</button>
              </div>
            </div>
            <p v-if="customRouteStatus" class="m-0 text-[10px] text-slate-300">{{ customRouteStatus }}</p>
          </div>
        </div>
      </div>
      </div>
    </div>
    <div class="search-ais-control pointer-events-none absolute z-[1100]" :class="{ 'toolbar-expanded': isSearchOpen || isGroupsOpen, 'groups-open': isGroupsOpen, 'search-open': isSearchOpen, 'route-open': routePlannerOpen }">
      <div class="combined-toolbar pointer-events-auto overflow-auto rounded-2xl border border-white/20 bg-slate-950/80 p-1 text-slate-50 shadow-[0_18px_50px_rgba(0,0,0,0.30)] backdrop-blur-md sm:p-2">
    <div class="search-control">
      <div class="mobile-map-search-bar">
        <label class="mobile-map-search-trigger" for="mobile-canal-search-input">
          <Search class="h-5 w-5 shrink-0" aria-hidden="true" />
          <input id="mobile-canal-search-input" ref="mobileSearchInput" v-model="searchQuery" type="search" autocomplete="off" :spellcheck="false" enterkeyhint="search" aria-label="Zoek boot, plek of gracht" aria-controls="canal-search-panel" :aria-expanded="isSearchOpen" placeholder="Zoek boot, plek of gracht" @focus="openMobileSearch" @click="openMobileSearch" @input="openMobileSearch" @keydown.enter.prevent="selectFirstResult" />
        </label>
        <button type="button" class="mobile-map-route-trigger" :aria-label="routePlannerOpen ? 'Routeplanner sluiten' : 'Route plannen'" :aria-expanded="routePlannerOpen" @click="toggleMobileRoutePlanner">
          <Navigation class="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" class="mobile-map-ais-trigger" :aria-expanded="isGroupsOpen" aria-label="AIS-groepen kiezen" @click="isSearchOpen = false; routePlannerOpen = false; routeMode = null; navigationLayersOpen = false; isGroupsOpen = !isGroupsOpen">AIS</button>
        <button type="button" class="mobile-map-layers-trigger" :aria-expanded="navigationLayersOpen" aria-label="Kaartlagen en filters" @click="toggleMobileLayers"><Layers3 class="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <Teleport defer to="#mobile-map-sheet-body" :disabled="!isMobileViewport"><div v-if="navigationLayersOpen" class="mobile-layers-panel">
        <div class="mobile-layers-heading"><strong>Kaartlagen</strong><button type="button" aria-label="Kaartlagen sluiten" @click="navigationLayersOpen = false">×</button></div>
        <div class="mobile-map-styles" role="group" aria-label="Kaarttype">
          <button v-for="style in [{ id: 'street', label: 'Kaart' }, { id: 'aerial', label: 'Luchtfoto' }]" :key="style.id" type="button" :aria-pressed="baseMapStyle === style.id" :class="{ 'mobile-map-style-active': baseMapStyle === style.id }" @click="chooseBaseMapStyle(style.id)"><span :class="`mobile-map-style-preview mobile-map-style-preview--${style.id}`"></span>{{ style.label }}</button>
        </div>
        <strong class="mobile-layers-subheading">Vaarkaartfilters</strong>
        <label v-for="filter in navigationFilters" :key="filter.id" class="mobile-layer-filter"><input type="checkbox" :checked="activeNavigationLayers.includes(filter.id)" :disabled="loadingNavigationLayers.includes(filter.id)" @change="toggleNavigationLayer(filter.id)" /><i :style="{ backgroundColor: filter.color }"></i><span>{{ filter.name }}</span><small v-if="navigationLayerCounts[filter.id] !== undefined">{{ navigationLayerCounts[filter.id] }}</small></label>
        <p v-if="navigationLayerError" class="m-0 text-xs text-red-200">{{ navigationLayerError }}</p>
        <div v-if="isAdmin" class="mobile-layer-admin"><button type="button" @click="startNewMapObject('closures'); navigationLayersOpen = false">+ Stremming</button><button type="button" @click="startNewReportingPoint(); navigationLayersOpen = false">+ Marifoonpunt</button></div>
      </div></Teleport>
      <div v-if="mobileSelectedPlace && !isSearchOpen && !routePlannerOpen && !navigationLayersOpen && !isGroupsOpen" class="mobile-place-card"><div><strong>{{ mobileSelectedPlace.name }}</strong><small>{{ mobileSelectedPlace.meta }}</small></div><button type="button" @click="startRouteToSelectedPlace"><Navigation class="h-4 w-4" aria-hidden="true" /> Route</button><button type="button" aria-label="Geselecteerde plek sluiten" @click="mobileSelectedPlace = null">×</button></div>
      <Teleport defer to="#mobile-map-sheet-body" :disabled="!isMobileViewport"><div v-if="routePlannerOpen" class="mobile-route-panel">
        <div class="mobile-route-panel-heading"><span>Route plannen</span><button type="button" aria-label="Routeplanner sluiten" @click="routePlannerOpen = false; routeMode = null">×</button></div>
        <div v-if="routeMode" class="mobile-route-pick-prompt" role="status">
          <span>Tik op de kaart voor {{ routeMode === 'start' ? 'je startpunt' : routeMode === 'end' ? 'je bestemming' : 'een extra punt' }}.</span>
          <button type="button" @click="routeMode = null">Annuleren</button>
        </div>
        <template v-else>
          <div class="mobile-route-fields">
            <div v-for="role in ['start', 'end']" :key="role" class="mobile-route-field">
              <span class="mobile-route-field-dot" :class="role === 'start' ? 'mobile-route-field-dot--start' : 'mobile-route-field-dot--end'"></span>
              <div class="relative min-w-0 flex-1">
                <input v-model.trim="routeAddressInputs[role]" :aria-label="role === 'start' ? 'Startpunt zoeken' : 'Bestemming zoeken'" :placeholder="routePoints.find((point) => point.role === role) ? routePointLabel(routePoints.find((point) => point.role === role)) : role === 'start' ? 'Kies startpunt' : 'Waar wil je heen?'" autocomplete="off" @input="scheduleRouteSuggestions(role)" @focus="scheduleRouteSuggestions(role)" @keydown.enter.prevent="geocodeRouteAddress(role)" />
                <div v-if="routeSuggestions[role].length" class="mobile-route-suggestions">
                  <button v-for="suggestion in routeSuggestions[role]" :key="suggestion.id" type="button" @click="selectRouteSuggestion(role, suggestion)"><strong>{{ suggestion.label }}</strong><small>{{ suggestion.displayName }}</small></button>
                </div>
              </div>
              <button type="button" class="mobile-route-map-pick" :aria-label="role === 'start' ? 'Startpunt op kaart kiezen' : 'Bestemming op kaart kiezen'" @click="setRouteMode(role)">Kaart</button>
            </div>
          </div>
          <div class="mobile-route-quick-actions">
            <button type="button" @click="setRouteStartFromUserLocation">Mijn locatie als start</button>
            <button type="button" @click="setRouteMode('waypoint')">+ Punt op kaart</button>
          </div>
          <div v-if="routePoints.length" class="mobile-route-points">
            <div v-for="(point, index) in routePoints" :key="point.id" class="mobile-route-point"><span>{{ index + 1 }}</span><span class="truncate">{{ routePointLabel(point) }}</span><button type="button" :aria-label="`Routepunt ${index + 1} verwijderen`" @click="removeRoutePoint(index)">×</button></div>
          </div>
          <div v-if="missingRouteHeight" class="mobile-route-height-warning" role="alert"><span>⚠ Vul de hoogte van je boot in. Zonder hoogte houdt de route geen rekening met lage bruggen.</span><button type="button" @click="focusMobileRouteHeight">Hoogte invullen</button></div>
          <p v-if="bridgeSourceWarning" class="text-xs text-amber-200">{{ bridgeSourceWarning }}</p>
          <button type="button" class="mobile-route-options-toggle" :aria-expanded="mobileRouteOptionsOpen" @click="mobileRouteOptionsOpen = !mobileRouteOptionsOpen">Boot en route-opties <span>{{ mobileRouteOptionsOpen ? '−' : '+' }}</span></button>
          <div v-if="mobileRouteOptionsOpen" class="mobile-route-options">
            <label>Hoogte (m)<input ref="mobileRouteHeightInput" v-model.number="routeBoatProfile.heightMeters" type="number" min="0" step="0.05" inputmode="decimal" placeholder="Bijv. 1,65" /></label>
            <label>Lengte (m)<input v-model.number="routeBoatProfile.lengthMeters" type="number" min="0" step="0.1" inputmode="decimal" placeholder="Optioneel" /></label>
            <label>Breedte (m)<input v-model.number="routeBoatProfile.widthMeters" type="number" min="0" step="0.05" inputmode="decimal" placeholder="Optioneel" /></label>
            <label>Diepgang (m)<input v-model.number="routeBoatProfile.draftMeters" type="number" min="0" step="0.05" inputmode="decimal" placeholder="Optioneel" /></label>
            <label>Snelheid (km/u)<input v-model.number="routeSpeedValue" type="number" min="1" step="0.1" inputmode="decimal" /></label>
            <label class="mobile-route-zone-option"><input v-model="routeAllowZone3" type="checkbox" /> Zone 3 / IJ toestaan</label>
            <div class="mobile-route-loop"><select v-model.number="routeLoopMinutes" aria-label="Duur van rondje"><option :value="20">20 min</option><option :value="30">30 min</option><option :value="45">45 min</option><option :value="60">60 min</option><option :value="90">90 min</option><option :value="120">120 min</option></select><button type="button" @click="generateRandomLoopRoute">Genereer rondje</button></div>
            <p v-if="routeHasBoatDimensions()" class="col-span-2 m-0 text-xs text-slate-300">Ingevulde bootmaten worden getoetst aan bekende brugmaten en vaarprofielen. Bij boothoogte geldt 0,15 m marge.</p>
          </div>
          <ul v-if="routeResult?.warnings?.length" class="m-0 list-disc pl-5 text-xs text-amber-200"><li v-for="warning in routeResult.warnings" :key="warning">{{ warning }}</li></ul>
          <div v-if="routeMessage" class="mobile-route-result" :class="routeResult?.status === 'ok' ? 'mobile-route-result--ok' : ''" role="status">
            <strong v-if="['ok', 'partial'].includes(routeResult?.status)">{{ formatRouteDistance(routeResult.distanceMeters) }} · {{ formatRouteDuration(routeResult.durationMinutes) }}</strong>
            <span>{{ routeMessage }}</span>
          </div>
          <div v-if="['ok', 'partial'].includes(routeResult?.status)" class="mobile-route-result-actions">
            <button type="button" @click="fitPlannedRoute">Toon route</button>
            <button type="button" :disabled="routeShareLoading" @click="sharePlannedRoute">{{ routeShareLoading ? 'Delen…' : 'Delen' }}</button>
            <button type="button" @click="exportPlannedRoute('pdf')">PDF</button>
            <button type="button" @click="clearPlannedRoute">Wis route</button>
          </div>
          <button v-if="isAdmin && ['ok', 'partial'].includes(routeResult?.status)" type="button" class="mobile-route-options-toggle" :aria-pressed="routeLinkMapMode" @click="toggleRouteLinkMapMode">{{ routeLinkMapMode ? 'Verberg brug- en meldpuntkoppelingen' : 'Toon brug- en meldpuntkoppelingen' }}</button>
          <p v-if="isAdmin && routeLinkMapMode && routeLinkMapStatus" class="m-0 text-xs text-sky-200" role="status">{{ routeLinkMapStatus }}</p>
          <div v-if="['ok', 'partial'].includes(routeResult?.status)" class="mobile-route-save">
            <template v-if="auth.user"><input v-model.trim="routeSaveName" aria-label="Naam voor route" placeholder="Naam voor deze route" /><button type="button" :disabled="!canSaveCurrentRoute" @click="saveCurrentRoute">Bewaar</button></template>
            <button v-else type="button" @click="auth.requireLogin('Sign in to save routes.')">Log in om route op te slaan</button>
          </div>
          <p v-if="routeShareMessage" class="m-0 text-xs text-sky-200">{{ routeShareMessage }} <a v-if="routeShareUrl" :href="routeShareUrl" target="_blank" rel="noopener" class="underline">Open link</a></p>
          <details v-if="savedRoutes.length || routeBridgeItems.length || routeReportingItems.length" class="mobile-route-details"><summary>Routegegevens en opgeslagen routes</summary><div v-for="route in savedRoutes" :key="route.id"><button type="button" @click="loadSavedRoute(route)">{{ route.name }}</button></div><p v-if="routeBridgeItems.length">Bruggen: {{ routeBridgeItems.map((bridge) => `${bridge.name} ${bridge.height}`).join(', ') }}</p><p v-if="routeReportingItems.length">Meldpunten: {{ routeReportingItems.map((point) => point.number).join(', ') }}</p></details>
        </template>
      </div></Teleport>
      <div>
        <div v-if="!isSearchOpen" class="desktop-search-trigger flex items-center gap-1.5">
          <button
            type="button"
            class="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-[14px] font-semibold text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70"
            :aria-expanded="isSearchOpen"
            aria-controls="canal-search-panel"
            @click="toggleSearch"
          >
            <span>Search</span>
            <span v-if="searchQuery" class="max-w-32 truncate text-slate-200/70">{{ searchQuery }}</span>
          </button>
          <button
            type="button"
            class="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70 sm:flex"
            :class="isUserLocationActive ? 'bg-sky-500/30 text-sky-100' : 'bg-white/10'"
            :aria-label="locationButtonLabel"
            :title="locationButtonLabel"
            @click="activateUserLocation"
          >
            <Crosshair class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <Teleport defer to="#mobile-map-sheet-body" :disabled="!isMobileViewport"><div id="canal-search-panel" :class="isSearchOpen ? 'block' : 'hidden'">
          <div class="search-panel-heading mb-2 flex items-center justify-between gap-3">
            <label class="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-slate-200/70 sm:text-[0.72rem]" for="canal-search-input">Search canals and boats</label>
            <div class="flex gap-2">
              <button type="button" class="hidden rounded-xl border border-white/10 px-3 py-2 text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70 sm:block" :class="isUserLocationActive ? 'bg-white/30' : 'bg-white/10'" :aria-label="locationButtonLabel" :title="locationButtonLabel" @click="activateUserLocation">
                <Crosshair class="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-medium text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70" @click="collapseSearch">Hide</button>
            </div>
          </div>
          <div class="search-panel-fields flex gap-2">
            <input
              id="canal-search-input"
              ref="searchInput"
              v-model="searchQuery"
              class="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[14px] text-inherit outline-none placeholder:text-slate-200/40 focus:border-sky-300/70 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70 sm:px-3.5 sm:py-3"
              type="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="Canal, boat name or MMSI"
              @keydown.enter.prevent="selectFirstResult"
            />
            <button v-if="searchQuery" type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-[14px] font-medium text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70 sm:px-3.5 sm:py-3" @click="clearSearch">Clear</button>
          </div>
          <button type="button" class="mobile-search-route-action" @click="toggleMobileRoutePlanner"><Navigation class="h-4 w-4" aria-hidden="true" /> Route plannen <span aria-hidden="true">›</span></button>
          <div class="mt-3 grid max-h-[38vh] gap-2 overflow-auto sm:max-h-[340px]">
            <button
              v-for="result in searchResults"
              :key="result.groupKey"
              type="button"
              class="grid gap-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-inherit transition hover:border-sky-400/55 hover:bg-sky-400/10 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70"
              @click="focusSearchResult(result)"
            >
              <span class="flex items-center gap-2 text-[0.9rem] font-semibold leading-tight">
                <span v-if="result.kind === 'vessel'" class="h-2 w-2 rounded-full" :class="searchVesselDotClass(result.mmsi)"></span>
                {{ result.name || (result.kind === 'vessel' ? 'Unnamed vessel' : 'Unnamed canal') }}
              </span>
              <span class="text-[0.72rem] text-slate-200/65">{{ formatResultMeta(result) }}</span>
            </button>

            <p v-if="searchQuery && !searchResults.length" class="m-0 rounded-2xl border border-dashed border-white/10 px-3 py-2 text-[0.84rem] text-slate-200/65">Geen grachten, bruggen of boten gevonden.</p>
          </div>
        </div></Teleport>
      </div>
    </div>

    <div class="ais-status border-t border-white/10 sm:border-l sm:border-t-0">
      <div class="px-3 py-2 text-slate-50">
        <div class="flex items-center gap-2 text-sm font-semibold">
          <span class="h-2.5 w-2.5 rounded-full" :class="aisStatusDotClass"></span>
          <span>Live AIS</span>
          <span class="ais-counts tabular-nums text-slate-200/80">{{ aisRecentVesselCount }} live · {{ aisDelayedVesselCount }} last known</span>
          <button
            type="button"
            class="ml-auto rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
            @click="isGroupsOpen = !isGroupsOpen"
          >
            {{ isGroupsOpen ? 'Close' : activeGroupLabel }}
          </button>
        </div>
        <p class="ais-message m-0 mt-1 max-w-64 text-[11px] leading-snug text-slate-200/70">{{ aisStatusMessage }}</p>
        <a
          v-if="!aisConfigured"
          class="pointer-events-auto mt-1.5 inline-block text-[11px] font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
          href="https://aisstream.io/apikeys"
          target="_blank"
          rel="noopener noreferrer"
        >
          Create free AIS key ↗
        </a>

        <Teleport defer to="#mobile-map-sheet-body" :disabled="!isMobileViewport"><div v-if="isGroupsOpen" class="mt-3 border-t border-white/10 pt-3">
          <label class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Show vessels</label>
          <p class="m-0 mt-1 text-[10px] text-slate-400">Alle AIS-boten zijn standaard zichtbaar, ook zonder rederijkoppeling. Een rederijfilter verbergt andere en ongekoppelde boten. Rederijgroepen gebruiken opgeslagen koppelingen en herkenbare AIS-namen. Nul betekent geen gekoppelde MMSI’s, niet dat de rederij geen boten heeft.</p>
          <div class="mt-1 grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2 text-xs">
            <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes('all')" @change="toggleVesselFilter('all')" />
              <span>All AIS vessels</span>
            </label>
            <label v-for="filter in builtInVesselFilters" :key="filter.id" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes(filter.id)" @change="toggleVesselFilter(filter.id)" />
              <i class="h-2 w-2 rounded-full" :class="filter.color" :style="filter.hexColor ? { backgroundColor: filter.hexColor } : undefined"></i>
              <span class="flex-1">{{ filter.name }}</span>
              <span class="text-slate-400">{{ filter.count }}</span>
            </label>
            <div v-for="group in vesselGroups" :key="group.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes(`group:${group.id}`)" @change="toggleVesselFilter(`group:${group.id}`)" />
              <button v-if="auth.user" type="button" class="min-w-0 flex-1 truncate text-left" @click="editingGroupId = group.id">{{ group.name }}</button>
              <span v-else class="min-w-0 flex-1 truncate">{{ group.name }}</span>
              <span class="text-slate-400">{{ group.mmsis.length }}</span>
              <button v-if="auth.user" type="button" class="text-sky-300" @click="editingGroupId = group.id">Edit</button>
            </div>
          </div>
          <form v-if="auth.user" class="mt-3 flex gap-2" @submit.prevent="createVesselGroup">
            <input
              v-model="newGroupName"
              class="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm outline-none placeholder:text-slate-400"
              placeholder="New group name"
              maxlength="40"
            />
            <button class="rounded-lg bg-sky-500 px-3 text-sm font-semibold hover:bg-sky-400" type="submit">Add</button>
          </form>

          <div v-if="auth.user && activeGroup" class="mt-3">
            <div class="flex items-center justify-between gap-2">
              <strong class="truncate text-sm">{{ activeGroup.name }}</strong>
              <button type="button" class="text-xs text-red-300 hover:text-red-200" @click="deleteActiveGroup">Delete group</button>
            </div>

            <form class="mt-2 flex gap-2" @submit.prevent="addManualMmsi">
              <input
                v-model="manualMmsi"
                class="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
                inputmode="numeric"
                maxlength="9"
                placeholder="Add 9-digit MMSI"
              />
              <button class="rounded-lg border border-white/15 bg-white/10 px-2 text-xs hover:bg-white/20" type="submit">Add</button>
            </form>

            <input
              v-model="vesselFilterQuery"
              class="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
              placeholder="Find live vessel or MMSI"
            />

            <div class="mt-2 max-h-52 space-y-1 overflow-auto">
              <label
                v-for="vessel in filteredLiveVessels"
                :key="vessel.mmsi"
                class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/10"
              >
                <input
                  type="checkbox"
                  :checked="activeGroup.mmsis.includes(vessel.mmsi)"
                  @change="toggleVesselInActiveGroup(vessel.mmsi)"
                />
                <span class="min-w-0 flex-1 truncate">{{ vessel.name || 'Unnamed vessel' }}</span>
                <span class="text-slate-400">{{ vessel.mmsi }}</span>
                <button type="button" class="text-sky-300 hover:text-sky-200" @click.prevent="focusVessel(vessel)">View</button>
              </label>
              <p v-if="!filteredLiveVessels.length" class="m-0 py-2 text-xs text-slate-400">No matching live vessels.</p>
            </div>

            <div v-if="offlineGroupMmsis.length" class="mt-2 border-t border-white/10 pt-2">
              <p class="m-0 text-[11px] text-slate-400">Saved, currently offline</p>
              <button
                v-for="mmsi in offlineGroupMmsis"
                :key="mmsi"
                type="button"
                class="mr-1 mt-1 rounded bg-white/10 px-1.5 py-1 text-[11px] hover:bg-red-500/30"
                title="Remove from group"
                @click="toggleVesselInActiveGroup(mmsi)"
              >
                {{ mmsi }} ×
              </button>
            </div>
          </div>
        </div></Teleport>
      </div>
    </div>
      </div>
    </div>

    <Teleport defer to="#mobile-map-sheet-body" :disabled="!isMobileViewport"><aside
      v-if="selectedVessel"
      class="vessel-details absolute z-[1300] w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden rounded-2xl border border-white/20 bg-slate-950/90 text-slate-50 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      :class="vesselDetailsCollapsed && 'vessel-details--collapsed'"
    >
      <header
        class="border-b border-white/10 bg-gradient-to-br from-sky-500/25 to-cyan-300/5 px-4 py-3"
        :class="vesselDetailsCollapsed && 'cursor-pointer border-b-0'"
        @click="vesselDetailsCollapsed && (vesselDetailsCollapsed = false)"
      >
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-xl">⌁</div>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[10px] font-bold uppercase tracking-[0.16em]" :style="selectedVessel.operator ? { color: selectedVessel.operator.color } : {}" :class="selectedVessel.serviceGroup === 'nt' ? 'text-purple-300' : 'text-sky-300'">{{ selectedVessel.operator?.name || (selectedVessel.fleet ? 'Vlootregister' : selectedVessel.serviceGroup === 'nt' ? 'Nautical supervision' : selectedVessel.serviceGroup === 'police' ? 'Police vessel' : vesselTypeLabel(selectedVessel.shipType)) }}</p>
            <h2 class="m-0 truncate text-lg font-bold">{{ selectedVessel.fleet?.name || selectedVessel.name || 'Unnamed AIS vessel' }}</h2>
            <p class="m-0 text-xs text-slate-300">MMSI {{ selectedVessel.mmsi }}<span v-if="selectedVessel.aisClass"> · Class {{ selectedVessel.aisClass }}</span></p>
          </div>
          <button type="button" class="rounded-lg bg-white/10 px-2.5 py-1 text-sm hover:bg-white/20" :aria-label="vesselDetailsCollapsed ? 'Expand details' : 'Collapse details'" @click.stop="isMobileViewport ? (mobileSheetExpanded = !mobileSheetExpanded) : (vesselDetailsCollapsed = !vesselDetailsCollapsed)">{{ vesselDetailsCollapsed ? '⌃' : '⌄' }}</button>
          <button type="button" class="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20" aria-label="Close details and history" @click.stop="closeVesselDetails">×</button>
        </div>
      </header>

      <div v-show="!vesselDetailsCollapsed" class="vessel-details-body min-h-0 overflow-auto p-4">
        <figure v-if="selectedVessel.photoUrl" class="m-0 mb-4 overflow-hidden rounded-xl border border-white/10">
          <img :src="selectedVessel.photoUrl" :alt="selectedVessel.photoAlt || selectedVessel.name" loading="lazy" decoding="async" width="800" height="450" class="aspect-video w-full object-cover" />
          <figcaption v-if="selectedVessel.photoSourceUrl" class="flex items-center justify-between gap-2 bg-white/5 px-3 py-2 text-[10px] text-slate-400">
            <span>{{ selectedVessel.photoCaption }}</span>
            <a :href="selectedVessel.photoSourceUrl" target="_blank" rel="noopener noreferrer" class="shrink-0 text-sky-300">Fotobron ↗</a>
          </figcaption>
        </figure>
        <section v-if="auth.user" class="mb-4 rounded-xl border border-sky-300/25 bg-sky-400/10 p-3">
          <button type="button" class="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-bold text-sky-200" :aria-expanded="vesselGroupPickerOpen" aria-controls="vessel-group-picker" @click="vesselGroupPickerOpen = !vesselGroupPickerOpen">
            <span>Add to groups<span v-if="selectedVesselGroups.length" class="mt-1 block text-xs font-normal text-slate-300">{{ selectedVesselGroups.map(group => group.name).join(', ') }}</span></span>
            <span aria-hidden="true">{{ vesselGroupPickerOpen ? '−' : '+' }}</span>
          </button>
          <div v-if="vesselGroupPickerOpen" id="vessel-group-picker" class="mt-2">
            <p class="m-0 mb-2 text-xs text-slate-300">Het vlootregister is voor alle rederijen. Beheerders bewaren rederijkoppelingen voor iedereen; eigen groepen blijven in deze browser.</p>
            <div class="max-h-44 overflow-auto">
              <label v-for="group in availableVesselGroups" :key="group.id" class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/10">
                <input type="checkbox" :checked="group.mmsis.includes(String(selectedVessel.mmsi))" :disabled="group.id.startsWith('operator:') && !isAdmin" @change="setSelectedVesselGroup(group.id, $event.target.checked)" />
                <span class="min-w-0 flex-1 break-words">{{ group.name }}</span>
                <span class="text-xs text-slate-400">{{ group.mmsis.length }}</span>
              </label>

            </div>
            <form class="mt-3 flex gap-2" @submit.prevent="createGroupWithSelectedVessel">
              <input v-model="vesselGroupDraftName" aria-label="New vessel group name" maxlength="40" placeholder="New group name" class="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950 px-2 py-2 text-sm" />
              <button type="submit" :disabled="!vesselGroupDraftName.trim()" class="min-h-11 rounded-lg bg-sky-500 px-3 text-xs font-bold text-white hover:bg-sky-400 disabled:opacity-40">Create &amp; add</button>
            </form>
            <p v-if="vesselGroupMessage" role="status" class="m-0 mt-2 text-xs text-sky-100">{{ vesselGroupMessage }}</p>
          </div>
        </section>
        <div class="grid grid-cols-3 gap-2">
          <div v-for="metric in vesselMetrics" :key="metric.label" class="rounded-xl bg-white/5 p-2.5">
            <span class="block text-[10px] uppercase tracking-wide text-slate-400">{{ metric.label }}</span>
            <strong class="mt-0.5 block text-base">{{ metric.value }}</strong>
          </div>
        </div>

        <a v-if="selectedVessel.mmsi" :href="`/vlootstatistieken?operator=${selectedVessel.operator?.id || 'unassigned'}&mmsi=${selectedVessel.mmsi}`" class="mt-4 block rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 py-3 text-center text-xs font-bold text-sky-200">Bekijk vaarstatistieken van deze boot ↗</a>
        <section v-for="section in vesselDetailSections" :key="section.title" class="mt-4">
          <h3 class="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{{ section.title }}</h3>
          <dl class="vessel-data-list mt-2">
            <div v-for="row in section.rows" :key="row.label"><dt>{{ row.label }}</dt><dd><span v-if="row.locked && auth.user">Alleen Flagship employees</span><button v-else-if="row.locked" type="button" class="font-semibold text-sky-300 hover:text-sky-200" @click="auth.requireLogin('Sign in to see drivers, shifts and locations.')">Sign in to see</button><template v-else>{{ row.value }}</template></dd></div>
          </dl>
        </section>

        <section v-if="selectedVessel.fleet?.notes" class="mt-4 rounded-xl border border-orange-300/15 bg-orange-400/10 p-3">
          <h3 class="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">Operational notes</h3>
          <p class="m-0 mt-1.5 text-xs leading-relaxed text-slate-200">{{ selectedVessel.fleet.notes }}</p>
        </section>

        <div class="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3">
          <code class="text-xs">{{ formatCoordinate(selectedVessel.latitude) }}, {{ formatCoordinate(selectedVessel.longitude) }}</code>
          <a class="text-xs font-semibold text-sky-300 hover:text-sky-200" :href="vesselMapsUrl" target="_blank" rel="noopener noreferrer">Maps ↗</a>
        </div>

        <button type="button" class="mt-3 w-full rounded-xl bg-orange-400/15 px-3 py-2 text-sm font-bold text-orange-100 hover:bg-orange-400/25" @click="useSelectedVesselAsRouteStartAndClose">
          Gebruik als startpunt route
        </button>

        <section class="mt-4">
          <div class="flex items-center justify-between">
            <h3 class="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Past route</h3>
            <span class="text-[10px] text-slate-400">{{ historyPointCount }} saved points</span>
          </div>
          <div class="mt-2 grid grid-cols-4 gap-1.5">
            <button
              v-for="hours in [1, 6, 24, 168]"
              :key="hours"
              type="button"
              class="rounded-lg border border-white/10 px-2 py-1.5 text-xs hover:bg-white/10"
              :class="historyHours === hours ? 'bg-sky-400/20 text-sky-200' : 'bg-white/5'"
              @click="showVesselHistory(hours)"
            >
              {{ hours === 168 ? '7 days' : `${hours}h` }}
            </button>
          </div>
          <p v-if="historyLoading" class="m-0 mt-2 text-xs text-sky-200">Loading route history…</p>
          <p v-else-if="historyError" class="m-0 mt-2 text-xs text-amber-300">{{ historyError }}</p>
          <p class="m-0 mt-1.5 text-[10px] text-slate-400">History is recorded by this server from the moment it is running.</p>
          <p v-if="historyOmittedCount" class="m-0 mt-1 text-[10px] text-amber-300">{{ historyOmittedCount }} unreliable segment{{ historyOmittedCount === 1 ? '' : 's' }} omitted.</p>
          <div class="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-300">
            <span class="flex items-center gap-1"><i class="h-2 w-2 rounded-full border-2 border-white bg-cyan-500"></i> Actual AIS report</span>
            <span class="flex items-center gap-1"><i class="h-1.5 w-5 rounded border border-slate-900 bg-yellow-300"></i> Reconstructed canal route</span>
            <span class="flex items-center gap-1"><i class="h-0 w-5 border-t-2 border-dashed border-red-500"></i> Direct fallback</span>
          </div>
        </section>


      </div>
    </aside></Teleport>

    <div v-if="reportingPassagePick" class="absolute bottom-24 left-1/2 z-[1800] hidden w-[min(32rem,90vw)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-sky-300/40 bg-slate-950/95 p-4 text-sm text-white shadow-xl sm:flex"><span class="flex-1">{{ routeLinkMapStatus }}</span><button type="button" class="rounded-lg bg-white/10 p-2" @click="cancelMobileMapInteraction">Annuleren</button></div>
    <div v-if="mobileMapInteractionActive" class="mobile-map-interaction-bar">
      <div class="min-w-0 flex-1"><strong class="block text-sm">{{ mobileMapInteractionTitle }}</strong><span class="block truncate text-xs text-slate-300">{{ mobileMapInteractionMessage }}</span></div>
      <button v-if="mobileMapInteractionCanFinish" type="button" class="mobile-map-interaction-done" @click="finishMobileMapInteraction">Done</button>
      <button type="button" class="mobile-map-interaction-cancel" @click="cancelMobileMapInteraction">Cancel</button>
    </div>
    <div class="mobile-location-control" :class="{ 'mobile-location-control--guest': !auth.user }">
      <button
        type="button"
        :class="isUserLocationActive ? 'mobile-location-control--active' : ''"
        :aria-label="locationButtonLabel"
        :title="locationButtonLabel"
        @pointerdown.stop
        @click.stop="activateUserLocation"
      >
        <Crosshair aria-hidden="true" />
      </button>
      <span v-if="userLocationError" role="status">{{ userLocationError }}</span>
    </div>
    <div ref="mapEl" class="map"></div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, inject, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { Crosshair, Layers3, Navigation, Search } from '@lucide/vue'
import L from 'leaflet'
import 'leaflet-polylinedecorator'
import {
  createMap,
  setBaseMapStyle,
  loadCanals,
  addCanals,
  addDock,
  buildCanalSearchIndex,
  findCanalResultByFeature,
  listCanals,
  searchCanals,
  focusCanalResult,
  clearCanalResultHighlight,
  showUserLocation,
} from '../scripts/leafletMap'
import { showLiveAisVessels } from '../scripts/aisVessels'
import { applyWaterwayEdits, waterwayKey } from '../../shared/waterway-edits.mjs'
import { withSupplementalWaterways } from '../scripts/supplementalWaterways.js'
import { canReadFlagshipPlanning, canUseOperations } from '../../shared/account-access.mjs'
import { reportingPointsAlongRoute } from '../../shared/reporting-route.mjs'
import { closureSnapshot } from '../../shared/closure-snapshot.mjs'
import { activeClosurePoints } from '../../shared/route-closures.mjs'
import { deriveReportingManeuver, nextReportingNumber, validateReportingRules } from '../../shared/reporting-movements.mjs'
import { boatPhoto } from '../../shared/boat-photos.mjs'
import { VESSEL_OPERATORS, groupVesselsByOperator } from '../../shared/vessel-operators.mjs'
import { exampleRouteFromSearch } from '../../shared/example-routes.mjs'
import automaticBridgeLinks from '../scripts/automaticBridgeLinks.json'
import { bridgeRouteCrossing } from '../scripts/bridgeRouteCrossing.js'
import { createBridgeLayer, loadAmsterdamBridges } from '../scripts/bridgeLayer'
import { applyBridgeClearances } from '../scripts/bridgeClearances.js'
import { bridgeNavigationWarning } from '../scripts/bridgeNavigationRules.js'
import { createNavigationLayer, createRestrictionLayer, loadNavigationLayer } from '../scripts/navigationLayers'
import { buildCanalRoutingNetwork, generateCanalLoopRoute, planCanalRouteVia } from '../scripts/canalRouting'
import FleetPanel from './FleetPanel.vue'
const AccountMenu = defineAsyncComponent(() => import('./AccountMenu.vue'))
import SiteNavigation from './SiteNavigation.vue'
import MobileMapSheet from './MobileMapSheet.vue'
import MapSettings from './MapSettings.vue'
import { defaultDataSaver, saveDataSaver, visibleInterval } from '../scripts/networkUsage.js'
import { createMobilePanelCoordinator, mobileViewportMetrics, mobileRoutePadding } from '../scripts/mobileMapLayout.js'
const BoatDutyPanel = defineAsyncComponent(() => import('./BoatDutyPanel.vue'))
const InventoryPanel = defineAsyncComponent(() => import('./InventoryPanel.vue'))
const PlanningPanel = defineAsyncComponent(() => import('./PlanningPanel.vue'))
import WaterLevelCard from './WaterLevelCard.vue'
import { PLANNING_LOCATION_PINS } from '../../shared/planning-locations.mjs'
import { translateValue } from '../i18n.js'

const auth = inject('auth')
const language = inject('language')
const canReadPlanning = computed(() => canReadFlagshipPlanning(auth.user))
const canUseStaffTools = computed(() => canUseOperations(auth.user))
const isAdmin = computed(() => auth.user?.role === 'admin')

const mapEl = ref(null)
const settingsOpen = ref(false)
const dataSaver = ref(defaultDataSaver(globalThis, auth.user?.id))
watch(dataSaver, enabled => { saveDataSaver(enabled, auth.user?.id); aisController?.setDataSaver(enabled) })
watch(() => auth.user?.id, userId => { dataSaver.value = defaultDataSaver(globalThis, userId) })
const searchInput = ref(null)
const mobileSearchInput = ref(null)
const searchQuery = ref('')
const isSearchOpen = ref(false)
const mobileSelectedPlace = ref(null)
const baseMapStyle = ref('street')
const canalsLayer = ref(null)
const canalSearchIndex = ref(null)
const selectedResult = ref(null)
const isUserLocationActive = ref(false)
const userLocationError = ref('')
const bridgeLayerVisible = ref(false)
const bridgeLayerLoading = ref(false)
const bridgeLayerError = ref('')
const bridgeCount = ref(0)
const bridgeSearchItems = ref([])
const bridgeClearanceStatus = ref('loading')
const bridgeSourceWarning = ref('')
let bridgeFeatures = []
const navigationLayersOpen = ref(false)
const activeNavigationLayers = ref(['closures'])
const loadingNavigationLayers = ref([])
const navigationLayerCounts = ref({})
const navigationLayerError = ref('')
const mapObjectEditor = ref(null)
const mapObjectPlacement = ref(false)
const mapObjectError = ref('')
const customRouteLines = ref(loadCustomRouteLines())
const customRouteDrawing = ref(false)
const customRouteDraft = ref([])
const customRouteLineName = ref('')
const customRouteLineType = ref('corridor')
const customRouteLineDirection = ref('both')
const customRouteLineSpeed = ref(12)
const customRouteLineZone3 = ref(true)
const customRouteStatus = ref('')
const customReportingPoints = ref(loadCustomReportingPoints())
const customReportingPlacement = ref(false)
const customReportingDraft = ref({ number: '', name: '', call: '', bearing: 0 })
const customReportingStatus = ref('')
const reportingRulesSaving = ref(false)
const reportingPassagePick = ref(null)
const reportingPreviewIndex = ref(null)
let reportingMovementPreview = null

const routePlannerOpen = ref(new URLSearchParams(window.location.search).get('planner') === '1')
const mobileRouteOptionsOpen = ref(false)
const mobileRouteHeightInput = ref(null)
const routeMode = ref(null)
const routePoints = ref([])
const routeResult = ref(null)
const routeMessage = ref('Klik op de kaart om een startpunt en eindpunt op het water te kiezen.')
const routeBridgeItems = ref([])
const routeBridgeLoading = ref(false)
const routeBridgeError = ref('')
const routeReportingItems = ref([])
const routeReportingLoading = ref(false)
const routeReportingError = ref('')
const routeLinkOverrides = ref(loadRouteLinkOverrides())
const routeLinkMapMode = ref(false)
const routeLinkMapStatus = ref('')
const routeLinkPendingItem = ref(null)
const selectedRouteLinkItem = ref(null)
const routeLinkChanges = ref([])
const routeExportLoading = ref(false)
const routeExportError = ref('')
const routeShareLoading = ref(false)
const routeShareMessage = ref('')
const routeShareUrl = ref('')
const routeAvoidVirtualEdges = ref(false)
const routeSpeedValue = ref(6)
const routeLoopMinutes = ref(60)
const routeAllowZone3 = ref(false)
const routeClosurePoints = ref([])
const routeClosureData = ref(null)
const routeClosureLoading = ref(false)
const routeClosureError = ref('')
let routeClosureLoad = null
const routeBoatProfile = ref({ heightMeters: null, widthMeters: null, lengthMeters: null, draftMeters: null })
const missingRouteHeight = computed(() => positiveNumberOrNull(routeBoatProfile.value.heightMeters) === null)
const routeAddressInputs = ref({ start: '', end: '' })
const routeAddressLoading = ref(null)
const routeSuggestions = ref({ start: [], end: [] })
const savedRoutes = ref(loadSavedRoutes())
const routeSaveName = ref('')
const mobileMapInteractionActive = computed(() => Boolean(
  reportingPassagePick.value || routeMode.value || mapObjectPlacement.value || customReportingPlacement.value
  || customRouteDrawing.value || routeLinkPendingItem.value?.networkPick || routeLinkMapMode.value,
))
const mobileMapInteractionCanFinish = computed(() => customRouteDrawing.value || routeLinkMapMode.value)
const mobileMapInteractionTitle = computed(() => {
  if (reportingPassagePick.value) return reportingPassagePick.value.side === 'from' ? 'Kies de aankomstkant' : 'Kies waar de boot naartoe vaart'
  if (routeMode.value === 'start') return 'Choose starting point'
  if (routeMode.value === 'end') return 'Choose destination'
  if (routeMode.value === 'waypoint') return 'Choose route point'
  if (mapObjectPlacement.value) return mapObjectEditor.value?.layer === 'reporting-points' ? 'Plaats het marifoonpunt' : 'Kies een positie op de kaart'
  if (customReportingPlacement.value) return 'Place reporting point'
  if (customRouteDrawing.value) return 'Draw sailing line'
  if (routeLinkMapMode.value || routeLinkPendingItem.value?.networkPick) return 'Choose sailing line'
  return 'Tap the map'
})
const mobileMapInteractionMessage = computed(() => {
  if (reportingPassagePick.value) return routeLinkMapStatus.value
  if (routeMode.value) return routeMessage.value
  if (mapObjectPlacement.value) return mapObjectEditor.value?.layer === 'reporting-points'
    ? 'Tik op de kruising of bocht waar de melding hoort.'
    : 'Tik op de gewenste positie op de kaart.'
  if (routeLinkPendingItem.value?.networkPick || routeLinkMapMode.value) return routeLinkMapStatus.value
  if (customReportingPlacement.value) return customReportingStatus.value
  if (customRouteDrawing.value) return customRouteStatus.value
  return 'Tap the desired position on the map.'
})
const aisStatus = ref('connecting')
const aisStatusMessage = ref('Connecting to the local AIS gateway…')
const aisConfigured = ref(true)
const aisVesselCount = ref(0)
const aisRecentVesselCount = ref(0)
const aisDelayedVesselCount = ref(0)
const liveVessels = ref([])
const vesselGroups = ref(loadVesselGroups())
const activeVesselFilters = ref(['all'])
const operatorAssignments = ref({})
const operatorSourceVessels = ref([])
const operatorGroups = computed(() => groupVesselsByOperator([...operatorSourceVessels.value, ...companyFleetBoats.value.map((boat) => boat.ais).filter(Boolean), ...liveVessels.value], operatorAssignments.value).map((group) => ({ ...group, operatorId: group.id, id: `operator:${group.id}` })))
const companyBaseMmsis = ref([])
const builtInGroupOverrides = ref(loadBuiltInGroupOverrides())
const companyMmsis = computed(() => companyBaseMmsis.value)
const companyFleetBoats = ref([])
const todayPlanningItems = ref([])
const ntMmsis = computed(() => effectiveGroupMmsis('nt', ['244035980', '244146144', '244750576', '244374235']))
const policeMmsis = computed(() => effectiveGroupMmsis('police', ['244615809', '244129388', '244034521', '244044753']))
const editingGroupId = ref(null)
const isGroupsOpen = ref(false)
const newGroupName = ref('')
const manualMmsi = ref('')
const vesselFilterQuery = ref('')
const selectedVessel = ref(null)
const vesselGroupPickerOpen = ref(false)
const vesselGroupDraftName = ref('')
const vesselGroupMessage = ref('')
const availableVesselGroups = computed(() => [
  { id: 'nt', name: 'Nautical supervision / NT', mmsis: ntMmsis.value },
  { id: 'police', name: 'Police vessels', mmsis: policeMmsis.value },
  ...operatorGroups.value,
  ...vesselGroups.value,
])
const selectedVesselGroups = computed(() => availableVesselGroups.value.filter(group => group.mmsis.includes(String(selectedVessel.value?.mmsi))))

watch(() => selectedVessel.value?.mmsi, () => {
  vesselGroupPickerOpen.value = false
  vesselGroupDraftName.value = ''
  vesselGroupMessage.value = ''
})
const vesselDetailsCollapsed = ref(false)
const isMobileViewport = ref(window.matchMedia('(max-width: 639px)').matches)
const activeMobilePanel = ref(null)
const mobileSheet = ref(null)
const mobileSheetExpanded = ref(false)
const mobileViewport = ref(mobileViewportMetrics({ width: window.innerWidth, height: window.innerHeight }))
const mobileSheetOpen = computed(() => isMobileViewport.value && ['search', 'route', 'layers', 'ais', 'vessel'].includes(activeMobilePanel.value) && !mobileMapInteractionActive.value)
const mobileSheetTitle = computed(() => ({ search: 'Zoeken', route: 'Route plannen', layers: 'Kaartlagen', ais: 'AIS en groepen', vessel: selectedVessel.value?.name || 'Bootdetails' })[activeMobilePanel.value] || '')
const mobileViewportStyle = computed(() => ({
  '--mobile-visible-height': `${mobileViewport.value.height}px`,
  '--mobile-viewport-top': `${mobileViewport.value.top}px`,
  '--mobile-viewport-bottom': `${mobileViewport.value.bottom}px`,
  '--mobile-bottom-space': mobileViewport.value.keyboardOpen ? '0px' : 'calc(var(--mobile-nav-height, 4.6rem) + env(safe-area-inset-bottom, 0px) + 8px)',
}))
const mobilePanelCoordinator = createMobilePanelCoordinator(() => isMobileViewport.value, key => { activeMobilePanel.value = key; mobileSheetExpanded.value = false })
provide('mobilePanelCoordinator', mobilePanelCoordinator)
for (const [key, state] of [['search', isSearchOpen], ['route', routePlannerOpen], ['layers', navigationLayersOpen], ['ais', isGroupsOpen]]) {
  mobilePanelCoordinator.register(key, () => {
    state.value = false
    if (key === 'route') routeMode.value = null
    if (key === 'search') mobileSearchInput.value?.blur()
  })
  watch(state, value => value ? mobilePanelCoordinator.claim(key) : mobilePanelCoordinator.release(key), { flush: 'sync' })
}
mobilePanelCoordinator.register('vessel', () => {})
watch(() => selectedVessel.value?.mmsi, value => value ? mobilePanelCoordinator.claim('vessel') : mobilePanelCoordinator.release('vessel'), { flush: 'sync' })
function closeMobileSheet() {
  if (activeMobilePanel.value === 'vessel') closeVesselDetails()
  else mobilePanelCoordinator.close()
  document.activeElement?.blur?.()
}
let mobileRouteFitUntil = 0
onMounted(() => {
  const media = window.matchMedia('(max-width: 639px)')
  let baselineHeight = window.innerHeight
  let frame = 0
  function updateViewport() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const viewport = window.visualViewport
      const editing = Boolean(document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]'))
      if (!editing) baselineHeight = window.innerHeight
      mobileViewport.value = mobileViewportMetrics({ width: window.innerWidth, height: window.innerHeight, visibleHeight: viewport?.height, visibleWidth: viewport?.width, offsetTop: viewport?.offsetTop, offsetLeft: viewport?.offsetLeft, baselineHeight, editing })
      if (Date.now() < mobileRouteFitUntil) nextTick(fitRouteInVisibleMap)
    })
  }
  function updateBreakpoint() {
    isMobileViewport.value = media.matches
    if (media.matches) {
      vesselDetailsCollapsed.value = false
      const key = isSearchOpen.value ? 'search' : routePlannerOpen.value ? 'route' : navigationLayersOpen.value ? 'layers' : isGroupsOpen.value ? 'ais' : selectedVessel.value ? 'vessel' : null
      if (key) mobilePanelCoordinator.claim(key)
    }
    updateViewport()
  }
  media.addEventListener('change', updateBreakpoint)
  window.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
  document.addEventListener('focusin', updateViewport)
  document.addEventListener('focusout', updateViewport)
  updateBreakpoint()
  mobileViewportCleanup = () => {
    cancelAnimationFrame(frame)
    media.removeEventListener('change', updateBreakpoint)
    window.removeEventListener('resize', updateViewport)
    window.visualViewport?.removeEventListener('resize', updateViewport)
    window.visualViewport?.removeEventListener('scroll', updateViewport)
    document.removeEventListener('focusin', updateViewport)
    document.removeEventListener('focusout', updateViewport)
  }
})
let mobileViewportCleanup = () => {}
onUnmounted(() => mobileViewportCleanup())

const routeStartVessel = ref(null)
const latestUserLocation = ref(null)
let useNextLocationAsRouteStart = false
const historyHours = ref(1)
const historyPointCount = ref(0)
const historyOmittedCount = ref(0)
const historyLoading = ref(false)
const historyError = ref('')
let map = null
let userLocationController = null
let userLocationErrorTimer = null
let aisController = null
let planningRefreshTimer = null
let routeClosureRefreshTimer = null
let placementPointerStart = null
let lastPointerPlacementAt = 0
let bridgeLayerController = null
let canalsGeoJson = null
let originalCanalsGeoJson = null
let waterwayEditsJson = ''
const waterwayLoadError = ref('')
let waterwayEditMarkers = null
let waterwayEditPreview = null
let canalRouteNetwork = null
let customRouteLayer = null
let customRouteDraftLayer = null
let selectedRouteLinkLayer = null
let customReportingLayer = null
let routeLayer = null
let routeLinkLayer = null
let routeLinkDragMarker = null
let routeMarkers = []
let routeBridgeRequestId = 0
let routeReportingRequestId = 0
const routeSuggestionTimers = new Map()
const navigationLayerControllers = new Map()
const navigationFilters = [
  { id: 'bridges', name: 'Brugmaten, bediening en contact', color: '#0ea5e9' },
  { id: 'bridge-openings', name: 'Geplande brugopeningen', color: '#ef4444' },
  { id: 'closures', name: 'Live hinderingen en stremmingen', color: '#f43f5e' },
  { id: 'water-levels', name: 'Actuele waterstanden', color: '#2563eb' },
  { id: 'locks', name: 'Sluizen en bediening', color: '#8b5cf6' },
  { id: 'moorings', name: 'Aanlegplaatsen en ligplaatsen', color: '#10b981' },
  { id: 'markers', name: 'Verkeersborden, boeien en markeringen', color: '#06b6d4' },
  { id: 'reporting-points', name: 'Marifoonmeldpunten', color: '#e11d48' },
  { id: 'restrictions', name: 'Snelheid en vaarbeperkingen', color: '#f97316' },
]

const closureSummary = computed(() => {
  const now = Date.now()
  const unique = new Map()
  for (const feature of routeClosureData.value?.features || []) {
    const properties = feature.properties || {}
    const key = `${properties.noticeNumber || feature.id}:${properties.name}:${properties.limitationCode}`
    const active = (!properties.start || Date.parse(properties.start) <= now) && (!properties.end || Date.parse(properties.end) > now)
    const current = unique.get(key)
    if (!current || active) unique.set(key, { ...properties, active })
  }
  const items = [...unique.values()]
  const fetchedAt = routeClosureData.value?.fetchedAt
  return {
    total: items.length,
    active: items.filter(item => item.active).length,
    upcoming: items.filter(item => !item.active).length,
    blocked: items.filter(item => item.active && item.blocksRouting).length,
    updated: fetchedAt && Number.isFinite(Date.parse(fetchedAt))
      ? `bijgewerkt ${new Date(fetchedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
      : '',
  }
})

const aisStatusDotClass = computed(() => ({
  'bg-emerald-400 shadow-[0_0_10px_rgb(52_211_153/0.8)]': aisStatus.value === 'live',
  'bg-amber-400': ['connecting', 'reconnecting', 'degraded'].includes(aisStatus.value),
  'bg-red-400': ['error', 'disconnected', 'offline'].includes(aisStatus.value),
}))

const activeGroup = computed(() => {
  return vesselGroups.value.find((group) => group.id === editingGroupId.value) || null
})
const activeGroupLabel = computed(() => {
  if (activeVesselFilters.value.includes('all')) return 'All vessels'
  const count = activeVesselFilters.value.length
  if (count === 1) {
    const operator = operatorGroups.value.find((group) => group.id === activeVesselFilters.value[0])
    if (operator) return operator.name
  }
  return `${count} group${count === 1 ? '' : 's'}`
})

const selectedRouteLinkHasOverride = computed(() => {
  const item = selectedRouteLinkItem.value
  const override = item && routeLinkOverride(item.kind, item.id)
  return Boolean(bridgeNetworkPositions(override).length)
})
const selectedBridgeNetworkPositions = computed(() => bridgeNetworkPositions(routeLinkOverride('bridge', selectedRouteLinkItem.value?.id)))

const builtInVesselFilters = computed(() => [
  { id: 'nt', name: 'Nautical supervision / NT', count: ntMmsis.value.length, color: 'bg-purple-500' },
  { id: 'police', name: 'Police vessels', count: policeMmsis.value.length, color: 'bg-blue-500' },
  ...operatorGroups.value.map((group) => ({ id: group.id, name: group.name, count: group.mmsis.length, hexColor: group.color })),
])
const filteredLiveVessels = computed(() => {
  const query = vesselFilterQuery.value.trim().toLowerCase()
  if (!query) return liveVessels.value
  return liveVessels.value.filter((vessel) =>
    `${vessel.name || ''} ${vessel.mmsi} ${operatorGroups.value.find((group) => group.mmsis.includes(String(vessel.mmsi)))?.name || ''}`.toLowerCase().includes(query),
  )
})
const offlineGroupMmsis = computed(() => {
  if (!activeGroup.value) return []
  const liveMmsis = new Set(liveVessels.value.map((vessel) => vessel.mmsi))
  return activeGroup.value.mmsis.filter((mmsi) => !liveMmsis.has(mmsi))
})
const routeSpeedKmh = computed(() => {
  const value = Number(routeSpeedValue.value)
  return Number.isFinite(value) && value > 0 ? value : 6
})
const vesselMapsUrl = computed(() => {
  if (!selectedVessel.value) return '#'
  return `https://www.google.com/maps/search/?api=1&query=${selectedVessel.value.latitude},${selectedVessel.value.longitude}`
})
const routeStartVesselLabel = computed(() => {
  const vessel = routeStartVessel.value
  if (!vessel) return ''
  return vessel.fleet?.name || vessel.name || vessel.mmsi || 'AIS boot'
})
const vesselMetrics = computed(() => {
  const vessel = selectedVessel.value
  if (!vessel) return []
  return [
    { label: 'Speed', value: Number.isFinite(vessel.speed) ? `${(vessel.speed * 1.852).toFixed(1)} km/u` : '—' },
    { label: 'Course', value: formatDegrees(vessel.course) },
    { label: 'Heading', value: formatDegrees(vessel.heading) },
  ]
})
const vesselDetailSections = computed(() => {
  const vessel = selectedVessel.value
  if (!vessel) return []
  const sections = [
    {
      title: 'Voyage',
      rows: [
        { label: 'Status', value: navigationStatusLabel(vessel.navigationStatus) },
        { label: 'Destination', value: vessel.destination || 'Not transmitted' },
        { label: 'Last signal', value: formatSignalTime(vessel.sourceReceivedAt || vessel.receivedAt) },
        { label: 'Source latency', value: Number.isFinite(Number(vessel.latencyMs)) ? `${(Number(vessel.latencyMs) / 1000).toFixed(1)} s` : 'Unknown' },
        { label: 'AIS message', value: vessel.messageType || 'Unknown' },
      ],
    },
    {
      title: 'Vessel',
      rows: [
        { label: 'Call sign', value: vessel.callSign || 'Unknown' },
        { label: 'IMO', value: vessel.imo || 'Not available' },
        { label: 'Dimensions', value: formatDimensions(vessel) },
        { label: 'Draught', value: vessel.draught ? `${vessel.draught} m` : 'Unknown' },
      ],
    },
  ]

  if (vessel.fleet) {
    sections.unshift({
      title: 'Bootgegevens',
      rows: [
        { label: 'Boat type', value: vessel.fleet.boat_type || (vessel.fleet.open_boat ? 'Open boat' : 'Covered boat') },
        { label: 'Required licence', value: vessel.fleet.license_required || 'Not specified' },
        { label: 'Open boat', value: vessel.fleet.open_boat ? 'Yes' : 'No' },
        { label: 'Toilet', value: vessel.fleet.has_toilet ? 'Yes' : 'No' },
        { label: 'Niceness rating', value: vessel.fleet.niceness_rating || 'Not rated' },
        { label: 'Dimensions', value: formatFleetDimensions(vessel.fleet) },
        { label: 'Capacity', value: vessel.fleet.capacity ? `${vessel.fleet.capacity} passengers` : 'Unknown' },
        { label: 'Propulsion', value: vessel.fleet.propulsion || 'Unknown' },
        { label: 'Home dock', value: vessel.fleet.home_dock || 'Not set' },
        { label: 'Registration', value: vessel.fleet.registration || 'Not set' },
      ],
    })
    if (canReadPlanning.value) {
      const planning = planningForVessel(vessel)
      const drivers = uniquePeople(planning, ['driver', 'skipper'])
      const hosts = uniquePeople(planning, ['host'])
      const shifts = planning.filter((item) => item.event_type === 'shift' && item.start_time)
        .map((item) => `${item.start_time}${item.end_time ? `–${item.end_time}` : ''}`)
      const locations = [...new Set(planning.flatMap((item) => [item.group_location, item.from_location, item.to_location]).filter(Boolean))]
      sections.unshift({
        title: "Today's schedule",
        rows: [
          { label: 'Driver', value: drivers.length ? drivers.join(', ') : 'Not scheduled / not recognized' },
          { label: 'Host', value: hosts.length ? hosts.join(', ') : 'Not scheduled' },
          { label: 'Shift', value: shifts.length ? [...new Set(shifts)].join(', ') : 'No shift time' },
          { label: 'Location', value: locations.length ? locations.join(' → ') : 'Not specified' },
        ],
      })
    } else {
      sections.unshift({
        title: "Today's schedule",
        rows: [
          { label: 'Driver', locked: true },
          { label: 'Shift', locked: true },
          { label: 'Location', locked: true },
        ],
      })
    }
  }

  return sections
})

const searchResults = computed(() => {
  const query = searchQuery.value.trim()

  if (!canalSearchIndex.value) {
    return []
  }

  if (!query) {
    return [...locationSearchResults('aanlegsteiger', 20), ...listCanals(canalSearchIndex.value)]
  }

  const normalizedQuery = query.toLowerCase()
  const vesselResults = liveVessels.value
    .filter((vessel) => `${vessel.name || ''} ${vessel.mmsi} ${operatorGroups.value.find((group) => group.mmsis.includes(String(vessel.mmsi)))?.name || ''}`.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      const aExact = a.mmsi === query || a.name?.toLowerCase() === normalizedQuery
      const bExact = b.mmsi === query || b.name?.toLowerCase() === normalizedQuery
      return Number(bExact) - Number(aExact) || (a.name || a.mmsi).localeCompare(b.name || b.mmsi)
    })
    .slice(0, 20)
    .map((vessel) => ({
      kind: 'vessel',
      groupKey: `vessel:${vessel.mmsi}`,
      name: vessel.name,
      mmsi: vessel.mmsi,
      receivedAt: vessel.receivedAt,
    }))

  const bridgeResults = bridgeSearchItems.value
    .filter((bridge) => `${bridge.name} ${bridge.number || ''} brug`.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      const aExact = a.name.toLowerCase() === normalizedQuery || String(a.number || '').toLowerCase() === normalizedQuery
      const bExact = b.name.toLowerCase() === normalizedQuery || String(b.number || '').toLowerCase() === normalizedQuery
      return Number(bExact) - Number(aExact) || a.name.localeCompare(b.name, 'nl')
    })
    .slice(0, 20)

  return [...locationSearchResults(query, 12), ...bridgeResults, ...vesselResults, ...searchCanals(canalSearchIndex.value, query)]
})

const locationButtonLabel = computed(() => {
  if (isUserLocationActive.value) {
    return 'Go to my current location'
  }

  return 'Find my current location'
})

const canSaveCurrentRoute = computed(() => (
  ['ok', 'partial'].includes(routeResult.value?.status) &&
  Array.isArray(routeResult.value?.coordinates) &&
  routeResult.value.coordinates.length >= 2 &&
  routePoints.value.length >= 1
))

function clearSearch() {
  clearSelectedResult()
  searchQuery.value = ''
  mobileSelectedPlace.value = null
}

function loadVesselGroups() {
  if (!auth.user) return []
  try {
    const groups = JSON.parse(localStorage.getItem('ais-vessel-groups') || '[]')
    return Array.isArray(groups) ? groups : []
  } catch {
    return []
  }
}

function saveVesselGroups() {
  localStorage.setItem('ais-vessel-groups', JSON.stringify(vesselGroups.value))
}

function loadSavedRoutes() {
  if (!auth.user) return []
  try {
    const routes = JSON.parse(localStorage.getItem('saved-planned-routes-v1') || '[]')
    return Array.isArray(routes)
      ? routes.filter((route) => route?.id && Array.isArray(route.points)).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
      : []
  } catch {
    return []
  }
}

function saveSavedRoutes() {
  try {
    localStorage.setItem('saved-planned-routes-v1', JSON.stringify(savedRoutes.value))
    return true
  } catch {
    routeMessage.value = 'Route opslaan faalde: browseropslag is niet beschikbaar of vol.'
    return false
  }
}

function saveCurrentRoute() {
  if (!auth.requireLogin()) return
  if (!canSaveCurrentRoute.value) {
    routeMessage.value = 'Plan of genereer eerst een route voordat je hem bewaart.'
    return
  }
  const now = new Date().toISOString()
  const name = routeSaveName.value.trim() || defaultSavedRouteName()
  const route = {
    id: createLocalId(),
    name,
    savedAt: now,
    routeType: routeResult.value.routeType || 'manual',
    points: routePoints.value.map((point) => ({
      id: createLocalId(),
      role: point.role,
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      name: point.name || null,
    })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
    result: savedRouteResultSnapshot(routeResult.value),
    settings: {
      speedValue: routeSpeedValue.value,
      speedUnit: 'kmh',
      loopMinutes: routeLoopMinutes.value,
      allowZone3: routeAllowZone3.value,
      avoidVirtualEdges: routeAvoidVirtualEdges.value,
      boatProfile: { ...routeBoatProfile.value },
      addressInputs: { ...routeAddressInputs.value },
    },
  }
  savedRoutes.value = [route, ...savedRoutes.value.filter((candidate) => candidate.name !== name)].slice(0, 30)
  if (!saveSavedRoutes()) return
  routeSaveName.value = ''
  routeMessage.value = `Route "${name}" opgeslagen.`
}

function loadSavedRoute(route) {
  if (!route?.points?.length && !route?.result?.coordinates?.length) return
  const settings = route.settings || {}
  const savedSpeed = Number(settings.speedValue)
  routeSpeedValue.value = Number.isFinite(savedSpeed) && savedSpeed > 0
    ? (settings.speedUnit === 'knots' ? Number((savedSpeed * 1.852).toFixed(1)) : savedSpeed)
    : routeSpeedValue.value
  routeLoopMinutes.value = Number(settings.loopMinutes) || routeLoopMinutes.value
  routeAllowZone3.value = Boolean(settings.allowZone3)
  routeAvoidVirtualEdges.value = Boolean(settings.avoidVirtualEdges)
  routeBoatProfile.value = { ...routeBoatProfile.value, ...(settings.boatProfile || {}) }
  routeAddressInputs.value = { start: '', end: '', ...(settings.addressInputs || {}) }
  routePoints.value = route.points.map((point) => ({
    id: createLocalId(),
    role: point.role || 'waypoint',
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    name: point.name || null,
  })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
  routePlannerOpen.value = true
  routeMode.value = null
  routeSaveName.value = route.name || ''
  const savedResult = restoreSavedRouteResult(route.result)
  if (routeHasBoatDimensions() && canalRouteNetwork) {
    if (routePoints.value.length >= 2) updatePlannedRoute()
    else generateRandomLoopRoute()
    if (bridgeClearanceStatus.value === 'ready') routeMessage.value = 'Opgeslagen route opnieuw berekend met de ingestelde bootmaten.'
  } else if (savedResult) {
    routeResult.value = savedResult
    updateRouteBridgeItems(savedResult)
    updateRouteReportingItems(savedResult)
    drawRouteMarkers()
    drawPlannedRoute(savedResult)
    routeMessage.value = `Route "${route.name || 'opgeslagen route'}" geladen.`
  } else {
    updatePlannedRoute()
    routeMessage.value = `Route "${route.name || 'opgeslagen route'}" geladen.`
  }
  fitPlannedRoute()
}

function deleteSavedRoute(id) {
  if (!auth.requireLogin()) return
  savedRoutes.value = savedRoutes.value.filter((route) => route.id !== id)
  saveSavedRoutes()
}

function defaultSavedRouteName() {
  if (routeResult.value?.routeType === 'loop') return `Rondje ${new Date().toLocaleString('nl-NL').slice(0, 16)}`
  const start = routePointLabel(routePoints.value[0])
  const end = routePointLabel(routePoints.value[routePoints.value.length - 1])
  return `${start} naar ${end}`.slice(0, 80)
}

function savedRouteResultSnapshot(result) {
  if (!result?.coordinates?.length) return null
  return {
    status: result.status,
    routeType: result.routeType || null,
    message: result.message || '',
    coordinates: result.coordinates.map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])]).filter((coordinate) => coordinate.every(Number.isFinite)),
    distanceMeters: Number(result.distanceMeters) || 0,
    baseDurationMinutes: Number(result.baseDurationMinutes) || null,
    durationMinutes: Number(result.durationMinutes) || null,
    speedKmh: Number(result.speedKmh) || (Number(result.speedKnots) ? Number(result.speedKnots) * 1.852 : routeSpeedKmh.value),
    targetDurationMinutes: Number(result.targetDurationMinutes) || null,
    steps: Array.isArray(result.steps) ? result.steps.map((step) => ({ name: step.name || '', distanceMeters: Number(step.distanceMeters) || 0 })) : [],
    segments: Array.isArray(result.segments) ? result.segments.map(savedRouteSegmentSnapshot).filter(Boolean) : [],
    snapped: Array.isArray(result.snapped) ? result.snapped : [],
    from: result.from || null,
    to: result.to || null,
    virtualSegmentCount: Number(result.virtualSegmentCount) || 0,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    partialRoute: result.partialRoute || null,
  }
}

function savedRouteSegmentSnapshot(segment) {
  const start = { latitude: Number(segment?.start?.latitude), longitude: Number(segment?.start?.longitude) }
  const end = { latitude: Number(segment?.end?.latitude), longitude: Number(segment?.end?.longitude) }
  if (!Number.isFinite(start.latitude) || !Number.isFinite(start.longitude) || !Number.isFinite(end.latitude) || !Number.isFinite(end.longitude)) return null
  return {
    name: segment.name || '',
    distanceMeters: Number(segment.distanceMeters) || 0,
    startMeters: Number(segment.startMeters) || 0,
    endMeters: Number(segment.endMeters) || 0,
    start,
    end,
  }
}

function restoreSavedRouteResult(snapshot) {
  if (!snapshot?.coordinates?.length) return null
  const coordinates = snapshot.coordinates
    .map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])])
    .filter((coordinate) => coordinate.every(Number.isFinite))
  if (coordinates.length < 2) return null
  return {
    ...snapshot,
    status: ['ok', 'partial'].includes(snapshot.status) ? snapshot.status : 'ok',
    coordinates,
    speedKmh: Number(snapshot.speedKmh) || (Number(snapshot.speedKnots) ? Number(snapshot.speedKnots) * 1.852 : 6),
    speedKnots: undefined,
    steps: Array.isArray(snapshot.steps) ? snapshot.steps : [],
    segments: Array.isArray(snapshot.segments) ? snapshot.segments : [],
    warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings : [],
  }
}

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function loadRouteLinkOverrides() {
  const defaults = () => ({ bridges: structuredClone(automaticBridgeLinks), reporting: {} })
  try {
    const overrides = JSON.parse(localStorage.getItem('route-link-overrides-v1') || '{}')
    return {
      bridges: { ...structuredClone(automaticBridgeLinks), ...(overrides?.bridges && typeof overrides.bridges === 'object' ? overrides.bridges : {}) },
      reporting: overrides?.reporting && typeof overrides.reporting === 'object' ? overrides.reporting : {},
    }
  } catch {
    return defaults()
  }
}

let routeLinkSaveQueue = Promise.resolve()

function persistRouteLink(kind, id, value) {
  const snapshot = JSON.parse(JSON.stringify(value))
  routeLinkSaveQueue = routeLinkSaveQueue.then(async () => {
    const response = await fetch('/api/map/route-links', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: routeLinkBucket(kind), id, value: snapshot }),
    })
    if (!response.ok) throw new Error('Opslaan op de server mislukt. De wijziging staat alleen in deze browser; probeer opnieuw.')
  }).catch((error) => { routeLinkMapStatus.value = error.message })
}

async function loadSharedRouteLinks() {
  try {
    await routeLinkSaveQueue
    const response = await fetch('/api/map/route-links')
    if (!response.ok) throw new Error('Brugkoppelingen konden niet van de server worden geladen.')
    const shared = await response.json()
    const local = loadRouteLinkOverrides()
    // Preserve older browser edits; only migrate entries absent from the server.
    if (isAdmin.value) {
      for (const bucket of ['bridges', 'reporting']) {
        for (const [id, value] of Object.entries(local[bucket])) {
          if (!Object.hasOwn(shared[bucket] || {}, id)
            && JSON.stringify(value) !== JSON.stringify(bucket === 'bridges' ? automaticBridgeLinks[id] : undefined)) {
            persistRouteLink(bucket === 'bridges' ? 'bridge' : 'reporting', id, value)
          }
        }
      }
    }
    routeLinkOverrides.value = {
      bridges: { ...local.bridges, ...shared.bridges },
      reporting: { ...local.reporting, ...shared.reporting },
    }
    saveRouteLinkOverrides()
    rebuildCanalRouteNetwork()
    refreshRouteLinkedItems()
  } catch (error) { routeLinkMapStatus.value = error.message }
}

function saveRouteLinkOverrides() {
  bridgeLayerController?.refreshLinkStyles()
  localStorage.setItem('route-link-overrides-v1', JSON.stringify(routeLinkOverrides.value))
  drawCustomRouteLines()
}

function routeLinkBucket(kind) {
  return kind === 'reporting' ? 'reporting' : 'bridges'
}

function routeLinkOverride(kind, id) {
  const key = normalizeRouteLinkId(id)
  return key ? routeLinkOverrides.value[routeLinkBucket(kind)]?.[key] || null : null
}

function routeLinkPositionOverride(kind, item) {
  const override = routeLinkOverride(kind, item?.number || item?.id || item?.name || item?.call)
  const latitude = Number(override?.latitude)
  const longitude = Number(override?.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
}

function saveRouteLinkPosition(kind, item, latlng) {
  const id = normalizeRouteLinkId(item?.number || item?.id || item?.name || item?.call)
  const latitude = Number(latlng?.lat ?? latlng?.latitude)
  const longitude = Number(latlng?.lng ?? latlng?.longitude)
  if (!id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return
  saveRouteLinkPatch(kind, id, { latitude, longitude })
  routePlannerOpen.value = true
  routeLinkMapStatus.value = `${kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${id} verplaatst. Deze positie wordt nu overal gebruikt.`
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
}

function refreshRouteLinkedItems() {
  if (!routeResult.value) return
  updateRouteBridgeItems(routeResult.value)
  updateRouteReportingItems(routeResult.value)
}

function toggleRouteLinkMapMode() {
  if (!['ok', 'partial'].includes(routeResult.value?.status)) return
  routeLinkMapMode.value = !routeLinkMapMode.value
  routeLinkMapStatus.value = routeLinkMapMode.value
    ? 'Sleep een marker naar de routelijn om de koppeling op te slaan.'
    : ''
  refreshRouteLinkMapLayer()
}

function refreshRouteLinkMapLayer() {
  clearRouteLinkMapLayer()
  if (routeLinkMapMode.value) drawRouteLinkMapLayer()
}

function clearRouteLinkMapLayer() {
  if (routeLinkLayer) routeLinkLayer.remove()
  routeLinkLayer = null
}

function drawRouteLinkMapLayer() {
  if (!map || !['ok', 'partial'].includes(routeResult.value?.status) || !routeResult.value?.coordinates?.length) return
  const layers = [
    ...routeBridgeItems.value.map((item) => createRouteLinkMapMarker('bridge', item)).filter(Boolean),
    ...routeReportingItems.value.map((item) => createRouteLinkMapMarker('reporting', item)).filter(Boolean),
  ]
  routeLinkLayer = L.layerGroup(layers).addTo(map)
  routeLinkLayer.eachLayer((layer) => layer.bringToFront?.())
}

function createRouteLinkMapMarker(kind, item) {
  const point = routeLinkItemPoint(kind, item)
  const routePosition = projectPointOnRoute(point, routeResult.value?.coordinates || [])
  if (!point || !routePosition) return null
  const routeName = routeStepNameAtMeters(routeResult.value, routePosition.routeMeters)
  const id = normalizeRouteLinkId(item.number || item.id || item.name || item.call)
  const linkedNames = routeLinkDisplayNames(kind, item)
  const linkedSegments = routeLinkDisplaySegments(kind, item)
  const color = kind === 'bridge' ? (linkedNames || linkedSegments ? '#f59e0b' : '#ef4444') : '#e11d48'
  const prefix = kind === 'bridge' ? 'B' : 'M'
  const label = `${prefix}${id ? ` ${id}` : ''}`
  const marker = L.marker([routePosition.point.latitude, routePosition.point.longitude], {
    draggable: true,
    zIndexOffset: 1400,
    icon: L.divIcon({
      className: '',
      html: `<div style="display:flex;align-items:center;justify-content:center;min-width:32px;height:28px;padding:0 7px;border-radius:999px;background:${color};border:3px solid white;color:white;font-size:11px;font-weight:900;box-shadow:0 10px 24px rgb(0 0 0 / .38);white-space:nowrap">${escapeHtml(label)}</div>`,
      iconSize: [42, 28],
      iconAnchor: [21, 14],
    }),
  })
  marker.bindTooltip(escapeHtml(`${label} · ${linkedSegments || linkedNames || 'niet gekoppeld'}${routeName ? ` · dichtstbij: ${routeName}` : ''}`), { direction: 'top', offset: [0, -14] })
  marker.bindPopup(routeLinkMarkerPopupHtml(kind, item, linkedNames, routeName, linkedSegments))
  marker.on('dragend', (event) => saveDraggedRouteLink(kind, item, event.target.getLatLng()))
  const connector = L.polyline([[point.latitude, point.longitude], [routePosition.point.latitude, routePosition.point.longitude]], {
    pane: 'navigation-pane',
    color,
    weight: 3,
    opacity: 0.75,
    dashArray: '5 5',
  })
  return L.layerGroup([connector, marker])
}

function routeLinkItemPoint(kind, item) {
  if (kind === 'reporting' && Number.isFinite(Number(item.sourceLatitude)) && Number.isFinite(Number(item.sourceLongitude))) {
    return { latitude: Number(item.sourceLatitude), longitude: Number(item.sourceLongitude) }
  }
  if (Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))) {
    return { latitude: Number(item.latitude), longitude: Number(item.longitude) }
  }
  return null
}

function routeLinkDisplayNames(kind, item) {
  const id = normalizeRouteLinkId(item.number || item.id || item.name || item.call)
  const override = routeLinkOverride(kind, id)
  const overrideNames = routeLinkNamesFromOverride(override)
  const itemNames = Array.isArray(item.routeNames) ? item.routeNames : parseRouteNames(item.routeNames)
  const names = overrideNames.length ? overrideNames : itemNames.length ? itemNames : (item.route ? [item.route] : [])
  return names.filter(Boolean).join(', ')
}

function routeLinkDisplaySegments(kind, item) {
  const id = normalizeRouteLinkId(item.number || item.id || item.name || item.call)
  const override = routeLinkOverride(kind, id)
  const networkNames = [...new Set(bridgeNetworkPositions(override).map((position) => position.lineName).filter(Boolean))]
  if (networkNames.length) return networkNames.join(', ')
  const segments = override?.routeSegments
  const labels = Array.isArray(segments)
    ? segments.map((segment) => segment?.name || segment?.label).filter(Boolean)
    : []
  return labels.join(', ')
}

function routeLinkNamesFromOverride(override) {
  const networkNames = [...new Set(bridgeNetworkPositions(override).map((position) => position.lineName).filter(Boolean))]
  if (networkNames.length) return networkNames
  if (Array.isArray(override?.routeNames)) return override.routeNames.filter(Boolean)
  if (typeof override?.routeNames === 'string') return parseRouteNames(override.routeNames)
  return []
}

function bridgeNetworkPositions(override) {
  if (Array.isArray(override?.networkPositions)) return override.networkPositions.filter(Boolean)
  return override?.networkPosition ? [override.networkPosition] : []
}

function routeLinkMarkerPopupHtml(kind, item, linkedNames, routeName, linkedSegments = '') {
  const id = item.number || item.id || ''
  const title = kind === 'bridge' ? (item.name || 'Brug') : (item.call || item.name || 'Marifoonpunt')
  return [
    `<strong>${escapeHtml(title)}</strong>${id ? ` <span>${escapeHtml(id)}</span>` : ''}`,
    `<div>Gekoppeld aan: ${escapeHtml(linkedSegments || linkedNames || 'niet gekoppeld')}</div>`,
    routeName ? `<div>Dichtstbijzijnde route: ${escapeHtml(routeName)}</div>` : '',
    '<div>Sleep naar de routelijn om opnieuw te koppelen.</div>',
  ].filter(Boolean).join('')
}

function saveDraggedRouteLink(kind, item, latlng) {
  const coordinates = routeResult.value?.coordinates || []
  const routePosition = projectPointOnRoute({ latitude: latlng.lat, longitude: latlng.lng }, coordinates)
  if (!routePosition) return
  if (routePosition.distanceMeters > 220) {
    routeLinkMapStatus.value = 'Sleep dichter bij de blauwe routelijn om te koppelen.'
    refreshRouteLinkMapLayer()
    return
  }
  const routeSegment = routeSegmentForRouteMeters(routeResult.value, routePosition.routeMeters)
  const routeName = routeSegment?.name || routeStepNameAtMeters(routeResult.value, routePosition.routeMeters)
  if (!routeName) return
  const id = normalizeRouteLinkId(item.number || item.id || item.name || item.call)
  if (!id) return
  saveRouteLinkPatch(kind, id, routeSegmentPatch(routeSegment, routeName, routePosition))
  routeLinkMapStatus.value = `${kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${id} gekoppeld aan ${routeName}.`
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
}

function saveRouteLinkPatch(kind, id, patch, action = 'Koppeling bijgewerkt') {
  if (!auth.requireLogin()) return
  const bucket = routeLinkBucket(kind)
  const key = normalizeRouteLinkId(id)
  if (!key) return
  const existing = routeLinkOverrides.value[bucket]?.[key] || {}
  if (kind === 'bridge' && patch.networkPositions?.length) {
    const positions = [...bridgeNetworkPositions(existing)]
    for (const position of patch.networkPositions) {
      if (!positions.some((stored) => stored.lineName === position.lineName
        && routeDistanceMeters(stored, position) < 8)) positions.push(position)
    }
    patch = { ...patch, networkPositions: positions }
  }
  const mergedPatch = patch.routeAssignments
    ? { ...patch, routeAssignments: { ...(existing.routeAssignments || {}), ...patch.routeAssignments } }
    : patch
  const next = { ...routeLinkOverrides.value[bucket], [key]: { ...existing, ...mergedPatch } }
  routeLinkOverrides.value = { ...routeLinkOverrides.value, [bucket]: next }
  saveRouteLinkOverrides()
  persistRouteLink(kind, key, next[key])
  recordRouteLinkChange(kind, key, existing, next[key], action)
}

function recordRouteLinkChange(kind, id, before, after, action) {
  routeLinkChanges.value = [{
    id: createLocalId(),
    kind,
    itemId: id,
    before: JSON.parse(JSON.stringify(before || {})),
    after: JSON.parse(JSON.stringify(after || {})),
    label: `${action}: ${kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${id}`,
  }, ...routeLinkChanges.value].slice(0, 8)
}

function applyRouteLinkOverride(kind, id, override) {
  const bucket = routeLinkBucket(kind)
  const next = { ...routeLinkOverrides.value[bucket] }
  if (override && Object.keys(override).length) next[id] = override
  else delete next[id]
  routeLinkOverrides.value = { ...routeLinkOverrides.value, [bucket]: next }
  saveRouteLinkOverrides()
  persistRouteLink(kind, id, override || {})
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
}

function undoRouteLinkChange(change) {
  applyRouteLinkOverride(change.kind, change.itemId, change.before)
  rebuildCanalRouteNetwork()
  drawCustomRouteLines()
  routeLinkChanges.value = routeLinkChanges.value.filter((item) => item.id !== change.id)
  routeLinkMapStatus.value = `${change.kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${change.itemId}: wijziging ongedaan gemaakt.`
}

function routeLinkItemLabel(item) {
  return `${item.kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${item.id}${item.name ? ` · ${item.name}` : ''}`
}

function cancelRouteLinkSelection() {
  reportingPassagePick.value = null
  reportingPreviewIndex.value = null
  reportingMovementPreview?.remove()
  reportingMovementPreview = null
  selectedRouteLinkItem.value = null
  routeLinkPendingItem.value = null
  routeLinkMapStatus.value = ''
  clearRouteLinkDragMarker()
  selectedRouteLinkLayer?.remove()
  selectedRouteLinkLayer = null
  drawPlannedRoute(routeResult.value)
}

function drawSelectedRouteLinkItem() {
  selectedRouteLinkLayer?.remove()
  selectedRouteLinkLayer = null
  const item = selectedRouteLinkItem.value
  if (!map || !item?.point) return
  selectedRouteLinkLayer = L.circleMarker([item.point.latitude, item.point.longitude], {
    pane: 'navigation-pane', radius: 12, color: '#fff', weight: 4, fillColor: item.kind === 'bridge' ? '#f59e0b' : '#e11d48', fillOpacity: 0.95,
  }).bindTooltip(`${escapeHtml(routeLinkItemLabel(item))} · geselecteerd`, { permanent: true, direction: 'top', offset: [0, -12] }).addTo(map)
  if (item.kind === 'reporting') previewReportingMovement(0)
}

function startSelectedRouteLinkPick() {
  const item = selectedRouteLinkItem.value
  if (!item) return
  routeLinkPendingItem.value = { ...item, networkPick: true }
  routeMode.value = null
  routeLinkMapStatus.value = `${routeLinkItemLabel(item)}: klik nu op de blauwe vaarlijn waar de brug ligt.`
}

function startSelectedRouteLinkDrag() {
  const item = selectedRouteLinkItem.value
  if (!item?.point) {
    routeLinkMapStatus.value = 'Voor dit punt is geen kaartpositie beschikbaar.'
    return
  }
  routeLinkPendingItem.value = { ...item, networkPick: true }
  routeMode.value = null
  routeLinkMapStatus.value = `${routeLinkItemLabel(item)}: sleep de marker naar de blauwe vaarlijn.`
  drawRouteLinkDragMarker()
}

function resetSelectedRouteLink() {
  if (!auth.requireLogin()) return
  const item = selectedRouteLinkItem.value
  if (!item) return
  const existing = routeLinkOverride(item.kind, item.id)
  if (!existing) return
  const next = { ...existing }
  delete next.networkPosition
  delete next.networkPositions
  applyRouteLinkOverride(item.kind, item.id, Object.keys(next).length ? next : null)
  recordRouteLinkChange(item.kind, item.id, existing, next, 'Netwerkkoppeling verwijderd')
  rebuildCanalRouteNetwork()
  selectedRouteLinkItem.value = { ...item, linkedNames: '' }
  routeLinkMapStatus.value = `${routeLinkItemLabel(item)} gebruikt weer de oorspronkelijke gegevens.`
}

function removeSelectedBridgeNetworkPosition(index) {
  if (!auth.requireLogin()) return
  const item = selectedRouteLinkItem.value
  if (item?.kind !== 'bridge') return
  const existing = routeLinkOverride('bridge', item.id)
  const positions = bridgeNetworkPositions(existing)
  if (index < 0 || index >= positions.length) return
  const remaining = positions.filter((_, positionIndex) => positionIndex !== index)
  const next = { ...existing, networkPositions: remaining }
  delete next.networkPosition
  applyRouteLinkOverride('bridge', item.id, next)
  recordRouteLinkChange('bridge', item.id, existing, next, 'Vaarlijn ontkoppeld')
  rebuildCanalRouteNetwork()
  if (routeResult.value) updatePlannedRoute()
  selectedRouteLinkItem.value = { ...item, linkedNames: remaining.map((position) => position.lineName).filter(Boolean).join(', ') }
  routeLinkMapStatus.value = 'Vaarlijn ontkoppeld. Andere koppelingen zijn behouden.'
}

function addReportingMovementRule() {
  const item = selectedRouteLinkItem.value
  if (!item || item.kind !== 'reporting') return
  item.movementRules ||= []
  item.movementRules.push({ kind: 'map-passage', from: null, to: null, maneuver: 'straight', call: '' })
  startReportingPassagePick(item.movementRules.length - 1, 'from')
}

function addReportingAlternative(index) {
  const item = selectedRouteLinkItem.value
  const source = item?.movementRules?.[index]
  if (!source?.from) return
  item.movementRules.push({ kind: 'map-passage', from: { ...source.from }, to: null, maneuver: 'left', call: '' })
  const nextIndex = item.movementRules.length - 1
  startReportingPassagePick(nextIndex, 'to')
  routeLinkMapStatus.value = 'Aankomstrichting overgenomen. Klik nu de andere afslag of vervolgrichting.'
}

function reportingManeuverLabel(rule) {
  return ({ straight: 'rechtdoor', left: 'linksaf', right: 'rechtsaf', uturn: 'keren' })[rule?.maneuver] || 'richting kiezen'
}

function removeReportingMovementRule(index) {
  reportingPassagePick.value = null
  selectedRouteLinkItem.value.movementRules.splice(index, 1)
  previewReportingMovement(Math.max(0, index - 1))
}

function reverseReportingMovement(index) {
  const item = selectedRouteLinkItem.value
  const rule = item?.movementRules?.[index]
  if (!rule?.from || !rule?.to) return
  item.movementRules.push({
    kind: 'map-passage', from: { ...rule.to }, to: { ...rule.from }, call: '',
    maneuver: deriveReportingManeuver(item.point, rule.to, rule.from) || rule.maneuver || 'straight',
  })
  previewReportingMovement(item.movementRules.length - 1)
  routeLinkMapStatus.value = 'Omgekeerde vaarbeweging toegevoegd. Vul hiervoor de andere melding in.'
}

function startReportingPassagePick(index, side) {
  if (!isAdmin.value || !selectedRouteLinkItem.value?.point) return
  cancelMobileMapInteraction()
  reportingPassagePick.value = { index, side }
  previewReportingMovement(index)
  routeLinkMapStatus.value = side === 'from'
    ? 'Klik op de blauwe lijn aan de kant waar de boot vandaan komt, vóór het meldpunt.'
    : 'Klik op de blauwe lijn waar de boot na het meldpunt naartoe vaart.'
}

function placeReportingPassageAnchor(latlng, selection = reportingPassagePick.value) {
  const item = selectedRouteLinkItem.value
  const rule = item?.movementRules?.[selection?.index]
  if (!rule || !item.point) return false
  const position = nearestRoutingNetworkPosition({ latitude: latlng.lat, longitude: latlng.lng }, 18, true)
  const distance = position && routeDistanceMeters(item.point, position.point)
  if (!position || distance < 15 || distance > 250) {
    routeLinkMapStatus.value = 'Klik op een blauwe lijn iets vóór of na het meldpunt (15 tot 250 meter).'
    return false
  }
  rule.kind = 'map-passage'
  rule[selection.side] = { ...position.point, lineName: position.lineName }
  if (rule.from && rule.to) rule.maneuver = deriveReportingManeuver(item.point, rule.from, rule.to) || rule.maneuver || 'straight'
  previewReportingMovement(selection.index)
  if (selection === reportingPassagePick.value) {
    if (selection.side === 'from' && !rule.to) {
      reportingPassagePick.value = { index: selection.index, side: 'to' }
      routeLinkMapStatus.value = 'Aankomstkant gekozen. Klik nu waar de boot na het meldpunt naartoe vaart.'
    } else {
      reportingPassagePick.value = null
      routeLinkMapStatus.value = 'Vaarbeweging gekozen. Controleer de gekleurde plekken en vul de melding in.'
    }
  }
  return true
}

function previewReportingMovement(index) {
  reportingMovementPreview?.remove()
  reportingMovementPreview = null
  reportingPreviewIndex.value = index
  const item = selectedRouteLinkItem.value
  const rule = item?.movementRules?.[index]
  if (!map || !item?.point || !rule) return
  const layers = []
  for (const [side, label, color] of [['from', 'Vanaf hier', '#10b981'], ['to', 'Naar hier', '#0ea5e9']]) {
    const anchor = rule[side]
    if (!anchor) continue
    const a = [anchor.latitude, anchor.longitude], center = [item.point.latitude, item.point.longitude]
    const path = side === 'from' ? [a, center] : [center, a]
    // These dashed arrows show the selected sides, not a navigable route.
    const line = L.polyline(path, { pane: 'navigation-pane', color, weight: 4, dashArray: '6 6', interactive: false })
    layers.push(line, L.polylineDecorator(line, { patterns: [{ offset: '65%', symbol: L.Symbol.arrowHead({ pixelSize: 12, polygon: true, pathOptions: { color, fillColor: color, fillOpacity: 1, interactive: false } }) }] }))
    const marker = L.marker(a, {
      draggable: true, zIndexOffset: 1500,
      icon: L.divIcon({ className: '', html: `<span style="display:block;white-space:nowrap;background:${color};color:white;border:2px solid white;border-radius:10px;padding:6px 10px;font-weight:bold">${label}</span>`, iconSize: [100, 34], iconAnchor: [50, 17] }),
    }).bindTooltip(escapeHtml(anchor.lineName))
    marker.on('dragend', event => {
      if (!placeReportingPassageAnchor(event.target.getLatLng(), { index, side })) previewReportingMovement(index)
    })
    layers.push(marker)
  }
  reportingMovementPreview = L.layerGroup(layers).addTo(map)
}

async function saveReportingMovementRules() {
  if (!auth.requireLogin() || !isAdmin.value || reportingRulesSaving.value) return
  const item = selectedRouteLinkItem.value
  if (!item || item.kind !== 'reporting') return
  const rules = JSON.parse(JSON.stringify(item.movementRules || []))
  const error = rules.some(rule => rule.kind !== 'map-passage') ? 'Wijs voor iedere oude instelling eerst beide kanten op de kaart aan.' : validateReportingRules(rules)
  if (error) { routeLinkMapStatus.value = error; return }
  reportingRulesSaving.value = true
  try {
    const collection = await loadNavigationLayer('reporting-points')
    const feature = collection.features.find(feature => item.objectKey && feature.properties._mapObjectKey === item.objectKey)
      || collection.features.find(feature => String(feature.properties.number) === String(item.id))
    if (feature) {
      const response = await fetch('/api/map/objects?layer=reporting-points', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectKey: feature.properties._mapObjectKey,
          feature: { ...feature, properties: { ...feature.properties, movementRules: rules } },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Opslaan faalde.')
      const verification = await loadNavigationLayer('reporting-points')
      const savedFeature = verification.features.find(candidate => candidate.properties._mapObjectKey === feature.properties._mapObjectKey)
      const savedRules = savedFeature?.properties?.movementRules
      if (!Array.isArray(savedRules) || JSON.stringify(savedRules) !== JSON.stringify(rules)) {
        throw new Error('De server kon de aangepaste meldregels niet bevestigen. Probeer opnieuw.')
      }
      item.movementRules = JSON.parse(JSON.stringify(savedRules))
      await reloadManagedMapLayer('reporting-points')
      routeLinkMapStatus.value = 'Meldregels opgeslagen voor iedereen.'
    } else {
      saveRouteLinkPatch('reporting', item.id, { movementRules: rules }, 'Meldregels opgeslagen')
      refreshRouteLinkedItems()
      routeLinkMapStatus.value = 'Meldregels voor dit eigen punt opgeslagen in deze browser.'
    }
  } catch (error) { routeLinkMapStatus.value = error.message || 'Opslaan faalde.' }
  finally { reportingRulesSaving.value = false }
}

function addReportingMessageFromFeature(feature) {
  const properties = feature?.properties || {}
  const point = averageRoutePoint(geometryRoutePoints(feature?.geometry))
  if (!point) return
  const firstCallBearing = Number(properties.calls?.[0]?.bearing)
  mapObjectEditor.value = {
    layer: 'reporting-points', objectKey: '', feature: null, positionChanged: true,
    name: properties.locationName || properties.name || 'Marifoonmeldpunt', number: '', type: 'Marifoonmelding', description: '',
    bearing: ((Number.isFinite(firstCallBearing) ? firstCallBearing : Number(properties.bearing) || 0) + 180) % 360,
    latitude: roundMapCoordinate(point.latitude), longitude: roundMapCoordinate(point.longitude),
  }
  mapObjectError.value = ''
}

function addReportingMovementToLocation(feature) {
  const properties = feature?.properties || {}
  const point = averageRoutePoint(geometryRoutePoints(feature?.geometry))
  const calls = Array.isArray(properties.calls) ? properties.calls : []
  const call = calls.find(candidate => Array.isArray(candidate.movementRules) && candidate.movementRules.length) || calls[0]
  if (!point || !call?.number) {
    mapObjectError.value = 'Dit marifoonpunt bevat geen bestaande melding om uit te breiden.'
    return
  }
  selectedRouteLinkItem.value = {
    kind: 'reporting', id: String(call.number), objectKey: call._mapObjectKey || '',
    name: properties.locationName || properties.name || call.locationName || call.name || '',
    point, call: '', movementRules: JSON.parse(JSON.stringify(call.movementRules || [])),
  }
  drawSelectedRouteLinkItem()
  addReportingMovementRule()
  routeLinkMapStatus.value = 'Nieuwe vaarbeweging voor dit bestaande marifoonpunt: kies waar de boot vandaan komt.'
}

function routeLinkPopupHtml(kind, item, point = null) {
  if (!isAdmin.value) return ''
  const id = normalizeRouteLinkId(item.number || item.id || item.name || item.call)
  if (!id) return ''
  const linkedNames = routeLinkDisplayNames(kind, item)
  const linkedSegments = routeLinkDisplaySegments(kind, item)
  const override = routeLinkOverride(kind, id) || {}
  const bearing = Number(override.bearing ?? item.bearing)
  const call = override.call || item.call || ''
  const latitude = Number(point?.latitude)
  const longitude = Number(point?.longitude)
  const canUsePoint = Number.isFinite(latitude) && Number.isFinite(longitude)
  return `
      <div class="route-link-popup">
      <div><span>Routekoppeling</span><b>${escapeHtml(linkedSegments || linkedNames || 'niet gekoppeld')}</b></div>
      <button type="button" data-route-link-action="select" data-route-link-kind="${escapeHtml(kind)}" data-route-link-id="${escapeHtml(id)}" data-route-link-object-key="${escapeHtml(item._mapObjectKey || '')}" data-route-link-name="${escapeHtml(item.name || item.locationName || item.call || '')}" data-route-link-names="${escapeHtml(linkedSegments || linkedNames)}" data-route-link-bearing="${escapeHtml(Number.isFinite(bearing) ? bearing : '')}" data-route-link-call="${escapeHtml(call)}" data-route-link-rules="${escapeHtml(encodeURIComponent(JSON.stringify(item.movementRules ?? override.movementRules ?? [])))}" data-route-link-lat="${escapeHtml(canUsePoint ? latitude : '')}" data-route-link-lng="${escapeHtml(canUsePoint ? longitude : '')}">${kind === 'reporting' ? 'Vaarbewegingen op kaart aanpassen' : 'Selecteer'}</button>
    </div>
  `
}

function mapAdminObjectHtml(layer, feature, fallbackPoint = null) {
  if (!isAdmin.value) return ''
  const payload = encodeURIComponent(JSON.stringify(feature))
  const label = layer === 'reporting-points' ? 'Melding beheren' : 'Beheren'
  return `<div class="map-admin-popup"><button type="button" data-map-admin-action="edit" data-map-admin-layer="${escapeHtml(layer)}" data-map-admin-feature="${escapeHtml(payload)}">${label}</button></div>`
}

function mapAdminReportingLocationHtml(feature) {
  if (!isAdmin.value) return ''
  const payload = escapeHtml(encodeURIComponent(JSON.stringify(feature)))
  return `<div class="map-admin-popup map-admin-popup--location"><button type="button" data-map-admin-action="edit-reporting-location" data-map-admin-layer="reporting-points" data-map-admin-feature="${payload}">Punt en meldingsnummers beheren</button><button type="button" data-map-admin-action="add-reporting-movement" data-map-admin-layer="reporting-points" data-map-admin-feature="${payload}">+ Vaarbeweging aan dit punt</button></div>`
}

function navigationFilterName(layer) {
  return navigationFilters.find((filter) => filter.id === layer)?.name || (layer === 'bridges' ? 'Bruggen' : layer)
}

function startNewMapObject(layer) {
  mapObjectEditor.value = { layer, objectKey: '', feature: null, positionChanged: true, name: '', number: '', type: layer === 'closures' ? 'Stremming' : '', description: '', start: '', end: '', bearing: 0, latitude: null, longitude: null }
  mapObjectError.value = ''
}

async function startNewReportingPoint() {
  navigationLayerError.value = ''
  try {
    const collection = await loadNavigationLayer('reporting-points')
    startNewMapObject('reporting-points')
    mapObjectEditor.value.number = String(nextReportingNumber(collection.features))
    mapObjectEditor.value.type = 'Marifoonmeldpunt'
    navigationLayersOpen.value = false
    startMapObjectPlacement()
  } catch (error) {
    navigationLayerError.value = error?.message || 'Het volgende meldingsnummer kon niet worden bepaald.'
  }
}

function editMapObject(layer, feature) {
  const properties = feature.properties || {}
  const points = geometryRoutePoints(feature.geometry)
  const point = averageRoutePoint(points)
  mapObjectEditor.value = {
    layer, objectKey: layer === 'routing-lines' ? waterwayKey(feature) : properties._mapObjectKey || '', feature: JSON.parse(JSON.stringify(feature)), positionChanged: false,
    closed: properties.closed === true, maxspeed: Number(properties.maxspeed) || 6, oneway: properties.oneway || 'no',
    start: localDateTimeInput(properties.start), end: localDateTimeInput(properties.end),
    name: properties.name || properties.locationName || properties.obj_naam || '',
    number: properties.number || properties.code || '',
    type: properties.type || properties.category || '',
    description: properties.description || properties.call || properties.instruction || '',
    bearing: Number(properties.bearing) || 0,
    latitude: point?.latitude ?? null, longitude: point?.longitude ?? null,
  }
  mapObjectError.value = ''
}

function editReportingLocation(feature) {
  const properties = feature?.properties || {}
  const point = averageRoutePoint(geometryRoutePoints(feature?.geometry))
  mapObjectEditor.value = {
    layer: 'reporting-points', objectKey: '', feature, reportingLocation: true, positionChanged: false,
    name: properties.locationName || properties.name || 'Marifoonmeldpunt', number: '', type: 'Marifoonmeldpunt', description: '', bearing: 0,
    latitude: point?.latitude ?? null, longitude: point?.longitude ?? null,
    calls: JSON.parse(JSON.stringify(Array.isArray(properties.calls) ? properties.calls : [])),
    deletedCallKeys: [],
  }
  mapObjectError.value = ''
}

async function addReportingCallToEditor() {
  const editor = mapObjectEditor.value
  if (!editor?.reportingLocation) return
  try {
    const collection = await loadNavigationLayer('reporting-points')
    const number = nextReportingNumber([
      ...(collection.features || []),
      ...editor.calls.map(call => ({ properties: { number: call.number } })),
    ])
    editor.calls.push({
      _editorId: `new-${Date.now()}`, number: String(number), name: editor.name,
      locationName: editor.name, type: 'Aanbevolen marifoonmelding', call: '', movementRules: [],
      instruction: 'Noem eerst de scheepsnaam en daarna de vaarrichting.',
      obligation: 'Melden geeft geen voorrang.', source: 'Eigen kaart',
    })
  } catch (error) {
    mapObjectError.value = error?.message || 'Een nieuw meldingsnummer kon niet worden bepaald.'
  }
}

function removeReportingCallFromEditor(index) {
  const editor = mapObjectEditor.value
  if (!editor?.reportingLocation) return
  const [call] = editor.calls.splice(index, 1)
  if (call?._mapObjectKey) editor.deletedCallKeys.push(call._mapObjectKey)
}

function localDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
}

function closeMapObjectEditor() {
  waterwayEditMarkers?.remove()
  waterwayEditPreview?.remove()
  mapObjectEditor.value = null
  mapObjectPlacement.value = false
  mapObjectError.value = ''
}

function startMapObjectPlacement() {
  mapObjectPlacement.value = true
  routeMode.value = null
  customRouteDrawing.value = false
  customReportingPlacement.value = false
}

function mapObjectFeatureFromEditor(editor) {
  const original = editor.feature || { type: 'Feature', properties: {}, geometry: null }
  const properties = { ...(original.properties || {}) }
  properties.name = editor.name || properties.name || navigationFilterName(editor.layer)
  if (editor.number) properties.number = editor.number
  if (editor.type) properties.type = editor.type
  if (editor.layer === 'reporting-points') {
    properties.locationName = editor.name || properties.locationName
    properties.call = editor.description
    properties.instruction = editor.description
    if (!editor.feature) properties.movementRules = []
  } else properties.description = editor.description
  if (editor.layer === 'routing-lines') Object.assign(properties, { closed: editor.closed, maxspeed: editor.maxspeed, oneway: editor.oneway })
  if (editor.layer === 'closures') Object.assign(properties, {
    type: 'Stremming', blocksRouting: true, source: 'Eigen stremming',
    start: editor.start ? new Date(editor.start).toISOString() : null,
    end: editor.end ? new Date(editor.end).toISOString() : null,
    waterway: properties.waterway || '',
  })
  const latitude = roundMapCoordinate(editor.latitude)
  const longitude = roundMapCoordinate(editor.longitude)
  const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude)
  const geometry = hasPoint && (editor.positionChanged || !original.geometry) ? { type: 'Point', coordinates: [longitude, latitude] } : original.geometry
  return { ...original, type: 'Feature', properties, geometry }
}

function roundMapCoordinate(value) {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value
  const number = Number(normalized)
  return Number.isFinite(number) ? Number(number.toFixed(6)) : NaN
}

async function saveMapObject() {
  const editor = mapObjectEditor.value
  if (!editor) return
  if (editor.layer === 'reporting-points' && !editor.reportingLocation && !String(editor.number ?? '').trim()) {
    mapObjectError.value = 'Vul een uniek meldingsnummer in.'
    return
  }
  if (editor.layer === 'reporting-points' && !editor.reportingLocation && !editor.objectKey) {
    const collection = await loadNavigationLayer('reporting-points')
    const duplicate = collection.features.find(candidate => String(candidate.properties?.number || '').trim().toLowerCase() === String(editor.number).trim().toLowerCase())
    if (duplicate) {
      mapObjectError.value = `Meldingsnummer ${editor.number} bestaat al bij ${duplicate.properties.locationName || duplicate.properties.name || 'een ander marifoonpunt'}. Voeg daar een vaarbeweging toe of kies een uniek nummer.`
      return
    }
  }
  const latitude = roundMapCoordinate(editor.latitude)
  const longitude = roundMapCoordinate(editor.longitude)
  if ((editor.positionChanged || !editor.feature?.geometry) && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    mapObjectError.value = 'Gebruik een geldige latitude (-90 tot 90) en longitude (-180 tot 180).'
    return
  }
  editor.latitude = latitude
  editor.longitude = longitude
  if (editor.reportingLocation) {
    try {
      await saveReportingLocation(editor, latitude, longitude)
      closeMapObjectEditor()
      await reloadManagedMapLayer(editor.layer)
    } catch (error) {
      mapObjectError.value = error?.message || 'Marifoonpunt opslaan faalde.'
    }
    return
  }
  if (editor.layer === 'closures' && editor.end && (!Number.isFinite(Date.parse(editor.end)) || (editor.start && Date.parse(editor.end) <= Date.parse(editor.start)))) {
    mapObjectError.value = 'Kies een eindtijd na de begintijd.'
    return
  }
  const feature = mapObjectFeatureFromEditor(editor)
  if (!feature.geometry) {
    mapObjectError.value = 'Kies eerst een positie op de kaart.'
    return
  }
  try {
    const response = await fetch(`/api/map/objects?layer=${encodeURIComponent(editor.layer)}`, { method: editor.objectKey ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectKey: editor.objectKey || undefined, feature }) })
    const data = await response.json()
    if (!response.ok) { mapObjectError.value = data.error || 'Opslaan faalde.'; return }
    closeMapObjectEditor()
    await reloadManagedMapLayer(editor.layer)
    if (editor.layer === 'reporting-points') {
      selectedRouteLinkItem.value = {
        kind: 'reporting', id: String(feature.properties.number), objectKey: data.objectKey || '', name: feature.properties.name,
        point: { latitude, longitude }, call: feature.properties.call || '',
        movementRules: JSON.parse(JSON.stringify(feature.properties.movementRules || [])),
      }
      drawSelectedRouteLinkItem()
      routeLinkMapStatus.value = 'Meldpunt opgeslagen. Wijs nu de aankomstkant en vervolgrichting aan op de kaart.'
      addReportingMovementRule()
    }
  } catch (error) {
    mapObjectError.value = error?.message || 'Opslaan faalde door een verbindingsfout.'
  }
}

async function saveReportingLocation(editor, latitude, longitude) {
  if (!editor.calls?.length) throw new Error('Dit marifoonpunt bevat geen meldingen.')
  const normalizedNumbers = editor.calls.map(call => String(call.number || '').trim().toLowerCase())
  if (normalizedNumbers.some(number => !number)) throw new Error('Vul voor iedere melding een nummer in.')
  if (new Set(normalizedNumbers).size !== normalizedNumbers.length) throw new Error('Ieder meldingsnummer op dit punt moet uniek zijn.')
  const collection = await loadNavigationLayer('reporting-points')
  const ownKeys = new Set(editor.calls.map(call => call._mapObjectKey).filter(Boolean))
  const duplicate = collection.features.find(feature => {
    const key = feature.properties?._mapObjectKey
    return !ownKeys.has(key) && !editor.deletedCallKeys?.includes(key)
      && normalizedNumbers.includes(String(feature.properties?.number || '').trim().toLowerCase())
  })
  if (duplicate) throw new Error(`Meldingsnummer ${duplicate.properties.number} bestaat al bij ${duplicate.properties.locationName || duplicate.properties.name || 'een ander marifoonpunt'}.`)
  for (const objectKey of editor.deletedCallKeys || []) {
    const response = await fetch('/api/map/objects?layer=reporting-points', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectKey }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Meldingsnummer verwijderen faalde.')
  }
  const responses = await Promise.all(editor.calls.map(async (call) => {
    const objectKey = call._mapObjectKey || ''
    const properties = { ...call, locationName: editor.name || call.locationName || call.name || 'Marifoonmeldpunt' }
    delete properties._mapObjectKey
    delete properties._mapObjectSource
    delete properties._editorId
    const feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [longitude, latitude] }, properties }
    const response = await fetch('/api/map/objects?layer=reporting-points', {
      method: objectKey ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectKey: objectKey || undefined, feature }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Marifoonpunt opslaan faalde.')
    return data
  }))
  return responses
}

async function deleteMapObject() {
  const editor = mapObjectEditor.value
  if (editor?.reportingLocation) {
    try {
      const calls = editor.calls || []
      if (!calls.length) throw new Error('Dit marifoonpunt bevat geen meldingen.')
      await Promise.all(calls.map(async (call) => {
        if (!call._mapObjectKey) throw new Error(`Melding ${call.number || ''} kan niet worden verwijderd.`)
        const response = await fetch('/api/map/objects?layer=reporting-points', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectKey: call._mapObjectKey }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Marifoonpunt verwijderen faalde.')
      }))
      closeMapObjectEditor()
      await reloadManagedMapLayer(editor.layer)
    } catch (error) {
      mapObjectError.value = error?.message || 'Marifoonpunt verwijderen faalde.'
    }
    return
  }
  if (!editor?.objectKey) return
  const response = await fetch(`/api/map/objects?layer=${encodeURIComponent(editor.layer)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectKey: editor.objectKey }) })
  const data = await response.json()
  if (!response.ok) { mapObjectError.value = data.error || 'Verwijderen faalde.'; return }
  closeMapObjectEditor()
  await reloadManagedMapLayer(editor.layer)
}

async function reloadManagedMapLayer(layer) {
  if (layer === 'routing-lines') { await loadWaterwayEdits(); return }
  if (layer === 'bridges') {
    bridgeLayerController?.destroy()
    bridgeLayerController = null
    bridgeLayerVisible.value = false
  } else {
    navigationLayerControllers.get(layer)?.remove()
    navigationLayerControllers.delete(layer)
    activeNavigationLayers.value = activeNavigationLayers.value.filter((id) => id !== layer)
  }
  await toggleNavigationLayer(layer)
  if (layer === 'bridges') loadBridgeSearchItems()
  if (layer === 'closures') await loadRouteClosures()
  if (routeResult.value) {
    updateRouteBridgeItems(routeResult.value)
    updateRouteReportingItems(routeResult.value)
  }
}

function routeNameForMapPoint(point) {
  if (!['ok', 'partial'].includes(routeResult.value?.status) || !routeResult.value?.coordinates?.length) return ''
  const latitude = Number(point?.latitude)
  const longitude = Number(point?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return ''
  const routePosition = projectPointOnRoute({ latitude, longitude }, routeResult.value.coordinates)
  if (!routePosition || routePosition.distanceMeters > 220) return ''
  return routeStepNameAtMeters(routeResult.value, routePosition.routeMeters)
}

function routeSegmentForMapPoint(point, maxDistanceMeters = 220) {
  if (!['ok', 'partial'].includes(routeResult.value?.status)) return null
  const latitude = Number(point?.latitude)
  const longitude = Number(point?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const routePosition = projectPointOnRouteSegments({ latitude, longitude }, routeSegmentsForResult(routeResult.value))
  if (!routePosition || routePosition.distanceMeters > maxDistanceMeters) return null
  return routePosition
}

function handleRouteLinkPopupClick(event) {
  const adminButton = (event.originalEvent?.target || event.target)?.closest?.('[data-map-admin-action]')
  if (adminButton) {
    event.preventDefault?.()
    event.stopPropagation?.()
    try {
      const feature = JSON.parse(decodeURIComponent(adminButton.dataset.mapAdminFeature))
      if (adminButton.dataset.mapAdminAction === 'add-reporting-movement') addReportingMovementToLocation(feature)
      else if (adminButton.dataset.mapAdminAction === 'add-reporting') addReportingMessageFromFeature(feature)
      else if (adminButton.dataset.mapAdminAction === 'edit-reporting-location') editReportingLocation(feature)
      else editMapObject(adminButton.dataset.mapAdminLayer, feature)
    } catch { mapObjectError.value = 'Objectgegevens konden niet worden geopend.' }
    map?.closePopup()
    return
  }
  const button = (event.originalEvent?.target || event.target)?.closest?.('[data-route-link-action]')
  if (!button) return
  event.preventDefault?.()
  event.stopPropagation?.()
  const kind = button.dataset.routeLinkKind
  const id = normalizeRouteLinkId(button.dataset.routeLinkId)
  if (!kind || !id) return
  if (button.dataset.routeLinkAction === 'select') {
    const latitude = button.dataset.routeLinkLat === '' ? NaN : Number(button.dataset.routeLinkLat)
    const longitude = button.dataset.routeLinkLng === '' ? NaN : Number(button.dataset.routeLinkLng)
    selectedRouteLinkItem.value = {
      kind, id,
      objectKey: button.dataset.routeLinkObjectKey || '',
      name: button.dataset.routeLinkName || '',
      linkedNames: button.dataset.routeLinkNames || '',
      bearing: Number.isFinite(Number(button.dataset.routeLinkBearing)) && button.dataset.routeLinkBearing !== '' ? Number(button.dataset.routeLinkBearing) : 0,
      call: button.dataset.routeLinkCall || '',
      movementRules: JSON.parse(decodeURIComponent(button.dataset.routeLinkRules || '%5B%5D')),
      point: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
    }
    if (kind === 'reporting' && selectedRouteLinkItem.value.point) {
      for (const rule of selectedRouteLinkItem.value.movementRules) {
        if (rule.kind === 'map-passage' && rule.from && rule.to && !rule.maneuver) {
          rule.maneuver = deriveReportingManeuver(selectedRouteLinkItem.value.point, rule.from, rule.to) || 'straight'
        }
      }
    }
    drawSelectedRouteLinkItem()
    routeLinkPendingItem.value = null
    routeLinkMapStatus.value = `${routeLinkItemLabel(selectedRouteLinkItem.value)} geselecteerd. Kies in het zwevende venster hoe je het wilt koppelen.`
    map?.closePopup()
    return
  }
}

function handleRouteLinkLineClick(event) {
  if (!routeLinkPendingItem.value) return
  if (event.originalEvent) L.DomEvent.stop(event.originalEvent)
  const routeSegment = routeSegmentForMapPoint({ latitude: event.latlng.lat, longitude: event.latlng.lng })
  const routeName = routeSegment?.segmentName || ''
  const pending = routeLinkPendingItem.value
  if (!routeName) {
    routeLinkMapStatus.value = `${pending.kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${pending.id}: klik dichter op het juiste routesegment.`
    return
  }
  saveRouteLinkPatch(pending.kind, pending.id, routeSegmentPatch(routeSegment.segment, routeName, routeSegment))
  routeLinkMapStatus.value = `${pending.kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${pending.id} gekoppeld aan segment ${routeName}.`
  routeLinkPendingItem.value = null
  drawPlannedRoute(routeResult.value)
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
}

function drawRouteLinkDragMarker() {
  clearRouteLinkDragMarker()
  const pending = routeLinkPendingItem.value
  if (!map || !pending?.point) return
  const color = pending.kind === 'bridge' ? '#f59e0b' : '#e11d48'
  const label = `${pending.kind === 'bridge' ? 'B' : 'M'} ${pending.id}`
  routeLinkDragMarker = L.marker([pending.point.latitude, pending.point.longitude], {
    draggable: true,
    zIndexOffset: 1800,
    icon: L.divIcon({
      className: '',
      html: `<div style="display:flex;align-items:center;justify-content:center;min-width:36px;height:30px;padding:0 8px;border-radius:999px;background:${color};border:3px solid white;color:white;font-size:12px;font-weight:900;box-shadow:0 10px 24px rgb(0 0 0 / .42);white-space:nowrap">${escapeHtml(label)}</div>`,
      iconSize: [48, 30],
      iconAnchor: [24, 15],
    }),
  })
    .bindTooltip('Sleep naar het juiste stuk van de blauwe route en laat los.', { direction: 'top', offset: [0, -14] })
    .on('dragend', (event) => saveDraggedPendingRouteLink(event.target.getLatLng()))
    .addTo(map)
  routeLinkDragMarker.openTooltip()
}

function clearRouteLinkDragMarker() {
  if (routeLinkDragMarker) routeLinkDragMarker.remove()
  routeLinkDragMarker = null
}

function saveDraggedPendingRouteLink(latlng) {
  const pending = routeLinkPendingItem.value
  if (!pending) return
  if (pending.networkPick) {
    saveBridgeNetworkPosition(pending, { latitude: latlng.lat, longitude: latlng.lng })
    return
  }
  const routeSegment = routeSegmentForMapPoint({ latitude: latlng.lat, longitude: latlng.lng })
  const routeName = routeSegment?.segmentName || ''
  if (!routeName) {
    routeLinkMapStatus.value = `${pending.kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${pending.id}: laat los dichter op het juiste routesegment.`
    drawRouteLinkDragMarker()
    return
  }
  saveRouteLinkPatch(pending.kind, pending.id, routeSegmentPatch(routeSegment.segment, routeName, routeSegment))
  routeLinkMapStatus.value = `${pending.kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${pending.id} gekoppeld aan segment ${routeName}.`
  routeLinkPendingItem.value = null
  clearRouteLinkDragMarker()
  drawPlannedRoute(routeResult.value)
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
}

function nearestRoutingNetworkPosition(point, maxDistanceMeters = 120, realLinesOnly = false) {
  if (!canalRouteNetwork?.nodes?.size) return null
  let best = null
  const visited = new Set()
  for (const node of canalRouteNetwork.nodes.values()) {
    for (const [neighborKey, edge] of node.neighbors) {
      if (realLinesOnly && edge?.virtual) continue
      const edgeKey = [node.key, neighborKey].sort().join('|')
      if (visited.has(edgeKey)) continue
      visited.add(edgeKey)
      const neighbor = canalRouteNetwork.nodes.get(neighborKey)
      if (!neighbor) continue
      const projection = projectPointOnSegment(point, [node.lat, node.lng], [neighbor.lat, neighbor.lng])
      if (!best || projection.distanceMeters < best.distanceMeters) best = { ...projection, lineName: edge?.name || 'Blauwe vaarlijn' }
    }
  }
  return best && best.distanceMeters <= maxDistanceMeters ? best : null
}

function saveBridgeNetworkPosition(item, targetPoint) {
  const networkPosition = nearestRoutingNetworkPosition(targetPoint)
  if (!networkPosition) {
    routeLinkMapStatus.value = 'Klik of sleep dichter bij een blauwe vaarlijn.'
    if (routeLinkPendingItem.value?.point) drawRouteLinkDragMarker()
    return
  }
  const source = item.point
  if (!source) return
  const nextPosition = {
      sourceLatitude: source.latitude,
      sourceLongitude: source.longitude,
      latitude: networkPosition.point.latitude,
      longitude: networkPosition.point.longitude,
      lineName: networkPosition.lineName,
    }
  const existing = routeLinkOverride(item.kind, item.id)
  const positions = bridgeNetworkPositions(existing)
  const duplicate = positions.some((position) => position.lineName === nextPosition.lineName
    && routeDistanceMeters({ latitude: position.latitude, longitude: position.longitude }, networkPosition.point) < 8)
  if (duplicate) {
    routeLinkMapStatus.value = `${networkPosition.lineName} is al aan dit punt gekoppeld.`
    routeLinkPendingItem.value = null
    clearRouteLinkDragMarker()
    return
  }
  const networkPositions = [...positions, nextPosition]
  const patch = item.kind === 'bridge'
    ? { networkPositions, networkPosition: undefined }
    : { networkPosition: nextPosition }
  saveRouteLinkPatch(item.kind, item.id, patch, 'Aan blauwe vaarlijn gekoppeld')
  routeLinkPendingItem.value = null
  selectedRouteLinkItem.value = { ...item, linkedNames: networkPositions.map((position) => position.lineName).filter(Boolean).join(', ') }
  clearRouteLinkDragMarker()
  rebuildCanalRouteNetwork()
  drawCustomRouteLines()
  if (routeResult.value) updatePlannedRoute()
  routeLinkMapStatus.value = `${routeLinkItemLabel(item)} is gekoppeld aan ${networkPosition.lineName}. Hiervoor was geen geplande route nodig.`
}

function routeSegmentPatch(segment, routeName, position = null) {
  const routeSegment = segment ? {
    key: routeSegmentKey(segment),
    name: segment.name || routeName,
    start: segment.start,
    end: segment.end,
  } : null
  const networkPosition = position?.point ? {
    latitude: position.point.latitude, longitude: position.point.longitude, lineName: routeName,
  } : null
  return {
    routeNames: [routeName], routeSegments: routeSegment ? [routeSegment] : [],
    networkPositions: networkPosition ? [networkPosition] : [], networkPosition: null,
  }
}

function normalizeRouteLinkId(value) {
  return String(value || '').trim()
}

function parseRouteNames(value) {
  return String(value || '').split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean)
}

function loadBuiltInGroupOverrides() {
  if (!auth.user) return {}
  try {
    const stored = JSON.parse(localStorage.getItem('ais-built-in-group-overrides-v1') || '{}')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  } catch { return {} }
}

function effectiveGroupMmsis(id, defaults) {
  const overrides = builtInGroupOverrides.value[id] || {}
  const members = new Set(defaults)
  for (const [mmsi, included] of Object.entries(overrides)) {
    if (included === true) members.add(mmsi)
    if (included === false) members.delete(mmsi)
  }
  return [...members]
}

function persistSelectedVesselGroups(groups, message) {
  try {
    localStorage.setItem('ais-vessel-groups', JSON.stringify(groups))
    vesselGroups.value = groups
    applyVesselGroupFilter()
    vesselGroupMessage.value = message
    return true
  } catch {
    vesselGroupMessage.value = 'Could not save groups. Browser storage may be full or unavailable.'
    return false
  }
}

async function setSelectedVesselGroup(groupId, included) {
  if (!auth.requireLogin() || !selectedVessel.value) return
  const mmsi = String(selectedVessel.value.mmsi)
  if (groupId.startsWith('operator:')) {
    if (!isAdmin.value) { vesselGroupMessage.value = 'Alleen beheerders kunnen gedeelde rederijkoppelingen aanpassen.'; return }
    try {
      const response = await fetch(`/api/map/operator-membership/${encodeURIComponent(mmsi)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId: included ? groupId.slice(9) : null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Rederijkoppeling opslaan mislukt.')
      operatorAssignments.value = data.assignments
      selectedVessel.value = enrichVesselWithFleetData(selectedVessel.value)
      applyVesselGroupFilter()
      vesselGroupMessage.value = included ? 'Rederijkoppeling voor iedereen opgeslagen.' : 'Automatische rederijkoppeling voor deze boot uitgeschakeld.'
    } catch (error) { vesselGroupMessage.value = error.message }
    return
  }
  if (groupId === 'company') {
    const group = availableVesselGroups.value.find(candidate => candidate.id === groupId)
    vesselGroupMessage.value = included ? 'Adding boat to Fleet Directory…' : 'Removing boat from Fleet Directory…'
    try {
      const response = await fetch(`/api/fleet/company-membership/${encodeURIComponent(mmsi)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ included, name: selectedVessel.value.name || selectedVessel.value.fleet?.name || '' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Fleet Directory could not be updated.')

      companyBaseMmsis.value = included
        ? [...new Set([...companyBaseMmsis.value, mmsi])]
        : companyBaseMmsis.value.filter(value => value !== mmsi)
      companyFleetBoats.value = included && result.boat
        ? [...companyFleetBoats.value.filter(boat => String(boat.mmsi) !== mmsi), result.boat]
        : companyFleetBoats.value.filter(boat => String(boat.mmsi) !== mmsi)
      const companyOverrides = { ...(builtInGroupOverrides.value.company || {}) }
      delete companyOverrides[mmsi]
      const nextOverrides = { ...builtInGroupOverrides.value, company: companyOverrides }
      localStorage.setItem('ais-built-in-group-overrides-v1', JSON.stringify(nextOverrides))
      builtInGroupOverrides.value = nextOverrides
      aisController?.setCompanyMmsis(companyMmsis.value, companyFleetBoats.value)
      selectedVessel.value = enrichVesselWithFleetData(selectedVessel.value)
      applyVesselGroupFilter()
      window.dispatchEvent(new CustomEvent('fleet-directory-updated'))
      vesselGroupMessage.value = included ? `Added to ${group.name} and Fleet Directory.` : `Removed from ${group.name} and Fleet Directory.`
    } catch (error) {
      vesselGroupMessage.value = error.message || 'Fleet Directory could not be updated.'
    }
    return
  }
  if (['company', 'nt', 'police'].includes(groupId)) {
    const group = availableVesselGroups.value.find(candidate => candidate.id === groupId)
    const overrides = {
      ...builtInGroupOverrides.value,
      [groupId]: { ...builtInGroupOverrides.value[groupId], [mmsi]: included },
    }
    try {
      localStorage.setItem('ais-built-in-group-overrides-v1', JSON.stringify(overrides))
      builtInGroupOverrides.value = overrides
      aisController?.setCompanyMmsis(companyMmsis.value)
      aisController?.setSpecialVesselMmsis({ nt: ntMmsis.value, police: policeMmsis.value })
      selectedVessel.value = enrichVesselWithFleetData(selectedVessel.value)
      applyVesselGroupFilter()
      vesselGroupMessage.value = included ? `Added to ${group.name}.` : `Removed from ${group.name}.`
    } catch {
      vesselGroupMessage.value = 'Could not save groups. Browser storage may be full or unavailable.'
    }
    return
  }
  const group = vesselGroups.value.find(candidate => candidate.id === groupId)
  if (!group) return
  const groups = vesselGroups.value.map(candidate => candidate.id !== groupId ? candidate : {
    ...candidate,
    mmsis: included ? [...new Set([...candidate.mmsis, mmsi])] : candidate.mmsis.filter(value => value !== mmsi),
  })
  persistSelectedVesselGroups(groups, included ? `Added to ${group.name}.` : `Removed from ${group.name}.`)
}

function createGroupWithSelectedVessel() {
  if (!auth.requireLogin() || !selectedVessel.value) return
  const name = vesselGroupDraftName.value.trim()
  if (!name) return
  if (isCompanyGroupName(name)) {
    setSelectedVesselGroup('company', true)
    vesselGroupDraftName.value = ''
    return
  }
  const existing = availableVesselGroups.value.find(group => group.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    setSelectedVesselGroup(existing.id, true)
    return
  }
  const group = { id: createLocalId(), name, mmsis: [String(selectedVessel.value.mmsi)] }
  if (persistSelectedVesselGroups([...vesselGroups.value, group], `Created ${name} and added this boat.`)) {
    vesselGroupDraftName.value = ''
  }
}

function createVesselGroup() {
  if (!auth.requireLogin()) return
  const name = newGroupName.value.trim()
  if (!name) return
  if (isCompanyGroupName(name)) {
    activeVesselFilters.value = [...activeVesselFilters.value.filter((filter) => filter !== 'all'), 'company']
    newGroupName.value = ''
    return
  }

  const group = {
    id: createLocalId(),
    name,
    mmsis: [],
  }
  vesselGroups.value.push(group)
  editingGroupId.value = group.id
  activeVesselFilters.value = [...activeVesselFilters.value.filter((filter) => filter !== 'all'), `group:${group.id}`]
  newGroupName.value = ''
  saveVesselGroups()
}

function isCompanyGroupName(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
  return normalized === 'company' || normalized === 'company fleet' || normalized === 'fleet directory'
}

function deleteActiveGroup() {
  if (!auth.requireLogin()) return
  if (!activeGroup.value) return
  const filterId = `group:${activeGroup.value.id}`
  vesselGroups.value = vesselGroups.value.filter((group) => group.id !== activeGroup.value.id)
  activeVesselFilters.value = activeVesselFilters.value.filter((filter) => filter !== filterId)
  editingGroupId.value = null
  saveVesselGroups()
}

function toggleVesselInActiveGroup(mmsi) {
  if (!auth.requireLogin()) return
  if (!activeGroup.value) return
  const normalizedMmsi = String(mmsi)
  const current = activeGroup.value.mmsis
  activeGroup.value.mmsis = current.includes(normalizedMmsi)
    ? current.filter((value) => value !== normalizedMmsi)
    : [...current, normalizedMmsi]
  saveVesselGroups()
  applyVesselGroupFilter()
}

function addManualMmsi() {
  if (!auth.requireLogin()) return
  const mmsi = manualMmsi.value.trim()
  if (!activeGroup.value || !/^\d{9}$/.test(mmsi)) return
  if (!activeGroup.value.mmsis.includes(mmsi)) activeGroup.value.mmsis.push(mmsi)
  manualMmsi.value = ''
  saveVesselGroups()
  applyVesselGroupFilter()
}

function applyVesselGroupFilter() {
  aisController?.setOperatorAssignments(operatorAssignments.value)
  if (activeVesselFilters.value.includes('all')) {
    aisController?.setVisibleMmsis(null)
    return
  }

  const visibleMmsis = new Set()
  if (activeVesselFilters.value.includes('company')) companyMmsis.value.forEach((mmsi) => visibleMmsis.add(mmsi))
  if (activeVesselFilters.value.includes('nt')) ntMmsis.value.forEach((mmsi) => visibleMmsis.add(mmsi))
  if (activeVesselFilters.value.includes('police')) policeMmsis.value.forEach((mmsi) => visibleMmsis.add(mmsi))
  for (const group of operatorGroups.value) {
    if (activeVesselFilters.value.includes(group.id)) group.mmsis.forEach((mmsi) => visibleMmsis.add(mmsi))
  }
  for (const filter of activeVesselFilters.value) {
    if (!filter.startsWith('group:')) continue
    const group = vesselGroups.value.find((candidate) => candidate.id === filter.slice(6))
    group?.mmsis.forEach((mmsi) => visibleMmsis.add(mmsi))
  }
  aisController?.setVisibleMmsis(visibleMmsis)
}

function toggleVesselFilter(filter) {
  if (filter === 'all') {
    activeVesselFilters.value = activeVesselFilters.value.includes('all') ? [] : ['all']
    return
  }

  const withoutAll = activeVesselFilters.value.filter((value) => value !== 'all')
  activeVesselFilters.value = withoutAll.includes(filter)
    ? withoutAll.filter((value) => value !== filter)
    : [...withoutAll, filter]
}

function setRouteMode(mode) {
  routePlannerOpen.value = true
  routeMode.value = routeMode.value === mode ? null : mode
  if (routeMode.value) routeMessage.value = routeMode.value === 'waypoint'
    ? 'Klik op de kaart om het nieuwe eindpunt toe te voegen.'
    : `Klik op de kaart om het ${routeMode.value === 'start' ? 'startpunt' : 'eindpunt'} te kiezen.`
}

function finishMobileMapInteraction() {
  if (customRouteDrawing.value) {
    customRouteDrawing.value = false
    customRouteStatus.value = customRouteDraft.value.length >= 2
      ? 'Drawing finished. Check the line and save it from the menu.'
      : 'Add at least two points before saving the sailing line.'
    return
  }
  if (routeLinkMapMode.value) {
    routeLinkMapMode.value = false
    routeLinkMapStatus.value = 'Editing sailing-line links finished.'
    refreshRouteLinkMapLayer()
  }
}

function cancelMobileMapInteraction() {
  if (reportingPassagePick.value) { reportingPassagePick.value = null; routeLinkMapStatus.value = 'Kaartselectie geannuleerd. Sla je wijzigingen op als je klaar bent.' }
  if (routeMode.value) {
    routeMode.value = null
    routeMessage.value = 'Map selection cancelled.'
  }
  if (mapObjectPlacement.value) mapObjectPlacement.value = false
  if (customReportingPlacement.value) {
    customReportingPlacement.value = false
    customReportingStatus.value = 'Placement cancelled.'
  }
  if (customRouteDrawing.value) cancelCustomRouteDrawing()
  if (routeLinkPendingItem.value?.networkPick) {
    routeLinkPendingItem.value = null
    clearRouteLinkDragMarker()
    routeLinkMapStatus.value = 'Sailing-line selection cancelled.'
  }
  if (routeLinkMapMode.value) {
    routeLinkMapMode.value = false
    refreshRouteLinkMapLayer()
  }
}

function loadCustomRouteLines() {
  if (!auth.user) return []
  try {
    const lines = JSON.parse(localStorage.getItem('custom-routing-lines-v1') || '[]')
    return Array.isArray(lines) ? lines.filter((line) => line?.id && Array.isArray(line.coordinates) && line.coordinates.length >= 2) : []
  } catch {
    return []
  }
}

function loadCustomReportingPoints() {
  if (!auth.user) return []
  try {
    const points = JSON.parse(localStorage.getItem('custom-reporting-points-v1') || '[]')
    return Array.isArray(points) ? points.filter((point) => point?.id && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))) : []
  } catch {
    return []
  }
}

function saveCustomReportingPoints() {
  localStorage.setItem('custom-reporting-points-v1', JSON.stringify(customReportingPoints.value))
}

function customReportingFeatures() {
  return customReportingPoints.value.map((point) => ({
    type: 'Feature',
    properties: {
      number: point.number || point.id,
      name: point.name || 'Eigen marifoonpunt',
      locationName: point.name || 'Eigen marifoonpunt',
      call: point.call || '', bearing: Number(point.bearing) || 0,
      instruction: point.call || '', obligation: 'Eigen toegevoegd meldpunt', source: 'Eigen kaart', customReportingPointId: point.id,
    },
    geometry: { type: 'Point', coordinates: [Number(point.longitude), Number(point.latitude)] },
  }))
}

function drawCustomReportingPoints() {
  customReportingLayer?.remove()
  customReportingLayer = null
  if (!map) return
  const markers = customReportingFeatures().map((feature) => {
    const point = feature.properties
    const [longitude, latitude] = feature.geometry.coordinates
    return L.marker([latitude, longitude], {
      pane: 'navigation-pane', zIndexOffset: 700,
      icon: L.divIcon({ className: '', html: '<div style="display:flex;height:38px;width:38px;align-items:center;justify-content:center;border-radius:999px;background:#e11d48;border:3px solid white;color:white;font-size:10px;font-weight:900;box-shadow:0 8px 20px rgb(0 0 0/.35)">VHF</div>', iconSize: [38, 38], iconAnchor: [19, 19] }),
    }).bindTooltip(`${escapeHtml(point.number)} · ${escapeHtml(point.name)}`, { direction: 'top' }).bindPopup(`<div class="reporting-popup__content"><div class="reporting-popup__eyebrow">Eigen marifoonpunt</div><strong class="reporting-popup__title">${escapeHtml(point.name)}</strong><p>${escapeHtml(point.call)}</p>${routeLinkPopupHtml('reporting', point, { latitude, longitude })}</div>`, { maxWidth: 380 })
  })
  customReportingLayer = L.layerGroup(markers).addTo(map)
}

function toggleCustomReportingPlacement() {
  if (customReportingPlacement.value) {
    customReportingPlacement.value = false
    customReportingStatus.value = ''
    return
  }
  if (!customReportingDraft.value.number.trim()) {
    customReportingStatus.value = 'Vul eerst een uniek nummer in.'
    return
  }
  if (customReportingPoints.value.some((point) => String(point.number).toLowerCase() === customReportingDraft.value.number.trim().toLowerCase())) {
    customReportingStatus.value = 'Dit nummer bestaat al. Kies een uniek nummer.'
    return
  }
  customReportingPlacement.value = true
  customRouteDrawing.value = false
  routeMode.value = null
  customReportingStatus.value = 'Klik nu op de vaste locatie van het marifoonpunt.'
}

function placeCustomReportingPoint(latlng) {
  if (!auth.requireLogin()) return
  const draft = customReportingDraft.value
  const point = {
    id: createLocalId(), number: draft.number.trim(), name: draft.name.trim() || `Marifoonpunt ${draft.number.trim()}`,
    call: draft.call.trim(), bearing: Number(draft.bearing) || 0,
    latitude: latlng.lat, longitude: latlng.lng,
  }
  customReportingPoints.value = [...customReportingPoints.value, point]
  saveCustomReportingPoints()
  drawCustomReportingPoints()
  customReportingPlacement.value = false
  customReportingDraft.value = { number: '', name: '', call: '', bearing: 0 }
  customReportingStatus.value = `${point.number} · ${point.name} is geplaatst. Klik het punt om het aan een blauwe vaarlijn te koppelen.`
  if (routeResult.value) updateRouteReportingItems(routeResult.value)
}

function deleteCustomReportingPoint(id) {
  if (!auth.requireLogin()) return
  const point = customReportingPoints.value.find((candidate) => candidate.id === id)
  if (!point) return
  customReportingPoints.value = customReportingPoints.value.filter((candidate) => candidate.id !== id)
  saveCustomReportingPoints()
  applyRouteLinkOverride('reporting', normalizeRouteLinkId(point.number || point.id), null)
  rebuildCanalRouteNetwork()
  drawCustomRouteLines()
  drawCustomReportingPoints()
  customReportingStatus.value = `${point.number} · ${point.name} is verwijderd.`
  if (routeResult.value) updateRouteReportingItems(routeResult.value)
}

function saveCustomRouteLines() {
  localStorage.setItem('custom-routing-lines-v1', JSON.stringify(customRouteLines.value))
}

function customRoutingGeoJson() {
  const pointConnections = [
    ['bridge', 'bridges', 'Brug'],
    ['reporting', 'reporting', 'Marifoonpunt'],
  ].flatMap(([kind, bucket, label]) => Object.entries(routeLinkOverrides.value[bucket] || {}).flatMap(([id, override]) => bridgeNetworkPositions(override).flatMap((position) => {
      const coordinates = [
        [Number(position?.sourceLongitude), Number(position?.sourceLatitude)],
        [Number(position?.longitude), Number(position?.latitude)],
      ]
      if (!coordinates.every((coordinate) => coordinate.every(Number.isFinite))) return []
      return [{
        type: 'Feature',
        properties: { name: `${label} ${id} verbinding`, waterway: 'canal', maxspeed: '6', source: `${kind}-network-connection`, linkedPointId: id },
        geometry: { type: 'LineString', coordinates },
      }]
    })))
  return {
    type: 'FeatureCollection',
    features: [...customRouteLines.value.filter((line) => line.connected !== false).map((line) => ({
      type: 'Feature',
      properties: {
        name: line.name, waterway: 'canal', maxspeed: String(line.maxSpeed || 12),
        navigationZone: line.zone3 === false ? null : 'zone3', oneway: line.direction === 'both' ? 'no' : 'yes',
        routeCostMultiplier: line.type === 'crossing' ? 1.2 : line.type === 'connector' ? 1.1 : 1,
        corridorType: line.type || 'corridor', source: 'user-drawn-routing-line', customRouteLineId: line.id,
      },
      geometry: { type: 'LineString', coordinates: (line.direction === 'reverse' ? [...line.coordinates].reverse() : line.coordinates).map((point) => [point.longitude, point.latitude]) },
    })), ...pointConnections],
  }
}

function rebuildCanalRouteNetwork() {
  if (!canalsGeoJson) return
  canalRouteNetwork = buildCanalRoutingNetwork({
    type: 'FeatureCollection',
    features: [...(canalsGeoJson.features || []), ...customRoutingGeoJson().features],
  }, { respectRestrictions: true })
  applyBridgeClearances(canalRouteNetwork, bridgeFeatures, routeLinkOverrides.value.bridges)
}

function drawCustomRouteLines() {
  if (!map) return
  customRouteLayer?.remove()
  const drawnLines = customRouteLines.value.map((line) => L.polyline(
    line.coordinates.map((point) => [point.latitude, point.longitude]),
    { pane: 'navigation-pane', color: line.connected === false ? '#ef4444' : '#0284c7', weight: line.type === 'corridor' ? 8 : 6, opacity: 0.9, dashArray: line.type === 'crossing' ? '10 8' : null, lineCap: 'round', lineJoin: 'round' },
  ).bindTooltip(`${escapeHtml(line.name)} · ${customRouteTypeLabel(line.type)} · ${line.direction === 'both' ? 'twee richtingen' : 'eenrichting'} · max ${line.maxSpeed || 12} km/u`))
  for (const [kind, bucket, label, color] of [['bridge', 'bridges', 'Brug', '#0ea5e9'], ['reporting', 'reporting', 'Marifoonpunt', '#e11d48']]) {
    for (const [id, override] of Object.entries(routeLinkOverrides.value[bucket] || {})) {
      for (const position of bridgeNetworkPositions(override)) {
      if (![position?.sourceLatitude, position?.sourceLongitude, position?.latitude, position?.longitude].every((value) => Number.isFinite(Number(value)))) continue
      drawnLines.push(L.polyline([
        [position.sourceLatitude, position.sourceLongitude],
        [position.latitude, position.longitude],
      ], { pane: 'navigation-pane', color, weight: 5, opacity: 0.9, dashArray: '6 6', lineCap: 'round' }).bindTooltip(`${label} ${escapeHtml(id)} · gekoppeld aan ${escapeHtml(position.lineName || 'vaarlijn')}`))
      }
    }
  }
  customRouteLayer = L.layerGroup(drawnLines).addTo(map)
}

function drawCustomRouteDraft() {
  customRouteDraftLayer?.remove()
  customRouteDraftLayer = null
  if (!map || !customRouteDraft.value.length) return
  const layers = customRouteDraft.value.map((point) => L.circleMarker([point.latitude, point.longitude], {
    pane: 'navigation-pane', radius: 5, color: '#fff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1,
  }))
  if (customRouteDraft.value.length > 1) {
    const endpointsConnected = Boolean(nearestCustomRouteEndpoint(customRouteDraft.value[0]) && nearestCustomRouteEndpoint(customRouteDraft.value.at(-1)))
    layers.unshift(L.polyline(customRouteDraft.value.map((point) => [point.latitude, point.longitude]), {
    pane: 'navigation-pane', color: endpointsConnected ? '#22c55e' : '#ef4444', weight: 8, opacity: 0.9, dashArray: '10 8', lineCap: 'round', lineJoin: 'round',
  }))
  }
  customRouteDraftLayer = L.layerGroup(layers).addTo(map)
}

function toggleCustomRouteDrawing() {
  if (customRouteDrawing.value) cancelCustomRouteDrawing()
  else {
    customRouteDrawing.value = true
    customRouteDraft.value = []
    routeMode.value = null
    customRouteStatus.value = 'Klik de punten van de nieuwe vaarverbinding op de kaart.'
  }
}

function cancelCustomRouteDrawing() {
  customRouteDrawing.value = false
  customRouteDraft.value = []
  customRouteDraftLayer?.remove()
  customRouteDraftLayer = null
  customRouteStatus.value = ''
}

function undoCustomRoutePoint() {
  customRouteDraft.value = customRouteDraft.value.slice(0, -1)
  drawCustomRouteDraft()
}

function saveCustomRouteLine() {
  if (!auth.requireLogin()) return
  if (customRouteDraft.value.length < 2) return
  const name = customRouteLineName.value || `Eigen vaarlijn ${customRouteLines.value.length + 1}`
  const coordinates = customRouteDraft.value.map((point) => ({ ...point }))
  const firstConnection = nearestCustomRouteEndpoint(coordinates[0])
  const lastConnection = nearestCustomRouteEndpoint(coordinates.at(-1))
  if (!firstConnection || !lastConnection) {
    customRouteStatus.value = 'De lijn is rood: begin en einde moeten binnen 80 meter van bestaand blauw vaarwater liggen.'
    return
  }
  coordinates[0] = firstConnection.point
  coordinates[coordinates.length - 1] = lastConnection.point
  const line = {
    id: createLocalId(), name, coordinates, connected: true,
    type: customRouteLineType.value, direction: customRouteLineDirection.value,
    maxSpeed: Math.max(1, Number(customRouteLineSpeed.value) || 12), zone3: customRouteLineZone3.value,
  }
  customRouteLines.value = [...customRouteLines.value, line]
  saveCustomRouteLines()
  rebuildCanalRouteNetwork()
  drawCustomRouteLines()
  customRouteLineName.value = ''
  customRouteDrawing.value = false
  customRouteDraft.value = []
  customRouteDraftLayer?.remove()
  customRouteDraftLayer = null
  customRouteStatus.value = `"${name}" is groen, aan beide uiteinden verbonden en toegevoegd aan het routeringsnetwerk.`
  if (routePoints.value.length >= 2) updatePlannedRoute()
}

function nearestCustomRouteEndpoint(point, maxDistanceMeters = 80) {
  if (!canalRouteNetwork?.nodes?.size) return null
  let nearest = null
  let nearestDistance = Infinity
  for (const node of canalRouteNetwork.nodes.values()) {
    const distance = map?.distance([point.latitude, point.longitude], [node.lat, node.lng]) ?? Infinity
    if (distance < nearestDistance) {
      nearest = node
      nearestDistance = distance
    }
  }
  return nearest && nearestDistance <= maxDistanceMeters
    ? { point: { latitude: nearest.lat, longitude: nearest.lng }, distanceMeters: nearestDistance }
    : null
}

function customRouteTypeLabel(type) {
  if (type === 'crossing') return 'oversteek'
  if (type === 'connector') return 'havenverbinding'
  return 'corridor'
}

function deleteCustomRouteLine(id) {
  if (!auth.requireLogin()) return
  const line = customRouteLines.value.find((candidate) => candidate.id === id)
  if (!line) return
  customRouteLines.value = customRouteLines.value.filter((candidate) => candidate.id !== id)
  saveCustomRouteLines()
  rebuildCanalRouteNetwork()
  drawCustomRouteLines()
  customRouteStatus.value = `"${line.name}" verwijderd uit het routeringsnetwerk.`
  if (routePoints.value.length >= 2) updatePlannedRoute()
}

function handleRouteMapClick(event) {
  if (reportingPassagePick.value) { placeReportingPassageAnchor(event.latlng); return }
  if (mapObjectPlacement.value && mapObjectEditor.value) {
    mapObjectEditor.value.latitude = roundMapCoordinate(event.latlng.lat)
    mapObjectEditor.value.longitude = roundMapCoordinate(event.latlng.lng)
    mapObjectEditor.value.positionChanged = true
    mapObjectPlacement.value = false
    return
  }
  if (customReportingPlacement.value) {
    placeCustomReportingPoint(event.latlng)
    return
  }
  if (routeLinkPendingItem.value?.networkPick) {
    saveBridgeNetworkPosition(routeLinkPendingItem.value, { latitude: event.latlng.lat, longitude: event.latlng.lng })
    return
  }
  if (customRouteDrawing.value) {
    customRouteDraft.value = [...customRouteDraft.value, { latitude: event.latlng.lat, longitude: event.latlng.lng }]
    customRouteStatus.value = `${customRouteDraft.value.length} punt${customRouteDraft.value.length === 1 ? '' : 'en'} geplaatst.`
    drawCustomRouteDraft()
    return
  }
  if (!routeMode.value) return
  if (isInteractiveMapTarget(event.originalEvent?.target)) return
  placeActiveRoutePoint(event.latlng)
}

function handleRoutePlacementClick(event) {
  if (Date.now() - lastPointerPlacementAt < 600) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }
  const placementActive = reportingPassagePick.value || routeMode.value || mapObjectPlacement.value
    || customReportingPlacement.value || customRouteDrawing.value || routeLinkPendingItem.value?.networkPick
  if (!placementActive || event.button !== 0) return
  if (isInteractiveMapTarget(event.target)) return
  const latlng = map?.mouseEventToLatLng(event)
  if (!latlng) return
  event.preventDefault()
  event.stopImmediatePropagation()
  handleRouteMapClick({ latlng, originalEvent: event })
}

function handlePlacementPointerDown(event) {
  const placementActive = reportingPassagePick.value || routeMode.value || mapObjectPlacement.value
    || customReportingPlacement.value || customRouteDrawing.value || routeLinkPendingItem.value?.networkPick
  if (!placementActive || event.isPrimary === false || isInteractiveMapTarget(event.target)) {
    placementPointerStart = null
    return
  }
  placementPointerStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now() }
}

function handlePlacementPointerUp(event) {
  const start = placementPointerStart
  placementPointerStart = null
  if (!start || start.pointerId !== event.pointerId || isInteractiveMapTarget(event.target)) return
  const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
  if (distance > 12 || Date.now() - start.at > 900) return
  const latlng = map?.mouseEventToLatLng(event)
  if (!latlng) return
  lastPointerPlacementAt = Date.now()
  handleRouteMapClick({ latlng, originalEvent: event })
}

function isInteractiveMapTarget(target) {
  const controls = '.leaflet-control, .leaflet-popup, button, input, select, textarea, a'
  // While choosing a route point, map symbols are valid positions too.
  // Existing route markers retain their drag/edit interaction.
  const markers = routeMode.value ? '.leaflet-route-point-pane' : '.leaflet-tooltip, .leaflet-marker-icon'
  return Boolean(target?.closest?.(`${controls}, ${markers}`))
}

function placeActiveRoutePoint(latlng) {
  if (!routeMode.value) return
  const point = { latitude: latlng.lat, longitude: latlng.lng }
  setRoutePoint(routeMode.value, point)
  routeMode.value = !routePoints.value.some(point => point.role === 'start') ? 'start'
    : !routePoints.value.some(point => point.role === 'end') ? 'end' : null
  updatePlannedRoute()
}

function updatePlannedRoute({ redrawMarkers = true } = {}) {
  if (!map || !canalRouteNetwork) return
  if (redrawMarkers) drawRouteMarkers()
  if (routePoints.value.length < 2) {
    routeResult.value = null
    setRouteBridgeResult(null)
    setRouteReportingResult(null)
    routeMessage.value = routePoints.value.length ? 'Kies nog minimaal één extra routepunt.' : 'Zoek een adres of klik start/eind op de kaart.'
    drawPlannedRoute(null)
    return
  }
  if ((routeBoatProfileForPlanner()?.heightMeters || routeBoatProfileForPlanner()?.widthMeters) && bridgeClearanceStatus.value !== 'ready') {
    routeResult.value = null
    setRouteBridgeResult(null)
    setRouteReportingResult(null)
    drawPlannedRoute(null)
    routeMessage.value = bridgeClearanceStatus.value === 'error'
      ? 'Brugmaten zijn niet beschikbaar. Een route voor deze bootmaten kan niet veilig worden berekend.'
      : 'Brugmaten worden geladen. De route wordt daarna berekend.'
    return
  }
  const result = planCanalRouteVia(routePoints.value, canalRouteNetwork, routePlannerOptions())
  routeResult.value = result
  updateRouteBridgeItems(result)
  updateRouteReportingItems(result)
  drawPlannedRoute(result)
  const furthestSnap = Math.max(0, ...(result.snapped || []).map((point) => Number(point.snapDistanceMeters) || 0))
  routeMessage.value = result.status === 'partial'
    ? result.message
    : result.status === 'ok'
    ? `Route gevonden.${furthestSnap > 15 ? ` Gekozen punt sluit na ${formatRouteDistance(furthestSnap)} aan op het dichtstbijzijnde vaarwater.` : ''} ETA gebruikt de ingestelde snelheid en bekende snelheidslimieten.`
    : result.message
}

function generateRandomLoopRoute() {
  if (!map || !canalRouteNetwork) return
  if ((routeBoatProfileForPlanner()?.heightMeters || routeBoatProfileForPlanner()?.widthMeters) && bridgeClearanceStatus.value !== 'ready') {
    routeResult.value = null
    drawPlannedRoute(null)
    routeMessage.value = bridgeClearanceStatus.value === 'error'
      ? 'Brugmaten zijn niet beschikbaar. Een rondje voor deze bootmaten kan niet veilig worden berekend.'
      : 'Brugmaten worden geladen. Probeer het rondje daarna opnieuw.'
    return
  }
  const start = routePoints.value.find((point) => point.role === 'start') || routePoints.value[0]
  if (!start) {
    routeMessage.value = 'Kies eerst een startpunt, gebruik “Start mijn locatie”, of klik start op de kaart.'
    routePlannerOpen.value = true
    return
  }
  const result = generateCanalLoopRoute(start, canalRouteNetwork, {
    targetMinutes: routeLoopMinutes.value,
    ...routePlannerOptions(),
  })
  routeResult.value = result
  updateRouteBridgeItems(result)
  updateRouteReportingItems(result)
  routeMode.value = null
  routePoints.value = [{ ...start, role: 'start', name: start.name || 'Start rondje' }]
  drawRouteMarkers()
  drawPlannedRoute(result)
  routeMessage.value = result.status === 'ok'
    ? `Rondje van ${result.durationMinutes} min gevonden${result.durationMinutes < routeLoopMinutes.value - 10 ? `; een langer passend rondje voor ${routeLoopMinutes.value} min is hier niet gevonden.` : ` (gevraagd: ${routeLoopMinutes.value} min).`}`
    : result.message
}

function refreshRouteAfterSettingsChange() {
  if (routeResult.value?.routeType === 'loop') generateRandomLoopRoute()
  else updatePlannedRoute()
}

function routePlannerOptions() {
  return {
    snapDistanceMeters: Infinity,
    speedKmh: routeSpeedKmh.value,
    boatProfile: routeBoatProfileForPlanner(),
    allowZone3: routeAllowZone3.value,
    avoidVirtualEdges: routeAvoidVirtualEdges.value,
    closurePoints: routeClosurePoints.value,
  }
}

function applyRouteClosureData(data) {
  data = closureSnapshot(data)
  routeClosureData.value = data
  routeClosurePoints.value = activeClosurePoints(data.features)
  if (activeNavigationLayers.value.includes('closures')) {
    navigationLayerControllers.get('closures')?.remove()
    const layer = createNavigationLayer('closures', data, canalsGeoJson, {
      adminObjectHtml: feature => mapAdminObjectHtml('closures', feature),
    })
    navigationLayerControllers.set('closures', layer)
    layer.addTo(map)
    navigationLayerCounts.value = { ...navigationLayerCounts.value, closures: closureSummary.value.total }
  }
}

async function loadRouteClosures() {
  if (routeClosureLoad) return routeClosureLoad
  routeClosureLoading.value = true
  routeClosureLoad = (async () => {
    try {
      const data = await loadNavigationLayer('closures')
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Ongeldige stremmingengegevens.')
      applyRouteClosureData(data)
      routeClosureError.value = data.stale
        ? 'Bron tijdelijk niet bereikbaar. Laatst bekende stremmingen worden gebruikt.'
        : data.partial ? 'Enkele officiële berichten konden niet worden geladen; de overige informatie is actueel.' : ''
    } catch {
      if (routeClosureData.value) applyRouteClosureData({ ...routeClosureData.value, stale: true })
      routeClosureError.value = routeClosureData.value
        ? 'Vernieuwen mislukt. Laatst bekende stremmingen worden gebruikt.'
        : 'Stremmingen niet beschikbaar. Deze route is niet op actuele stremmingen gecontroleerd.'
    } finally {
      routeClosureLoading.value = false
      routeClosureLoad = null
      if (routePoints.value.length >= 2 && map) refreshRouteAfterSettingsChange()
    }
  })()
  return routeClosureLoad
}

function drawRouteMarkers() {
  if (!map) return
  for (const marker of routeMarkers) marker.remove()
  routeMarkers = routePoints.value.map((point, index) => createRouteMarker(point, index).addTo(map))
  bringRouteMarkersToFront()
}

function bringRouteMarkersToFront() {
  for (const marker of routeMarkers) marker.setZIndexOffset?.(2400).bringToFront?.()
}

function drawPlannedRoute(result) {
  if (!map) return
  if (routeLayer) routeLayer.remove()
  routeLayer = null
  if (!['ok', 'partial'].includes(result?.status) || !result.coordinates?.length) {
    clearRouteLinkMapLayer()
    routeLinkMapMode.value = false
    routeLinkMapStatus.value = ''
    routeLinkPendingItem.value = null
    selectedRouteLinkItem.value = null
    clearRouteLinkDragMarker()
    return
  }
  const shadow = L.polyline(result.coordinates, {
    pane: 'navigation-pane',
    color: '#020617',
    weight: 19,
    opacity: 0.72,
    lineCap: 'round',
    lineJoin: 'round',
  })
  const halo = L.polyline(result.coordinates, {
    pane: 'navigation-pane',
    color: '#ffffff',
    weight: 14,
    opacity: 0.96,
    lineCap: 'round',
    lineJoin: 'round',
  })
  const line = L.polyline(result.coordinates, {
    pane: 'navigation-pane',
    color: '#0284c7',
    weight: 9,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
  })
  const center = L.polyline(result.coordinates, {
    pane: 'navigation-pane',
    color: '#fef08a',
    weight: 3,
    opacity: 0.95,
    dashArray: '12 14',
    lineCap: 'round',
  })
  const arrows = L.polylineDecorator(line, {
    patterns: [{ offset: '5%', repeat: '78px', symbol: L.Symbol.arrowHead({ pixelSize: 18, polygon: true, pathOptions: { pane: 'navigation-pane', color: '#082f49', fillColor: '#fef08a', fillOpacity: 1, weight: 2 } }) }],
  })
  const layers = [shadow, halo, line, center, arrows]
  for (const [index, snappedPoint] of (result.snapped || []).entries()) {
    const selectedPoint = routePoints.value[index]
    if (!selectedPoint || Number(snappedPoint.snapDistanceMeters) <= 5) continue
    layers.push(L.polyline([
      [selectedPoint.latitude, selectedPoint.longitude],
      [snappedPoint.latitude, snappedPoint.longitude],
    ], { pane: 'navigation-pane', color: '#f59e0b', weight: 4, opacity: 0.9, dashArray: '5 7', lineCap: 'round', interactive: false }))
  }
  if (routeLinkPendingItem.value) {
    for (const segment of routeSegmentsForResult(result)) {
      layers.push(L.polyline([segment.start, segment.end], {
        pane: 'navigation-pane',
        color: '#fbbf24',
        weight: 22,
        opacity: 0.22,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true,
      })
        .bindTooltip(escapeHtml(segment.name || 'Routesegment'), { sticky: true })
        .on('click', handleRouteLinkLineClick))
    }
  }
  if (result.status === 'partial' && result.partialRoute?.target && result.partialRoute?.reached) {
    layers.push(L.polyline([
      [result.partialRoute.reached.latitude, result.partialRoute.reached.longitude],
      [result.partialRoute.target.latitude, result.partialRoute.target.longitude],
    ], { pane: 'navigation-pane', color: '#f97316', weight: 7, opacity: 0.95, dashArray: '8 10', lineCap: 'round' }))
  }
  routeLayer = L.layerGroup(layers).addTo(map)
  routeLayer.eachLayer((layer) => layer.bringToFront?.())
  bringRouteMarkersToFront()
  refreshRouteLinkMapLayer()
}

function createRouteMarker(point, index) {
  const isStart = point.role === 'start'
  const isEnd = point.role === 'end'
  const label = String(index + 1)
  const color = isStart ? '#22c55e' : isEnd ? '#ef4444' : '#06b6d4'
  return L.marker([point.latitude, point.longitude], {
    pane: 'route-point-pane',
    draggable: true,
    zIndexOffset: 2400,
    icon: L.divIcon({
      className: '',
      html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:${color};border:2px solid white;color:white;font-weight:900;box-shadow:0 8px 20px rgb(0 0 0 / .35)">${label}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    }),
  }).on('dragend', (event) => {
    const latlng = event.target.getLatLng()
    routePoints.value[index] = { ...routePoints.value[index], latitude: latlng.lat, longitude: latlng.lng, name: null }
    updatePlannedRoute()
  })
}

function clearPlannedRoute() {
  routePoints.value = []
  routeResult.value = null
  setRouteBridgeResult(null)
  setRouteReportingResult(null)
  routeMode.value = null
  routeMessage.value = 'Klik op de kaart om een startpunt en eindpunt op het water te kiezen.'
  if (routeLayer) routeLayer.remove()
  clearRouteLinkMapLayer()
  routeLinkMapMode.value = false
  routeLinkMapStatus.value = ''
  routeLinkPendingItem.value = null
  clearRouteLinkDragMarker()
  for (const marker of routeMarkers) marker.remove()
  routeLayer = null
  routeMarkers = []
}

function swapRoutePoints() {
  routePoints.value = [...routePoints.value].reverse()
  updatePlannedRoute()
}

async function fitPlannedRoute() {
  if (!map || !routeResult.value?.coordinates?.length) return
  mobileSheetExpanded.value = false
  if (isMobileViewport.value) document.activeElement?.blur?.()
  await nextTick()
  requestAnimationFrame(() => fitRouteInVisibleMap())
  mobileRouteFitUntil = Date.now() + 900
}
function fitRouteInVisibleMap() {
  if (!map || !routeResult.value?.coordinates?.length) return
  let padding = { padding: [40, 40] }
  if (isMobileViewport.value) {
    const v = mobileViewport.value
    const element = mobileSheet.value?.element
    padding = mobileRoutePadding(map.getContainer().getBoundingClientRect(), { top: v.top, left: v.left, right: v.left + v.width, bottom: v.top + v.height }, {
      toolbar: document.querySelector('.mobile-map-search-bar')?.getBoundingClientRect(),
      sheet: mobileSheetOpen.value && element ? element.getBoundingClientRect() : null,
      bottomSpace: v.keyboardOpen ? 0 : Math.max(16, map.getContainer().getBoundingClientRect().bottom - (document.querySelector('.mobile-nav-button')?.getBoundingClientRect().top ?? (window.innerHeight - 82))),
    })
  }
  map.fitBounds(L.latLngBounds(routeResult.value.coordinates), { ...padding, maxZoom: 17, animate: false })
}

function setRouteBridgeResult(items, { loading = false, error = '' } = {}) {
  if (items === null) routeBridgeItems.value = []
  else if (Array.isArray(items)) routeBridgeItems.value = items
  routeBridgeLoading.value = loading
  routeBridgeError.value = error
  if (items === null) routeBridgeRequestId += 1
  if (items === null) clearRouteLinkMapLayer()
}

async function updateRouteBridgeItems(result) {
  const requestId = ++routeBridgeRequestId
  if (!['ok', 'partial'].includes(result?.status) || !result.coordinates?.length) {
    setRouteBridgeResult(null)
    return
  }
  routeBridgeLoading.value = true
  routeBridgeError.value = ''
  try {
    const data = await loadAmsterdamBridges()
    if (requestId !== routeBridgeRequestId) return
    routeBridgeItems.value = collectBridgesAlongRoute(data.features || [], result)
    refreshRouteLinkMapLayer()
  } catch {
    if (requestId !== routeBridgeRequestId) return
    routeBridgeItems.value = []
    routeBridgeError.value = 'Bruggen laden faalde.'
  } finally {
    if (requestId === routeBridgeRequestId) routeBridgeLoading.value = false
  }
}

function setRouteReportingResult(items, { loading = false, error = '' } = {}) {
  if (items === null) routeReportingItems.value = []
  else if (Array.isArray(items)) routeReportingItems.value = items
  routeReportingLoading.value = loading
  routeReportingError.value = error
  if (items === null) routeReportingRequestId += 1
}

async function updateRouteReportingItems(result) {
  const requestId = ++routeReportingRequestId
  if (!['ok', 'partial'].includes(result?.status) || !result.coordinates?.length) {
    setRouteReportingResult(null)
    return
  }
  routeReportingLoading.value = true
  routeReportingError.value = ''
  try {
    const data = await loadNavigationLayer('reporting-points')
    if (requestId !== routeReportingRequestId) return
    routeReportingItems.value = collectReportingPointsAlongRoute([...(data.features || []), ...customReportingFeatures()], result)
    refreshRouteLinkMapLayer()
  } catch {
    if (requestId !== routeReportingRequestId) return
    routeReportingItems.value = []
    routeReportingError.value = 'Meldpunten laden faalde.'
  } finally {
    if (requestId === routeReportingRequestId) routeReportingLoading.value = false
  }
}

async function exportPlannedRoute(format = 'html') {
  if (!['ok', 'partial'].includes(routeResult.value?.status) || !routeResult.value?.coordinates?.length) return
  const pdfWindow = format === 'pdf' ? window.open('', '_blank') : null
  if (format === 'pdf' && !pdfWindow) {
    routeExportError.value = 'PDF-venster werd geblokkeerd door de browser.'
    return
  }
  routeExportLoading.value = true
  routeExportError.value = ''
  try {
    const exportData = await buildRouteExportData(routeResult.value)
    const html = routeExportHtml(exportData)
    if (format === 'pdf') {
      pdfWindow.document.open()
      pdfWindow.document.write(html)
      pdfWindow.document.close()
      prepareRouteExportPrintWindow(pdfWindow)
    } else {
      downloadRouteExport(html, routeExportFilename())
    }
  } catch (error) {
    routeExportError.value = error?.message || 'Route exporteren faalde.'
    if (format === 'pdf') pdfWindow?.close()
  } finally {
    routeExportLoading.value = false
  }
}

async function sharePlannedRoute() {
  if (!canSaveCurrentRoute.value || routeShareLoading.value) return
  routeShareLoading.value = true
  routeShareMessage.value = ''
  routeShareUrl.value = ''
  try {
    const response = await fetch('/api/shared-routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route: currentRouteSnapshot(defaultSavedRouteName()) }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Route delen faalde.')
    routeShareUrl.value = new URL(data.url, window.location.origin).href
    const copied = await copyText(routeShareUrl.value)
    routeShareMessage.value = copied
      ? 'Deellink gekopieerd. Deze route blijft 7 dagen beschikbaar.'
      : 'Deellink gemaakt. Deze route blijft 7 dagen beschikbaar.'
  } catch (error) {
    routeShareMessage.value = error?.message || 'Route delen faalde.'
  } finally {
    routeShareLoading.value = false
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function currentRouteSnapshot(name) {
  return {
    name,
    savedAt: new Date().toISOString(),
    routeType: routeResult.value?.routeType || 'manual',
    points: routePoints.value.map((point) => ({
      role: point.role,
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      name: point.name || null,
    })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
    result: savedRouteResultSnapshot(routeResult.value),
    settings: {
      speedValue: routeSpeedValue.value,
      speedUnit: 'kmh',
      loopMinutes: routeLoopMinutes.value,
      allowZone3: routeAllowZone3.value,
      avoidVirtualEdges: routeAvoidVirtualEdges.value,
      boatProfile: { ...routeBoatProfile.value },
      addressInputs: { ...routeAddressInputs.value },
    },
  }
}

function loadExampleRouteFromUrl() {
  const example = exampleRouteFromSearch(window.location.search)
  if (!example) return
  routePoints.value = example.points.map((point) => ({ ...point, id: createLocalId() }))
  routeAvoidVirtualEdges.value = example.avoidVirtualEdges
  routePlannerOpen.value = true
  routeMode.value = null
  routeSaveName.value = example.name
  // Preserve the user's dimensions and speed; never substitute the sample boat.
  updatePlannedRoute()
  fitPlannedRoute()
}

async function loadSharedRouteFromUrl() {
  const token = new URLSearchParams(window.location.search).get('route')
  if (!token || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) return
  try {
    const response = await fetch(`/api/shared-routes/${encodeURIComponent(token)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Gedeelde route laden faalde.')
    loadSavedRoute(data.route)
    routeShareMessage.value = `Gedeelde route geladen. Beschikbaar tot ${new Date(data.expiresAt).toLocaleString('nl-NL')}.`
  } catch (error) {
    routePlannerOpen.value = true
    routeShareMessage.value = error?.message || 'Gedeelde route laden faalde.'
  }
}

function prepareRouteExportPrintWindow(printWindow) {
  const triggerPrint = () => {
    if (printWindow.closed) return
    printWindow.focus()
    printWindow.print()
  }
  printWindow.document.getElementById('route-export-print')?.addEventListener('click', triggerPrint)
  const htmlImages = [...printWindow.document.images].filter((image) => !image.complete)
  const svgImages = [...printWindow.document.querySelectorAll('svg image')]
  const pendingImages = [...htmlImages, ...svgImages]
  let remaining = pendingImages.length
  let printed = false
  const printOnce = () => {
    if (printed) return
    printed = true
    window.setTimeout(() => {
      printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(triggerPrint))
    }, 500)
  }
  const imageFinished = () => {
    remaining -= 1
    if (remaining <= 0) printOnce()
  }
  pendingImages.forEach((image) => {
    image.addEventListener('load', imageFinished, { once: true })
    image.addEventListener('error', imageFinished, { once: true })
  })
  if (!pendingImages.length) printOnce()
  window.setTimeout(printOnce, 5000)
}

async function buildRouteExportData(result) {
  const [bridgeData, reportingData] = await Promise.all([
    loadAmsterdamBridges(),
    loadNavigationLayer('reporting-points'),
  ])
  const bridges = collectBridgesAlongRoute(bridgeData.features || [], result)
  const reportingPoints = collectReportingPointsAlongRoute([...(reportingData.features || []), ...customReportingFeatures()], result)
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      distance: formatRouteDistance(result.distanceMeters),
      duration: formatRouteDuration(result.durationMinutes),
      speed: formatRouteSpeed(result.speedKmh),
      status: result.status,
      from: routePointLabel(routePoints.value[0]),
      to: routePointLabel(routePoints.value[routePoints.value.length - 1]),
      zone3: routeAllowZone3.value,
    },
    warnings: result.warnings || [],
    coordinates: result.coordinates,
    backgroundWaterways: collectExportBackgroundWaterways(canalsGeoJson, result.coordinates),
    canals: (result.steps || []).map((step, index) => ({
      index: index + 1,
      name: step.name || 'Onbekende vaarweg',
      distance: formatRouteDistance(step.distanceMeters || 0),
      distanceMeters: step.distanceMeters || 0,
    })),
    bridges,
    reportingPoints,
  }
}

function collectExportBackgroundWaterways(geoJson, routeCoordinates) {
  if (!geoJson?.features?.length || !routeCoordinates?.length) return []
  const routeBox = expandedRouteBounds(routeCoordinates, 0.006)
  return geoJson.features
    .flatMap((feature) => waterwaysForExportFeature(feature, routeBox))
    .slice(0, 650)
}

function waterwaysForExportFeature(feature, routeBox) {
  const properties = feature.properties || {}
  if (!properties.waterway && properties.natural !== 'water') return []
  return geometryCoordinateLines(feature.geometry)
    .filter((line) => line.length >= 2 && lineIntersectsBounds(line, routeBox))
    .map((line) => ({
      name: properties.name || properties.waterway || '',
      coordinates: simplifyExportLine(line, 120).map(([longitude, latitude]) => [latitude, longitude]),
      isRouteWaterway: properties.boat !== 'no' && properties.motorboat !== 'no',
    }))
}

function expandedRouteBounds(coordinates, paddingDegrees) {
  const latitudes = coordinates.map(([latitude]) => latitude)
  const longitudes = coordinates.map(([, longitude]) => longitude)
  return {
    minLat: Math.min(...latitudes) - paddingDegrees,
    maxLat: Math.max(...latitudes) + paddingDegrees,
    minLng: Math.min(...longitudes) - paddingDegrees,
    maxLng: Math.max(...longitudes) + paddingDegrees,
  }
}

function lineIntersectsBounds(line, bounds) {
  return line.some(([longitude, latitude]) => latitude >= bounds.minLat && latitude <= bounds.maxLat && longitude >= bounds.minLng && longitude <= bounds.maxLng)
}

function geometryCoordinateLines(geometry) {
  if (!geometry) return []
  if (geometry.type === 'LineString') return [geometry.coordinates || []]
  if (geometry.type === 'MultiLineString') return geometry.coordinates || []
  if (geometry.type === 'Polygon') return geometry.coordinates || []
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).flat()
  if (geometry.type === 'GeometryCollection') return (geometry.geometries || []).flatMap(geometryCoordinateLines)
  return []
}

function simplifyExportLine(line, maxPoints) {
  if (line.length <= maxPoints) return line
  const step = Math.ceil(line.length / maxPoints)
  const simplified = line.filter((_, index) => index % step === 0)
  const last = line[line.length - 1]
  if (simplified[simplified.length - 1] !== last) simplified.push(last)
  return simplified
}

function collectReportingPointsAlongRoute(features, result) {
  return reportingPointsAlongRoute(features, result, routeLinkOverrides.value)
}

function collectBridgesAlongRoute(features, result) {
  const coordinates = result?.coordinates || []
  const segments = routeSegmentsForResult(result)
  return features
    .map((feature) => {
      const point = featureRoutePoint(feature, coordinates, 'bridge')
      if (!point) return null
      const properties = feature.properties || {}
      const override = bridgeOverrideForProperties(properties)
      const overrideRouteNames = routeLinkNamesFromOverride(override)
      const crossing = routeLinkPositionOverride('bridge', properties) ? null : bridgeRouteCrossing(feature.geometry, segments, properties.fisOpenings)
      const explicitRoutePosition = crossing || projectPointOnLinkedRouteSegment(point, segments, override)
      const candidateRouteNames = overrideRouteNames.length ? overrideRouteNames : [properties.route, properties.name].filter(Boolean)
      const hasNetworkBinding = bridgeNetworkPositions(override).length > 0
      if (hasNetworkBinding && !explicitRoutePosition) return null
      const routePosition = explicitRoutePosition || projectPointOnMatchingRouteSegment(point, segments, candidateRouteNames)
      if (!routePosition) return null
      const maxDistanceMeters = explicitRoutePosition ? 12 : overrideRouteNames.length ? 8 : 6
      if (routePosition.distanceMeters > maxDistanceMeters) return null
      return {
        ...bridgeExportItem(feature, point, override),
        ...(crossing?.sourceOpening ? { opening: crossing.sourceOpening.name, height: crossing.sourceOpening.heightMeters ? `${formatExportMeters(crossing.sourceOpening.heightMeters)} doorvaarthoogte (FIS)` : 'onbekend', width: formatExportMeters(crossing.sourceOpening.widthMeters) || 'onbekend' } : {}),
        routeMeters: routePosition.routeMeters,
        distanceToRouteMeters: Math.round(routePosition.distanceMeters),
        routeNames: candidateRouteNames,
        matchedRouteName: true,
        matchedRouteSegment: Boolean(explicitRoutePosition),
        matchedSegmentName: routePosition.segmentName,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.routeMeters - b.routeMeters || a.name.localeCompare(b.name))
}

function collectFeaturesAlongRoute(features, coordinates, maxDistanceMeters, mapper) {
  return features
    .map((feature) => {
      const point = featureRoutePoint(feature, coordinates)
      if (!point) return null
      const routePosition = projectPointOnRoute(point, coordinates)
      if (!routePosition || routePosition.distanceMeters > maxDistanceMeters) return null
      return { ...mapper(feature, point, routePosition), routeMeters: routePosition.routeMeters, distanceToRouteMeters: Math.round(routePosition.distanceMeters) }
    })
    .filter(Boolean)
    .sort((a, b) => a.routeMeters - b.routeMeters || a.name.localeCompare(b.name))
}

function routeSegmentsForResult(result) {
  if (Array.isArray(result?.segments) && result.segments.length) {
    return result.segments
      .map((segment) => ({
        name: segment.name || '',
        startMeters: Number(segment.startMeters) || 0,
        endMeters: Number(segment.endMeters) || 0,
        start: [Number(segment.start?.latitude), Number(segment.start?.longitude)],
        end: [Number(segment.end?.latitude), Number(segment.end?.longitude)],
      }))
      .filter((segment) => Number.isFinite(segment.start[0]) && Number.isFinite(segment.start[1]) && Number.isFinite(segment.end[0]) && Number.isFinite(segment.end[1]))
  }
  const coordinates = result?.coordinates || []
  const names = result?.steps || []
  if (!coordinates.length || !names.length) return []
  let routeMeters = 0
  return coordinates.slice(1).map((coordinate, index) => {
    const start = coordinates[index]
    const distance = routeDistanceMeters({ latitude: start[0], longitude: start[1] }, { latitude: coordinate[0], longitude: coordinate[1] })
    const segment = {
      name: routeStepNameAtMeters(result, routeMeters + distance / 2),
      startMeters: routeMeters,
      endMeters: routeMeters + distance,
      start,
      end: coordinate,
    }
    routeMeters += distance
    return segment
  })
}

function projectPointOnMatchingRouteSegment(point, segments, names) {
  const candidateNames = (names || []).map(normalizeRouteName).filter(Boolean)
  if (!candidateNames.length) return null
  let best = null
  for (const segment of segments || []) {
    const segmentName = normalizeRouteName(segment.name)
    if (!segmentName || !candidateNames.some((name) => routeNameTokensMatch(name, segmentName))) continue
    const projection = projectPointOnSegment(point, segment.start, segment.end)
    const routeMeters = (Number(segment.startMeters) || 0) + projection.segmentMeters * projection.t
    const candidate = { ...projection, routeMeters, segmentName: segment.name }
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate
  }
  return best
}

function projectPointOnLinkedRouteSegment(point, segments, override) {
  const positions = bridgeNetworkPositions(override)
  if (positions.length) {
    for (const networkPosition of positions) {
    if (!Number.isFinite(Number(networkPosition?.latitude)) || !Number.isFinite(Number(networkPosition?.longitude))) continue
    const linkedPoint = { latitude: Number(networkPosition.latitude), longitude: Number(networkPosition.longitude) }
    const linkedPosition = networkPosition.lineName
      ? projectPointOnMatchingRouteSegment(linkedPoint, segments, [networkPosition.lineName])
      : null
    if (linkedPosition && linkedPosition.distanceMeters <= 12) return linkedPosition
    }
    return null
  }
  const assignedSegments = override?.routeSegments || []
  const linkedKeys = new Set(assignedSegments.map((segment) => segment?.key).filter(Boolean))
  if (!linkedKeys.size) return null
  const assignedPoint = point
  let best = null
  for (const segment of segments || []) {
    if (!linkedKeys.has(routeSegmentKey(segment))) continue
    const projection = projectPointOnSegment(assignedPoint, segment.start, segment.end)
    const routeMeters = (Number(segment.startMeters) || 0) + projection.segmentMeters * projection.t
    const candidate = { ...projection, routeMeters, segmentName: segment.name, segment }
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate
  }
  return best
}

function projectPointOnRouteSegments(point, segments) {
  let best = null
  for (const segment of segments || []) {
    const projection = projectPointOnSegment(point, segment.start, segment.end)
    const routeMeters = (Number(segment.startMeters) || 0) + projection.segmentMeters * projection.t
    const candidate = { ...projection, routeMeters, segmentName: segment.name, segment }
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate
  }
  return best
}

function routeSegmentForRouteMeters(result, routeMeters) {
  return routeSegmentsForResult(result).find((segment) => routeMeters >= segment.startMeters && routeMeters <= segment.endMeters) || null
}

function routeSegmentKey(segment) {
  const name = normalizeRouteName(segment?.name)
  const start = Array.isArray(segment?.start) ? segment.start : []
  const end = Array.isArray(segment?.end) ? segment.end : []
  const coordinates = [start, end]
    .map(([latitude, longitude]) => `${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}`)
    .join('|')
  return `${name}|${coordinates}`
}

function routeNameSetForResult(result) {
  return new Set((result?.steps || []).map((step) => normalizeRouteName(step.name)).filter(Boolean))
}

function routeStepNameAtMeters(result, routeMeters) {
  const steps = (result?.steps || []).filter((step) => step.name)
  if (!steps.length) return ''
  let coveredMeters = 0
  for (const step of steps) {
    coveredMeters += Number(step.distanceMeters) || 0
    if (routeMeters <= coveredMeters) return step.name
  }
  return steps[steps.length - 1]?.name || ''
}

function routeNamesMatch(names, routeNames) {
  const candidates = (names || []).map(normalizeRouteName).filter(Boolean)
  for (const candidate of candidates) {
    for (const routeName of routeNames) {
      if (routeNameTokensMatch(candidate, routeName)) return true
    }
  }
  return false
}

function routeNameTokensMatch(candidate, routeName) {
  if (!candidate || !routeName) return false
  if (candidate === routeName) return true
  const ignored = new Set(['oude', 'nieuwe', 'groot', 'grote', 'klein', 'kleine', 'richting', 'naar', 'van', 'voor', 'bij', 'over', 'onder'])
  const candidateTokens = new Set(candidate.split(' ').filter((token) => token.length >= 4 && !ignored.has(token)))
  const routeTokens = routeName.split(' ').filter((token) => token.length >= 4 && !ignored.has(token))
  return routeTokens.some((token) => candidateTokens.has(token))
}

function bridgeOverrideForProperties(properties) {
  return routeLinkOverride('bridge', properties.number) || routeLinkOverride('bridge', properties.name)
}

function reportingOverrideForProperties(properties) {
  return routeLinkOverride('reporting', properties.number) || routeLinkOverride('reporting', properties.call)
}

function inferReportingRouteNames(properties) {
  return [
    ...(Array.isArray(properties.routeNames) ? properties.routeNames : []),
    ...parseRouteNames([properties.call, properties.locationName, properties.name].filter(Boolean).join(', ')),
  ]
}

function normalizeRouteName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(gracht|kanaal|vaart|dok|haven|sluis|brug|verbinding)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bridgeExportItem(feature, point, override = null) {
  const properties = feature.properties || {}
  return {
    name: override?.name || bridgeExportTitle(properties),
    number: properties.number || '',
    height: override?.height || bridgeExportHeight(properties),
    clearanceNap: formatExportMeters(properties.clearanceNap),
    clearanceAt4mNap: formatExportMeters(properties.clearanceAt4mNap),
    winterWaterLevelNap: formatExportMeters(properties.winterWaterLevelNap),
    width: formatExportMeters(properties.passageWidth ?? properties.fisPassageWidthMeters),
    type: properties.bridgeType || '',
    route: properties.route || '',
    latitude: point.latitude,
    longitude: point.longitude,
  }
}

function reportingPointExportItem(feature, point, override = null) {
  const properties = feature.properties || {}
  return {
    name: override?.name || properties.locationName || properties.name || 'Marifoonmeldpunt',
    number: properties.number || '',
    call: override?.call || properties.call || '',
    source: properties.source || '',
    latitude: point.latitude,
    longitude: point.longitude,
  }
}

function bridgeExportTitle(properties) {
  return [properties.name, properties.number ? `brug ${properties.number}` : null].filter(Boolean).join(' · ') || 'Brug'
}

function bridgeExportHeight(properties) {
  if (bridgeNavigationWarning(properties)) return 'geen doorgaande vaarroute'
  const calculated = properties.clearanceNap != null && properties.winterWaterLevelNap != null
    ? Number(properties.clearanceNap) - Number(properties.winterWaterLevelNap)
    : null
  const fisHeight = Number(properties.fisClearanceMeters) > 0 ? Number(properties.fisClearanceMeters) : null
  const value = calculated ?? fisHeight ?? properties.clearanceNap ?? properties.clearanceAt4mNap
  if (value === null || value === undefined || value === '') return 'onbekend'
  if (calculated !== null) return `${Number(value).toFixed(2)} m vrije hoogte bij winterpeil`
  return fisHeight !== null ? `${fisHeight.toFixed(2)} m doorvaarthoogte (FIS)` : `${Number(value).toFixed(2)} m t.o.v. NAP`
}

function formatExportMeters(value) {
  return value === null || value === undefined || value === '' ? '' : `${Number(value).toFixed(2)} m`
}

function featureRoutePoint(feature, coordinates, kind = null) {
  const overridePoint = kind ? routeLinkPositionOverride(kind, feature.properties || {}) : null
  if (overridePoint) return overridePoint
  const points = geometryRoutePoints(feature.geometry)
  if (!points.length) return null
  let best = null
  for (const point of points) {
    const projection = projectPointOnRoute(point, coordinates)
    if (!projection) continue
    if (!best || projection.distanceMeters < best.distanceMeters) best = { ...point, distanceMeters: projection.distanceMeters }
  }
  return best || averageRoutePoint(points)
}

function geometryRoutePoints(geometry) {
  if (!geometry) return []
  if (geometry.type === 'GeometryCollection') return (geometry.geometries || []).flatMap(geometryRoutePoints)
  return flattenCoordinatePairs(geometry.coordinates)
    .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
}

function flattenCoordinatePairs(value) {
  if (!Array.isArray(value)) return []
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) return [[Number(value[0]), Number(value[1])]]
  return value.flatMap(flattenCoordinatePairs)
}

function averageRoutePoint(points) {
  if (!points.length) return null
  const total = points.reduce((sum, point) => ({ latitude: sum.latitude + point.latitude, longitude: sum.longitude + point.longitude }), { latitude: 0, longitude: 0 })
  return { latitude: total.latitude / points.length, longitude: total.longitude / points.length }
}

function projectPointOnRoute(point, coordinates) {
  if (!point || !coordinates?.length) return null
  let best = null
  let coveredMeters = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const segment = projectPointOnSegment(point, coordinates[index - 1], coordinates[index])
    const routeMeters = coveredMeters + segment.segmentMeters * segment.t
    if (!best || segment.distanceMeters < best.distanceMeters) best = { ...segment, routeMeters }
    coveredMeters += segment.segmentMeters
  }
  return best
}

function projectPointOnSegment(point, start, end) {
  const scale = Math.cos(point.latitude * Math.PI / 180)
  const px = point.longitude * scale
  const py = point.latitude
  const ax = start[1] * scale
  const ay = start[0]
  const bx = end[1] * scale
  const by = end[0]
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  const projected = { latitude: ay + t * dy, longitude: (ax + t * dx) / scale }
  const segmentMeters = routeDistanceMeters({ latitude: start[0], longitude: start[1] }, { latitude: end[0], longitude: end[1] })
  return { t, point: projected, segmentMeters, distanceMeters: routeDistanceMeters(point, projected), bearingDegrees: routeBearingDegrees(start, end) }
}

function routeDistanceMeters(a, b) {
  const latitude = ((a.latitude + b.latitude) / 2) * Math.PI / 180
  return Math.hypot((a.longitude - b.longitude) * Math.cos(latitude), a.latitude - b.latitude) * 111_320
}

function routeBearingDegrees(start, end) {
  const lat1 = start[0] * Math.PI / 180
  const lat2 = end[0] * Math.PI / 180
  const deltaLng = (end[1] - start[1]) * Math.PI / 180
  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function bearingDeltaDegrees(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180)
}

function downloadRouteExport(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function routeExportFilename() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  return `boat-tracker-route-${stamp}.html`
}

function exportLabel(value) {
  return translateValue(value, language?.locale || 'en')
}

function routeExportHtml(data) {
  const numberedBridges = (data.bridges || []).map((bridge, index) => ({ ...bridge, mapIndex: index + 1 }))
  const generatedAt = formatExportDate(data.generatedAt)
  const summaryHtml = routeExportSummaryHtml(data)
  const warningsHtml = data.warnings?.length
    ? data.warnings.map((warning) => `<div class="warning">${escapeHtml(exportLabel(warning))}</div>`).join('')
    : ''
  const bridgesHtml = routeExportTableHtml([
    { key: 'mapIndex', label: 'Kaart' }, { key: 'name', label: 'Brug' }, { key: 'number', label: 'Brugnummer' }, { key: 'height', label: 'Hoogte' },
    { key: 'clearanceNap', label: 'Onderkant NAP' }, { key: 'clearanceAt4mNap', label: '4 m breedte NAP' },
    { key: 'winterWaterLevelNap', label: 'Winterpeil' }, { key: 'width', label: 'Breedte' }, { key: 'route', label: 'Vaarroute' },
  ], numberedBridges)
  const reportingHtml = routeExportTableHtml([
    { key: 'name', label: 'Meldpunt' }, { key: 'number', label: 'Nr' }, { key: 'call', label: 'Melding' },
  ], data.reportingPoints)
  const mapSvg = routeExportMapSvg({ ...data, bridges: numberedBridges })
  return `<!doctype html>
<html lang="${language?.locale || 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Boottracker · ${exportLabel('Routekaart')}</title>
  <style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; }
    header, main { max-width: 1180px; margin: 0 auto; padding: 20px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 28px 0 10px; font-size: 18px; }
    .meta { color: #475569; font-size: 13px; }
    #map { min-height: 560px; border: 1px solid #cbd5e1; background: #e0f2fe; overflow: hidden; }
    #map svg { display: block; width: 100%; height: auto; min-height: 520px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 16px 0; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .card span { display: block; color: #64748b; font-size: 11px; text-transform: uppercase; }
    .card strong { display: block; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e2e8f0; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #e2e8f0; font-size: 11px; text-transform: uppercase; color: #334155; }
    tr:last-child td { border-bottom: 0; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 10px; margin: 8px 0; }
    @media print {
      @page { size: A4 landscape; margin: 8mm; }
      body { background: white; }
      header, main { padding: 12px; }
      button { display: none; }
      #map { min-height: 0; break-inside: avoid; page-break-inside: avoid; }
      #map svg { width: 100%; height: auto; min-height: 0; shape-rendering: geometricPrecision; }
      #map svg polyline, #map svg path, #map svg line, #map svg circle, #map svg text { visibility: visible !important; }
      a[href]::after { content: ""; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Boottracker · ${exportLabel('Routekaart')}</h1>
      <div class="meta">${exportLabel('Gegenereerd:')} ${escapeHtml(generatedAt)}</div>
    </div>
    <button id="route-export-print" type="button">Print / PDF</button>
  </header>
  <main>
    <div id="map">${mapSvg}</div>
    <section class="cards">${summaryHtml}</section>
    <section>${warningsHtml}</section>
    <section>
      <h2>${exportLabel('Bruggen langs de route')}</h2>
      ${bridgesHtml}
    </section>
    <section>
      <h2>${exportLabel('Meldpunten langs de route')}</h2>
      ${reportingHtml}
    </section>
  </main>
  <script>document.getElementById('route-export-print').addEventListener('click', function () { window.print() })<\/script>
</body>
</html>`
}

function routeExportSummaryHtml(data) {
  return [
    ['Van', data.summary.from], ['Naar', data.summary.to], ['Afstand', data.summary.distance],
    ['Vaartijd', data.summary.duration], ['Snelheid', data.summary.speed],
    ['Zone 3 / IJ', data.summary.zone3 ? 'toegestaan' : 'vermeden'],
  ].map(([label, value]) => `<div class="card"><span>${escapeHtml(exportLabel(label))}</span><strong>${escapeHtml(exportLabel(value))}</strong></div>`).join('')
}

function routeExportTableHtml(columns, rows = []) {
  const head = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(exportLabel(column.label))}</th>`).join('')}</tr></thead>`
  const body = rows.length
    ? `<tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody>`
    : `<tbody><tr><td colspan="${columns.length}">${exportLabel('Geen items langs deze route gevonden.')}</td></tr></tbody>`
  return `<table>${head}${body}</table>`
}

function routeExportMapSvg(data) {
  const width = 1120
  const height = 560
  const pad = 44
  const routePoints = (data.coordinates || []).map(([latitude, longitude]) => ({ latitude, longitude }))
  const backgroundLines = (data.backgroundWaterways || [])
    .map((waterway) => ({
      ...waterway,
      points: (waterway.coordinates || []).map(([latitude, longitude]) => ({ latitude, longitude })),
    }))
    .filter((waterway) => waterway.points.length >= 2)
  const bridgePoints = (data.bridges || []).map((bridge) => ({ ...bridge, kind: 'bridge' }))
  const reportingPoints = (data.reportingPoints || []).map((point) => ({ ...point, kind: 'reporting' }))
  const allPoints = [...routePoints, ...backgroundLines.flatMap((line) => line.points), ...bridgePoints, ...reportingPoints].filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
  if (!allPoints.length) return ''
  const minLat = Math.min(...allPoints.map((point) => point.latitude))
  const maxLat = Math.max(...allPoints.map((point) => point.latitude))
  const minLng = Math.min(...allPoints.map((point) => point.longitude))
  const maxLng = Math.max(...allPoints.map((point) => point.longitude))
  const zoom = routeExportTileZoom(minLat, maxLat, minLng, maxLng, width - pad * 2, height - pad * 2)
  const topLeftWorld = routeExportWorldPixel({ latitude: maxLat, longitude: minLng }, zoom)
  const bottomRightWorld = routeExportWorldPixel({ latitude: minLat, longitude: maxLng }, zoom)
  const worldWidth = Math.max(1, bottomRightWorld.x - topLeftWorld.x)
  const worldHeight = Math.max(1, bottomRightWorld.y - topLeftWorld.y)
  const scale = Math.min((width - pad * 2) / worldWidth, (height - pad * 2) / worldHeight)
  const offsetX = pad + ((width - pad * 2) - worldWidth * scale) / 2
  const offsetY = pad + ((height - pad * 2) - worldHeight * scale) / 2
  const project = (point) => ({
    x: offsetX + (routeExportWorldPixel(point, zoom).x - topLeftWorld.x) * scale,
    y: offsetY + (routeExportWorldPixel(point, zoom).y - topLeftWorld.y) * scale,
  })
  const occupiedMarkerPositions = []
  const placeExportMarker = (anchor, preferredAngle, minimumSpacing = 25) => {
    const angles = [preferredAngle, preferredAngle + Math.PI, preferredAngle + Math.PI / 2, preferredAngle - Math.PI / 2, preferredAngle + Math.PI / 4, preferredAngle - Math.PI / 4]
    let bestCandidate = null
    let bestClearance = -1
    for (const radius of [22, 32, 44, 58]) {
      for (const angle of angles) {
        const candidate = {
          x: Math.max(pad + 12, Math.min(width - pad - 12, anchor.x + Math.cos(angle) * radius)),
          y: Math.max(pad + 12, Math.min(height - pad - 12, anchor.y + Math.sin(angle) * radius)),
        }
        if (candidate.x < 320 && candidate.y < 118) continue
        const clearance = occupiedMarkerPositions.length ? Math.min(...occupiedMarkerPositions.map((position) => Math.hypot(position.x - candidate.x, position.y - candidate.y))) : Infinity
        if (clearance > bestClearance) { bestCandidate = candidate; bestClearance = clearance }
        if (clearance >= minimumSpacing) {
          occupiedMarkerPositions.push(candidate)
          return candidate
        }
      }
    }
    const fallback = bestCandidate || { x: anchor.x, y: anchor.y }
    occupiedMarkerPositions.push(fallback)
    return fallback
  }
  const osmTiles = routeExportOsmTiles(minLat, maxLat, minLng, maxLng, zoom, topLeftWorld, scale, offsetX, offsetY)
  const routeLine = routePoints.map((point) => {
    const p = project(point)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
  const backgroundWater = backgroundLines.map((waterway) => {
    const points = waterway.points.map((point) => {
      const p = project(point)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    }).join(' ')
    const width = waterway.isRouteWaterway ? 3 : 1.5
    const opacity = waterway.isRouteWaterway ? 0.62 : 0.32
    return `<polyline points="${points}" fill="none" stroke="#7dd3fc" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"><title>${escapeHtml(waterway.name)}</title></polyline>`
  }).join('')
  const bridgeMarkers = bridgePoints.map((bridge, index) => {
    const p = project(bridge)
    const marker = placeExportMarker(p, index % 2 === 0 ? -Math.PI / 4 : -3 * Math.PI / 4, 27)
    return `<g><line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${marker.x.toFixed(1)}" y2="${marker.y.toFixed(1)}" stroke="#92400e" stroke-width="1.5"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#92400e"/><circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="10" fill="#f59e0b" stroke="#fff" stroke-width="2.5"><title>${escapeHtml(`${bridge.mapIndex}. ${bridge.name} ${bridge.height}`)}</title></circle><text x="${marker.x.toFixed(1)}" y="${(marker.y + 3.7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="900" fill="#172554">${escapeHtml(bridge.mapIndex)}</text></g>`
  }).join('')
  const reportingMarkers = reportingPoints.map((point, index) => {
    const p = project(point)
    const source = Number.isFinite(point.sourceLatitude) && Number.isFinite(point.sourceLongitude)
      ? project({ latitude: point.sourceLatitude, longitude: point.sourceLongitude })
      : p
    const connector = Math.hypot(source.x - p.x, source.y - p.y) > 9
      ? `<line x1="${source.x.toFixed(1)}" y1="${source.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#e11d48" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.75"/><circle cx="${source.x.toFixed(1)}" cy="${source.y.toFixed(1)}" r="3" fill="#e11d48" opacity="0.7"/>`
      : ''
    const offsetAngle = (index % 2 === 0 ? -45 : -135) * Math.PI / 180
    const marker = placeExportMarker(p, offsetAngle, 32)
    const title = `${point.number}. ${point.call}`
    return `<g>${connector}<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${marker.x.toFixed(1)}" y2="${marker.y.toFixed(1)}" stroke="#9f1239" stroke-width="1.5"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#9f1239"/><circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="11" fill="#e11d48" stroke="#fff" stroke-width="3"><title>${escapeHtml(title)}</title></circle><text x="${marker.x.toFixed(1)}" y="${(marker.y + 4).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">${escapeHtml(point.number)}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Boottracker ${exportLabel('Routekaart')}">
    <defs><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#bae6fd" stroke-width="1"/></pattern></defs>
    <rect width="100%" height="100%" fill="#f1f5f9"/>
    ${osmTiles}
    <rect width="100%" height="100%" fill="#ecfeff" opacity="0.12"/>
    ${backgroundWater}
    <rect width="100%" height="100%" fill="url(#grid)" opacity="0.10"/>
    <polyline points="${routeLine}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <polyline points="${routeLine}" fill="none" stroke="#0284c7" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${bridgeMarkers}${reportingMarkers}
    <g transform="translate(24 24)"><rect width="278" height="82" rx="8" fill="white" opacity="0.95"/><line x1="14" y1="20" x2="54" y2="20" stroke="#0284c7" stroke-width="3.5" stroke-linecap="round"/><text x="66" y="24" font-size="13" fill="#0f172a">${exportLabel('Geplande route')}</text><circle cx="34" cy="47" r="9" fill="#f59e0b"/><text x="34" y="51" text-anchor="middle" font-size="9" font-weight="900" fill="#172554">#</text><text x="66" y="51" font-size="13" fill="#0f172a">${exportLabel('Genummerde brug')}</text><circle cx="34" cy="70" r="9" fill="#e11d48"/><text x="66" y="74" font-size="13" fill="#0f172a">${exportLabel('Marifoonmeldpunt')}</text></g>
  </svg>`
}

function routeExportTileZoom(minLat, maxLat, minLng, maxLng, targetWidth, targetHeight) {
  for (let zoom = 17; zoom >= 12; zoom -= 1) {
    const topLeft = routeExportWorldPixel({ latitude: maxLat, longitude: minLng }, zoom)
    const bottomRight = routeExportWorldPixel({ latitude: minLat, longitude: maxLng }, zoom)
    const tileColumns = Math.ceil(bottomRight.x / 256) - Math.floor(topLeft.x / 256) + 1
    const tileRows = Math.ceil(bottomRight.y / 256) - Math.floor(topLeft.y / 256) + 1
    if (tileColumns * tileRows <= 80 && bottomRight.x - topLeft.x <= targetWidth * 4 && bottomRight.y - topLeft.y <= targetHeight * 4) return zoom
  }
  return 12
}

function routeExportWorldPixel(point, zoom) {
  const sinLat = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, point.latitude)) * Math.PI / 180)
  const scale = 256 * 2 ** zoom
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  }
}

function routeExportOsmTiles(minLat, maxLat, minLng, maxLng, zoom, topLeftWorld, scale, offsetX, offsetY) {
  const topLeftTile = routeExportTileXY({ latitude: maxLat, longitude: minLng }, zoom)
  const bottomRightTile = routeExportTileXY({ latitude: minLat, longitude: maxLng }, zoom)
  const maxTile = 2 ** zoom - 1
  const tiles = []
  for (let x = Math.max(0, topLeftTile.x - 1); x <= Math.min(maxTile, bottomRightTile.x + 1); x += 1) {
    for (let y = Math.max(0, topLeftTile.y - 1); y <= Math.min(maxTile, bottomRightTile.y + 1); y += 1) {
      const imageX = offsetX + (x * 256 - topLeftWorld.x) * scale
      const imageY = offsetY + (y * 256 - topLeftWorld.y) * scale
      const size = 256 * scale + 0.5
      tiles.push(`<image href="https://tile.openstreetmap.org/${zoom}/${x}/${y}.png" x="${imageX.toFixed(1)}" y="${imageY.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" preserveAspectRatio="none"/>`)
    }
  }
  return `<g opacity="0.94">${tiles.join('')}</g>`
}

function routeExportTileXY(point, zoom) {
  const world = routeExportWorldPixel(point, zoom)
  return { x: Math.floor(world.x / 256), y: Math.floor(world.y / 256) }
}

function formatExportDate(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString(language?.locale === 'nl' ? 'nl-NL' : 'en-GB') : value
}

function routePointLabel(point) {
  return point ? (point.name || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`) : 'Nog niet gekozen'
}

function routePointRole(index) {
  const point = routePoints.value[index]
  if (point?.role === 'start') return 'Start'
  if (point?.role === 'end') return 'Eind'
  return `Via ${index}`
}

function setRoutePoint(role, point) {
  const next = { id: createLocalId(), role, ...point }
  if (role === 'start') {
    const existing = routePoints.value.findIndex((candidate) => candidate.role === 'start')
    routePoints.value = existing >= 0
      ? routePoints.value.map((candidate, index) => index === existing ? next : candidate)
      : [next, ...routePoints.value]
  } else if (role === 'end') {
    const existing = routePoints.value.findIndex((candidate) => candidate.role === 'end')
    routePoints.value = existing >= 0
      ? routePoints.value.map((candidate, index) => index === existing ? next : candidate)
      : [...routePoints.value, next]
  } else {
    next.role = 'end'
    routePoints.value = [
      ...routePoints.value.map((candidate) => {
        if (candidate.role !== 'end') return candidate
        return { ...candidate, role: 'waypoint' }
      }),
      next,
    ]
  }
}

function removeRoutePoint(index) {
  routePoints.value = routePoints.value.filter((_, candidateIndex) => candidateIndex !== index)
  updatePlannedRoute()
}

function routeHasBoatDimensions() {
  return ['heightMeters', 'widthMeters', 'lengthMeters', 'draftMeters'].some((key) => positiveNumberOrNull(routeBoatProfile.value[key]) !== null)
}

function routeBoatProfileForPlanner() {
  const profile = {
    heightMeters: positiveNumberOrNull(routeBoatProfile.value.heightMeters),
    widthMeters: positiveNumberOrNull(routeBoatProfile.value.widthMeters),
    lengthMeters: positiveNumberOrNull(routeBoatProfile.value.lengthMeters),
    draftMeters: positiveNumberOrNull(routeBoatProfile.value.draftMeters),
    safetyMarginMeters: 0.15,
  }
  return routeHasBoatDimensions() ? profile : null
}

function positiveNumberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function setRouteStartFromUserLocation() {
  if (!latestUserLocation.value) {
    useNextLocationAsRouteStart = true
    activateUserLocation()
    routeMessage.value = 'GPS-locatie wordt opgehaald…'
    return
  }
  setRoutePoint('start', { ...latestUserLocation.value, name: 'Mijn locatie' })
  routePlannerOpen.value = true
  updatePlannedRoute()
}

function setRouteStartFromSelectedVessel() {
  const vessel = routeStartVessel.value || selectedVessel.value
  if (!vessel || !Number.isFinite(Number(vessel.latitude)) || !Number.isFinite(Number(vessel.longitude))) return
  setRoutePoint('start', {
    latitude: Number(vessel.latitude),
    longitude: Number(vessel.longitude),
    name: vessel.fleet?.name || vessel.name || `AIS ${vessel.mmsi}`,
  })
  routePlannerOpen.value = true
  updatePlannedRoute()
}

function useSelectedVesselAsRouteStartAndClose() {
  if (!selectedVessel.value) return
  routeStartVessel.value = selectedVessel.value
  setRouteStartFromSelectedVessel()
  routePlannerOpen.value = true
  closeVesselDetails()
}

async function geocodeRouteAddress(role) {
  const query = routeAddressInputs.value[role]?.trim()
  if (!query) return
  routeAddressLoading.value = role
  try {
    const localResults = locationSearchResults(query, 5)
    const { results } = localResults.length ? { results: localResults } : await searchRouteAddress(query, 5)
    const [match] = results || []
    if (!match) throw new Error('Geen adres gevonden.')
    selectRouteSuggestion(role, match)
  } catch (error) {
    routeMessage.value = error.message || 'Adres zoeken faalde.'
  } finally {
    routeAddressLoading.value = null
  }
}

function scheduleRouteSuggestions(role) {
  window.clearTimeout(routeSuggestionTimers.get(role))
  const query = routeAddressInputs.value[role]?.trim()
  if (!query || query.length < 2) {
    routeSuggestions.value = { ...routeSuggestions.value, [role]: [] }
    return
  }
  routeSuggestionTimers.set(role, window.setTimeout(() => loadRouteSuggestions(role, query), 250))
}

async function loadRouteSuggestions(role, query) {
  try {
    const localResults = locationSearchResults(query, 6)
    const data = localResults.length >= 6 ? { results: [] } : await searchRouteAddress(query, 6 - localResults.length)
    if (routeAddressInputs.value[role]?.trim() !== query) return
    routeSuggestions.value = { ...routeSuggestions.value, [role]: [...localResults, ...(data.results || [])].slice(0, 6) }
  } catch {
    routeSuggestions.value = { ...routeSuggestions.value, [role]: locationSearchResults(query, 6) }
  }
}

function locationSearchResults(query, limit = 8) {
  const normalizedQuery = normalizeLocationSearch(query)
  if (!normalizedQuery) return []
  const genericDockSearch = ['aanlegsteiger', 'aanleg stijger', 'steiger', 'dock', 'docks', 'oranje marker']
    .some((term) => {
      const normalizedTerm = normalizeLocationSearch(term)
      return normalizedTerm.includes(normalizedQuery) || normalizedQuery.includes(normalizedTerm)
    })
  return PLANNING_LOCATION_PINS
    .map((pin) => {
      const terms = [pin.name, pin.label, ...(pin.aliases || []), 'aanlegsteiger', 'aanleg stijger', 'steiger', 'oranje marker'].filter(Boolean)
      const normalizedTerms = terms.map(normalizeLocationSearch)
      const exact = normalizedTerms.some((term) => term === normalizedQuery)
      const includes = normalizedTerms.some((term) => term.includes(normalizedQuery) || normalizedQuery.includes(term))
      if (!genericDockSearch && !exact && !includes) return null
      return {
        id: `location:${pin.name}`,
        groupKey: `location:${pin.name}`,
        kind: 'location',
        name: pin.label || pin.name,
        label: pin.label || pin.name,
        displayName: `Oranje marker · aanlegsteiger · ${pin.name}`,
        latitude: pin.latitude,
        longitude: pin.longitude,
        score: exact ? 0 : includes ? 1 : 2,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
}

function normalizeLocationSearch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

async function searchRouteAddress(query, limit) {
  const params = `q=${encodeURIComponent(query)}&limit=${limit}`
  const endpoints = [`/api/geocode/search?${params}`, `/api/geocode?${params}`]
  const errors = []
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } })
      if (response.ok) return response.json()
      errors.push(await geocodeErrorMessage(response))
      if (response.status !== 404) break
    } catch (error) {
      errors.push(error?.message || 'NetworkError')
    }
  }
  throw new Error(errors.find(Boolean) || 'Adres zoeken faalde: lokale API niet bereikbaar.')
}

async function geocodeErrorMessage(response) {
  try {
    const data = await response.clone().json()
    if (data?.error) return `Adres zoeken faalde (${response.status}): ${data.error}`
  } catch {
    // Some 404s come from the static/Vite fallback and are plain text/html.
  }
  const text = await response.text().catch(() => '')
  const summary = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return `Adres zoeken faalde (${response.status})${summary ? `: ${summary}` : ''}`
}

function selectRouteSuggestion(role, suggestion) {
  setRoutePoint(role, {
    latitude: Number(suggestion.latitude),
    longitude: Number(suggestion.longitude),
    name: suggestion.label || suggestion.displayName,
  })
  routeAddressInputs.value = { ...routeAddressInputs.value, [role]: suggestion.label || suggestion.displayName || routeAddressInputs.value[role] }
  routeSuggestions.value = { ...routeSuggestions.value, [role]: [] }
  routePlannerOpen.value = true
  updatePlannedRoute()
}

function formatRouteDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters} m`
}

function formatRouteDuration(minutes) {
  if (!Number.isFinite(minutes)) return '—'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}u ${minutes % 60}m`
}

function formatRouteSpeed(kmh) {
  const value = Number(kmh)
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(value % 1 ? 1 : 0)} km/u`
}

function focusVessel(vessel) {
  aisController?.focusVessel(vessel.mmsi)
}

function focusFleetBoatOnMap(boat) {
  if (!boat?.ais || !map) return

  activeVesselFilters.value = ['all']
  applyVesselGroupFilter()
  const focused = aisController?.focusVessel(String(boat.mmsi))

  if (!focused && Number.isFinite(boat.ais.latitude) && Number.isFinite(boat.ais.longitude)) {
    map.setView([boat.ais.latitude, boat.ais.longitude], Math.max(map.getZoom(), 16))
    selectedVessel.value = { ...enrichVesselWithFleetData({ ...boat.ais, mmsi: String(boat.mmsi) }), fleet: boat }
    vesselDetailsCollapsed.value = false
  }
}

function focusPlanningBoatOnMap(schedule) {
  const boat = companyFleetBoats.value.find((candidate) => String(candidate.mmsi) === String(schedule.mmsi)
    || normalizeBoatLabel(candidate.name) === normalizeBoatLabel(schedule.boatName))
  if (boat) focusFleetBoatOnMap(boat)
  else if (schedule.mmsi) aisController?.focusVessel(String(schedule.mmsi))
}

function showPlanningTourRoute(tour) {
  const boat = companyFleetBoats.value.find((candidate) => String(candidate.mmsi) === String(tour.mmsi))
  if (boat) focusFleetBoatOnMap(boat)
  else aisController?.focusVessel(String(tour.mmsi))
  historyHours.value = null
  aisController?.showHistory(String(tour.mmsi), null, { from: Number(tour.from), to: Number(tour.to) })
}

function planningForVessel(vessel) {
  const mmsi = String(vessel.mmsi || vessel.fleet?.mmsi || '')
  const name = normalizeBoatLabel(vessel.fleet?.name || vessel.name)
  return todayPlanningItems.value.filter((item) => (mmsi && String(item.mmsi || '') === mmsi)
    || normalizeBoatLabel(item.boat_name) === name)
}

function uniquePeople(items, roles) {
  const people = []
  for (const name of items.filter((item) => roles.includes(item.role)).map((item) => item.person_name).filter(Boolean)) {
    const existing = people.findIndex((candidate) => personNameSimilarity(candidate, name) >= 0.72)
    if (existing < 0) people.push(name)
    else if (name.length > people[existing].length) people[existing] = name
  }
  return people
}

function personNameSimilarity(left, right) {
  const a = normalizeBoatLabel(left).replace(/\s/g, '')
  const b = normalizeBoatLabel(right).replace(/\s/g, '')
  if (!a || !b || a[0] !== b[0]) return 0
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous.splice(0, previous.length, ...current)
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length)
}

function normalizeBoatLabel(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

async function loadTodayPlanning() {
  if (!canReadPlanning.value) { todayPlanningItems.value = []; return }
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
    const response = await fetch(`/api/planning/day?date=${today}`)
    if (response.ok) todayPlanningItems.value = (await response.json()).items
  } catch {
    // The map and AIS remain usable when planning is temporarily unavailable.
  }
}

function closeVesselDetails() {
  vesselDetailsCollapsed.value = false
  selectedVessel.value = null
  aisController?.clearSelection()
}

async function showVesselHistory(hours) {
  if (!selectedVessel.value) return
  historyHours.value = hours
  historyLoading.value = true
  historyError.value = ''
  const history = await aisController?.showHistory(selectedVessel.value.mmsi, hours, null, { fitBounds: true })
  if (history && isMobileViewport.value) mobileSheetExpanded.value = false
}

function formatDegrees(value) {
  return Number.isFinite(value) ? `${Math.round(value)}°` : '—'
}

function formatDimensions(vessel) {
  if (vessel.length && vessel.width) return `${vessel.length} × ${vessel.width} m`
  if (vessel.length) return `${vessel.length} m long`
  if (vessel.width) return `${vessel.width} m wide`
  return 'Unknown'
}

function formatFleetDimensions(boat) {
  if (boat.length_m && boat.width_m) return `${boat.length_m} × ${boat.width_m} m`
  if (boat.length_m) return `${boat.length_m} m long`
  return 'Unknown'
}

function enrichVesselWithFleetData(vessel) {
  const fleet = companyFleetBoats.value.find((boat) => String(boat.mmsi) === String(vessel.mmsi)) || null
  const mmsi = String(vessel.mmsi)
  const serviceGroup = ntMmsis.value.includes(mmsi) ? 'nt' : policeMmsis.value.includes(mmsi) ? 'police' : null
  const matched = operatorGroups.value.find((group) => group.mmsis.includes(mmsi))
  const operator = matched ? { id: matched.operatorId, name: matched.name, color: matched.color } : null
  const photo = boatPhoto({ ...vessel, name: fleet?.name || vessel.name, photoUrl: fleet?.photoUrl, photoVerified: fleet?.photoVerified }, operator?.id, { ambiguousName: (matched?.vessels || []).filter((item) => String(item.name || '').toLowerCase() === String(vessel.name || '').toLowerCase()).length > 1 })
  return { ...vessel, fleet, serviceGroup, operator, ...photo }
}

function searchVesselDotClass(mmsi) {
  const value = String(mmsi)
  if (policeMmsis.value.includes(value)) return 'bg-blue-500'
  if (ntMmsis.value.includes(value)) return 'bg-purple-500'
  const operator = operatorGroups.value.find((group) => group.mmsis.includes(value))
  if (operator) return { 'flagship': 'bg-orange-400', 'lovers': 'bg-red-400', 'smidtje': 'bg-purple-400', 'stromma': 'bg-pink-400', 'p-kooij': 'bg-yellow-400', 'blue-boat': 'bg-sky-400', 'plas': 'bg-green-400', 'pure-boats': 'bg-teal-400', 'kinboat': 'bg-lime-400', 'those-dam-boat-guys': 'bg-fuchsia-400', 'de-nederlanden': 'bg-rose-300' }[operator.operatorId]
  return 'bg-sky-400'
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(5) : '—'
}

function formatSignalTime(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
}

function navigationStatusLabel(status) {
  return {
    0: 'Under way using engine',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted manoeuvrability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Fishing',
    8: 'Under way sailing',
    14: 'AIS-SART active',
    15: 'Not defined',
  }[status] || 'Unknown'
}

function vesselTypeLabel(type) {
  if (!Number.isFinite(type)) return 'AIS vessel'
  if (type === 30) return 'Fishing vessel'
  if (type >= 31 && type <= 32) return 'Towing vessel'
  if (type === 33) return 'Dredger'
  if (type === 35) return 'Military vessel'
  if (type === 36) return 'Sailing vessel'
  if (type === 37) return 'Pleasure craft'
  if (type >= 40 && type <= 49) return 'High-speed craft'
  if (type === 50) return 'Pilot vessel'
  if (type === 51) return 'Search and rescue'
  if (type === 52) return 'Tug'
  if (type === 53) return 'Port tender'
  if (type >= 60 && type <= 69) return 'Passenger vessel'
  if (type >= 70 && type <= 79) return 'Cargo vessel'
  if (type >= 80 && type <= 89) return 'Tanker'
  return 'AIS vessel'
}

function openMobileSearch() {
  isSearchOpen.value = true
  mobileSheetExpanded.value = true
  mobileSelectedPlace.value = null
}

async function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value

  if (isSearchOpen.value) {
    if (window.matchMedia('(max-width: 639px)').matches) {
      isGroupsOpen.value = false
      routePlannerOpen.value = false
      navigationLayersOpen.value = false
    }
    await nextTick()
    searchInput.value?.focus()
  }
}

function toggleMobileRoutePlanner() {
  const opening = !routePlannerOpen.value
  if (opening && !routePoints.value.some((point) => point.role === 'end') && searchQuery.value.trim()) {
    const query = searchQuery.value.trim().toLowerCase()
    const result = searchResults.value.find((item) => item.name?.toLowerCase() === query) || searchResults.value[0]
    const vessel = result?.kind === 'vessel' ? liveVessels.value.find((item) => item.mmsi === result.mmsi) : null
    const latitude = Number(vessel?.latitude ?? result?.latitude)
    const longitude = Number(vessel?.longitude ?? result?.longitude)
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      setRoutePoint('end', { latitude, longitude, name: result.name || searchQuery.value.trim() })
      routeAddressInputs.value.end = result.name || searchQuery.value.trim()
      updatePlannedRoute()
    } else {
      routeAddressInputs.value.end = searchQuery.value.trim()
      scheduleRouteSuggestions('end')
    }
  }
  isSearchOpen.value = false
  isGroupsOpen.value = false
  navigationLayersOpen.value = false
  routePlannerOpen.value = !routePlannerOpen.value
  if (!routePlannerOpen.value) routeMode.value = null
}

async function focusMobileRouteHeight() {
  mobileRouteOptionsOpen.value = true
  await nextTick()
  mobileRouteHeightInput.value?.focus()
}

function toggleMobileLayers() {
  const opening = !navigationLayersOpen.value
  isSearchOpen.value = false
  isGroupsOpen.value = false
  routePlannerOpen.value = false
  routeMode.value = null
  navigationLayersOpen.value = opening
}

function chooseBaseMapStyle(style) {
  baseMapStyle.value = style
  setBaseMapStyle(map, style)
}

function startRouteToSelectedPlace() {
  const place = mobileSelectedPlace.value
  if (!place) return
  if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
    setRoutePoint('end', { latitude: place.latitude, longitude: place.longitude, name: place.name })
    routeAddressInputs.value.end = place.name
    updatePlannedRoute()
  } else {
    routeAddressInputs.value.end = place.name
    scheduleRouteSuggestions('end')
  }
  mobileSelectedPlace.value = null
  isSearchOpen.value = false
  navigationLayersOpen.value = false
  routePlannerOpen.value = true
}

function collapseSearch() {
  isSearchOpen.value = false
  mobileSearchInput.value?.blur()
}

function focusResult(result) {
  if (!map || !canalsLayer.value) return

  if (result.kind === 'location') {
    clearSelectedResult()
    map.setView([result.latitude, result.longitude], Math.max(map.getZoom(), 16))
    L.popup()
      .setLatLng([result.latitude, result.longitude])
      .setContent(`<div><strong>${escapeHtml(result.name)}</strong></div><div>Oranje marker / aanlegsteiger</div>`)
      .openOn(map)
    searchQuery.value = result.name
    return
  }

  clearSelectedResult()

  const focused = focusCanalResult(map, canalsLayer.value, result)

  if (focused) {
    selectedResult.value = result
  }

  if (focused && result.name) {
    searchQuery.value = result.name
  }
}

function focusSearchResult(result) {
  const mobile = window.matchMedia('(max-width: 639px)').matches
  if (mobile) collapseSearch()
  if (result.kind === 'bridge') {
    focusBridgeSearchResult(result)
  } else if (result.kind !== 'vessel') {
    focusResult(result)
  } else {
    activeVesselFilters.value = ['all']
    applyVesselGroupFilter()
    aisController?.focusVessel(result.mmsi)
    searchQuery.value = result.name || result.mmsi
  }
  if (mobile) {
    const vessel = result.kind === 'vessel' ? liveVessels.value.find((item) => item.mmsi === result.mmsi) : null
    const latitude = Number(vessel?.latitude ?? result.latitude ?? map?.getCenter().lat)
    const longitude = Number(vessel?.longitude ?? result.longitude ?? map?.getCenter().lng)
    mobileSelectedPlace.value = {
      name: result.name || (result.kind === 'vessel' ? `AIS ${result.mmsi}` : 'Geselecteerde plek'),
      meta: formatResultMeta(result),
      latitude,
      longitude,
    }
  }
}

async function focusBridgeSearchResult(result) {
  if (!map) return
  if (!bridgeLayerVisible.value) await toggleNavigationLayer('bridges')
  map.setView([result.latitude, result.longitude], Math.max(map.getZoom(), 17), { animate: false })
  L.popup({ maxWidth: 340 })
    .setLatLng([result.latitude, result.longitude])
    .setContent(`<div><strong>${escapeHtml(result.name)}</strong></div><div>Brug${result.number ? ` ${escapeHtml(result.number)}` : ''}${result.height ? ` · ${escapeHtml(result.height)}` : ''}</div>${bridgeNavigationWarning(result) ? `<p>${escapeHtml(bridgeNavigationWarning(result))}</p>` : ''}`)
    .openOn(map)
  searchQuery.value = result.name
}

async function loadBridgeSearchItems() {
  try {
    const data = await loadAmsterdamBridges()
    bridgeFeatures = data.features || []
    bridgeSourceWarning.value = data.stale ? 'Bruggegevens zijn verouderd: de actuele bron is tijdelijk niet bereikbaar.' : ''
    bridgeClearanceStatus.value = bridgeFeatures.length ? 'ready' : 'error'
    bridgeSearchItems.value = (data.features || []).map((feature) => {
      const properties = feature.properties || {}
      const point = averageRoutePoint(geometryRoutePoints(feature.geometry))
      if (!point) return null
      return {
        kind: 'bridge', groupKey: `bridge:${properties._mapObjectKey || properties.number || properties.name}`,
        name: properties.name || 'Brug', number: properties.number || '',
        height: bridgeExportHeight(properties), latitude: point.latitude, longitude: point.longitude,
      }
    }).filter(Boolean)
    rebuildCanalRouteNetwork()
    const requestedBridge = new URLSearchParams(window.location.search).get('bridge')
    if (requestedBridge) {
      const bridge = bridgeSearchItems.value.find((item) => item.number === requestedBridge)
      if (bridge) await focusBridgeSearchResult(bridge)
    }
    if (routePoints.value.length >= 2) refreshRouteAfterSettingsChange()
  } catch {
    bridgeSearchItems.value = []
    bridgeClearanceStatus.value = 'error'
  }
}

function selectFirstResult() {
  if (searchResults.value.length === 0) return

  focusSearchResult(searchResults.value[0])
}

function activateUserLocation() {
  if (!map) return
  window.clearTimeout(userLocationErrorTimer)
  userLocationError.value = ''

  if (isUserLocationActive.value) {
    userLocationController?.center()
    return
  }

  isUserLocationActive.value = true
  userLocationController = showUserLocation(map, {
    onFound: (event) => {
      latestUserLocation.value = { latitude: event.latlng.lat, longitude: event.latlng.lng }
      if (useNextLocationAsRouteStart) {
        useNextLocationAsRouteStart = false
        setRouteStartFromUserLocation()
      }
    },
    onError: (error) => {
      useNextLocationAsRouteStart = false
      userLocationController?.stop()
      userLocationController = null
      isUserLocationActive.value = false
      latestUserLocation.value = null
      userLocationError.value = error?.code === 1
        ? (/firefox/i.test(navigator.userAgent) ? 'Sta locatie toe in Firefox site-instellingen' : 'Locatietoegang is geblokkeerd')
        : 'Locatie kon niet worden bepaald'
      userLocationErrorTimer = window.setTimeout(() => {
        userLocationError.value = ''
      }, 5_000)
    },
  })
}

async function toggleBridgeLayer() {
  if (!map || bridgeLayerLoading.value) return
  bridgeLayerError.value = ''
  if (bridgeLayerVisible.value) {
    map.removeLayer(bridgeLayerController.layer)
    bridgeLayerVisible.value = false
    return
  }
  bridgeLayerLoading.value = true
  try {
    if (!bridgeLayerController) {
      const data = await loadAmsterdamBridges()
      bridgeLayerController = createBridgeLayer(map, data, {
        isLinked: (properties) => Boolean(routeLinkDisplayNames('bridge', properties) || routeLinkDisplaySegments('bridge', properties)),
        routeLinkPopupHtml: (properties, point) => routeLinkPopupHtml('bridge', properties, point),
        adminObjectHtml: (feature, point) => mapAdminObjectHtml('bridges', feature, point),
      })
      bridgeCount.value = bridgeLayerController.count
    }
    bridgeLayerController.layer.addTo(map)
    bridgeLayerVisible.value = true
  } catch (error) {
    bridgeLayerError.value = error.message
  } finally {
    bridgeLayerLoading.value = false
  }
}

async function toggleNavigationLayer(id) {
  if (!map || loadingNavigationLayers.value.includes(id)) return
  navigationLayerError.value = ''
  const active = activeNavigationLayers.value.includes(id)
  if (active) {
    const controller = id === 'bridges' ? bridgeLayerController?.layer : navigationLayerControllers.get(id)
    if (controller) map.removeLayer(controller)
    activeNavigationLayers.value = activeNavigationLayers.value.filter((value) => value !== id)
    if (id === 'bridges') bridgeLayerVisible.value = false
    return
  }
  loadingNavigationLayers.value = [...loadingNavigationLayers.value, id]
  try {
    let layer
    if (id === 'bridges') {
      if (!bridgeLayerController) {
        const data = await loadAmsterdamBridges()
        bridgeLayerController = createBridgeLayer(map, data, {
          isLinked: (properties) => Boolean(routeLinkDisplayNames('bridge', properties) || routeLinkDisplaySegments('bridge', properties)),
        routeLinkPopupHtml: (properties, point) => routeLinkPopupHtml('bridge', properties, point),
          adminObjectHtml: (feature, point) => mapAdminObjectHtml('bridges', feature, point),
        })
        bridgeCount.value = bridgeLayerController.count
      }
      layer = bridgeLayerController.layer
      bridgeLayerVisible.value = true
      navigationLayerCounts.value = { ...navigationLayerCounts.value, bridges: bridgeCount.value }
    } else if (id === 'closures') {
      await loadRouteClosures()
      if (!routeClosureData.value) throw new Error(routeClosureError.value)
      layer = createNavigationLayer('closures', routeClosureData.value, canalsGeoJson, { adminObjectHtml: feature => mapAdminObjectHtml('closures', feature) })
      navigationLayerControllers.set(id, layer)
      navigationLayerCounts.value = { ...navigationLayerCounts.value, closures: closureSummary.value.total }
    } else if (id === 'restrictions') {
      layer = navigationLayerControllers.get(id) || createRestrictionLayer(canalsGeoJson)
      navigationLayerControllers.set(id, layer)
      navigationLayerCounts.value = { ...navigationLayerCounts.value, restrictions: layer.getLayers().length }
    } else {
      if (!navigationLayerControllers.has(id)) {
        const data = await loadNavigationLayer(id)
        navigationLayerControllers.set(id, createNavigationLayer(id, data, canalsGeoJson, {
          adminObjectHtml: (feature) => mapAdminObjectHtml(id, feature),
          adminLocationHtml: id === 'reporting-points'
            ? (feature) => mapAdminReportingLocationHtml(feature)
            : null,
          routeLinkPopupHtml: id === 'reporting-points'
            ? (properties, point) => routeLinkPopupHtml('reporting', properties, point)
            : null,
        }))
        navigationLayerCounts.value = { ...navigationLayerCounts.value, [id]: data.features?.length || 0 }
      }
      layer = navigationLayerControllers.get(id)
    }
    layer.addTo(map)
    activeNavigationLayers.value = [...activeNavigationLayers.value, id]
  } catch (error) {
    navigationLayerError.value = error.message
  } finally {
    loadingNavigationLayers.value = loadingNavigationLayers.value.filter((value) => value !== id)
  }
}

function formatResultMeta(result) {
  if (result?.kind === 'vessel') {
    const mmsi = String(result.mmsi)
    const groupLabel = policeMmsis.value.includes(mmsi)
      ? 'Police · '
      : ntMmsis.value.includes(mmsi)
        ? 'Nautical supervision · '
        : companyMmsis.value.includes(mmsi)
          ? 'Vlootregister · '
          : ''
    const operator = operatorGroups.value.find((group) => group.mmsis.includes(mmsi))
    return `${operator ? `${operator.name} · ` : groupLabel}MMSI ${result.mmsi}`
  }
  if (result?.kind === 'location') return `Oranje marker · ${formatCoordinate(result.latitude)}, ${formatCoordinate(result.longitude)}`
  if (result?.kind === 'bridge') return `Brug${result.number ? ` ${result.number}` : ''}${result.height ? ` · ${result.height}` : ''}`

  if (!result?.wayIds?.length) {
    return ''
  }

  if (result.wayIds.length === 1) {
    return result.wayIds[0]
  }

  return `${result.wayIds[0]} +${result.wayIds.length - 1} more`
}

function clearSelectedResult() {
  if (!canalsLayer.value || !selectedResult.value) {
    selectedResult.value = null
    return
  }

  clearCanalResultHighlight(canalsLayer.value, selectedResult.value)
  selectedResult.value = null
}

async function loadWaterwayEdits() {
  if (!originalCanalsGeoJson) return
  try {
    const response = await fetch('/api/map/objects?layer=routing-lines')
    const rows = await response.json()
    if (!response.ok || !Array.isArray(rows)) throw new Error('Vaarlijnwijzigingen konden niet worden geladen.')
    waterwayLoadError.value = ''
    const serialized = JSON.stringify(rows)
    if (serialized === waterwayEditsJson && canalsLayer.value) return
    waterwayEditsJson = serialized
    canalsGeoJson = applyWaterwayEdits(originalCanalsGeoJson, rows)
    rebuildCanalRouteNetwork()
    canalsLayer.value?.remove()
    canalsLayer.value = await addCanals(map, canalsGeoJson)
    canalSearchIndex.value = buildCanalSearchIndex(canalsGeoJson)
    bindCanalClickSelection()
    if (routePoints.value.length >= 2) refreshRouteAfterSettingsChange()
  } catch {
    waterwayLoadError.value = 'Vaarlijnwijzigingen niet geladen. De kaart kan verouderde vaarlijnen bevatten.'
    if (!canalsLayer.value) {
      canalsGeoJson = originalCanalsGeoJson
      rebuildCanalRouteNetwork()
      canalsLayer.value = await addCanals(map, canalsGeoJson)
      canalSearchIndex.value = buildCanalSearchIndex(canalsGeoJson)
      bindCanalClickSelection()
    }
  }
}

function addClosureForWaterway(feature) {
  closeMapObjectEditor()
  editMapObject('closures', { ...feature, id: undefined, properties: { name: feature.properties?.name || 'Eigen stremming', waterway: feature.properties?.name || '', type: 'Stremming', blocksRouting: true } })
  mapObjectEditor.value.objectKey = ''
}

function editWaterwayGeometry() {
  const feature = mapObjectEditor.value?.feature
  if (!feature || !['LineString', 'MultiLineString'].includes(feature.geometry.type)) return
  waterwayEditMarkers?.remove()
  waterwayEditPreview?.remove()
  waterwayEditPreview = L.geoJSON(feature, { style: { color: '#f59e0b', weight: 6 } }).addTo(map)
  const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  waterwayEditMarkers = L.layerGroup(lines.flatMap(line => line.map(coordinate => L.marker([coordinate[1], coordinate[0]], {
    draggable: true, zIndexOffset: 1600, icon: L.divIcon({ className: '', html: '<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50%;background:#f59e0b"></span>', iconSize: [18,18], iconAnchor: [9,9] }),
  }).on('dragend', event => {
    const point = event.target.getLatLng()
    coordinate[0] = point.lng; coordinate[1] = point.lat
    waterwayEditPreview.clearLayers().addData(feature)
  })))).addTo(map)
  map.fitBounds(waterwayEditPreview.getBounds(), { padding: [60,60], maxZoom: 18 })
}

function bindCanalClickSelection() {
  if (!canalsLayer.value) return
  canalsLayer.value.eachLayer(featureLayer => {
    const feature = featureLayer.feature
    if (!['LineString', 'MultiLineString'].includes(feature.geometry?.type)) return
    featureLayer.bindPopup(() => {
      const container = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = (feature.properties?.name || 'Vaarlijn') + (feature.properties?.closed ? ' · afgesloten' : '')
      container.append(title)
      for (const [label, action] of [['Vaarlijn bewerken / blijvend afsluiten', () => editMapObject('routing-lines', feature)], ['Tijdelijke stremming toevoegen', () => addClosureForWaterway(feature)]]) {
        const button = document.createElement('button')
        button.type = 'button'; button.textContent = label
        button.style.cssText = 'display:block;width:100%;padding:10px;margin-top:8px;border-radius:8px;background:#e0f2fe;color:#075985;text-align:left'
        button.onclick = () => {
          if (!auth.requireLogin('Log in om vaarlijnen en stremmingen op te slaan.')) return
          if (!isAdmin.value) { button.textContent = 'Alleen een beheerder kan de gedeelde kaart aanpassen.'; return }
          map.closePopup(); action()
        }
        container.append(button)
      }
      return container
    })
  })
}

watch(searchQuery, (nextValue, previousValue) => {
  if (previousValue && !nextValue) {
    clearSelectedResult()
  }
})

watch(activeVesselFilters, applyVesselGroupFilter, { deep: true })
watch(operatorAssignments, () => aisController?.setOperatorAssignments(operatorAssignments.value), { deep: true })
watch(() => operatorGroups.value.map((group) => `${group.id}:${group.mmsis.join(',')}`).join('|'), applyVesselGroupFilter)
watch(routeSpeedValue, refreshRouteAfterSettingsChange)
watch(routeAllowZone3, refreshRouteAfterSettingsChange)
watch(routeLoopMinutes, () => { if (routeResult.value?.routeType === 'loop') generateRandomLoopRoute() })
watch(routeBoatProfile, refreshRouteAfterSettingsChange, { deep: true })

onMounted(async () => {
  if (!mapEl.value) return

  map = createMap(mapEl.value)
  const routePointPane = map.createPane('route-point-pane')
  routePointPane.style.zIndex = '780'
  map.getContainer().addEventListener('click', handleRouteLinkPopupClick, true)
  map.getContainer().addEventListener('click', handleRoutePlacementClick, true)
  map.getContainer().addEventListener('pointerdown', handlePlacementPointerDown, true)
  map.getContainer().addEventListener('pointerup', handlePlacementPointerUp, true)
  loadTodayPlanning()
  loadRouteClosures()
  planningRefreshTimer = visibleInterval(() => { loadTodayPlanning(); loadOperatorGroups() }, 60_000)
  routeClosureRefreshTimer = visibleInterval(() => { loadRouteClosures(); loadWaterwayEdits() }, 60_000)

  const canals = await loadCanals()
  originalCanalsGeoJson = withSupplementalWaterways(canals)
  await loadWaterwayEdits()
  await loadSharedRouteLinks()
  drawCustomRouteLines()
  drawCustomReportingPoints()
  bindCanalClickSelection()
  map.on('click', handleRouteMapClick)
  map.on('dragstart', () => { mobileRouteFitUntil = 0 })

  await startAccountMapLayers(canals)
  await loadBridgeSearchItems()
  const linkedOperator = new URLSearchParams(window.location.search).get('operator')
  if (VESSEL_OPERATORS.some((operator) => operator.id === linkedOperator)) {
    activeVesselFilters.value = [`operator:${linkedOperator}`]
    applyVesselGroupFilter()
  }

  await loadSharedRouteFromUrl()
  loadExampleRouteFromUrl()
  const linkedBoat = new URLSearchParams(window.location.search).get('boat')
  if (/^\d{9}$/.test(linkedBoat || '')) {
    const boat = companyFleetBoats.value.find(candidate => String(candidate.mmsi) === linkedBoat)
    if (boat?.ais) focusFleetBoatOnMap(boat)
    else {
      const vessel = liveVessels.value.find((candidate) => String(candidate.mmsi) === linkedBoat)
      if (vessel) { map.setView([vessel.latitude, vessel.longitude], 17); selectedVessel.value = enrichVesselWithFleetData(vessel); mobilePanelCoordinator.claim('vessel') }
      else { searchQuery.value = boat?.name || linkedBoat; isSearchOpen.value = true }
    }
  }

  for (const pin of PLANNING_LOCATION_PINS) addDock(map, pin.latitude, pin.longitude, pin.label)
})

async function loadOperatorGroups() {
  try {
    const response = await fetch('/api/map/operator-groups')
    const data = await response.json()
    if (!response.ok) throw new Error('Rederijgroepen konden niet worden geladen.')
    operatorAssignments.value = data.assignments || {}
    operatorSourceVessels.value = (data.groups || []).flatMap((group) => group.vessels || [])
  } catch { vesselGroupMessage.value = 'Gedeelde rederijkoppelingen zijn niet beschikbaar; alleen herkenning op AIS-naam is actief.' }
}

async function startAccountMapLayers(canals) {
  try {
    let fleetSummary = await fetch('/api/fleet/summary').then((response) => response.json())
    if (auth.user?.role === 'admin') {
      const legacyCompanyGroups = vesselGroups.value.filter((group) => isCompanyGroupName(group.name))
      const legacyCompanyMmsis = [...new Set([
        ...Object.entries(builtInGroupOverrides.value.company || {})
        .filter(([, included]) => included === true)
        .map(([mmsi]) => mmsi),
        ...legacyCompanyGroups.flatMap((group) => group.mmsis),
      ])]
        .filter((mmsi) => !fleetSummary.boats.some((boat) => String(boat.mmsi) === mmsi))
      if (legacyCompanyMmsis.length || legacyCompanyGroups.length) {
        await Promise.all(legacyCompanyMmsis.map((mmsi) => fetch(`/api/fleet/company-membership/${encodeURIComponent(mmsi)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ included: true }),
        }).then((response) => { if (!response.ok) throw new Error('Legacy company group could not be synchronized.') })))
        const overrides = { ...builtInGroupOverrides.value, company: { ...(builtInGroupOverrides.value.company || {}) } }
        for (const mmsi of legacyCompanyMmsis) delete overrides.company[mmsi]
        localStorage.setItem('ais-built-in-group-overrides-v1', JSON.stringify(overrides))
        builtInGroupOverrides.value = overrides
        if (legacyCompanyGroups.length) {
          const legacyIds = new Set(legacyCompanyGroups.map((group) => group.id))
          vesselGroups.value = vesselGroups.value.filter((group) => !legacyIds.has(group.id))
          saveVesselGroups()
        }
        fleetSummary = await fetch('/api/fleet/summary', { cache: 'no-store' }).then((response) => response.json())
      }
    }
    await loadOperatorGroups()
    companyFleetBoats.value = fleetSummary.boats
    companyBaseMmsis.value = fleetSummary.boats.map((boat) => String(boat.mmsi)).filter(Boolean)

    aisController = showLiveAisVessels(map, {
      canals,
      connectLive: true,
      dataSaver: dataSaver.value,
      operatorAssignments: operatorAssignments.value,
      companyMmsis: companyMmsis.value,
      companyBoats: companyFleetBoats.value,
      initialVessels: [...operatorSourceVessels.value, ...fleetSummary.boats.map(boat => boat.ais).filter(Boolean)],
      onStatus: ({ status, message, configured }) => {
        aisStatus.value = status
        aisStatusMessage.value = message
        if (typeof configured === 'boolean') aisConfigured.value = configured
      },
      onCount: (count) => {
        aisVesselCount.value = count
      },
      onVessels: (vessels) => {
        const now = Date.now()
        aisRecentVesselCount.value = vessels.filter((vessel) => now - new Date(vessel.sourceReceivedAt || vessel.receivedAt).getTime() <= 15 * 60_000).length
        aisDelayedVesselCount.value = Math.max(0, vessels.length - aisRecentVesselCount.value)
        liveVessels.value = vessels.map((vessel) => ({
          ...vessel,
          mmsi: String(vessel.mmsi),
        }))
      },
      onSelect: (vessel) => {
        const isNewSelection = selectedVessel.value?.mmsi !== vessel.mmsi
        selectedVessel.value = enrichVesselWithFleetData(vessel)
      mobilePanelCoordinator.claim('vessel')
        vesselDetailsCollapsed.value = false
        routeStartVessel.value = selectedVessel.value
        if (isNewSelection) {
          historyHours.value = 1
          aisController?.showHistory(vessel.mmsi, 1)
        }
      },
      onHistory: ({ hours, range, pointCount, omittedCount = 0 }) => {
        historyHours.value = range ? null : (hours || historyHours.value)
        historyPointCount.value = pointCount
        historyOmittedCount.value = omittedCount
        historyLoading.value = false
        historyError.value = pointCount ? '' : 'No route history is available for this period.'
      },
      onHistoryError: () => {
        historyPointCount.value = 0
        historyOmittedCount.value = 0
        historyLoading.value = false
        historyError.value = 'Route history could not be loaded.'
      },
      onSnapshot: (count) => {
        aisStatusMessage.value = `Loaded ${count} recent vessel positions; delayed vessels are faded automatically`
      },
    })
    aisController.setCompanyMmsis(companyMmsis.value, companyFleetBoats.value)
    aisController.setSpecialVesselMmsis({ nt: ntMmsis.value, police: policeMmsis.value })
    applyVesselGroupFilter()
  } catch (error) {
    console.error('Failed to start AIS layer', error)
    aisStatus.value = 'error'
    aisStatusMessage.value = 'AIS failed to start; canal routes remain available.'
  }

}

watch(() => auth.user?.id, (userId) => {
  if (!userId) return
  loadSharedRouteLinks()
  savedRoutes.value = loadSavedRoutes()
  vesselGroups.value = loadVesselGroups()
  builtInGroupOverrides.value = loadBuiltInGroupOverrides()
  loadTodayPlanning()
  if (canalsGeoJson) {
    aisController?.stop()
    aisController = null
    startAccountMapLayers(canalsGeoJson)
  }
})

onUnmounted(() => {
  waterwayEditMarkers?.remove()
  waterwayEditPreview?.remove()
  reportingMovementPreview?.remove()
  map?.off('click', handleRouteMapClick)
  map?.getContainer().removeEventListener('click', handleRouteLinkPopupClick, true)
  map?.getContainer().removeEventListener('click', handleRoutePlacementClick, true)
  map?.getContainer().removeEventListener('pointerdown', handlePlacementPointerDown, true)
  map?.getContainer().removeEventListener('pointerup', handlePlacementPointerUp, true)
  clearPlannedRoute()
  customRouteLayer?.remove()
  customRouteDraftLayer?.remove()
  selectedRouteLinkLayer?.remove()
  customReportingLayer?.remove()
  for (const timer of routeSuggestionTimers.values()) window.clearTimeout(timer)
  routeSuggestionTimers.clear()
  window.clearTimeout(userLocationErrorTimer)
  userLocationController?.stop()
  aisController?.stop()
  planningRefreshTimer?.()
  routeClosureRefreshTimer?.()
  bridgeLayerController?.destroy()
  for (const layer of navigationLayerControllers.values()) layer.remove()
  navigationLayerControllers.clear()
})
</script>

<style scoped>
.mobile-map-tools-inner > div {
  pointer-events: auto;
}

.route-placement-active :deep(.leaflet-container) {
  cursor: crosshair;
}

.map-shell {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
}

.map {
  height: 100%;
  width: 100%;
}

.search-ais-control {
  right: calc(0.75rem + env(safe-area-inset-right));
  top: calc(0.75rem + env(safe-area-inset-top));
  max-height: calc(100dvh - 1.5rem - env(safe-area-inset-top));
}

.mobile-map-search-bar,
.mobile-search-route-action,
.mobile-route-panel,
.mobile-layers-panel,
.mobile-place-card,
.mobile-map-layers-trigger {
  display: none;
}

.combined-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  max-height: inherit;
  overscroll-behavior: contain;
}

.search-ais-control.toolbar-expanded {
  width: min(24rem, calc(100vw - 1.5rem));
}

.toolbar-expanded .combined-toolbar {
  display: block;
}

.toolbar-expanded .ais-status {
  border-left-width: 0;
  border-top-width: 1px;
}

.vessel-details {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 7rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  bottom: calc(5.5rem + env(safe-area-inset-bottom));
  left: calc(0.75rem + env(safe-area-inset-left));
}

.vessel-details > header {
  flex-shrink: 0;
}

.vessel-details > div:first-child:not(.vessel-details-body) {
  flex-shrink: 0;
  max-height: 22dvh;
  overflow: hidden;
}

.vessel-details--collapsed {
  max-height: none;
}

.mobile-map-interaction-bar {
  display: none;
}

.vessel-data-list {
  display: grid;
  gap: 0.45rem;
}

.vessel-data-list > div {
  align-items: baseline;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
}

.vessel-data-list dt {
  color: rgb(148 163 184);
  font-size: 0.75rem;
}

.vessel-data-list dd {
  font-size: 0.78rem;
  font-weight: 600;
  margin: 0;
  max-width: 65%;
  text-align: right;
}

:deep(.leaflet-top) {
  top: env(safe-area-inset-top);
}

:deep(.leaflet-bottom) {
  bottom: env(safe-area-inset-bottom);
}

:deep(.leaflet-left) {
  left: env(safe-area-inset-left);
}

:deep(.leaflet-right) {
  right: env(safe-area-inset-right);
}

.search-control button {
  cursor: pointer;
}

.mobile-location-control {
  display: none;
}

@media (min-width: 640px) {
  .search-ais-control {
    right: calc(1rem + env(safe-area-inset-right));
    top: calc(1rem + env(safe-area-inset-top));
    max-height: calc(100dvh - 2rem - env(safe-area-inset-top));
  }

  .vessel-details {
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
  }

  .mobile-map-tools {
    bottom: calc(5.5rem + env(safe-area-inset-bottom));
    max-height: calc(100dvh - 7rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }

  .mobile-map-tools-inner {
    align-items: end;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: min(24rem, calc(100vw - 2rem));
  }

  .mobile-map-tools-inner.route-tools-open,
  .mobile-map-tools-inner.map-filters-open {
    width: min(40rem, calc(100vw - 2rem));
  }

  .mobile-map-tools-inner.route-tools-open {
    grid-template-columns: minmax(18rem, 1fr) minmax(9rem, 0.45fr);
  }

  .mobile-map-tools-inner.map-filters-open {
    grid-template-columns: minmax(9rem, 0.45fr) minmax(18rem, 1fr);
  }

  .mobile-map-tools-inner.route-tools-open.map-filters-open {
    grid-template-columns: minmax(18rem, 1.08fr) minmax(18rem, 1fr);
    width: min(48rem, calc(100vw - 2rem));
  }

  .route-tools-panel,
  .map-filters-panel {
    max-height: calc(100dvh - 7rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    min-width: 0;
  }

  .route-tools-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .route-tools-open .route-tools-panel > div {
    max-height: calc(100dvh - 11rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }
}

@media (max-width: 639px) {
  .mobile-map-tools { display: none; }
  .mobile-map-tools.mobile-route-active { display: none; }
  .search-ais-control.route-open {
    bottom: auto;
    left: calc(0.5rem + env(safe-area-inset-left));
    right: calc(0.5rem + env(safe-area-inset-right));
    width: auto;
    max-height: calc(100dvh - var(--mobile-nav-height) - 1.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }

  .mobile-route-panel {
    display: grid;
    gap: 0.65rem;
    max-height: calc(100dvh - var(--mobile-nav-height) - 5.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    overflow-y: auto;
    padding: 0.5rem 0.45rem 0.65rem;
    overscroll-behavior: contain;
  }

  .mobile-route-panel-heading,
  .mobile-route-field,
  .mobile-route-quick-actions,
  .mobile-route-point,
  .mobile-route-result-actions { display: flex; align-items: center; gap: 0.5rem; }
  .mobile-route-panel-heading { justify-content: space-between; padding: 0 0.35rem; font-weight: 800; }
  .mobile-route-panel-heading button { width: 2.5rem; font-size: 1.5rem; }
  .mobile-route-fields { display: grid; gap: 0.5rem; }
  .mobile-route-field { position: relative; min-height: 3.2rem; border: 1px solid rgb(255 255 255 / 0.14); border-radius: 0.9rem; background: rgb(255 255 255 / 0.07); padding: 0.3rem 0.4rem 0.3rem 0.75rem; }
  .mobile-route-field-dot { width: 0.7rem; height: 0.7rem; flex: none; border: 2px solid #86efac; border-radius: 50%; }
  .mobile-route-field-dot--end { border-color: #fca5a5; background: #fca5a5; }
  .mobile-route-field input { width: 100%; min-width: 0; min-height: 2.5rem; background: transparent; color: white; outline: none; }
  .mobile-route-map-pick { flex: none; border-radius: 0.65rem; background: rgb(14 165 233 / 0.18); padding: 0 0.55rem; color: #bae6fd; font-size: 0.75rem; font-weight: 700; }
  .mobile-route-suggestions { position: absolute; z-index: 1300; top: 100%; left: 0; right: 0; max-height: 12rem; overflow-y: auto; border: 1px solid rgb(255 255 255 / 0.2); border-radius: 0.8rem; background: #020617; box-shadow: 0 12px 30px rgb(0 0 0 / 0.45); }
  .mobile-route-suggestions button { display: block; width: 100%; padding: 0.6rem; text-align: left; }
  .mobile-route-suggestions small { display: block; color: #94a3b8; }
  .mobile-route-quick-actions button,
  .mobile-route-result-actions button { flex: 1; border-radius: 0.7rem; background: rgb(14 165 233 / 0.15); padding: 0.55rem; color: #bae6fd; font-size: 0.75rem; font-weight: 700; }
  .mobile-route-points { display: grid; gap: 0.3rem; }
  .mobile-route-point { border-radius: 0.6rem; background: rgb(255 255 255 / 0.07); padding: 0.4rem 0.55rem; font-size: 0.75rem; }
  .mobile-route-point span:nth-child(2) { flex: 1; }
  .mobile-route-point button { width: 2rem; font-size: 1.1rem; }
  .mobile-route-options-toggle { display: flex; justify-content: space-between; border-top: 1px solid rgb(255 255 255 / 0.12); padding: 0.65rem 0.35rem 0; text-align: left; font-weight: 700; }
  .mobile-route-height-warning { display: grid; gap: 0.5rem; border: 1px solid rgb(252 211 77 / 0.4); border-radius: 0.75rem; background: rgb(245 158 11 / 0.16); padding: 0.7rem; color: #fef3c7; font-size: 0.8rem; font-weight: 600; }
  .mobile-route-height-warning button { justify-self: start; border-radius: 0.55rem; background: rgb(245 158 11 / 0.25); padding: 0 0.8rem; color: #fff7ed; font-size: 0.75rem; font-weight: 800; }
  .mobile-route-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
  .mobile-route-options label:not(.mobile-route-zone-option) { display: grid; gap: 0.25rem; font-size: 0.72rem; color: #cbd5e1; }
  .mobile-route-options input:not([type='checkbox']) { width: 100%; min-width: 0; border-radius: 0.55rem; background: rgb(255 255 255 / 0.1); padding: 0.45rem; color: white; }
  .mobile-route-zone-option { grid-column: span 2; display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; }
  .mobile-route-loop { grid-column: span 2; display: flex; gap: 0.5rem; }
  .mobile-route-loop select { flex: 1; border-radius: 0.55rem; background: #1e293b; padding: 0.5rem; color: white; }
  .mobile-route-loop button { flex: 1; border-radius: 0.55rem; background: rgb(14 165 233 / 0.2); padding: 0.5rem; color: #bae6fd; font-weight: 700; }
  .mobile-route-result { display: grid; gap: 0.2rem; border-radius: 0.7rem; background: rgb(245 158 11 / 0.12); padding: 0.65rem; color: #fde68a; font-size: 0.75rem; }
  .mobile-route-result--ok { background: rgb(16 185 129 / 0.12); color: #a7f3d0; }
  .mobile-route-result strong { font-size: 0.95rem; }
  .mobile-route-result-actions { flex-wrap: wrap; }
  .mobile-route-result-actions button { flex-basis: calc(50% - 0.25rem); }
  .mobile-route-save { display: flex; gap: 0.5rem; }
  .mobile-route-save input { flex: 1; min-width: 0; border-radius: 0.6rem; background: rgb(255 255 255 / 0.1); padding: 0.55rem; }
  .mobile-route-save button { border-radius: 0.6rem; background: rgb(16 185 129 / 0.2); padding: 0.55rem 0.75rem; color: #a7f3d0; font-weight: 700; }
  .mobile-route-details { border-radius: 0.7rem; background: rgb(255 255 255 / 0.06); padding: 0.6rem; font-size: 0.75rem; }
  .mobile-route-details summary { cursor: pointer; font-weight: 700; }
  .mobile-route-details button { width: 100%; padding: 0.4rem; text-align: left; color: #bae6fd; }
  .mobile-route-pick-prompt { display: flex; align-items: center; gap: 0.5rem; border-radius: 0.7rem; background: rgb(14 165 233 / 0.16); padding: 0.6rem; color: #bae6fd; font-size: 0.8rem; }
  .mobile-route-pick-prompt span { flex: 1; }
  .mobile-route-pick-prompt button { text-decoration: underline; }
  .search-ais-control,
  .search-ais-control.toolbar-expanded {
    bottom: auto;
    left: calc(0.5rem + env(safe-area-inset-left));
    right: calc(0.5rem + env(safe-area-inset-right));
    top: calc(0.5rem + env(safe-area-inset-top));
    width: auto;
    max-height: calc(100dvh - var(--mobile-nav-height) - 1.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }

  .combined-toolbar,
  .toolbar-expanded .combined-toolbar {
    display: block;
    max-height: inherit;
    overflow-y: auto;
  }

  .desktop-search-trigger { display: none !important; }

  .mobile-map-search-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .mobile-map-search-trigger {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    padding: 0.25rem 0.75rem;
    text-align: left;
    font-size: 0.92rem;
    font-weight: 600;
  }

  .mobile-map-route-trigger,
  .mobile-map-ais-trigger {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.75rem;
    border-radius: 0.75rem;
    background: rgb(14 165 233 / 0.22);
    color: #bae6fd;
  }

  .mobile-map-ais-trigger { width: 2.9rem; background: rgb(255 255 255 / 0.1); color: white; font-size: 0.7rem; font-weight: 800; }

  .mobile-map-layers-trigger { display: grid; flex: none; place-items: center; width: 2.75rem; border-radius: 0.75rem; background: rgb(255 255 255 / 0.1); color: white; }
  .mobile-layers-panel { display: grid; gap: 0.35rem; max-height: min(70dvh, 38rem); overflow-y: auto; padding: 0.7rem; overscroll-behavior: contain; }
  .mobile-layers-heading { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; }
  .mobile-layers-heading button { min-width: 2.75rem; font-size: 1.5rem; }
  .mobile-map-styles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgb(255 255 255 / 0.13); }
  .mobile-map-styles button { display: grid; gap: 0.3rem; border: 2px solid transparent; border-radius: 0.8rem; padding: 0.3rem; background: rgb(255 255 255 / 0.06); text-align: center; font-size: 0.75rem; font-weight: 700; }
  .mobile-map-styles button.mobile-map-style-active { border-color: #38bdf8; color: #bae6fd; }
  .mobile-map-style-preview { height: 3.2rem; border-radius: 0.5rem; }
  .mobile-map-style-preview--street { background: repeating-linear-gradient(135deg, #d8e8d4 0 12px, #f6f2e8 12px 18px, #b1d5e8 18px 25px); }
  .mobile-map-style-preview--aerial { background: repeating-linear-gradient(25deg, #305a3d 0 14px, #4a7249 14px 23px, #69735b 23px 29px, #455a71 29px 38px); }
  .mobile-layers-subheading { padding: 0.45rem 0.15rem 0.2rem; font-size: 0.76rem; color: #cbd5e1; }
  .mobile-layer-filter { display: flex; align-items: center; gap: 0.6rem; min-height: 2.9rem; padding: 0.3rem 0.4rem; border-radius: 0.6rem; background: rgb(255 255 255 / 0.05); font-size: 0.77rem; }
  .mobile-layer-filter input { width: 1.1rem; height: 1.1rem; flex: none; }
  .mobile-layer-filter i { width: 0.6rem; height: 0.6rem; border-radius: 50%; flex: none; }
  .mobile-layer-filter span { flex: 1; }
  .mobile-layer-filter small { color: #94a3b8; }
  .mobile-layer-admin { display: flex; gap: 0.5rem; padding-top: 0.5rem; }
  .mobile-layer-admin button { flex: 1; border-radius: 0.6rem; background: rgb(14 165 233 / 0.18); color: #bae6fd; font-size: 0.75rem; font-weight: 700; }
  .mobile-place-card { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem; border-top: 1px solid rgb(255 255 255 / 0.14); }
  .mobile-place-card > div { display: grid; min-width: 0; flex: 1; }
  .mobile-place-card strong, .mobile-place-card small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mobile-place-card small { color: #94a3b8; font-size: 0.7rem; }
  .mobile-place-card button:nth-child(2) { display: flex; align-items: center; gap: 0.35rem; border-radius: 0.6rem; padding: 0 0.65rem; background: #0284c7; font-size: 0.8rem; font-weight: 700; }
  .mobile-place-card button:last-child { width: 2rem; font-size: 1.4rem; }

  .mobile-search-route-action {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    margin-top: 0.7rem;
    padding: 0.75rem;
    border-radius: 0.75rem;
    background: rgb(14 165 233 / 0.15);
    color: #bae6fd;
    text-align: left;
    font-weight: 700;
  }

  .mobile-search-route-action span { margin-left: auto; }
  .search-ais-control .ais-status { display: none; }
  .search-ais-control.groups-open .ais-status { display: block; }

  .mobile-map-tools-inner:not(.mobile-map-tools-expanded) .route-tools-panel { display: none; }
  .mobile-map-tools-inner:not(.mobile-map-tools-expanded) { grid-template-columns: minmax(0, 1fr); width: max-content; }
  .mobile-location-control {
    align-items: flex-end;
    bottom: calc(var(--mobile-nav-height) + 0.75rem + env(safe-area-inset-bottom));
    display: flex;
    gap: 0.5rem;
    left: calc(0.75rem + env(safe-area-inset-left));
    pointer-events: none;
    position: absolute;
    z-index: 1450;
  }

  .mobile-location-control button {
    aspect-ratio: 1;
    align-items: center;
    background: rgb(2 6 23 / 0.9);
    border: 1px solid rgb(255 255 255 / 0.25);
    border-radius: 50%;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.38);
    color: white;
    display: flex;
    flex: 0 0 3rem;
    height: 3rem;
    justify-content: center;
    max-height: 3rem;
    max-width: 3rem;
    min-height: 3rem;
    min-width: 3rem;
    padding: 0;
    pointer-events: auto;
    touch-action: manipulation;
    width: 3rem;
  }

  .mobile-location-control button.mobile-location-control--active {
    background: rgb(2 132 199 / 0.95);
    border-color: rgb(125 211 252 / 0.8);
  }

  .mobile-location-control button svg {
    height: 1.35rem;
    width: 1.35rem;
  }

  .mobile-location-control span {
    background: rgb(2 6 23 / 0.92);
    border: 1px solid rgb(248 113 113 / 0.45);
    border-radius: 0.75rem;
    color: rgb(254 202 202);
    font-size: 0.7rem;
    max-width: min(15rem, calc(100vw - 5rem));
    padding: 0.5rem 0.65rem;
    pointer-events: auto;
  }

  :deep(.guest-sign-in-control.mobile-nav-account) {
    left: auto !important;
    right: calc(4rem + env(safe-area-inset-right));
    width: 5.6rem;
  }

  :deep(.guest-sign-in-control .mobile-nav-button) {
    height: 3rem;
    padding: 0.35rem 0.65rem;
  }

  .mobile-location-control.mobile-location-control--guest {
    bottom: calc(0.4rem + env(safe-area-inset-bottom));
    left: auto;
    right: calc(0.5rem + env(safe-area-inset-right));
    z-index: 1650;
  }

  .map-shell {
    --mobile-nav-height: 4.6rem;
  }

  :deep(.mobile-nav-item) {
    bottom: calc(0.4rem + env(safe-area-inset-bottom)) !important;
    top: auto !important;
    width: calc(20vw - 0.24rem);
  }

  :deep(.mobile-nav-fleet) { left: 0.4rem !important; }
  :deep(.mobile-nav-planning) { left: calc(20vw + 0.08rem) !important; }
  :deep(.mobile-nav-duty) { left: calc(40vw + 0.08rem) !important; }
  :deep(.mobile-nav-inventory) { left: calc(60vw + 0.08rem) !important; }
  :deep(.mobile-nav-account) { left: calc(80vw - 0.08rem) !important; }

  :deep(.mobile-nav-button) {
    align-items: center;
    background: rgb(2 6 23 / 0.94);
    border-color: rgb(255 255 255 / 0.12);
    border-radius: 0.9rem;
    display: flex;
    flex-direction: column;
    font-size: 0.68rem;
    font-weight: 700;
    gap: 0.2rem;
    height: 3.9rem;
    justify-content: center;
    line-height: 1;
    padding: 0.35rem 0.2rem;
    text-align: center;
    width: 100%;
  }

  :deep(.mobile-nav-button > svg),
  :deep(.mobile-nav-icon) {
    display: block !important;
    height: 1.15rem;
    width: 1.15rem;
  }

  :deep(.mobile-nav-account .mobile-nav-button > span:first-child) {
    border-radius: 0.55rem;
    height: 1.55rem;
    width: 1.55rem;
  }

  :deep(.mobile-nav-label) { display: none; }
  :deep(.mobile-nav-short-label) { display: inline !important; }

  :deep(.mobile-nav-item > section) {
    border-radius: 1rem;
    bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
    left: 0.4rem;
    max-height: none;
    max-width: none;
    position: fixed;
    right: 0.4rem;
    top: calc(0.4rem + env(safe-area-inset-top));
    width: auto;
  }

  :deep(.mobile-nav-item > section > header) {
    flex-wrap: wrap;
    padding: 0.7rem 0.9rem;
  }

  .map-interaction-active :deep(.mobile-nav-item),
  .map-interaction-active:not(.route-placement-active) .mobile-map-tools,
  .map-interaction-active .search-ais-control,
  .map-interaction-active .vessel-details,
  .map-interaction-active .map-editor-panel,
  .map-interaction-active .route-link-editor-panel {
    display: none;
  }

  .mobile-map-interaction-bar {
    align-items: center;
    background: rgb(2 6 23 / 0.96);
    border: 1px solid rgb(125 211 252 / 0.35);
    border-radius: 1rem;
    bottom: calc(0.5rem + env(safe-area-inset-bottom));
    box-shadow: 0 18px 45px rgb(0 0 0 / 0.45);
    color: white;
    display: flex;
    gap: 0.5rem;
    left: calc(0.5rem + env(safe-area-inset-left));
    padding: 0.65rem;
    pointer-events: auto;
    position: fixed;
    right: calc(0.5rem + env(safe-area-inset-right));
    z-index: 1800;
  }

  .mobile-map-interaction-bar button {
    border-radius: 0.7rem;
    flex: 0 0 auto;
    font-size: 0.75rem;
    font-weight: 800;
    min-height: 44px;
    padding-inline: 0.8rem;
  }

  .mobile-map-interaction-done {
    background: rgb(14 165 233);
  }

  .mobile-map-interaction-cancel {
    background: rgb(255 255 255 / 0.1);
  }

  .search-ais-control {
    right: calc(0.5rem + env(safe-area-inset-right));
    top: calc(0.5rem + env(safe-area-inset-top));
    max-height: calc(100dvh - 1rem - env(safe-area-inset-top));
  }

  .search-ais-control.toolbar-expanded {
    bottom: calc(var(--mobile-nav-height) + 0.5rem + env(safe-area-inset-bottom));
    left: calc(0.5rem + env(safe-area-inset-left));
    max-height: calc(100dvh - var(--mobile-nav-height) - 1rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    overflow: hidden;
    width: auto;
  }

  .toolbar-expanded .combined-toolbar {
    max-height: inherit;
    overscroll-behavior: contain;
  }

  .ais-status {
    min-width: 0;
  }

  .ais-status > div {
    width: auto;
  }

  .ais-message { display: none; }
  .ais-counts { font-size: 0.7rem; }

  .mobile-map-tools {
    bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
    left: 0.5rem;
    right: 0.5rem;
  }

  .mobile-map-tools-inner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .mobile-map-tools-inner.mobile-map-tools-expanded {
    background: rgb(2 6 23 / 0.94);
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 1rem;
    bottom: calc(var(--mobile-nav-height) + 0.5rem + env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    left: 0.5rem;
    max-height: calc(100dvh - var(--mobile-nav-height) - 1rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    overflow-y: auto;
    padding: 0.35rem;
    position: fixed;
    right: 0.5rem;
    width: auto;
  }

  .mobile-map-tools-inner > div {
    border-radius: 0.9rem;
    min-width: 0;
  }

  .mobile-map-tools-inner.mobile-map-tools-expanded > div {
    max-height: none;
  }

  .route-placement-active .mobile-map-tools-inner.mobile-map-tools-expanded {
    bottom: calc(5.5rem + env(safe-area-inset-bottom));
    max-height: 40dvh;
    overflow: visible;
    padding: 0;
    border: 0;
    background: none;
  }

  .route-placement-active .route-tools-panel {
    display: flex;
    flex-direction: column;
    max-height: 40dvh !important;
    overflow: hidden;
  }

  .route-placement-active .route-tools-panel > div {
    min-height: 0;
    overflow-y: auto;
  }

  .route-placement-active .map-filters-panel {
    display: none;
  }

  .mobile-map-tools-inner button,
  .search-ais-control button {
    min-height: 44px;
    touch-action: manipulation;
  }

  .mobile-map-tools-inner input:not([type="checkbox"]):not([type="radio"]),
  .mobile-map-tools-inner select,
  .search-ais-control input:not([type="checkbox"]):not([type="radio"]),
  .search-ais-control select {
    font-size: 16px;
    min-height: 44px;
  }

  .route-tools-panel > button,
  .map-filters-panel > button {
    font-size: 0.9rem;
    padding-inline: 0.75rem;
  }

  .route-tools-panel > div,
  .map-filters-panel > div {
    max-height: none !important;
  }

  .map-filters-panel label {
    min-height: 44px;
    padding-block: 0.45rem;
  }

  .vessel-details {
    bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
    left: 0.4rem;
    max-height: calc(100dvh - var(--mobile-nav-height) - 0.8rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    max-width: none;
    right: 0.4rem;
    width: auto;
  }

  .vessel-details > div:last-child {
    max-height: calc(100dvh - 13rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }

  .vessel-details.vessel-details--collapsed {
    bottom: calc(var(--mobile-nav-height) + 0.45rem + env(safe-area-inset-bottom));
    max-height: none;
  }

  .vessel-details--collapsed header {
    padding-block: 0.65rem;
  }

  :deep(.leaflet-bottom) {
    bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom));
  }

  .search-ais-control.toolbar-expanded {
    bottom: auto;
    right: calc(0.5rem + env(safe-area-inset-right));
    max-height: calc(100dvh - var(--mobile-nav-height) - 1.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }

  .search-ais-control.route-open {
    bottom: auto;
    left: calc(0.5rem + env(safe-area-inset-left));
    right: calc(0.5rem + env(safe-area-inset-right));
    max-height: calc(100dvh - var(--mobile-nav-height) - 1.5rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }

  .search-ais-control:not(.toolbar-expanded) {
    left: calc(0.5rem + env(safe-area-inset-left));
  }

  .mobile-map-tools-inner:not(.mobile-map-tools-expanded) {
    grid-template-columns: minmax(0, 1fr);
    width: max-content;
  }
}

:deep(.combined-scale-control) {
  color: rgb(15 23 42);
  display: grid;
  grid-template-areas:
    "label label"
    "vertical ."
    "corner horizontal";
  grid-template-columns: auto auto;
  grid-template-rows: auto auto auto;
  justify-items: start;
  margin-left: 10px;
  margin-bottom: 10px;
  pointer-events: none;
}

:deep(.combined-scale-control__label) {
  grid-area: label;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 2px;
  text-shadow:
    0 1px 0 rgb(255 255 255 / 0.75),
    1px 0 0 rgb(255 255 255 / 0.75),
    0 -1px 0 rgb(255 255 255 / 0.75),
    -1px 0 0 rgb(255 255 255 / 0.75);
}

:deep(.combined-scale-control__horizontal) {
  align-self: end;
  border-bottom: 2px solid rgb(15 23 42 / 0.75);
  border-right: 2px solid rgb(15 23 42 / 0.75);
  grid-area: horizontal;
  height: 7px;
}

:deep(.combined-scale-control__vertical) {
  align-self: end;
  border-left: 2px solid rgb(15 23 42 / 0.75);
  border-top: 2px solid rgb(15 23 42 / 0.75);
  grid-area: vertical;
  justify-self: start;
  width: 7px;
}

:deep(.combined-scale-control__corner) {
  border-bottom: 2px solid rgb(15 23 42 / 0.75);
  border-left: 2px solid rgb(15 23 42 / 0.75);
  grid-area: corner;
  height: 7px;
  width: 7px;
}

:deep(.bridge-height-marker) {
  background: transparent;
  border: 0;
}

:deep(.bridge-height-marker span) {
  background: rgb(120 53 15 / 0.92);
  border: 1px solid rgb(251 191 36 / 0.8);
  border-radius: 999px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.35);
  color: white;
  display: block;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 5px;
  text-align: center;
  white-space: nowrap;
}

:deep(.bridge-height-marker.bridge-height-marker--unlinked span) {
  background: #ef4444;
  border-color: #fca5a5;
  color: white;
}

:deep(.bridge-height-marker span small) {
  display: block;
  font-size: 8px;
  font-weight: 800;
  line-height: 1.1;
  margin-top: 1px;
}

:deep(.bridge-height-marker--waterkaart span) {
  background: rgb(7 89 133 / 0.94);
  border-color: rgb(125 211 252 / 0.85);
}

:deep(.bridge-height-marker--blocked span) {
  background: #991b1b;
  border-color: #fca5a5;
  font-size: 8px;
  line-height: 1.1;
  padding: 2px 4px;
}

:deep(.bridge-popup__navigation-warning) {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #991b1b;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  padding: 8px;
}

:deep(.bridge-popup > strong) {
  display: block;
  font-size: 14px;
  margin-bottom: 7px;
}

:deep(.bridge-popup > div),
:deep(.bridge-popup__section > div) {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-top: 3px;
}

:deep(.bridge-popup > div span),
:deep(.bridge-popup__section > div span) { color: #64748b; }

:deep(.bridge-popup__section) {
  border-top: 1px solid #e2e8f0;
  margin-top: 10px;
  padding-top: 8px;
}

:deep(.bridge-popup__section h3) {
  color: #0369a1;
  font-size: 12px;
  margin: 0 0 5px;
}

:deep(.bridge-popup__block) {
  align-items: flex-start;
}

:deep(.bridge-popup__block b) {
  line-height: 1.35;
  max-width: 190px;
  text-align: right;
}

:deep(.bridge-popup a) {
  color: #0369a1;
  font-weight: 700;
}

:deep(.route-link-popup) {
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
}

:deep(.route-link-popup button) {
  background: #0284c7;
  border: 0;
  border-radius: 7px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  padding: 7px 9px;
  text-align: left;
}

:deep(.route-link-popup button + button) {
  background: #e2e8f0;
  color: #0f172a;
}

:deep(.route-link-popup button:disabled) {
  background: #cbd5e1;
  color: #64748b;
  cursor: not-allowed;
}

:deep(.map-admin-popup) { border-top: 1px solid #d1fae5; display: grid; gap: 6px; margin-top: 8px; padding-top: 8px; }
:deep(.map-admin-popup button) { width: 100%; border: 0; border-radius: 7px; background: #059669; color: white; cursor: pointer; font-size: 12px; font-weight: 800; padding: 7px 9px; }

:deep(.bridge-popup small) { display: block; margin-top: 8px; color: #64748b; }

@media (max-width: 639px) {
  .search-ais-control, .search-ais-control.toolbar-expanded, .search-ais-control.route-open {
    top: calc(var(--mobile-viewport-top, 0px) + 8px); bottom: auto;
    left: 8px; right: 8px; width: auto; max-height: none; overflow: visible;
  }
  .combined-toolbar, .toolbar-expanded .combined-toolbar { max-height: none; overflow: visible; }
  .ais-status { display: none; }
  .mobile-sheet-open :deep(.site-navigation), .mobile-keyboard-open :deep(.site-navigation),
  .mobile-sheet-open .mobile-location-control { display: none; }
  .mobile-keyboard-open :deep(.mobile-nav-item > button) { visibility: hidden; }
  :deep(.mobile-nav-item > section) {
    top: calc(var(--mobile-viewport-top, 0px) + 8px);
    bottom: calc(var(--mobile-viewport-bottom, 0px) + var(--mobile-bottom-space));
    max-height: calc(var(--mobile-visible-height, 100dvh) - var(--mobile-bottom-space) - 16px);
  }
  :deep(.mobile-map-sheet-body input), :deep(.mobile-map-sheet-body textarea),
  :deep(.mobile-nav-item input), :deep(.mobile-nav-item textarea), :deep(.mobile-nav-item select) { font-size: 16px; }
  .mobile-route-panel, .mobile-layers-panel { margin: 0; padding: 0; border: 0; max-height: none; overflow: visible; }
  .mobile-route-panel-heading, .mobile-layers-heading, .search-panel-heading, .search-panel-fields { display: none; }
  .mobile-map-search-trigger { gap: 8px; padding: 0 8px; cursor: text; }
  .mobile-map-search-trigger input { flex: 1; min-width: 0; width: 100%; border: 0; border-radius: 0; background: transparent; padding: 0; color: inherit; outline: none; }
  .mobile-map-search-trigger input::placeholder { color: #cbd5e1; opacity: 1; }
  .mobile-map-search-trigger:focus-within { border-radius: 10px; outline: 2px solid #7dd3fc; outline-offset: -2px; }
  #canal-search-panel { max-height: none; overflow: visible; }
  .mobile-route-suggestions { position: static; max-height: none; }
  .vessel-details, .vessel-details.vessel-details--collapsed {
    position: static; width: 100%; max-width: none; max-height: none; margin: 0; border: 0; box-shadow: none;
  }
  .vessel-details > .vessel-details-body:last-child { max-height: none; overflow: visible; }
  #canal-search-panel > .overflow-auto { max-height: none; overflow: visible; }
  :deep(.mobile-map-sheet-body button) { min-height: 44px; touch-action: manipulation; }
  :deep(.mobile-map-sheet-body input:not([type="checkbox"]):not([type="radio"])), :deep(.mobile-map-sheet-body select) { min-height: 44px; font-size: 16px; }
}

</style>
