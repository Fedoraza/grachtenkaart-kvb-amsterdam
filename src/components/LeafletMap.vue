<template>
  <div class="map-shell">
    <AccountMenu />
    <PlanningPanel @show-boat="focusPlanningBoatOnMap" @show-tour-route="showPlanningTourRoute" @schedule-updated="loadTodayPlanning" />
    <FleetPanel @show-on-map="focusFleetBoatOnMap" />
    <div class="pointer-events-none absolute bottom-24 left-3 z-[1180] sm:left-4">
      <div class="pointer-events-auto grid w-72 gap-2 text-white">
      <div class="rounded-2xl border border-white/15 bg-slate-950/90 p-2 shadow-xl backdrop-blur-md">
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
          <div class="mt-2 grid grid-cols-2 gap-1.5">
            <button type="button" class="rounded-lg bg-emerald-400/15 px-2 py-1.5 font-bold text-emerald-100 hover:bg-emerald-400/25" @click="setRouteStartFromUserLocation">Start mijn locatie</button>
            <button type="button" class="rounded-lg bg-orange-400/15 px-2 py-1.5 font-bold text-orange-100 hover:bg-orange-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!routeStartVessel" @click="setRouteStartFromSelectedVessel">{{ routeStartVessel ? `Start ${routeStartVesselLabel}` : 'Klik eerst AIS boot' }}</button>
          </div>
          <p class="m-0 mt-1 text-[10px] text-slate-400">Voor AIS-start: klik een boot op de kaart. Daarna blijft die boot hier beschikbaar als startpunt.</p>
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
            <div class="grid grid-cols-[1fr_auto] items-end gap-1.5">
              <label class="grid gap-1 text-[10px] text-slate-400">Snelheid<input v-model.number="routeSpeedValue" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="0.5" step="0.1" /></label>
              <select v-model="routeSpeedUnit" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white">
                <option value="kmh">km/u</option>
                <option value="knots">knopen</option>
              </select>
            </div>
            <div class="grid grid-cols-3 gap-1.5">
              <label class="grid gap-1 text-[10px] text-slate-400">Hoogte m<input v-model.number="routeBoatProfile.heightMeters" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="0" step="0.05" placeholder="bv 1.65" /></label>
              <label class="grid gap-1 text-[10px] text-slate-400">Breedte m<input v-model.number="routeBoatProfile.widthMeters" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="0" step="0.05" placeholder="bv 2.2" /></label>
              <label class="grid gap-1 text-[10px] text-slate-400">Diepgang m<input v-model.number="routeBoatProfile.draftMeters" class="rounded bg-slate-900 px-1.5 py-1 text-xs text-white" type="number" min="0" step="0.05" placeholder="bv 0.7" /></label>
            </div>
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
            <div class="rounded-lg bg-white/5 p-2"><span class="block text-[10px] uppercase text-slate-400">Snelheid</span><strong>{{ formatRouteSpeed(routeResult.speedKnots) }}</strong></div>
            <div class="rounded-lg bg-white/5 p-2"><span class="block text-[10px] uppercase text-slate-400">Drukte</span><strong>{{ routeResult.trafficLevel }}<span v-if="routeResult.trafficDelayMinutes"> +{{ routeResult.trafficDelayMinutes }} min</span></strong></div>
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
              <li v-for="(bridge, index) in routeBridgeItems.slice(0, 12)" :key="`${bridge.number}-${bridge.name}-${index}`" class="grid grid-cols-[auto_1fr_auto_auto] gap-2 rounded bg-white/5 px-2 py-1">
                <span class="text-slate-400">{{ index + 1 }}</span>
                <span class="min-w-0 truncate">{{ bridge.name }}<span v-if="bridge.number" class="text-slate-400"> · {{ bridge.number }}</span></span>
                <span class="text-slate-400">{{ bridge.height }}</span>
                <button v-if="isAdmin" type="button" class="text-sky-300 hover:text-sky-200" @click="editRouteLink('bridge', bridge)">Edit</button>
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
              <li v-for="point in routeReportingItems.slice(0, 12)" :key="`${point.number}-${point.name}`" class="grid grid-cols-[auto_1fr_auto] gap-2 rounded bg-white/5 px-2 py-1">
                <span class="text-slate-400">{{ point.number }}</span>
                <span class="min-w-0 truncate"><span v-if="point.direction" class="text-slate-400">{{ point.direction }} · </span>{{ point.call }}</span>
                <button v-if="isAdmin" type="button" class="text-sky-300 hover:text-sky-200" @click="editRouteLink('reporting', point)">Edit</button>
              </li>
              <li v-if="!routeReportingLoading && !routeReportingItems.length" class="rounded bg-white/5 px-2 py-1 text-[10px] text-slate-400">Geen meldpunten in deze vaarrichting gevonden.</li>
            </ol>
          </div>
          <div v-if="isAdmin" class="mt-2 rounded-xl border border-sky-300/20 bg-sky-400/10 p-2">
            <div class="grid gap-1.5">
              <button type="button" class="rounded-lg px-2 py-1.5 font-bold text-sky-100 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-40" :class="routeLinkMapMode ? 'bg-sky-400/30' : 'bg-sky-400/15'" :disabled="!['ok', 'partial'].includes(routeResult?.status)" @click="toggleRouteLinkMapMode">{{ routeLinkMapMode ? 'Stop koppelen op kaart' : 'Koppel op kaart' }}</button>
              <p class="m-0 text-[10px] text-slate-300">Sleep een brug of marifoonpunt naar de blauwe routelijn. De tooltip laat zien waar hij nu aan gekoppeld is.</p>
              <p v-if="routeLinkMapStatus" class="m-0 rounded bg-sky-950/60 px-2 py-1 text-[10px] text-sky-100">{{ routeLinkMapStatus }}</p>
            </div>
            <button type="button" class="mt-2 flex w-full items-center justify-between border-t border-white/10 pt-2 text-left text-[10px] font-black uppercase tracking-wide text-sky-100" @click="routeLinkEditorOpen = !routeLinkEditorOpen"><span>Geavanceerd bewerken</span><span>{{ routeLinkEditorOpen ? '−' : '+' }}</span></button>
            <form v-if="routeLinkEditorOpen" class="mt-2 grid gap-1.5" @submit.prevent="saveRouteLinkOverride">
              <div class="grid grid-cols-[1fr_1fr] gap-1.5">
                <select v-model="routeLinkEditor.kind" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white">
                  <option value="bridge">Brug</option>
                  <option value="reporting">Marifoonpunt</option>
                </select>
                <input v-model.trim="routeLinkEditor.id" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white" :placeholder="routeLinkEditor.kind === 'bridge' ? 'Brugnummer' : 'Meldpuntnummer'" />
              </div>
              <input v-model.trim="routeLinkEditor.name" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="Naam / label optioneel" />
              <textarea v-model.trim="routeLinkEditor.routeNames" class="min-h-16 rounded bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="Vaarroute(s) of kanaalnamen, gescheiden met komma's"></textarea>
              <div v-if="currentRouteNames.length" class="flex max-h-16 flex-wrap gap-1 overflow-auto">
                <button v-for="name in currentRouteNames" :key="name" type="button" class="rounded bg-white/10 px-1.5 py-1 text-[10px] text-sky-100 hover:bg-white/20" @click="appendRouteLinkName(name)">{{ name }}</button>
              </div>
              <div class="grid grid-cols-[1fr_1fr] gap-1.5">
                <input v-model.trim="routeLinkEditor.height" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="Brughoogte optioneel" />
                <input v-model.trim="routeLinkEditor.bearing" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="Meldrichting graden" />
              </div>
              <input v-model.trim="routeLinkEditor.call" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="Marifoontekst optioneel" />
              <div class="grid grid-cols-3 gap-1.5">
                <button type="submit" class="rounded-lg bg-sky-400/25 px-2 py-1.5 font-bold text-sky-100 hover:bg-sky-400/35">Opslaan</button>
                <button type="button" class="rounded-lg bg-white/10 px-2 py-1.5 font-bold hover:bg-white/20" @click="resetRouteLinkEditor">Nieuw</button>
                <button type="button" class="rounded-lg bg-red-400/15 px-2 py-1.5 font-bold text-red-100 hover:bg-red-400/25" @click="deleteRouteLinkOverride">Verwijder</button>
              </div>
              <p class="m-0 text-[10px] text-slate-300">Override bepaalt aan welke vaarroute(s) de brug of melding gekoppeld is. Laat velden leeg om brondata te blijven gebruiken.</p>
              <div v-if="routeLinkOverrideList.length" class="mt-1 grid max-h-28 gap-1 overflow-auto border-t border-white/10 pt-1">
                <button v-for="override in routeLinkOverrideList" :key="`${override.kind}-${override.id}`" type="button" class="grid grid-cols-[auto_1fr] gap-2 rounded bg-white/5 px-2 py-1 text-left hover:bg-white/10" @click="editSavedRouteLink(override)">
                  <span class="text-slate-400">{{ override.kind === 'bridge' ? 'Brug' : 'VHF' }} {{ override.id }}</span>
                  <span class="truncate">{{ override.routeNames.join(', ') || override.name || 'Geen route ingevuld' }}</span>
                </button>
              </div>
            </form>
          </div>
          <p v-if="routeResult?.trafficVesselCount" class="m-0 mt-1.5 text-[10px] text-cyan-100">Drukte voorspelling gebruikt {{ routeResult.trafficVesselCount }} live AIS boot{{ routeResult.trafficVesselCount === 1 ? '' : 'en' }} dicht bij de route.</p>
          <p v-if="routeResult?.virtualSegmentCount" class="m-0 mt-1.5 text-[10px] text-amber-200">{{ routeResult.virtualSegmentCount }} korte netwerkverbinding{{ routeResult.virtualSegmentCount === 1 ? '' : 'en' }} gebruikt bij ontbrekende kaartdata.</p>
          <p v-if="routeClosurePoints.length" class="m-0 mt-1.5 text-[10px] text-amber-200">Routeplanning vermijdt {{ routeClosurePoints.length }} scheepvaartbeperking{{ routeClosurePoints.length === 1 ? '' : 'en' }}.</p>
          <div class="mt-2 rounded-xl bg-black/20 p-2">
            <strong class="text-[10px] uppercase tracking-wide text-slate-300">Opgeslagen routes</strong>
            <div class="mt-1 grid grid-cols-[1fr_auto] gap-1.5">
              <input v-model.trim="routeSaveName" class="rounded bg-slate-900 px-2 py-1.5 text-xs text-white placeholder:text-slate-500" placeholder="Naam voor deze route" />
              <button type="button" class="rounded-lg bg-emerald-400/15 px-2 py-1.5 font-bold text-emerald-100 hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!canSaveCurrentRoute" @click="saveCurrentRoute">Bewaar</button>
            </div>
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
          <div class="mt-2 grid grid-cols-5 gap-1.5">
            <button type="button" class="rounded-lg bg-white/10 px-2 py-1.5 font-bold hover:bg-white/20" @click="swapRoutePoints">Wissel</button>
            <button type="button" class="rounded-lg bg-white/10 px-2 py-1.5 font-bold hover:bg-white/20" @click="fitPlannedRoute">Zoom</button>
            <button type="button" class="rounded-lg bg-cyan-400/15 px-2 py-1.5 font-bold text-cyan-100 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="routeExportLoading || !['ok', 'partial'].includes(routeResult?.status)" @click="exportPlannedRoute('html')">{{ routeExportLoading ? '...' : 'HTML' }}</button>
            <button type="button" class="rounded-lg bg-cyan-400/15 px-2 py-1.5 font-bold text-cyan-100 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40" :disabled="routeExportLoading || !['ok', 'partial'].includes(routeResult?.status)" @click="exportPlannedRoute('pdf')">PDF</button>
            <button type="button" class="rounded-lg bg-red-400/15 px-2 py-1.5 font-bold text-red-100 hover:bg-red-400/25" @click="clearPlannedRoute">Clear</button>
          </div>
          <p class="m-0 mt-2 text-[10px] leading-snug text-slate-400">Route gebruikt mapped waterwegen, verboden grachten en oneway-tags. Controleer altijd actuele stremmingen/bruggen.</p>
        </div>
      </div>
      <div class="rounded-2xl border border-white/15 bg-slate-950/90 p-2 shadow-xl backdrop-blur-md">
        <button type="button" class="flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-black hover:bg-white/10" @click="navigationLayersOpen = !navigationLayersOpen"><span>Vaarkaartfilters</span><span>{{ navigationLayersOpen ? '−' : '+' }}</span></button>
        <div v-if="navigationLayersOpen" class="mt-1 grid gap-1 border-t border-white/10 pt-2">
          <label v-for="filter in navigationFilters" :key="filter.id" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/10">
            <input type="checkbox" :checked="activeNavigationLayers.includes(filter.id)" :disabled="loadingNavigationLayers.includes(filter.id)" @change="toggleNavigationLayer(filter.id)" />
            <i class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: filter.color }"></i><span class="min-w-0 flex-1">{{ filter.name }}</span><span v-if="navigationLayerCounts[filter.id] !== undefined" class="text-slate-400">{{ navigationLayerCounts[filter.id] }}</span>
          </label>
          <p v-if="navigationLayerError" class="m-0 rounded-lg bg-red-950/80 px-2 py-1 text-[10px] text-red-200">{{ navigationLayerError }}</p>
        </div>
      </div>
      </div>
    </div>
    <div
      class="search-control pointer-events-none absolute z-[1100] max-w-[24rem]"
      :class="isSearchOpen ? 'w-[calc(100vw-1.5rem)] sm:w-[24rem]' : 'w-auto'"
    >
      <div class="pointer-events-auto rounded-2xl border border-white/20 bg-slate-950/50 p-1 text-slate-50 shadow-[0_18px_50px_rgba(0,0,0,0.30)] backdrop-blur-md sm:p-2">
        <div v-if="!isSearchOpen">
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
        </div>

        <div id="canal-search-panel" :class="isSearchOpen ? 'block' : 'hidden'">
          <div class="mb-2 flex items-center justify-between gap-3">
            <label class="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-slate-200/70 sm:text-[0.72rem]" for="canal-search-input">Search canals and boats</label>
            <div class="flex gap-2">
              <button type="button" class="rounded-xl border border-white/10 px-3 py-2 text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70" :class="isUserLocationActive ? 'bg-white/30' : 'bg-white/10'" :aria-label="locationButtonLabel" :title="locationButtonLabel" @click="activateUserLocation">
                <component :is="isUserLocationActive ? LocateFixed : Locate" class="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" class="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-medium text-inherit transition hover:bg-white/15 focus:outline focus:outline-1 focus:outline-offset-1 focus:outline-sky-300/70" @click="collapseSearch">Hide</button>
            </div>
          </div>
          <div class="flex gap-2">
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

            <p v-if="searchQuery && !searchResults.length" class="m-0 rounded-2xl border border-dashed border-white/10 px-3 py-2 text-[0.84rem] text-slate-200/65">No canals or boats match this query.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="ais-status pointer-events-none absolute z-[1100]">
      <div class="pointer-events-auto w-[calc(100vw-1.5rem)] max-w-80 rounded-xl border border-white/20 bg-slate-950/75 px-3 py-2 text-slate-50 shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-2 text-sm font-semibold">
          <span class="h-2.5 w-2.5 rounded-full" :class="aisStatusDotClass"></span>
          <span>Live AIS</span>
          <span class="tabular-nums text-slate-200/80">{{ aisRecentVesselCount }} live · {{ aisDelayedVesselCount }} last known</span>
          <button
            type="button"
            class="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
            title="Zoom to AIS vessels"
            @click="fitAisVessels"
          >
            Find
          </button>
          <button
            type="button"
            class="ml-auto rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
            @click="isGroupsOpen = !isGroupsOpen"
          >
            {{ isGroupsOpen ? 'Close' : activeGroupLabel }}
          </button>
        </div>
        <p class="m-0 mt-1 max-w-64 text-[11px] leading-snug text-slate-200/70">{{ aisStatusMessage }}</p>
        <a
          v-if="!aisConfigured"
          class="pointer-events-auto mt-1.5 inline-block text-[11px] font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
          href="https://aisstream.io/apikeys"
          target="_blank"
          rel="noopener noreferrer"
        >
          Create free AIS key ↗
        </a>

        <div v-if="isGroupsOpen" class="mt-3 border-t border-white/10 pt-3">
          <label class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Show vessels</label>
          <div class="mt-1 grid gap-1 rounded-xl border border-white/10 bg-white/5 p-2 text-xs">
            <label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes('all')" @change="toggleVesselFilter('all')" />
              <span>All AIS vessels</span>
            </label>
            <label v-for="filter in builtInVesselFilters" :key="filter.id" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes(filter.id)" @change="toggleVesselFilter(filter.id)" />
              <i class="h-2 w-2 rounded-full" :class="filter.color"></i>
              <span class="flex-1">{{ filter.name }}</span>
              <span class="text-slate-400">{{ filter.count }}</span>
            </label>
            <div v-for="group in vesselGroups" :key="group.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
              <input type="checkbox" :checked="activeVesselFilters.includes(`group:${group.id}`)" @change="toggleVesselFilter(`group:${group.id}`)" />
              <button type="button" class="min-w-0 flex-1 truncate text-left" :disabled="!isAdmin" @click="isAdmin && (editingGroupId = group.id)">{{ group.name }}</button>
              <span class="text-slate-400">{{ group.mmsis.length }}</span>
              <button v-if="isAdmin" type="button" class="text-sky-300" @click="editingGroupId = group.id">Edit</button>
            </div>
          </div>
          <form v-if="isAdmin" class="mt-3 flex gap-2" @submit.prevent="createVesselGroup">
            <input
              v-model="newGroupName"
              class="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm outline-none placeholder:text-slate-400"
              placeholder="New group name"
              maxlength="40"
            />
            <button class="rounded-lg bg-sky-500 px-3 text-sm font-semibold hover:bg-sky-400" type="submit">Add</button>
          </form>

          <div v-if="isAdmin && activeGroup" class="mt-3">
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
        </div>
      </div>
    </div>

    <aside
      v-if="selectedVessel"
      class="vessel-details absolute z-[1150] w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden rounded-2xl border border-white/20 bg-slate-950/90 text-slate-50 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl"
    >
      <div v-if="selectedVessel.fleet?.photoUrl" class="aspect-[16/7] bg-slate-900">
        <img :src="selectedVessel.fleet.photoUrl" :alt="selectedVessel.fleet.name" class="h-full w-full object-cover" />
      </div>
      <header class="border-b border-white/10 bg-gradient-to-br from-sky-500/25 to-cyan-300/5 px-4 py-3">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-xl">⌁</div>
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[10px] font-bold uppercase tracking-[0.16em]" :class="selectedVessel.fleet ? 'text-orange-300' : selectedVessel.serviceGroup === 'nt' ? 'text-purple-300' : 'text-sky-300'">{{ selectedVessel.fleet ? 'Company fleet' : selectedVessel.serviceGroup === 'nt' ? 'Nautical supervision' : selectedVessel.serviceGroup === 'police' ? 'Police vessel' : vesselTypeLabel(selectedVessel.shipType) }}</p>
            <h2 class="m-0 truncate text-lg font-bold">{{ selectedVessel.fleet?.name || selectedVessel.name || 'Unnamed AIS vessel' }}</h2>
            <p class="m-0 text-xs text-slate-300">MMSI {{ selectedVessel.mmsi }}<span v-if="selectedVessel.aisClass"> · Class {{ selectedVessel.aisClass }}</span></p>
          </div>
          <button type="button" class="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20" aria-label="Close details" @click="closeVesselDetails">×</button>
        </div>
      </header>

      <div class="max-h-[58vh] overflow-auto p-4">
        <div class="grid grid-cols-3 gap-2">
          <div v-for="metric in vesselMetrics" :key="metric.label" class="rounded-xl bg-white/5 p-2.5">
            <span class="block text-[10px] uppercase tracking-wide text-slate-400">{{ metric.label }}</span>
            <strong class="mt-0.5 block text-base">{{ metric.value }}</strong>
          </div>
        </div>

        <section v-for="section in vesselDetailSections" :key="section.title" class="mt-4">
          <h3 class="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{{ section.title }}</h3>
          <dl class="vessel-data-list mt-2">
            <div v-for="row in section.rows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
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
          <p class="m-0 mt-1.5 text-[10px] text-slate-400">History is recorded by this server from the moment it is running.</p>
          <p v-if="historyOmittedCount" class="m-0 mt-1 text-[10px] text-amber-300">{{ historyOmittedCount }} unreliable segment{{ historyOmittedCount === 1 ? '' : 's' }} omitted.</p>
          <div class="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-300">
            <span class="flex items-center gap-1"><i class="h-2 w-2 rounded-full border-2 border-white bg-cyan-500"></i> Actual AIS report</span>
            <span class="flex items-center gap-1"><i class="h-1.5 w-5 rounded border border-slate-900 bg-yellow-300"></i> Reconstructed canal route</span>
            <span class="flex items-center gap-1"><i class="h-0 w-5 border-t-2 border-dashed border-red-500"></i> Direct fallback</span>
          </div>
        </section>

        <button
          v-if="isAdmin && activeGroup"
          type="button"
          class="mt-3 w-full rounded-xl border border-sky-300/25 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/20"
          @click="toggleVesselInActiveGroup(selectedVessel.mmsi)"
        >
          {{ activeGroup.mmsis.includes(selectedVessel.mmsi) ? `Remove from ${activeGroup.name}` : `Add to ${activeGroup.name}` }}
        </button>
      </div>
    </aside>

    <div ref="mapEl" class="map"></div>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Locate, LocateFixed } from '@lucide/vue'
