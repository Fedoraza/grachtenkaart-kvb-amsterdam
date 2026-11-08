import L from "leaflet";
import { mergeAisState } from "../../shared/ais-state.mjs";
import { inferVesselOperator, operatorById, groupVesselsByOperator } from "../../shared/vessel-operators.mjs";
import { buildCanalRoutingNetwork, reconstructCanalRoute } from "./canalRouting";
import { interpolateCoordinate, reconnectDelay } from "./aisMotion";

let configuredRemoveAfterMs = 30 * 24 * 60 * 60 * 1000;
let configuredNamedRemoveAfterMs = 3 * 60 * 60 * 1000;
let configuredUnnamedRemoveAfterMs = 60 * 60 * 1000;
let configuredMovingStaleMs = 15 * 60_000;
let configuredStationaryStaleMs = 15 * 60_000;

export function showLiveAisVessels(map, options = {}) {
  const historyPane = map.getPane("ais-history-pane") || map.createPane("ais-history-pane");
  historyPane.style.zIndex = "550";
  historyPane.style.pointerEvents = "none";
  const vessels = new Map();
  const layer = L.layerGroup().addTo(map);
  const historyLayer = L.layerGroup().addTo(map);
  const canalNetwork = buildCanalRoutingNetwork(options.canals);
  let visibleMmsis = null;
  let operatorAssignments = { ...(options.operatorAssignments || {}) };
  let companyMmsis = new Set(Array.from(options.companyMmsis || [], String));
  let companyNames = new Map((options.companyBoats || []).filter((boat) => boat.mmsi)
    .map((boat) => [String(boat.mmsi), String(boat.name || "").trim()]));
  let specialMmsis = { nt: new Set(), police: new Set() };
  let historyRequestController = null;
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let lastSocketMessageAt = Date.now();
  let socketOpenedAt = Date.now();
  let stopped = false;
  let dataSaver = Boolean(options.dataSaver);
  const canConnect = () => !stopped && document.visibilityState !== "hidden";
  const socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";

  function connectSocket() {
    if (!canConnect()) return;
    clearTimeout(reconnectTimer);
    options.onStatus?.({ status: "reconnecting", message: reconnectAttempt ? `Reconnecting to local AIS gateway (attempt ${reconnectAttempt + 1})…` : "Connecting to local AIS gateway…" });
    const connection = new WebSocket(`${socketProtocol}//${location.host}/ais${dataSaver ? "?dataSaver=1" : ""}`);
    socket = connection;
    socketOpenedAt = Date.now();
    lastSocketMessageAt = Date.now();
    connection.addEventListener("open", () => {
      if (socket !== connection || !canConnect()) return;
      reconnectAttempt = 0;
      options.onStatus?.({ status: "reconnecting", message: "Connected; loading current AIS snapshot…" });
    });
    connection.addEventListener("message", event => { if (socket === connection && canConnect()) { lastSocketMessageAt = Date.now(); handleSocketMessage(event); } });
    connection.addEventListener("close", () => {
      if (socket !== connection || !canConnect()) return;
      socket = null;
      options.onStatus?.({ status: "reconnecting", message: "Local AIS gateway disconnected; reconnecting automatically…" });
      const delay = reconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(connectSocket, delay);
    });
    connection.addEventListener("error", () => {
      if (socket !== connection || !canConnect()) return;
      options.onStatus?.({ status: "degraded", message: "Local AIS gateway connection error" });
    });
  }

  function handleSocketMessage({ data }) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (message.type === "status") {
      if (message.config) {
        configuredMovingStaleMs = Number(message.config.movingStaleMs) || configuredMovingStaleMs;
        configuredStationaryStaleMs = Number(message.config.stationaryStaleMs) || configuredStationaryStaleMs;
        configuredRemoveAfterMs = Number(message.config.removeAfterMs) || configuredRemoveAfterMs;
        configuredNamedRemoveAfterMs = Number(message.config.namedRemoveAfterMs) || configuredNamedRemoveAfterMs;
        configuredUnnamedRemoveAfterMs = Number(message.config.unnamedRemoveAfterMs) || configuredUnnamedRemoveAfterMs;
      }
      options.onStatus?.(message);
      return;
    }

    if (message.type === "snapshot") {
      if (message.config) {
        configuredMovingStaleMs = Number(message.config.movingStaleMs) || configuredMovingStaleMs;
        configuredStationaryStaleMs = Number(message.config.stationaryStaleMs) || configuredStationaryStaleMs;
        configuredRemoveAfterMs = Number(message.config.removeAfterMs) || configuredRemoveAfterMs;
        configuredNamedRemoveAfterMs = Number(message.config.namedRemoveAfterMs) || configuredNamedRemoveAfterMs;
        configuredUnnamedRemoveAfterMs = Number(message.config.unnamedRemoveAfterMs) || configuredUnnamedRemoveAfterMs;
      }
      for (const vessel of message.vessels || []) processVesselMessage(vessel, false);
      emitVesselState();
      options.onSnapshot?.(message.vessels?.length || 0);
      return;
    }

    if (message.type === "boat-duty-update") {
      window.dispatchEvent(new CustomEvent("boat-duty-update", { detail: message }));
      return;
    }
    if (message.type === "inventory-update") {
      window.dispatchEvent(new CustomEvent("inventory-update", { detail: message }));
      return;
    }

    if (message.type === "ais-batch") {
      for (const update of message.messages || []) processVesselMessage(update);
      emitVesselState();
      return;
    }

    processVesselMessage(message);
    emitVesselState();
  }

  function pauseSocket() {
    clearTimeout(reconnectTimer);
    const connection = socket;
    socket = null;
    connection?.close();
  }
  function resumeSocket() {
    if (options.connectLive === false || !canConnect() || socket) return;
    reconnectAttempt = 0;
    connectSocket();
  }
  function visibilityChanged() {
    if (document.visibilityState === 'hidden') {
      pauseSocket();
      options.onStatus?.({ status: 'paused', message: 'Live AIS gepauzeerd zolang de app op de achtergrond staat.' });
    } else resumeSocket();
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('pagehide', pauseSocket);
  window.addEventListener('pageshow', resumeSocket);
  window.addEventListener('online', resumeSocket);
  resumeSocket();

  function processVesselMessage(message, highlightMovement = true) {
    const vessel = vessels.get(message.mmsi) || {
      mmsi: message.mmsi,
      marker: null,
      lastPositionAt: 0,
    };
    const previousPosition = vessel.marker && Number.isFinite(vessel.latitude) && Number.isFinite(vessel.longitude)
      ? [vessel.latitude, vessel.longitude]
      : null;

    Object.assign(vessel, mergeAisState(vessel, message));
    vessel.operatorId = inferVesselOperator(vessel, operatorAssignments)?.id || null;
    vessel.onSelect = () => {
      selectedMmsi = vessel.mmsi;
      options.onSelect?.(publicVessel(vessel));
    };
    vessels.set(message.mmsi, vessel);

    if (Number.isFinite(message.latitude) && Number.isFinite(message.longitude)) {
      vessel.lastPositionAt = getMessageTimestamp(message.sourceReceivedAt || message.receivedAt);
      updateVesselMarker(layer, vessel, companyMmsis, companyNames, specialMmsis);
      syncMarkerVisibility(layer, vessel, visibleMmsis);
      updateStaleAppearance(vessel);
      if (highlightMovement && message.type === "vessel-position" && previousPosition
        && layer.hasLayer(vessel.marker)
        && movedAtLeastFiveMeters(previousPosition, [message.latitude, message.longitude])) {
        pulseVesselMarker(vessel);
      }
    } else if (vessel.marker) {
      updateVesselMarker(layer, vessel, companyMmsis, companyNames, specialMmsis);
    }

    if (vessel.mmsi === selectedMmsi) options.onSelect?.(publicVessel(vessel));
  }

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    // The gateway sends a status heartbeat every 30 seconds. A dead socket can
    // remain OPEN after network changes; reconnect instead of silently freezing.
    if (socket && canConnect() && options.connectLive !== false && (socket.readyState === WebSocket.CONNECTING ? now - socketOpenedAt > 30_000 : now - lastSocketMessageAt > 90_000)) {
      pauseSocket();
      resumeSocket();
    }
    for (const [mmsi, vessel] of vessels) {
      if (!vessel.marker) continue;

      const age = now - vessel.lastPositionAt;
      vessel.marker.getElement()?.classList.toggle("ais-vessel--stale", age > staleThreshold(vessel));
      vessel.marker.getElement()?.classList.toggle("ais-vessel--offline", age > 24 * 60 * 60 * 1000);
      updateVesselPopup(vessel);

      if (age > removalThreshold(vessel, companyMmsis, specialMmsis)) {
        if (vessel.animationFrame) cancelAnimationFrame(vessel.animationFrame);
        clearTimeout(vessel.glowTimeout);
        vessel.marker.remove();
        vessels.delete(mmsi);
      }
    }
    emitVesselState();
  }, 30_000);
  let selectedMmsi = null;
  // Fleet data includes last-known positions even before the WebSocket snapshot.
  for (const vessel of options.initialVessels || []) {
    if (!vessel?.mmsi || !Number.isFinite(vessel.latitude) || !Number.isFinite(vessel.longitude)) continue;
    vessel.operatorId = inferVesselOperator(vessel, operatorAssignments)?.id || null;
    if (Date.now() - getMessageTimestamp(vessel.sourceReceivedAt || vessel.receivedAt) > removalThreshold(vessel, companyMmsis, specialMmsis)) continue;
    processVesselMessage(vessel, false);
  }
  emitVesselState();

  function emitVesselState() {
    // Use the same duplicate-name rules as the server and directories.
    const memberships = new Map(groupVesselsByOperator([...vessels.values()], operatorAssignments).flatMap((group) => group.mmsis.map((mmsi) => [mmsi, group.id])));
    for (const vessel of vessels.values()) {
      const operatorId = memberships.get(String(vessel.mmsi)) || null;
      if (vessel.operatorId === operatorId) continue;
      vessel.operatorId = operatorId;
      if (vessel.marker) updateVesselMarker(layer, vessel, companyMmsis, companyNames, specialMmsis);
    }
    options.onCount?.(countVisibleVessels(layer, vessels));
    options.onVessels?.(
      Array.from(vessels.values())
        .filter((vessel) => vessel.marker)
        .map(publicVessel)
        .sort((a, b) => (a.name || a.mmsi).localeCompare(b.name || b.mmsi)),
    );
  }

  return {
    setDataSaver(enabled) {
      if (dataSaver === Boolean(enabled)) return;
      dataSaver = Boolean(enabled);
      pauseSocket();
      resumeSocket();
    },
    focusVessel(mmsi) {
      const vessel = vessels.get(String(mmsi));
      if (!vessel?.marker) return false;

      selectedMmsi = vessel.mmsi;
      map.panTo(vessel.marker.getLatLng());
      vessel.marker.openPopup();
      options.onSelect?.(publicVessel(vessel));
      return true;
    },
    fitVisibleVessels() {
      const visibleMarkers = Array.from(vessels.values())
        .filter((vessel) => vessel.marker && layer.hasLayer(vessel.marker))
        .map((vessel) => vessel.marker);
      if (!visibleMarkers.length) return false;

      const bounds = L.featureGroup(visibleMarkers).getBounds();
      map.fitBounds(bounds, { maxZoom: 16, padding: [35, 35] });
      return true;
    },
    clearSelection() {
      selectedMmsi = null;
      map.closePopup();
      historyRequestController?.abort();
      historyLayer.clearLayers();
      options.onHistory?.({ hours: null, pointCount: 0 });
    },
    async showHistory(mmsi, hours = 1, range = null, viewOptions = {}) {
      historyRequestController?.abort();
      historyRequestController = new AbortController();

      try {
        const query = range ? `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : `hours=${hours}`;
        const response = await fetch(`/api/ais/vessels/${encodeURIComponent(mmsi)}/history?${query}`, {
          signal: historyRequestController.signal,
        });
        if (!response.ok) throw new Error(`History request failed (${response.status})`);

        const history = await response.json();
        historyLayer.clearLayers();
        const reconstructed = reconstructCanalRoute(history.points, canalNetwork);

        for (const path of reconstructed.paths) {
          L.polyline(path, {
            color: "#0f172a",
            opacity: 0.95,
            pane: "ais-history-pane",
            weight: 9,
          }).addTo(historyLayer);
          L.polyline(path, {
            color: "#fde047",
            opacity: 1,
            pane: "ais-history-pane",
            weight: 5,
          }).bindTooltip("Reconstructed route along waterways").addTo(historyLayer);
        }

        if (reconstructed.fallbackSegments.length) {
          L.polyline(reconstructed.fallbackSegments, {
            color: "#ef4444",
            dashArray: "8 8",
            opacity: 1,
            pane: "ais-history-pane",
            weight: 4,
          }).bindTooltip("Direct fallback: no reliable canal route found").addTo(historyLayer);
        }

        for (const report of reconstructed.reports) {
          L.circleMarker([report.latitude, report.longitude], {
            color: "#ffffff",
            fillColor: "#06b6d4",
            fillOpacity: 1,
            pane: "ais-history-pane",
            radius: 4,
            weight: 2,
          })
            .bindTooltip(`Actual AIS report · ${formatReportDateTime(report.receivedAt)}`)
            .addTo(historyLayer);
        }

        if (viewOptions.fitBounds && historyLayer.getLayers().length) {
          const bounds = historyLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, {
              maxZoom: 17,
              paddingTopLeft: [24, 80],
              paddingBottomRight: [24, 110],
            });
          }
        }

        options.onHistory?.({
          hours: range ? null : hours,
          range: Boolean(range),
          pointCount: reconstructed.reports.length,
          pathCount: reconstructed.paths.length,
          fallbackCount: reconstructed.fallbackSegments.length,
          omittedCount: reconstructed.omittedSegments,
        });
        return history;
      } catch (error) {
        if (error.name !== "AbortError") options.onHistoryError?.(error);
        return null;
      }
    },
    setVisibleMmsis(mmsis) {
      visibleMmsis = mmsis === null ? null : new Set(Array.from(mmsis, String));

      for (const vessel of vessels.values()) {
        syncMarkerVisibility(layer, vessel, visibleMmsis);
      }

      emitVesselState();
    },
    setOperatorAssignments(assignments) {
      operatorAssignments = { ...assignments };
      for (const vessel of vessels.values()) {
        vessel.operatorId = inferVesselOperator(vessel, operatorAssignments)?.id || null;
        if (vessel.marker) updateVesselMarker(layer, vessel, companyMmsis, companyNames, specialMmsis);
      }
    },
    setCompanyMmsis(mmsis, boats = null) {
      companyMmsis = new Set(Array.from(mmsis || [], String));
      if (boats) companyNames = new Map(boats.filter((boat) => boat.mmsi)
        .map((boat) => [String(boat.mmsi), String(boat.name || "").trim()]));
      for (const vessel of vessels.values()) {
        if (!vessel.marker) continue;
        vessel.marker.setIcon(createVesselIcon(vessel.heading ?? vessel.course ?? 0, getVesselCategory(vessel, companyMmsis, specialMmsis), companyNames.get(String(vessel.mmsi)) || vessel.name));
        updateStaleAppearance(vessel);
      }
    },
    setSpecialVesselMmsis(groups) {
      specialMmsis = {
        nt: new Set(Array.from(groups?.nt || [], String)),
        police: new Set(Array.from(groups?.police || [], String)),
      };
      for (const vessel of vessels.values()) {
        if (!vessel.marker) continue;
        vessel.marker.setIcon(createVesselIcon(vessel.heading ?? vessel.course ?? 0, getVesselCategory(vessel, companyMmsis, specialMmsis), companyNames.get(String(vessel.mmsi)) || vessel.name));
        updateStaleAppearance(vessel);
      }
    },
    stop() {
      stopped = true;
      clearInterval(cleanupTimer);
      clearTimeout(reconnectTimer);
      pauseSocket();
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', pauseSocket);
      window.removeEventListener('pageshow', resumeSocket);
      window.removeEventListener('online', resumeSocket);
      historyRequestController?.abort();
      historyLayer.remove();
      layer.remove();
      for (const vessel of vessels.values()) {
        if (vessel.animationFrame) cancelAnimationFrame(vessel.animationFrame);
        clearTimeout(vessel.glowTimeout);
      }
      vessels.clear();
    },
  };
}

function movedAtLeastFiveMeters([fromLat, fromLng], [toLat, toLng]) {
  const north = (toLat - fromLat) * 111_320;
  const east = (toLng - fromLng) * 111_320 * Math.cos(((fromLat + toLat) / 2) * Math.PI / 180);
  return Math.hypot(north, east) >= 5;
}

function pulseVesselMarker(vessel) {
  const element = vessel.marker?.getElement();
  if (!element) return;
  clearTimeout(vessel.glowTimeout);
  element.classList.remove("ais-vessel--updated");
  void element.offsetWidth;
  element.classList.add("ais-vessel--updated");
  vessel.glowTimeout = setTimeout(() => {
    element.classList.remove("ais-vessel--updated");
    vessel.glowTimeout = null;
  }, 1200);
}

function syncMarkerVisibility(layer, vessel, visibleMmsis) {
  if (!vessel.marker) return;

  const shouldShow = visibleMmsis === null || visibleMmsis.has(String(vessel.mmsi));
  const isShown = layer.hasLayer(vessel.marker);

  if (shouldShow && !isShown) layer.addLayer(vessel.marker);
  if (!shouldShow && isShown) layer.removeLayer(vessel.marker);
}

function updateStaleAppearance(vessel) {
  const age = Date.now() - vessel.lastPositionAt;
  const isStale = age > staleThreshold(vessel);
  vessel.marker?.getElement()?.classList.toggle("ais-vessel--stale", isStale);
  vessel.marker?.getElement()?.classList.toggle("ais-vessel--offline", age > 24 * 60 * 60 * 1000);
}

function staleThreshold(vessel) {
  return Number(vessel.speed) > 0.5 ? configuredMovingStaleMs : configuredStationaryStaleMs;
}

function removalThreshold(vessel, companyMmsis, specialMmsis) {
  const mmsi = String(vessel.mmsi);
  if (vessel.operatorId) return Infinity;
  const hasKnownIdentity = Boolean(String(vessel.name || "").trim())
    || companyMmsis.has(mmsi)
    || specialMmsis.nt.has(mmsi)
    || specialMmsis.police.has(mmsi);
  return hasKnownIdentity
    ? Math.min(configuredRemoveAfterMs, configuredNamedRemoveAfterMs)
    : Math.min(configuredRemoveAfterMs, configuredUnnamedRemoveAfterMs);
}

function getMessageTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function updateVesselMarker(layer, vessel, companyMmsis, companyNames, specialMmsis) {
  const latLng = [vessel.latitude, vessel.longitude];
  const rotation = vessel.heading ?? vessel.course ?? 0;
  const category = getVesselCategory(vessel, companyMmsis, specialMmsis);

  if (!vessel.marker) {
    vessel.marker = L.marker(latLng, {
      icon: createVesselIcon(rotation, category, companyNames.get(String(vessel.mmsi)) || vessel.name),
      keyboard: true,
      riseOnHover: true,
      title: vessel.name || `AIS ${vessel.mmsi}`,
    }).addTo(layer);
    vessel.marker.bindPopup("");
    vessel.marker.on("click", () => {
      vessel.onSelect?.();
    });
  } else {
    animateMarkerTo(vessel, latLng);
    vessel.marker.setIcon(createVesselIcon(rotation, category, companyNames.get(String(vessel.mmsi)) || vessel.name));
  }

  vessel.marker.setZIndexOffset(vessel.operatorId ? 200 : 0);
  if (vessel.operatorId) {
    const label = `${escapeHtml(companyNames.get(String(vessel.mmsi)) || vessel.name || vessel.mmsi)} · MMSI ${escapeHtml(String(vessel.mmsi))} · ${Date.now() - vessel.lastPositionAt > staleThreshold(vessel) ? 'Last known position · ' : ''}${escapeHtml(formatSignalAge(vessel.sourceReceivedAt || vessel.receivedAt))}`;
    if (vessel.marker.getTooltip()) vessel.marker.setTooltipContent(label);
    else vessel.marker.bindTooltip(label, { direction: "top" });
  } else if (vessel.marker.getTooltip()) vessel.marker.unbindTooltip();
  updateVesselPopup(vessel);
}

function animateMarkerTo(vessel, target) {
  if (!vessel.marker) return;
  if (vessel.animationFrame) cancelAnimationFrame(vessel.animationFrame);
  const start = vessel.marker.getLatLng();
  const targetLat = Number(target[0]), targetLng = Number(target[1]);
  const distance = Math.hypot(start.lat - targetLat, start.lng - targetLng);
  if (!Number.isFinite(distance) || distance > 0.02) {
    vessel.marker.setLatLng(target);
    return;
  }
  const startedAt = performance.now();
  const duration = 650;
  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    vessel.marker.setLatLng(interpolateCoordinate([start.lat, start.lng], [targetLat, targetLng], eased));
    if (progress < 1) vessel.animationFrame = requestAnimationFrame(step);
    else {
      vessel.marker.setLatLng(target);
      vessel.animationFrame = null;
    }
  };
  vessel.animationFrame = requestAnimationFrame(step);
}

function createVesselIcon(rotation, category, name) {
  const heading = Number.isFinite(Number(rotation)) ? Number(rotation) : 0;
  const operator = category.startsWith("operator-") ? operatorById(category.slice(9)) : null;
  const fleetName = operator ? escapeHtml(String(name || "Fleetboot").trim().slice(0, 36)) : "";
  return L.divIcon({
    className: `ais-vessel-marker${operator ? " ais-company-marker" : ""}`,
    html: `<div class="ais-vessel${category ? ` ais-vessel--${category}` : ""}"${operator ? ` style="--operator-color:${operator.color};--ais-position-glow:${operator.color}"` : ""}><span class="ais-vessel__hull" style="transform:rotate(${heading}deg)" aria-hidden="true"><svg viewBox="0 0 32 42" focusable="false"><path class="ais-vessel__outline" d="M16 2C10 6 6 13 5 22L7 35Q16 41 25 35L27 22C26 13 22 6 16 2Z"/><path class="ais-vessel__deck" d="M16 9C12 13 10 19 10 28L16 31L22 28C22 19 20 13 16 9Z"/><path class="ais-vessel__window" d="M12 21Q16 18 20 21L20 25Q16 27 12 25Z"/><path class="ais-vessel__stern" d="M10 33Q16 36 22 33"/></svg></span>${fleetName ? `<span class="ais-vessel__name">${fleetName}</span>` : ""}</div>`,
    iconSize: [30, 36],
    iconAnchor: [15, 18],
    popupAnchor: [0, -17],
  });
}

function getVesselCategory(vessel, companyMmsis, specialMmsis) {
  const mmsi = String(vessel.mmsi);
  const name = String(vessel.name || "").trim().toUpperCase();

  if (specialMmsis.police.has(mmsi) || /POLITIE|WATERPOLITIE|POLICE/.test(name)) return "police";
  if (specialMmsis.nt.has(mmsi) || /^NT\s*-?\s*\d+/.test(name)) return "nt";
  return vessel.operatorId ? `operator-${vessel.operatorId}` : "";
}

function updateVesselPopup(vessel) {
  const speed = vessel.speed === null || vessel.speed === undefined ? "Unknown" : `${(vessel.speed * 1.852).toFixed(1)} km/u`;
  const course = vessel.course === null || vessel.course === undefined ? "Unknown" : `${Math.round(vessel.course)}°`;
  const received = formatSignalAge(vessel.sourceReceivedAt || vessel.receivedAt);
  const latency = Number.isFinite(Number(vessel.latencyMs)) ? `${(Number(vessel.latencyMs) / 1000).toFixed(1)} s` : "Unknown";
  const ageMs = Date.now() - getMessageTimestamp(vessel.sourceReceivedAt || vessel.receivedAt);
  const signalState = ageMs > 24 * 60 * 60 * 1000 ? "Last known only" : ageMs > staleThreshold(vessel) ? "Delayed" : "Live";

  vessel.marker.setPopupContent(`
    <div class="ais-popup">
      <strong>${escapeHtml(vessel.name || "Unnamed AIS vessel")}</strong>
      <dl>
        <div><dt>MMSI</dt><dd>${escapeHtml(vessel.mmsi)}</dd></div>
        <div><dt>Speed</dt><dd>${speed}</dd></div>
        <div><dt>Course</dt><dd>${course}</dd></div>
        <div><dt>Last signal</dt><dd>${received}</dd></div>
        <div><dt>Position status</dt><dd>${signalState}</dd></div>
        <div><dt>Source latency</dt><dd>${latency}</dd></div>
        <div><dt>AIS message</dt><dd>${escapeHtml(vessel.messageType || "Unknown")}</dd></div>
      </dl>
    </div>
  `);
}

function formatSignalAge(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

function formatMinutesAgo(value) {
  if (!value) return "Unknown";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  return minutes < 1 ? "Less than 1 minute ago" : `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

function formatReportDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const reportDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((today.getTime() - reportDay.getTime()) / 86_400_000);
  const dayLabel = dayDifference === 0
    ? "Today"
    : dayDifference === 1
      ? "Yesterday"
      : date.toLocaleDateString(undefined, { weekday: "long" });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return `${dayLabel} · ${timeLabel}`;
}

function countVisibleVessels(layer, vessels) {
  let count = 0;
  for (const vessel of vessels.values()) {
    if (vessel.marker && layer.hasLayer(vessel.marker)) count += 1;
  }
  return count;
}

function publicVessel(vessel) {
  const { marker, onSelect, animationFrame, glowTimeout, ...data } = vessel;
  return data;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