import L from 'leaflet'
import 'leaflet-polylinedecorator'
import {
  createMap,
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
import { createBridgeLayer, loadAmsterdamBridges } from '../scripts/bridgeLayer'
import { createNavigationLayer, createRestrictionLayer, loadNavigationLayer } from '../scripts/navigationLayers'
import { buildCanalRoutingNetwork, generateCanalLoopRoute, planCanalRouteVia } from '../scripts/canalRouting'
import FleetPanel from './FleetPanel.vue'
import AccountMenu from './AccountMenu.vue'
import PlanningPanel from './PlanningPanel.vue'
import { PLANNING_LOCATION_PINS } from '../../shared/planning-locations.mjs'

const auth = inject('auth')
const isAdmin = computed(() => auth.user?.role === 'admin')

const mapEl = ref(null)
const searchInput = ref(null)
const searchQuery = ref('')
const isSearchOpen = ref(false)
const canalsLayer = ref(null)
const canalSearchIndex = ref(null)
const selectedResult = ref(null)
const isUserLocationActive = ref(false)
const bridgeLayerVisible = ref(false)
const bridgeLayerLoading = ref(false)
const bridgeLayerError = ref('')
const bridgeCount = ref(0)
const navigationLayersOpen = ref(false)
const activeNavigationLayers = ref([])
const loadingNavigationLayers = ref([])
const navigationLayerCounts = ref({})
const navigationLayerError = ref('')
const routePlannerOpen = ref(false)
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
const routeLinkEditorOpen = ref(false)
const routeLinkEditor = ref(emptyRouteLinkEditor())
const routeLinkMapMode = ref(false)
const routeLinkMapStatus = ref('')
const routeLinkPendingItem = ref(null)
const routeExportLoading = ref(false)
const routeExportError = ref('')
const routeSpeedValue = ref(6)
const routeSpeedUnit = ref('kmh')
const routeLoopMinutes = ref(60)
const routeAllowZone3 = ref(false)
const routeClosurePoints = ref([])
const routeBoatProfile = ref({ heightMeters: null, widthMeters: null, draftMeters: null })
const routeAddressInputs = ref({ start: '', end: '' })
const routeAddressLoading = ref(null)
const routeSuggestions = ref({ start: [], end: [] })
const savedRoutes = ref(loadSavedRoutes())
const routeSaveName = ref('')
const aisStatus = ref('connecting')
const aisStatusMessage = ref('Connecting to the local AIS gateway…')
const aisConfigured = ref(true)
const aisVesselCount = ref(0)
const aisRecentVesselCount = ref(0)
const aisDelayedVesselCount = ref(0)
const liveVessels = ref([])
const vesselGroups = ref(loadVesselGroups())
const activeVesselFilters = ref(['company', 'nt', 'police'])
const companyMmsis = ref([])
const companyFleetBoats = ref([])
const todayPlanningItems = ref([])
const ntMmsis = ['244035980', '244146144', '244750576', '244374235']
const policeMmsis = ['244615809', '244129388', '244034521', '244044753']
const editingGroupId = ref(null)
const isGroupsOpen = ref(false)
const newGroupName = ref('')
const manualMmsi = ref('')
const vesselFilterQuery = ref('')
const selectedVessel = ref(null)
const routeStartVessel = ref(null)
const latestUserLocation = ref(null)
const historyHours = ref(1)
const historyPointCount = ref(0)
const historyOmittedCount = ref(0)
let map = null
let userLocationController = null
let aisController = null
let planningRefreshTimer = null
let routeClosureRefreshTimer = null
let bridgeLayerController = null
let canalsGeoJson = null
let canalRouteNetwork = null
let routeLayer = null
let routeLinkLayer = null
let routeLinkDragMarker = null
let routeMarkers = []
let routeBridgeRequestId = 0
let routeReportingRequestId = 0
const routeSuggestionTimers = new Map()
const navigationLayerControllers = new Map()
const navigationFilters = [
  { id: 'bridges', name: 'Brughoogtes, bediening en contact', color: '#0ea5e9' },
  { id: 'bridge-openings', name: 'Geplande brugopeningen', color: '#ef4444' },
  { id: 'closures', name: 'Stremmingen en scheepvaartbeperkingen', color: '#f43f5e' },
  { id: 'water-levels', name: 'Actuele waterstanden', color: '#2563eb' },
  { id: 'locks', name: 'Sluizen en bediening', color: '#8b5cf6' },
  { id: 'moorings', name: 'Aanlegplaatsen en ligplaatsen', color: '#10b981' },
  { id: 'markers', name: 'Verkeersborden, boeien en markeringen', color: '#06b6d4' },
  { id: 'reporting-points', name: 'Marifoonmeldpunten', color: '#e11d48' },
  { id: 'restrictions', name: 'Snelheid en vaarbeperkingen', color: '#f97316' },
]

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
  return `${count} group${count === 1 ? '' : 's'}`
})

const currentRouteNames = computed(() => {
  return [...new Set((routeResult.value?.steps || []).map((step) => step.name).filter(Boolean))]
})

const routeLinkOverrideList = computed(() => {
  const bridgeOverrides = Object.entries(routeLinkOverrides.value.bridges || {}).map(([id, override]) => ({ kind: 'bridge', id, ...override, routeNames: routeLinkNamesFromOverride(override) }))
  const reportingOverrides = Object.entries(routeLinkOverrides.value.reporting || {}).map(([id, override]) => ({ kind: 'reporting', id, ...override, routeNames: routeLinkNamesFromOverride(override) }))
  return [...bridgeOverrides, ...reportingOverrides].sort((a, b) => a.kind.localeCompare(b.kind) || String(a.id).localeCompare(String(b.id), 'nl', { numeric: true }))
})
const builtInVesselFilters = computed(() => [
  { id: 'company', name: 'Company fleet', count: companyMmsis.value.length, color: 'bg-orange-400' },
  { id: 'nt', name: 'Nautical supervision / NT', count: ntMmsis.length, color: 'bg-purple-500' },
  { id: 'police', name: 'Police vessels', count: policeMmsis.length, color: 'bg-blue-500' },
])
const filteredLiveVessels = computed(() => {
  const query = vesselFilterQuery.value.trim().toLowerCase()
  if (!query) return liveVessels.value
  return liveVessels.value.filter((vessel) =>
    `${vessel.name || ''} ${vessel.mmsi}`.toLowerCase().includes(query),
  )
})
const offlineGroupMmsis = computed(() => {
  if (!activeGroup.value) return []
  const liveMmsis = new Set(liveVessels.value.map((vessel) => vessel.mmsi))
  return activeGroup.value.mmsis.filter((mmsi) => !liveMmsis.has(mmsi))
})
const routeSpeedKnots = computed(() => {
  const value = Number(routeSpeedValue.value)
  const speed = Number.isFinite(value) && value > 0 ? value : 6
  return routeSpeedUnit.value === 'knots' ? speed : speed / 1.852
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
    { label: 'Speed', value: Number.isFinite(vessel.speed) ? `${vessel.speed.toFixed(1)} kn` : '—' },
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
        { label: 'Last signal', value: formatSignalTime(vessel.receivedAt) },
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
      title: 'Company details',
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
    const planning = planningForVessel(vessel)
    const drivers = uniquePeople(planning, ['skipper'])
    const hosts = uniquePeople(planning, ['host'])
    const shifts = planning.filter((item) => item.event_type === 'shift' && item.start_time)
      .map((item) => `${item.start_time}${item.end_time ? `–${item.end_time}` : ''}`)
    const locations = [...new Set(planning.flatMap((item) => [item.from_location, item.to_location]).filter(Boolean))]
    sections.unshift({
      title: "Today's schedule",
      rows: [
        { label: 'Driver', value: drivers.length ? drivers.join(', ') : 'Not scheduled / not recognized' },
        { label: 'Host', value: hosts.length ? hosts.join(', ') : 'Not scheduled' },
        { label: 'Shift', value: shifts.length ? [...new Set(shifts)].join(', ') : 'No shift time' },
        { label: 'Location', value: locations.length ? locations.join(' → ') : 'Not specified' },
      ],
    })
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
    .filter((vessel) => `${vessel.name || ''} ${vessel.mmsi}`.toLowerCase().includes(normalizedQuery))
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

  return [...locationSearchResults(query, 12), ...vesselResults, ...searchCanals(canalSearchIndex.value, query)]
})

const locationButtonLabel = computed(() => {
  if (isUserLocationActive.value) {
    return 'Hide live location'
  }

  return 'Show live location'
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
}

function loadVesselGroups() {
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
      speedUnit: routeSpeedUnit.value,
      loopMinutes: routeLoopMinutes.value,
      allowZone3: routeAllowZone3.value,
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
  routeSpeedValue.value = Number(settings.speedValue) || routeSpeedValue.value
  routeSpeedUnit.value = settings.speedUnit === 'knots' ? 'knots' : 'kmh'
  routeLoopMinutes.value = Number(settings.loopMinutes) || routeLoopMinutes.value
  routeAllowZone3.value = Boolean(settings.allowZone3)
  routeBoatProfile.value = { ...routeBoatProfile.value, ...(settings.boatProfile || {}) }
  routeAddressInputs.value = { start: '', end: '', ...(settings.addressInputs || {}) }
  routePoints.value = route.points.map((point) => ({
    id: crypto.randomUUID(),
    role: point.role || 'waypoint',
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    name: point.name || null,
  })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
  routePlannerOpen.value = true
  routeMode.value = null
  routeSaveName.value = route.name || ''
  const savedResult = restoreSavedRouteResult(route.result)
  if (savedResult) {
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
    speedKnots: Number(result.speedKnots) || routeSpeedKnots.value,
    speedKmh: Number(result.speedKmh) || routeSpeedKnots.value * 1.852,
    trafficFactor: Number(result.trafficFactor) || 1,
    trafficLevel: result.trafficLevel || 'onbekend',
    trafficVesselCount: Number(result.trafficVesselCount) || 0,
    trafficDelayMinutes: Number(result.trafficDelayMinutes) || 0,
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
    steps: Array.isArray(snapshot.steps) ? snapshot.steps : [],
    segments: Array.isArray(snapshot.segments) ? snapshot.segments : [],
    warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings : [],
  }
}

function createLocalId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyRouteLinkEditor(kind = 'bridge') {
  return { kind, id: '', name: '', routeNames: '', height: '', bearing: '', call: '' }
}

function loadRouteLinkOverrides() {
  try {
    const overrides = JSON.parse(localStorage.getItem('route-link-overrides-v1') || '{}')
    return {
      bridges: overrides?.bridges && typeof overrides.bridges === 'object' ? overrides.bridges : {},
      reporting: overrides?.reporting && typeof overrides.reporting === 'object' ? overrides.reporting : {},
    }
  } catch {
    return { bridges: {}, reporting: {} }
  }
}

function saveRouteLinkOverrides() {
  localStorage.setItem('route-link-overrides-v1', JSON.stringify(routeLinkOverrides.value))
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

function editRouteLink(kind, item) {
  const id = normalizeRouteLinkId(item.number || item.id || item.name)
  const override = routeLinkOverride(kind, id) || {}
  const overrideNames = routeLinkNamesFromOverride(override)
  const itemNames = Array.isArray(item.routeNames) ? item.routeNames : parseRouteNames(item.routeNames)
  routeLinkEditorOpen.value = true
  routeLinkEditor.value = {
    kind,
    id,
    name: override.name || item.name || '',
    routeNames: (overrideNames.length ? overrideNames : itemNames.length ? itemNames : (item.route ? [item.route] : [])).join(', '),
    height: override.height || (kind === 'bridge' ? item.height : '') || '',
    bearing: override.bearing ?? (kind === 'reporting' ? item.bearing ?? item.routeBearing ?? '' : ''),
    call: override.call || (kind === 'reporting' ? item.call : '') || '',
  }
}

function resetRouteLinkEditor(kind = routeLinkEditor.value.kind) {
  routeLinkEditor.value = emptyRouteLinkEditor(kind)
}

function appendRouteLinkName(name) {
  const names = new Set(parseRouteNames(routeLinkEditor.value.routeNames))
  names.add(name)
  routeLinkEditor.value = { ...routeLinkEditor.value, routeNames: [...names].join(', ') }
}

function editSavedRouteLink(override) {
  routeLinkEditorOpen.value = true
  routeLinkEditor.value = {
    kind: override.kind,
    id: override.id,
    name: override.name || '',
    routeNames: (override.routeNames || []).join(', '),
    height: override.kind === 'bridge' ? override.height || '' : '',
    bearing: override.kind === 'reporting' && override.bearing !== undefined ? String(override.bearing) : '',
    call: override.kind === 'reporting' ? override.call || '' : '',
  }
}

function saveRouteLinkOverride() {
  const editor = routeLinkEditor.value
  const id = normalizeRouteLinkId(editor.id)
  if (!id) return
  const bucket = routeLinkBucket(editor.kind)
  const next = { ...routeLinkOverrides.value[bucket] }
  const existing = next[id] || {}
  const override = {
    ...existing,
    routeNames: parseRouteNames(editor.routeNames),
    name: editor.name.trim() || undefined,
    height: editor.kind === 'bridge' && editor.height.trim() ? editor.height.trim() : undefined,
    bearing: editor.kind === 'reporting' && Number.isFinite(Number(editor.bearing)) ? Number(editor.bearing) : undefined,
    call: editor.kind === 'reporting' && editor.call.trim() ? editor.call.trim() : undefined,
  }
  next[id] = Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)))
  routeLinkOverrides.value = { ...routeLinkOverrides.value, [bucket]: next }
  saveRouteLinkOverrides()
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
}

function deleteRouteLinkOverride() {
  const editor = routeLinkEditor.value
  const id = normalizeRouteLinkId(editor.id)
  if (!id) return
  const bucket = routeLinkBucket(editor.kind)
  const next = { ...routeLinkOverrides.value[bucket] }
  delete next[id]
  routeLinkOverrides.value = { ...routeLinkOverrides.value, [bucket]: next }
  saveRouteLinkOverrides()
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
  const color = kind === 'bridge' ? '#f59e0b' : '#e11d48'
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
  const labels = Array.isArray(override?.routeSegments)
    ? override.routeSegments.map((segment) => segment?.name || segment?.label).filter(Boolean)
    : []
  return labels.join(', ')
}

function routeLinkNamesFromOverride(override) {
  if (Array.isArray(override?.routeNames)) return override.routeNames.filter(Boolean)
  if (typeof override?.routeNames === 'string') return parseRouteNames(override.routeNames)
  return []
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
  saveRouteLinkPatch(kind, id, routeSegmentPatch(routeSegment, routeName))
  routeLinkEditor.value = {
    ...routeLinkEditor.value,
    kind,
    id,
    routeNames: routeName,
  }
  routeLinkMapStatus.value = `${kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${id} gekoppeld aan ${routeName}.`
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
}

function saveRouteLinkPatch(kind, id, patch) {
  const bucket = routeLinkBucket(kind)
  const key = normalizeRouteLinkId(id)
  if (!key) return
  const existing = routeLinkOverrides.value[bucket]?.[key] || {}
  const next = { ...routeLinkOverrides.value[bucket], [key]: { ...existing, ...patch } }
  routeLinkOverrides.value = { ...routeLinkOverrides.value, [bucket]: next }
  saveRouteLinkOverrides()
}

function routeLinkPopupHtml(kind, item, point = null) {
  if (!isAdmin.value) return ''
  const id = normalizeRouteLinkId(item.number || item.id || item.name || item.call)
  if (!id) return ''
  const linkedNames = routeLinkDisplayNames(kind, item)
  const linkedSegments = routeLinkDisplaySegments(kind, item)
  const latitude = Number(point?.latitude)
  const longitude = Number(point?.longitude)
  const hasRoute = ['ok', 'partial'].includes(routeResult.value?.status) && routeResult.value?.coordinates?.length
  const canUsePoint = Number.isFinite(latitude) && Number.isFinite(longitude)
  const pointDisabled = hasRoute && canUsePoint ? '' : ' disabled'
  const routeDisabled = hasRoute ? '' : ' disabled'
  return `
      <div class="route-link-popup">
      <div><span>Routekoppeling</span><b>${escapeHtml(linkedSegments || linkedNames || 'niet gekoppeld')}</b></div>
      <button type="button" data-route-link-action="pick-line" data-route-link-kind="${escapeHtml(kind)}" data-route-link-id="${escapeHtml(id)}" data-route-link-name="${escapeHtml(item.name || item.locationName || item.call || '')}"${hasRoute ? '' : ' disabled'}>${hasRoute ? 'Klik juiste segment' : 'Plan eerst een route'}</button>
      <button type="button" data-route-link-action="drag-line" data-route-link-kind="${escapeHtml(kind)}" data-route-link-id="${escapeHtml(id)}" data-route-link-name="${escapeHtml(item.name || item.locationName || item.call || '')}" data-route-link-lat="${escapeHtml(canUsePoint ? latitude : '')}" data-route-link-lng="${escapeHtml(canUsePoint ? longitude : '')}"${routeDisabled}>Sleep naar lijn</button>
      <button type="button" data-route-link-action="link" data-route-link-kind="${escapeHtml(kind)}" data-route-link-id="${escapeHtml(id)}" data-route-link-lat="${escapeHtml(latitude)}" data-route-link-lng="${escapeHtml(longitude)}"${pointDisabled}>Koppel dichtstbij</button>
      <button type="button" data-route-link-action="edit" data-route-link-kind="${escapeHtml(kind)}" data-route-link-id="${escapeHtml(id)}" data-route-link-name="${escapeHtml(item.name || item.locationName || item.call || '')}">Geavanceerd</button>
    </div>
  `
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
  const button = (event.originalEvent?.target || event.target)?.closest?.('[data-route-link-action]')
  if (!button) return
  event.preventDefault?.()
  event.stopPropagation?.()
  const kind = button.dataset.routeLinkKind
  const id = normalizeRouteLinkId(button.dataset.routeLinkId)
  if (!kind || !id) return
  if (button.dataset.routeLinkAction === 'pick-line') {
    routeLinkPendingItem.value = {
      kind,
      id,
      name: button.dataset.routeLinkName || '',
    }
    routePlannerOpen.value = true
    routeMode.value = null
    routeLinkMapStatus.value = `${kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${id}: klik nu op de blauwe routelijn waar deze bij hoort.`
    map?.closePopup()
    drawPlannedRoute(routeResult.value)
    return
  }
  if (button.dataset.routeLinkAction === 'drag-line') {
    const datasetPoint = { latitude: Number(button.dataset.routeLinkLat), longitude: Number(button.dataset.routeLinkLng) }
    const center = map?.getCenter()
    const point = Number.isFinite(datasetPoint.latitude) && Number.isFinite(datasetPoint.longitude)
      ? datasetPoint
      : center
        ? { latitude: center.lat, longitude: center.lng }
        : null
    if (!point) return
    routeLinkPendingItem.value = {
      kind,
      id,
      name: button.dataset.routeLinkName || '',
      point,
    }
    routePlannerOpen.value = true
    routeMode.value = null
    routeLinkMapStatus.value = `${kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${id}: sleep de koppelmarker naar de blauwe routelijn.`
    map?.closePopup()
    drawPlannedRoute(routeResult.value)
    drawRouteLinkDragMarker()
    return
  }
  if (button.dataset.routeLinkAction === 'edit') {
    routeLinkEditorOpen.value = true
    routePlannerOpen.value = true
    routeLinkEditor.value = {
      ...emptyRouteLinkEditor(kind),
      id,
      name: button.dataset.routeLinkName || '',
      routeNames: routeLinkNamesFromOverride(routeLinkOverride(kind, id)).join(', '),
    }
    return
  }
  const routeSegment = routeSegmentForMapPoint({ latitude: button.dataset.routeLinkLat, longitude: button.dataset.routeLinkLng })
  const routeName = routeSegment?.segmentName || ''
  if (!routeName) {
    routePlannerOpen.value = true
    routeLinkMapStatus.value = 'Dit punt ligt niet dicht genoeg bij de huidige route. Plan of zoom een route langs dit punt.'
    return
  }
  saveRouteLinkPatch(kind, id, routeSegmentPatch(routeSegment.segment, routeName))
  routePlannerOpen.value = true
  routeLinkMapStatus.value = `${kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${id} gekoppeld aan segment ${routeName}.`
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
  map?.closePopup()
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
  saveRouteLinkPatch(pending.kind, pending.id, routeSegmentPatch(routeSegment.segment, routeName))
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
  const routeSegment = routeSegmentForMapPoint({ latitude: latlng.lat, longitude: latlng.lng })
  const routeName = routeSegment?.segmentName || ''
  if (!routeName) {
    routeLinkMapStatus.value = `${pending.kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${pending.id}: laat los dichter op het juiste routesegment.`
    drawRouteLinkDragMarker()
    return
  }
  saveRouteLinkPatch(pending.kind, pending.id, routeSegmentPatch(routeSegment.segment, routeName))
  routeLinkMapStatus.value = `${pending.kind === 'bridge' ? 'Brug' : 'Marifoonpunt'} ${pending.id} gekoppeld aan segment ${routeName}.`
  routeLinkPendingItem.value = null
  clearRouteLinkDragMarker()
  drawPlannedRoute(routeResult.value)
  refreshRouteLinkedItems()
  refreshRouteLinkMapLayer()
}

function routeSegmentPatch(segment, routeName) {
  const routeSegment = segment ? {
    key: routeSegmentKey(segment),
    name: segment.name || routeName,
    start: segment.start,
    end: segment.end,
  } : null
  return {
    routeNames: [routeName],
    routeSegments: routeSegment ? [routeSegment] : undefined,
  }
}

function normalizeRouteLinkId(value) {
  return String(value || '').trim()
}

function parseRouteNames(value) {
  return String(value || '').split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean)
}

function createVesselGroup() {
  const name = newGroupName.value.trim()
  if (!name) return

  const group = {
    id: crypto.randomUUID(),
    name,
    mmsis: [],
  }
  vesselGroups.value.push(group)
  editingGroupId.value = group.id
  activeVesselFilters.value = [...activeVesselFilters.value.filter((filter) => filter !== 'all'), `group:${group.id}`]
  newGroupName.value = ''
  saveVesselGroups()
}

function deleteActiveGroup() {
  if (!activeGroup.value) return
  const filterId = `group:${activeGroup.value.id}`
  vesselGroups.value = vesselGroups.value.filter((group) => group.id !== activeGroup.value.id)
  activeVesselFilters.value = activeVesselFilters.value.filter((filter) => filter !== filterId)
  editingGroupId.value = null
  saveVesselGroups()
}

function toggleVesselInActiveGroup(mmsi) {
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
  const mmsi = manualMmsi.value.trim()
  if (!activeGroup.value || !/^\d{9}$/.test(mmsi)) return
  if (!activeGroup.value.mmsis.includes(mmsi)) activeGroup.value.mmsis.push(mmsi)
  manualMmsi.value = ''
  saveVesselGroups()
  applyVesselGroupFilter()
}

function applyVesselGroupFilter() {
  if (activeVesselFilters.value.includes('all')) {
    aisController?.setVisibleMmsis(null)
    return
  }

  const visibleMmsis = new Set()
  if (activeVesselFilters.value.includes('company')) companyMmsis.value.forEach((mmsi) => visibleMmsis.add(mmsi))
  if (activeVesselFilters.value.includes('nt')) ntMmsis.forEach((mmsi) => visibleMmsis.add(mmsi))
  if (activeVesselFilters.value.includes('police')) policeMmsis.forEach((mmsi) => visibleMmsis.add(mmsi))
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

function fitAisVessels() {
  aisController?.fitVisibleVessels()
}

function setRouteMode(mode) {
  routePlannerOpen.value = true
  routeMode.value = routeMode.value === mode ? null : mode
  if (routeMode.value) routeMessage.value = routeMode.value === 'waypoint'
    ? 'Klik op de kaart om een extra routepunt toe te voegen.'
    : `Klik op de kaart om het ${routeMode.value === 'start' ? 'startpunt' : 'eindpunt'} te kiezen.`
}

function handleRouteMapClick(event) {
  if (!routeMode.value) return
  const point = { latitude: event.latlng.lat, longitude: event.latlng.lng }
  setRoutePoint(routeMode.value, point)
  routeMode.value = routePoints.value.length >= 2 ? null : (routeMode.value === 'start' ? 'end' : 'start')
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
  const result = planCanalRouteVia(routePoints.value, canalRouteNetwork, routePlannerOptions())
  routeResult.value = result
  updateRouteBridgeItems(result)
  updateRouteReportingItems(result)
  drawPlannedRoute(result)
  routeMessage.value = result.status === 'partial'
    ? result.message
    : result.status === 'ok'
    ? `Route gevonden. ETA gebruikt ingestelde snelheid, bekende snelheidslimieten en AIS-drukte (${result.trafficLevel}).`
    : result.message
}

function generateRandomLoopRoute() {
  if (!map || !canalRouteNetwork) return
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
    ? `Rondje gevonden: terug bij start binnen ${routeLoopMinutes.value} min.`
    : result.message
}

function refreshRouteAfterSettingsChange() {
  if (routeResult.value?.routeType === 'loop') generateRandomLoopRoute()
  else updatePlannedRoute()
}

function routePlannerOptions() {
  return {
    speedKnots: routeSpeedKnots.value,
    trafficPoints: liveVessels.value,
    boatProfile: routeBoatProfileForPlanner(),
    allowZone3: routeAllowZone3.value,
    closurePoints: routeClosurePoints.value,
  }
}

async function loadRouteClosures() {
  try {
    const data = await loadNavigationLayer('closures')
    routeClosurePoints.value = (data.features || [])
      .map(routeClosureFromFeature)
      .filter(Boolean)
  } catch {
    routeClosurePoints.value = []
  }
}

function routeClosureFromFeature(feature) {
  const [longitude, latitude] = feature.geometry?.coordinates || []
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  const properties = feature.properties || {}
  if (!isActiveRouteClosure(properties.start, properties.end)) return null
  return {
    latitude,
    longitude,
    radiusMeters: 140,
    name: properties.name || 'Scheepvaartbeperking',
    start: properties.start,
    end: properties.end,
  }
}

function isActiveRouteClosure(startValue, endValue) {
  const now = Date.now()
  const start = Date.parse(startValue || '')
  const end = Date.parse(endValue || '')
  if (!Number.isFinite(start) && !Number.isFinite(end)) return true
  if (Number.isFinite(start) && start - now > 30 * 60_000) return false
  if (Number.isFinite(end) && end < now - 15 * 60_000) return false
  return Number.isFinite(start) || Number.isFinite(end)
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

function fitPlannedRoute() {
  if (routeResult.value?.coordinates?.length) map?.fitBounds(L.latLngBounds(routeResult.value.coordinates), { padding: [40, 40], maxZoom: 17 })
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
    routeReportingItems.value = collectReportingPointsAlongRoute(data.features || [], result)
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
      window.setTimeout(() => pdfWindow.print(), 350)
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

async function buildRouteExportData(result) {
  const [bridgeData, reportingData] = await Promise.all([
    loadAmsterdamBridges(),
    loadNavigationLayer('reporting-points'),
  ])
  const bridges = collectBridgesAlongRoute(bridgeData.features || [], result)
  const reportingPoints = collectReportingPointsAlongRoute(reportingData.features || [], result)
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      distance: formatRouteDistance(result.distanceMeters),
      duration: formatRouteDuration(result.durationMinutes),
      speed: formatRouteSpeed(result.speedKnots),
      traffic: result.trafficLevel,
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
  const coordinates = result?.coordinates || []
  const segments = routeSegmentsForResult(result)
  return features
    .map((feature) => {
      const point = featureRoutePoint(feature, coordinates, 'reporting')
      if (!point) return null
      const properties = feature.properties || {}
      const override = reportingOverrideForProperties(properties)
      const overrideRouteNames = routeLinkNamesFromOverride(override)
      const explicitRoutePosition = projectPointOnLinkedRouteSegment(point, segments, override)
      const candidateRouteNames = overrideRouteNames.length ? overrideRouteNames : inferReportingRouteNames(properties)
      const routePosition = explicitRoutePosition || projectPointOnMatchingRouteSegment(point, segments, candidateRouteNames)
      if (!routePosition || routePosition.distanceMeters > 80) return null
      const bearing = Number(override?.bearing ?? properties.bearing)
      if (Number.isFinite(bearing) && Number.isFinite(routePosition.bearingDegrees) && bearingDeltaDegrees(routePosition.bearingDegrees, bearing) > 45) return null
      return {
        ...reportingPointExportItem(feature, point, override),
        bearing,
        routeBearing: routePosition.bearingDegrees,
        direction: compassDirection(routePosition.bearingDegrees),
        sourceLatitude: point.latitude,
        sourceLongitude: point.longitude,
        latitude: routePosition.point.latitude,
        longitude: routePosition.point.longitude,
        routeNames: candidateRouteNames,
        matchedRouteName: true,
        matchedRouteSegment: Boolean(explicitRoutePosition),
        matchedSegmentName: routePosition.segmentName,
        routeMeters: routePosition.routeMeters,
        distanceToRouteMeters: Math.round(routePosition.distanceMeters),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.routeMeters - b.routeMeters || Number(a.number) - Number(b.number))
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
      const explicitRoutePosition = projectPointOnLinkedRouteSegment(point, segments, override)
      const candidateRouteNames = overrideRouteNames.length ? overrideRouteNames : [properties.route, properties.name].filter(Boolean)
      const routePosition = explicitRoutePosition || projectPointOnMatchingRouteSegment(point, segments, candidateRouteNames)
      if (!routePosition) return null
      const maxDistanceMeters = explicitRoutePosition ? 220 : overrideRouteNames.length ? 120 : 34
      if (routePosition.distanceMeters > maxDistanceMeters) return null
      return {
        ...bridgeExportItem(feature, point, override),
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
  const linkedKeys = new Set((override?.routeSegments || []).map((segment) => segment?.key).filter(Boolean))
  if (!linkedKeys.size) return null
  let best = null
  for (const segment of segments || []) {
    if (!linkedKeys.has(routeSegmentKey(segment))) continue
    const projection = projectPointOnSegment(point, segment.start, segment.end)
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
    width: formatExportMeters(properties.passageWidth),
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
    instruction: properties.instruction || '',
    obligation: properties.obligation || '',
    source: properties.source || '',
    latitude: point.latitude,
    longitude: point.longitude,
  }
}

function bridgeExportTitle(properties) {
  return [properties.name, properties.number ? `brug ${properties.number}` : null].filter(Boolean).join(' · ') || 'Brug'
}

function bridgeExportHeight(properties) {
  const calculated = Number.isFinite(Number(properties.clearanceNap)) && Number.isFinite(Number(properties.winterWaterLevelNap))
    ? Number(properties.clearanceNap) - Number(properties.winterWaterLevelNap)
    : null
  const value = calculated ?? properties.clearanceNap ?? properties.clearanceAt4mNap
  if (value === null || value === undefined || value === '') return 'onbekend'
  return calculated === null ? `${Number(value).toFixed(2)} m t.o.v. NAP` : `${Number(value).toFixed(2)} m vrije hoogte bij winterpeil`
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

function compassDirection(degrees) {
  if (!Number.isFinite(degrees)) return ''
  const labels = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW']
  return labels[Math.round(((degrees % 360) / 45)) % labels.length]
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
  return `routekaart-${stamp}.html`
}

function routeExportHtml(data) {
  const generatedAt = formatExportDate(data.generatedAt)
  const summaryHtml = routeExportSummaryHtml(data)
  const warningsHtml = data.warnings?.length
    ? data.warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join('')
    : ''
  const canalsHtml = routeExportTableHtml(
    [{ key: 'index', label: '#' }, { key: 'name', label: 'Gracht / vaarweg' }, { key: 'distance', label: 'Afstand' }],
    data.canals,
  )
  const bridgesHtml = routeExportTableHtml([
    { key: 'name', label: 'Brug' }, { key: 'number', label: 'Nummer' }, { key: 'height', label: 'Hoogte' },
    { key: 'clearanceNap', label: 'Onderkant NAP' }, { key: 'clearanceAt4mNap', label: '4 m breedte NAP' },
    { key: 'winterWaterLevelNap', label: 'Winterpeil' }, { key: 'width', label: 'Breedte' }, { key: 'route', label: 'Vaarroute' },
  ], data.bridges)
  const reportingHtml = routeExportTableHtml([
    { key: 'name', label: 'Meldpunt' }, { key: 'number', label: 'Nr' }, { key: 'direction', label: 'Richting' }, { key: 'call', label: 'Melding' },
    { key: 'instruction', label: 'Werkwijze' }, { key: 'obligation', label: 'Opmerking' },
  ], data.reportingPoints)
  const mapSvg = routeExportMapSvg(data)
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Routekaart export</title>
  <style>
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
    .map-note { color: #475569; font-size: 12px; margin: 8px 0 0; }
    @media print {
      body { background: white; }
      header, main { padding: 12px; }
      button { display: none; }
      #map { min-height: 360px; page-break-inside: avoid; }
      #map svg { min-height: 360px; }
      a[href]::after { content: ""; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Routekaart</h1>
      <div class="meta">Gegenereerd: ${escapeHtml(generatedAt)}</div>
    </div>
    <button onclick="window.print()">Print / PDF</button>
  </header>
  <main>
    <div id="map">${mapSvg}</div>
    <p class="map-note">Routekaart met OpenStreetMap-achtergrond, lokale grachtenlaag, route, bruggen en meldpunten. Zonder internet blijft de lokale grachtenlaag zichtbaar.</p>
    <section class="cards">${summaryHtml}</section>
    <section>${warningsHtml}</section>
    <section>
      <h2>Grachten en vaarwegen</h2>
      ${canalsHtml}
    </section>
    <section>
      <h2>Bruggen langs de route</h2>
      ${bridgesHtml}
    </section>
    <section>
      <h2>Meldpunten langs de route</h2>
      ${reportingHtml}
    </section>
  </main>
</body>
</html>`
}

function routeExportSummaryHtml(data) {
  return [
    ['Van', data.summary.from], ['Naar', data.summary.to], ['Afstand', data.summary.distance],
    ['Vaartijd', data.summary.duration], ['Snelheid', data.summary.speed], ['Drukte', data.summary.traffic],
    ['Zone 3 / IJ', data.summary.zone3 ? 'toegestaan' : 'vermeden'],
  ].map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')
}

function routeExportTableHtml(columns, rows = []) {
  const head = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>`
  const body = rows.length
    ? `<tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody>`
    : `<tbody><tr><td colspan="${columns.length}">Geen items langs deze route gevonden.</td></tr></tbody>`
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
    const width = waterway.isRouteWaterway ? 6 : 4
    const opacity = waterway.isRouteWaterway ? 0.78 : 0.45
    return `<polyline points="${points}" fill="none" stroke="#7dd3fc" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"><title>${escapeHtml(waterway.name)}</title></polyline>`
  }).join('')
  const bridgeMarkers = bridgePoints.map((bridge) => {
    const p = project(bridge)
    return `<g><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="#f59e0b" stroke="#fff" stroke-width="3"><title>${escapeHtml(`${bridge.name} ${bridge.height}`)}</title></circle></g>`
  }).join('')
  const reportingMarkers = reportingPoints.map((point) => {
    const p = project(point)
    const source = Number.isFinite(point.sourceLatitude) && Number.isFinite(point.sourceLongitude)
      ? project({ latitude: point.sourceLatitude, longitude: point.sourceLongitude })
      : p
    const connector = Math.hypot(source.x - p.x, source.y - p.y) > 9
      ? `<line x1="${source.x.toFixed(1)}" y1="${source.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#e11d48" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.75"/><circle cx="${source.x.toFixed(1)}" cy="${source.y.toFixed(1)}" r="3" fill="#e11d48" opacity="0.7"/>`
      : ''
    const angle = Number.isFinite(point.routeBearing) ? point.routeBearing : point.bearing || 0
    const title = `${point.number}. ${point.call} richting ${point.direction || Math.round(angle)}`
    return `<g>${connector}<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)})"><path d="M0,-18 L12,10 L0,5 L-12,10 Z" fill="#e11d48" stroke="#fff" stroke-width="3" stroke-linejoin="round"><title>${escapeHtml(title)}</title></path></g><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="8" fill="#e11d48" stroke="#fff" stroke-width="2"/><text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">${escapeHtml(point.number)}</text></g>`
  }).join('')
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Routekaart">
    <defs><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#bae6fd" stroke-width="1"/></pattern></defs>
    <rect width="100%" height="100%" fill="#f1f5f9"/>
    ${osmTiles}
    <rect width="100%" height="100%" fill="#ecfeff" opacity="0.12"/>
    ${backgroundWater}
    <rect width="100%" height="100%" fill="url(#grid)" opacity="0.10"/>
    <polyline points="${routeLine}" fill="none" stroke="#075985" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity="0.22"/>
    <polyline points="${routeLine}" fill="none" stroke="#0ea5e9" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    ${bridgeMarkers}${reportingMarkers}
    <g transform="translate(24 24)"><rect width="258" height="78" rx="8" fill="white" opacity="0.92"/><line x1="14" y1="20" x2="54" y2="20" stroke="#0ea5e9" stroke-width="6" stroke-linecap="round"/><text x="66" y="24" font-size="13" fill="#0f172a">Route</text><circle cx="34" cy="46" r="6" fill="#f59e0b"/><text x="66" y="50" font-size="13" fill="#0f172a">Brug</text><path d="M34,56 L43,73 L34,69 L25,73 Z" fill="#e11d48"/><text x="66" y="70" font-size="13" fill="#0f172a">Meldpunt + richting</text></g>
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
  return Number.isFinite(date.getTime()) ? date.toLocaleString('nl-NL') : value
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
  const next = { id: crypto.randomUUID(), role, ...point }
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
    next.role = 'waypoint'
    const endIndex = routePoints.value.findIndex((candidate) => candidate.role === 'end')
    const insertAt = endIndex >= 0 ? endIndex : routePoints.value.length
    routePoints.value = [...routePoints.value.slice(0, insertAt), next, ...routePoints.value.slice(insertAt)]
  }
}

function removeRoutePoint(index) {
  routePoints.value = routePoints.value.filter((_, candidateIndex) => candidateIndex !== index)
  updatePlannedRoute()
}

function routeBoatProfileForPlanner() {
  const profile = {
    heightMeters: positiveNumberOrNull(routeBoatProfile.value.heightMeters),
    widthMeters: positiveNumberOrNull(routeBoatProfile.value.widthMeters),
    draftMeters: positiveNumberOrNull(routeBoatProfile.value.draftMeters),
    safetyMarginMeters: 0.15,
  }
  return Object.values(profile).some((value) => Number.isFinite(value)) ? profile : null
}

function positiveNumberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function setRouteStartFromUserLocation() {
  if (!latestUserLocation.value) {
    activateUserLocation()
    routeMessage.value = 'Wacht op GPS-locatie en klik daarna nogmaals op “Start mijn locatie”.'
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

function formatRouteSpeed(knots) {
  const value = Number(knots)
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(value % 1 ? 1 : 0)} kn · ${(value * 1.852).toFixed(1)} km/u`
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
    selectedVessel.value = { ...boat.ais, mmsi: String(boat.mmsi), fleet: boat }
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
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
    const response = await fetch(`/api/planning/day?date=${today}`)
    if (response.ok) todayPlanningItems.value = (await response.json()).items
  } catch {
    // The map and AIS remain usable when planning is temporarily unavailable.
  }
}

function closeVesselDetails() {
  selectedVessel.value = null
  aisController?.clearSelection()
}

function showVesselHistory(hours) {
  if (!selectedVessel.value) return
  historyHours.value = hours
  aisController?.showHistory(selectedVessel.value.mmsi, hours)
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
  const serviceGroup = ntMmsis.includes(mmsi) ? 'nt' : policeMmsis.includes(mmsi) ? 'police' : null
  return { ...vessel, fleet, serviceGroup }
}

function searchVesselDotClass(mmsi) {
  const value = String(mmsi)
  if (policeMmsis.includes(value)) return 'bg-blue-500'
  if (ntMmsis.includes(value)) return 'bg-purple-500'
  if (companyMmsis.value.includes(value)) return 'bg-orange-400'
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

async function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value

  if (isSearchOpen.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}

function collapseSearch() {
  isSearchOpen.value = false
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
  if (result.kind !== 'vessel') {
    focusResult(result)
    return
  }

  activeVesselFilters.value = ['all']
  applyVesselGroupFilter()
  aisController?.focusVessel(result.mmsi)
  searchQuery.value = result.name || result.mmsi
}

function selectFirstResult() {
  if (searchResults.value.length === 0) return

  focusSearchResult(searchResults.value[0])
}

function activateUserLocation() {
  if (!map) return

  if (isUserLocationActive.value) {
    userLocationController?.stop()
    userLocationController = null
    isUserLocationActive.value = false
    latestUserLocation.value = null
    return
  }

  isUserLocationActive.value = true
  userLocationController = showUserLocation(map, {
    onFound: (event) => {
      latestUserLocation.value = { latitude: event.latlng.lat, longitude: event.latlng.lng }
    },
    onError: (error) => {
      userLocationController?.stop()
      userLocationController = null
      isUserLocationActive.value = false
      latestUserLocation.value = null
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
        routeLinkPopupHtml: (properties, point) => routeLinkPopupHtml('bridge', properties, point),
        draggablePositions: isAdmin.value,
        positionOverrideFor: (properties) => routeLinkPositionOverride('bridge', properties),
        onPositionDragEnd: (properties, latlng) => saveRouteLinkPosition('bridge', properties, latlng),
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
          routeLinkPopupHtml: (properties, point) => routeLinkPopupHtml('bridge', properties, point),
          draggablePositions: isAdmin.value,
          positionOverrideFor: (properties) => routeLinkPositionOverride('bridge', properties),
          onPositionDragEnd: (properties, latlng) => saveRouteLinkPosition('bridge', properties, latlng),
        })
        bridgeCount.value = bridgeLayerController.count
      }
      layer = bridgeLayerController.layer
      bridgeLayerVisible.value = true
      navigationLayerCounts.value = { ...navigationLayerCounts.value, bridges: bridgeCount.value }
    } else if (id === 'restrictions') {
      layer = navigationLayerControllers.get(id) || createRestrictionLayer(canalsGeoJson)
      navigationLayerControllers.set(id, layer)
      navigationLayerCounts.value = { ...navigationLayerCounts.value, restrictions: layer.getLayers().length }
    } else {
      if (!navigationLayerControllers.has(id)) {
        const data = await loadNavigationLayer(id)
        navigationLayerControllers.set(id, createNavigationLayer(id, data, canalsGeoJson, {
          routeLinkPopupHtml: id === 'reporting-points'
            ? (properties, point) => routeLinkPopupHtml('reporting', properties, point)
            : null,
          draggablePositions: isAdmin.value && id === 'reporting-points',
          positionOverrideFor: id === 'reporting-points'
            ? (properties) => routeLinkPositionOverride('reporting', properties)
            : null,
          onPositionDragEnd: id === 'reporting-points'
            ? (properties, latlng) => saveRouteLinkPosition('reporting', properties, latlng)
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
    const groupLabel = policeMmsis.includes(mmsi)
      ? 'Police · '
      : ntMmsis.includes(mmsi)
        ? 'Nautical supervision · '
        : companyMmsis.value.includes(mmsi)
          ? 'Company fleet · '
          : ''
    return `${groupLabel}MMSI ${result.mmsi}`
  }
  if (result?.kind === 'location') return `Oranje marker · ${formatCoordinate(result.latitude)}, ${formatCoordinate(result.longitude)}`

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

function bindCanalClickSelection() {
  if (!canalsLayer.value || !canalSearchIndex.value) return

  canalsLayer.value.eachLayer((featureLayer) => {
    featureLayer.on('click', () => {
      if (routeMode.value) return
      const result = findCanalResultByFeature(canalSearchIndex.value, featureLayer.feature)

      if (!result) return

      focusResult(result)
    })
  })
}

watch(searchQuery, (nextValue, previousValue) => {
  if (previousValue && !nextValue) {
    clearSelectedResult()
  }
})

watch(activeVesselFilters, applyVesselGroupFilter, { deep: true })
watch(routeSpeedValue, refreshRouteAfterSettingsChange)
watch(routeSpeedUnit, refreshRouteAfterSettingsChange)
watch(routeAllowZone3, refreshRouteAfterSettingsChange)
watch(routeLoopMinutes, () => { if (routeResult.value?.routeType === 'loop') generateRandomLoopRoute() })
watch(routeBoatProfile, refreshRouteAfterSettingsChange, { deep: true })

onMounted(async () => {
  if (!mapEl.value) return

  map = createMap(mapEl.value)
  const routePointPane = map.createPane('route-point-pane')
  routePointPane.style.zIndex = '780'
  map.getContainer().addEventListener('click', handleRouteLinkPopupClick, true)
  loadTodayPlanning()
  loadRouteClosures()
  planningRefreshTimer = window.setInterval(loadTodayPlanning, 60_000)
  routeClosureRefreshTimer = window.setInterval(loadRouteClosures, 5 * 60_000)

  const canals = await loadCanals()
  canalsGeoJson = canals
  canalRouteNetwork = buildCanalRoutingNetwork(canals, { respectRestrictions: true })
  canalSearchIndex.value = buildCanalSearchIndex(canals)
  canalsLayer.value = await addCanals(map, canals)
  bindCanalClickSelection()
  map.on('click', handleRouteMapClick)

  try {
    const fleetSummary = await fetch('/api/fleet/summary').then((response) => response.json())
    companyFleetBoats.value = fleetSummary.boats
    companyMmsis.value = fleetSummary.boats.map((boat) => String(boat.mmsi)).filter(Boolean)

    aisController = showLiveAisVessels(map, {
      canals,
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
      },
      onHistoryError: () => {
        historyPointCount.value = 0
        historyOmittedCount.value = 0
      },
      onSnapshot: (count) => {
        aisStatusMessage.value = `Loaded ${count} recent vessel positions; delayed vessels are faded automatically`
      },
    })
    aisController.setCompanyMmsis(companyMmsis.value)
    aisController.setSpecialVesselMmsis({ nt: ntMmsis, police: policeMmsis })
    applyVesselGroupFilter()
  } catch (error) {
    console.error('Failed to start AIS layer', error)
    aisStatus.value = 'error'
    aisStatusMessage.value = 'AIS failed to start; canal routes remain available.'
  }

  for (const pin of PLANNING_LOCATION_PINS) addDock(map, pin.latitude, pin.longitude, pin.label)
})

onUnmounted(() => {
  map?.off('click', handleRouteMapClick)
  map?.getContainer().removeEventListener('click', handleRouteLinkPopupClick, true)
  clearPlannedRoute()
  for (const timer of routeSuggestionTimers.values()) window.clearTimeout(timer)
  routeSuggestionTimers.clear()
  userLocationController?.stop()
  aisController?.stop()
  window.clearInterval(planningRefreshTimer)
  window.clearInterval(routeClosureRefreshTimer)
  bridgeLayerController?.destroy()
  for (const layer of navigationLayerControllers.values()) layer.remove()
  navigationLayerControllers.clear()
})
</script>

<style scoped>
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

.search-control {
  right: calc(0.75rem + env(safe-area-inset-right));
  top: calc(0.75rem + env(safe-area-inset-top));
}

.ais-status {
  bottom: calc(0.75rem + env(safe-area-inset-bottom));
  right: calc(0.75rem + env(safe-area-inset-right));
}

.vessel-details {
  bottom: calc(5.5rem + env(safe-area-inset-bottom));
  left: calc(0.75rem + env(safe-area-inset-left));
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

@media (min-width: 640px) {
  .search-control {
    right: calc(1rem + env(safe-area-inset-right));
    top: calc(1rem + env(safe-area-inset-top));
  }

  .vessel-details {
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
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

:deep(.bridge-popup small) { display: block; margin-top: 8px; color: #64748b; }
</style>
