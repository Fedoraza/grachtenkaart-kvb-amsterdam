import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { WebSocket, WebSocketServer } from "ws";
import { gunzipSync } from "node:zlib";
import { createWhatsAppConnector } from "./server/whatsapp.mjs";
import { analyzePlanningImage } from "./server/planning-upload.mjs";
import { parseStaffingPlanning } from "./server/planning-staff.mjs";

loadLocalEnv();

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5173);
const apiKey = process.env.AISSTREAM_API_KEY?.trim();
const historyDays = Math.max(1, Number(process.env.AIS_HISTORY_DAYS || 30));
const clients = new Set();
const latestVessels = new Map();
const lastStoredPositionAt = new Map();
const pendingPlanningAnalyses = new Map();
let bridgeDataCache = null;
const navigationLayerCache = new Map();
let whatsappRescanStarted = false;
const whatsappChatRescanAt = new Map();
let upstream = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let upstreamConnectedAt = 0;
let lastUpstreamMessageAt = 0;
let lastUpstreamPongAt = 0;

const databasePath = process.env.DATABASE_PATH || join(process.cwd(), "data", "ais.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS vessels (
    mmsi TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mmsi TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed REAL,
    course REAL,
    heading REAL,
    received_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS positions_mmsi_time ON positions (mmsi, received_at);
  CREATE TABLE IF NOT EXISTS fleet_boats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mmsi TEXT UNIQUE,
    registration TEXT,
    capacity INTEGER,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fleet_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boat_id INTEGER,
    service_date TEXT,
    start_time TEXT,
    end_time TEXT,
    skipper TEXT,
    guide TEXT,
    route TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    source_message_id INTEGER,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (boat_id) REFERENCES fleet_boats(id)
  );
  CREATE TABLE IF NOT EXISTS whatsapp_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_text TEXT NOT NULL,
    sender TEXT,
    message_date TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS planning_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_message_id TEXT NOT NULL UNIQUE,
    chat_id TEXT,
    sender TEXT,
    received_at INTEGER,
    service_date TEXT NOT NULL,
    chat_title TEXT,
    location TEXT,
    source_text TEXT,
    source_ocr_tsv TEXT,
    source_image_hash TEXT,
    source_image_path TEXT,
    image_type TEXT,
    status TEXT NOT NULL DEFAULT 'imported',
    item_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS planning_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    boat_id INTEGER,
    boat_name TEXT NOT NULL,
    service_date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    person_name TEXT,
    role TEXT,
    event_type TEXT NOT NULL DEFAULT 'shift',
    from_location TEXT,
    to_location TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (import_id) REFERENCES planning_imports(id) ON DELETE CASCADE,
    FOREIGN KEY (boat_id) REFERENCES fleet_boats(id)
  );
  CREATE INDEX IF NOT EXISTS planning_items_date_time ON planning_items (service_date, start_time);
  CREATE INDEX IF NOT EXISTS planning_items_boat_date ON planning_items (boat_id, service_date);
  CREATE TABLE IF NOT EXISTS planning_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    person_name TEXT NOT NULL,
    role TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (import_id) REFERENCES planning_imports(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS planning_staff_date_role ON planning_staff (service_date, role);
  CREATE TABLE IF NOT EXISTS whatsapp_chats (
    chat_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    linked_parent TEXT,
    is_community INTEGER NOT NULL DEFAULT 0,
    is_announcement INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS whatsapp_message_anchors (
    chat_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    message_timestamp INTEGER NOT NULL,
    from_me INTEGER NOT NULL DEFAULT 0,
    history_requested_at INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    phone_e164 TEXT UNIQUE,
    phone_verified_at INTEGER,
    auth_method TEXT NOT NULL DEFAULT 'password',
    role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions (expires_at);
  CREATE TABLE IF NOT EXISTS account_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    browser_token_hash TEXT NOT NULL UNIQUE,
    phone_e164 TEXT NOT NULL,
    name TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    verified_at INTEGER,
    consumed_at INTEGER,
    external_message_id TEXT UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS account_verifications_phone_status ON account_verifications (phone_e164, status, expires_at);
`);
ensureFleetBoatColumns();
ensureWhatsAppChatColumns();
ensurePlanningImportColumns();
ensureUserColumns();
cleanupInvalidWhatsAppPlanningImports();
const upsertVesselStatement = database.prepare(`
  INSERT INTO vessels (mmsi, data, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(mmsi) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`);
const insertPositionStatement = database.prepare(`
  INSERT INTO positions (mmsi, latitude, longitude, speed, course, heading, received_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
loadLatestVessels();
pruneHistory();

const whatsapp = createWhatsAppConnector({
  isChatEnabled: isWhatsAppChatEnabled,
  onChats: upsertWhatsAppChats,
  onGroupMessage: recordWhatsAppGroupAnchor,
  onPlanningMessage: importReadOnlyWhatsAppPlanningMessage,
  onLocationStaffMessage: importReadOnlyWhatsAppLocationStaff,
  onVerificationMessage: verifyInboundAccountMessage,
  onReady: () => {
    if (whatsappRescanStarted) return;
    whatsappRescanStarted = true;
    setTimeout(() => rescanAllWhatsAppPlanning().catch((error) => console.error("WhatsApp history rescan failed", error)), 500);
  },
});

const vite = isProduction
  ? null
  : await import("vite").then(({ createServer }) =>
      createServer({
        server: {
          middlewareMode: true,
          watch: {
            ignored: ["**/data/**", "**/*.sqlite", "**/*.sqlite-*"],
          },
        },
        appType: "spa",
      }),
    );

const server = createServer(async (req, res) => {
  applySecurityHeaders(req, res);
  const requestUrl = new URL(req.url || "/", "http://localhost");
  if (isMutationMethod(req.method) && !isTrustedOrigin(req)) {
    sendJson(res, 403, { error: "Untrusted request origin" });
    return;
  }
  if (requestUrl.pathname.startsWith("/api/auth/")) {
    await handleAuthApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/")) {
    const user = getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { error: "Authentication required" });
      return;
    }
    req.authUser = user;
  }
  if (requestUrl.pathname.startsWith("/api/ais/")) {
    handleAisApi(requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/fleet/")) {
    if (req.method !== "GET" && !requireAdmin(req, res)) return;
    if (requestUrl.pathname.includes("/whatsapp") && !requireAdmin(req, res)) return;
    await handleFleetApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/planning/")) {
    await handlePlanningApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname === "/api/map/bridges") {
    await handleBridgeDataApi(res);
    return;
  }
  if (requestUrl.pathname === "/api/map/navigation-layer") {
    await handleNavigationLayerApi(requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/whatsapp/")) {
    if (!requireAdmin(req, res)) return;
    await handleWhatsAppApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "API endpoint not found" });
    return;
  }

  if (vite) {
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
    return;
  }

  serveProductionFile(req, res);
});

async function handleBridgeDataApi(res) {
  const cachePath = join(process.cwd(), "data", "amsterdam-bridges-v2.json");
  const maxAge = 24 * 60 * 60 * 1000;
  try {
    if (!bridgeDataCache && existsSync(cachePath) && Date.now() - statSync(cachePath).mtimeMs < maxAge) {
      bridgeDataCache = JSON.parse(readFileSync(cachePath, "utf8"));
    }
    if (!bridgeDataCache) {
      const baseUrl = "https://api.data.amsterdam.nl/v1/civieleconstructies/v1";
      const [allResponse, fixedResponse] = await Promise.all([
        fetch(`${baseUrl}/brug?_format=geojson&page_size=5000`, { headers: { Accept: "application/geo+json, application/json" } }),
        fetch(`${baseUrl}/brug_vast?_format=geojson&page_size=5000`, { headers: { Accept: "application/geo+json, application/json" } }),
      ]);
      if (!allResponse.ok || !fixedResponse.ok) throw new Error(`Amsterdam bridge API returned ${allResponse.status}/${fixedResponse.status}`);
      const [allBridges, fixedBridges] = await Promise.all([allResponse.json(), fixedResponse.json()]);
      const fixedByNumber = new Map((fixedBridges.features || []).map((feature) => [feature.properties?.objectnummer, feature]));
      const includedNumbers = new Set();
      const normalizeFeature = (feature, details = feature) => ({
        type: "Feature",
        id: feature.id,
        geometry: feature.geometry,
        properties: {
          name: details.properties?.objectnaam || feature.properties?.objectnaam || details.properties?.openbareruimte || "Naam onbekend",
          number: feature.properties.objectnummer || null,
          clearanceNap: finiteNumber(details.properties?.doorvaarthoogte),
          clearanceAt4mNap: finiteNumber(details.properties?.brughoogteBij4M),
          passageWidth: finiteNumber(details.properties?.doorvaartbreedte),
          winterWaterLevelNap: finiteNumber(details.properties?.waterpeilwinter),
          bridgeType: details.properties?.typebrug || feature.properties?.type || feature.properties?.nenTypeBeheerobject || null,
          route: details.properties?.hoofdvaarroute || details.properties?.waterobject || null,
          updatedAt: details.properties?.lastupdate || null,
        },
      });
      const features = (allBridges.features || []).map((feature) => {
        const number = feature.properties?.objectnummer;
        if (number) includedNumbers.add(number);
        return normalizeFeature(feature, fixedByNumber.get(number) || feature);
      });
      for (const feature of fixedBridges.features || []) {
        const number = feature.properties?.objectnummer;
        if (!number || includedNumbers.has(number)) continue;
        features.push(normalizeFeature(feature));
      }
      bridgeDataCache = { type: "FeatureCollection", source: "Gemeente Amsterdam Civiele Constructies", fetchedAt: Date.now(), features };
      writeFileSync(cachePath, JSON.stringify(bridgeDataCache));
    }
    sendJson(res, 200, bridgeDataCache);
  } catch (error) {
    console.error("Bridge data API error", error.message);
    sendJson(res, 502, { error: "Could not load Amsterdam bridge data" });
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function handleNavigationLayerApi(requestUrl, res) {
  const layer = requestUrl.searchParams.get("layer");
  const cached = navigationLayerCache.get(layer);
  if (cached && cached.expiresAt > Date.now()) return sendJson(res, 200, cached.data);
  try {
    let data;
    let maxAge = 6 * 60 * 60 * 1000;
    if (layer === "locks") {
      const response = await fetch("https://api.data.amsterdam.nl/v1/civieleconstructies/v1/sluizen?_format=geojson&page_size=5000");
      if (!response.ok) throw new Error(`Amsterdam locks API returned ${response.status}`);
      const source = await response.json();
      data = { type: "FeatureCollection", features: (source.features || []).map((feature) => ({
        type: "Feature", geometry: feature.geometry, properties: {
          name: feature.properties?.objectnaam || "Sluis",
          number: feature.properties?.objectnummer || null,
          type: feature.properties?.type || null,
          operation: feature.properties?.typeBediening || null,
          operator: feature.properties?.bedienaar || null,
        },
      })) };
    } else if (layer === "markers") {
      const base = "https://api.pdok.nl/rws/vaarwegmarkeringen-nederland/ogc/v1/collections";
      const bbox = "4.65,52.20,5.15,52.55";
      const crs = encodeURIComponent("http://www.opengis.net/def/crs/OGC/1.3/CRS84");
      const responses = await Promise.all(["vaarweg_markeringen_drijvend_rd", "vaarweg_markeringen_vast_rd"]
        .map((collection) => fetch(`${base}/${collection}/items?f=json&bbox=${bbox}&limit=10000&crs=${crs}`)));
      if (responses.some((response) => !response.ok)) throw new Error("PDOK marker API request failed");
      const collections = await Promise.all(responses.map((response) => response.json()));
      data = { type: "FeatureCollection", features: collections.flatMap((collection) => collection.features || []) };
      maxAge = 24 * 60 * 60 * 1000;
    } else if (layer === "bridge-openings") {
      const response = await fetch("https://opendata.ndw.nu/planningsfeed_brugopeningen.xml.gz");
      if (!response.ok) throw new Error(`NDW bridge feed returned ${response.status}`);
      const xml = gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");
      data = parseNdwBridgeOpenings(xml);
      maxAge = 5 * 60 * 1000;
    } else if (layer === "moorings") {
      const response = await fetch("https://api.data.amsterdam.nl/v1/varen/v1/opafstapplaats?_format=geojson&page_size=5000");
      if (!response.ok) throw new Error(`Amsterdam public docks API returned ${response.status}`);
      const source = await response.json();
      data = { type: "FeatureCollection", features: (source.features || [])
        .filter((feature) => String(feature.properties?.kleurOpKaart || "").startsWith("Openbare op- en afstapplaats passagiersvaart"))
        .map((feature) => ({
          type: "Feature",
          id: feature.id,
          geometry: feature.geometry,
          properties: {
            name: feature.properties?.tekstOnMouseover || feature.properties?.volgnr || "Openbare aanlegplaats",
            type: "Openbare op- en afstapplaats",
            number: feature.properties?.volgnr || null,
            status: feature.properties?.kleurOpKaart || null,
            loading: feature.properties?.laadLos || null,
            charging: feature.properties?.eLaadpunt || null,
            updatedAt: feature.properties?.verwerkingsdatum || null,
            operator: "Gemeente Amsterdam",
          },
        })) };
      maxAge = 24 * 60 * 60 * 1000;
    } else if (layer === "water-levels") {
      const wfs = new URL("https://geo.rijkswaterstaat.nl/services/ogc/hws/DDAPI20/ows");
      for (const [key, value] of Object.entries({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: "locatiesmetlaatstewaarneming", outputFormat: "application/json", srsName: "EPSG:4326", bbox: "4.65,52.20,5.15,52.55,EPSG:4326" })) wfs.searchParams.set(key, value);
      const response = await fetch(wfs);
      if (!response.ok) throw new Error(`RWS water level WFS returned ${response.status}`);
      const source = await response.json();
      data = { type: "FeatureCollection", features: (source.features || []).filter((feature) => /waterhoogte/i.test(String(feature.properties?.parameter_wat_omschrijving || feature.properties?.PARAMETER_WAT_OMSCHRIJVING || ""))).map((feature) => ({
        type: "Feature", id: feature.id, geometry: feature.geometry, properties: {
          name: feature.properties?.NAAM || feature.properties?.OMSCHRIJVING || feature.properties?.CODE || "Watermeetpunt",
          value: feature.properties?.WAARDE_LAATSTE_METING ?? null,
          unit: feature.properties?.EENHEIDCODE || "cm t.o.v. NAP",
          observedAt: feature.properties?.TIJDSTIP_LAATSTE_METING ?? null,
        },
      })) };
      maxAge = 10 * 60 * 1000;
    } else {
      return sendJson(res, 400, { error: "Unknown navigation layer" });
    }
    navigationLayerCache.set(layer, { data, expiresAt: Date.now() + maxAge });
    sendJson(res, 200, data);
  } catch (error) {
    console.error(`Navigation layer ${layer} failed`, error.message);
    sendJson(res, 502, { error: `Could not load ${layer}` });
  }
}

function parseNdwBridgeOpenings(xml) {
  const features = [];
  for (const match of String(xml).matchAll(/<sit:situation\b[^>]*id="([^"]+)"[\s\S]*?<\/sit:situation>/g)) {
    const block = match[0];
    const latitude = Number(block.match(/<loc:latitude>([^<]+)<\/loc:latitude>/)?.[1]);
    const longitude = Number(block.match(/<loc:longitude>([^<]+)<\/loc:longitude>/)?.[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 52.2 || latitude > 52.55 || longitude < 4.65 || longitude > 5.15) continue;
    const start = block.match(/<com:overallStartTime>([^<]+)<\/com:overallStartTime>/)?.[1] || null;
    const end = block.match(/<com:overallEndTime>([^<]+)<\/com:overallEndTime>/)?.[1] || null;
    const code = block.match(/<loc:externalLocationCode>([^<]+)<\/loc:externalLocationCode>/)?.[1] || null;
    features.push({ type: "Feature", id: match[1], geometry: { type: "Point", coordinates: [longitude, latitude] }, properties: { name: "Geplande brugopening", code, start, end } });
  }
  return { type: "FeatureCollection", features };
}

const localSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 });

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;

  if (pathname !== "/ais") {
    if (isProduction) socket.destroy();
    return;
  }
  if (!isTrustedOrigin(request)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const user = getAuthenticatedUser(request);
  if (!user) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if ([...clients].filter((client) => client.authUserId === user.id).length >= 5) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  localSocketServer.handleUpgrade(request, socket, head, (client) => {
    client.authUserId = user.id;
    localSocketServer.emit("connection", client, request);
  });
});

localSocketServer.on("connection", (client) => {
  clients.add(client);
  send(client, {
    type: "snapshot",
    vessels: getActiveVesselSnapshot(),
  });

  if (!apiKey) {
    send(client, {
      type: "status",
      status: "not-configured",
      message: "Set AISSTREAM_API_KEY in .env to receive live AIS positions.",
    });
  } else {
    const isUpstreamLive = upstream?.readyState === WebSocket.OPEN;
    send(client, {
      type: "status",
      status: isUpstreamLive ? "live" : "connecting",
      message: isUpstreamLive ? "Receiving live AIS positions" : "Connecting to the AIS stream…",
    });
  }

  client.on("close", () => {
    clients.delete(client);
  });
  client.on("message", () => client.close(1008, "Read-only AIS stream"));
});

server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;

server.listen(port, "127.0.0.1", () => {
  console.log(`Boat Tracker: http://127.0.0.1:${port}/`);
  console.log(apiKey ? "AIS: configured" : "AIS: not configured (copy .env.example to .env)");
  console.log(`AIS history: ${historyDays} days in data/ais.sqlite`);
  connectUpstream();
  whatsapp.start().catch((error) => console.error("WhatsApp connector failed to start", error));
});

const upstreamWatchdog = setInterval(checkUpstreamHealth, 30_000);
upstreamWatchdog.unref();
const authCleanup = setInterval(() => {
  const now = Date.now();
  database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now);
  database.prepare("DELETE FROM account_verifications WHERE expires_at <= ? OR consumed_at <= ?").run(now - 24 * 60 * 60 * 1000, now - 24 * 60 * 60 * 1000);
}, 60 * 60 * 1000);
authCleanup.unref();

function connectUpstream() {
  if (!apiKey) return;
  if (upstream && [WebSocket.CONNECTING, WebSocket.OPEN].includes(upstream.readyState)) return;

  clearTimeout(reconnectTimer);
  broadcast({ type: "status", status: "connecting", message: "Connecting to AISStream…" });
  upstream = new WebSocket("wss://stream.aisstream.io/v0/stream");

  upstream.on("open", () => {
    reconnectAttempt = 0;
    upstreamConnectedAt = Date.now();
    lastUpstreamMessageAt = Date.now();
    lastUpstreamPongAt = Date.now();
    upstream.send(
      JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[52.28, 4.72], [52.45, 5.03]]],
        FilterMessageTypes: [
          "PositionReport",
          "StandardClassBPositionReport",
          "ExtendedClassBPositionReport",
          "ShipStaticData",
          "StaticDataReport",
        ],
      }),
    );
    broadcast({ type: "status", status: "live", message: "Receiving live AIS positions" });
  });

  upstream.on("message", (raw) => {
    lastUpstreamMessageAt = Date.now();
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const normalizedMessage = normalizeAisMessage(message);
    if (normalizedMessage) {
      persistAisMessage(normalizedMessage);
      broadcast(normalizedMessage);
    }
  });

  upstream.on("error", (error) => {
    console.error(`AIS upstream error: ${error.message}`);
  });

  upstream.on("pong", () => {
    lastUpstreamPongAt = Date.now();
  });

  upstream.on("close", (code, reason) => {
    upstream = null;
    const detail = reason?.toString() || `connection closed (${code})`;
    broadcast({ type: "status", status: "reconnecting", message: `AIS ${detail}; reconnecting…` });

    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connectUpstream, Math.min(30_000, 1_000 * 2 ** reconnectAttempt));
  });
}

function checkUpstreamHealth() {
  if (!apiKey) return;

  if (!upstream || upstream.readyState === WebSocket.CLOSED) {
    connectUpstream();
    return;
  }

  if (upstream.readyState !== WebSocket.OPEN) return;

  const now = Date.now();
  const messageAge = now - lastUpstreamMessageAt;
  const pongAge = now - lastUpstreamPongAt;
  const connectionAge = now - upstreamConnectedAt;

  if (connectionAge > 120_000 && (messageAge > 120_000 || pongAge > 90_000)) {
    console.warn(`AIS watchdog: restarting stalled stream (message age ${Math.round(messageAge / 1000)}s)`);
    broadcast({ type: "status", status: "reconnecting", message: "AIS feed stalled; reconnecting automatically…" });
    upstream.terminate();
    return;
  }

  upstream.ping();
  broadcast({
    type: "status",
    status: "live",
    message: `Receiving AIS positions · feed update ${Math.max(0, Math.round(messageAge / 1000))}s ago`,
  });
}

function persistAisMessage(message) {
  const existing = latestVessels.get(message.mmsi) || { mmsi: message.mmsi };
  const merged = mergeDefined(existing, message);
  latestVessels.set(message.mmsi, merged);

  const now = Date.now();
  upsertVesselStatement.run(message.mmsi, JSON.stringify(merged), now);

  if (message.type !== "vessel-position") return;

  const receivedAt = parseAisTime(message.receivedAt);
  const lastStoredAt = lastStoredPositionAt.get(message.mmsi) || 0;
  if (receivedAt - lastStoredAt < 10_000) return;

  insertPositionStatement.run(
    message.mmsi,
    message.latitude,
    message.longitude,
    message.speed,
    message.course,
    message.heading,
    receivedAt,
  );
  lastStoredPositionAt.set(message.mmsi, receivedAt);
}

function mergeDefined(existing, update) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(update)) {
    if (value !== null && value !== undefined && value !== "") merged[key] = value;
  }
  return merged;
}

function parseAisTime(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function loadLatestVessels() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const rows = database.prepare("SELECT mmsi, data FROM vessels WHERE updated_at >= ?").all(cutoff);
  for (const row of rows) {
    try {
      latestVessels.set(row.mmsi, JSON.parse(row.data));
    } catch {
      // Ignore malformed legacy rows.
    }
  }
}

function getActiveVesselSnapshot() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return Array.from(latestVessels.values()).filter((vessel) => parseAisTime(vessel.receivedAt) >= cutoff);
}

function pruneHistory() {
  const cutoff = Date.now() - historyDays * 24 * 60 * 60 * 1000;
  database.prepare("DELETE FROM positions WHERE received_at < ?").run(cutoff);
  database.prepare("DELETE FROM vessels WHERE updated_at < ?").run(cutoff);
}

function handleAisApi(requestUrl, res) {
  if (requestUrl.pathname === "/api/ais/health") {
    const now = Date.now();
    sendJson(res, 200, {
      status: upstream?.readyState === WebSocket.OPEN ? "connected" : "reconnecting",
      connectedAt: upstreamConnectedAt || null,
      lastMessageAt: lastUpstreamMessageAt || null,
      messageAgeSeconds: lastUpstreamMessageAt ? Math.round((now - lastUpstreamMessageAt) / 1000) : null,
      cachedVessels: latestVessels.size,
      activeVessels: getActiveVesselSnapshot().length,
      provider: "AISStream",
    });
    return;
  }

  const historyMatch = requestUrl.pathname.match(/^\/api\/ais\/vessels\/(\d{9})\/history$/);
  if (!historyMatch) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const hours = Math.min(historyDays * 24, Math.max(1, Number(requestUrl.searchParams.get("hours") || 1)));
  const since = Date.now() - hours * 60 * 60 * 1000;
  const rows = database.prepare(`
    SELECT latitude, longitude, speed, course, heading, received_at AS receivedAt
    FROM positions
    WHERE mmsi = ? AND received_at >= ?
    ORDER BY received_at ASC
    LIMIT 10000
  `).all(historyMatch[1], since);

  const step = Math.max(1, Math.ceil(rows.length / 1500));
  sendJson(res, 200, {
    mmsi: historyMatch[1],
    hours,
    points: rows.filter((_, index) => index % step === 0 || index === rows.length - 1),
  });
}

function sendJson(res, statusCode, value) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

function applySecurityHeaders(req, res) {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' ws: wss:",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; "));
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function isMutationMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

function isTrustedOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.host === req.headers.host;
  } catch {
    return false;
  }
}

const authCookieName = "grachten_session";
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const loginAttempts = new Map();
const registrationAttempts = new Map();

async function handleAuthApi(req, requestUrl, res) {
  const path = requestUrl.pathname;
  try {
    if (req.method === "GET" && path === "/api/auth/status") {
      const user = getAuthenticatedUser(req);
      const needsSetup = database.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0;
      sendJson(res, 200, { needsSetup, authenticated: Boolean(user), user: user ? publicUser(user) : null });
      return;
    }

    if (req.method === "POST" && path === "/api/auth/register/start") {
      if (database.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0) {
        return sendJson(res, 409, { error: "An administrator must complete initial setup first" });
      }
      const body = await readJsonBody(req);
      const name = normalizeName(body.name);
      const phone = normalizePhoneNumber(body.phone);
      const requester = req.socket.remoteAddress || "unknown";
      const phoneAttemptKey = `${requester}:${phone}`;
      const ipAttemptKey = `${requester}:*`;
      if (isRegistrationRateLimited(phoneAttemptKey, 5) || isRegistrationRateLimited(ipAttemptKey, 20)) {
        return sendJson(res, 429, { error: "Too many verification attempts. Try again later." });
      }
      recordRegistrationAttempt(phoneAttemptKey);
      recordRegistrationAttempt(ipAttemptKey);
      const verificationInfo = whatsapp.getVerificationInfo();
      if (!verificationInfo.connected || !verificationInfo.phone) {
        return sendJson(res, 503, { error: "WhatsApp verification is temporarily unavailable" });
      }
      if (!await whatsapp.isEligiblePhone(phone)) {
        return sendJson(res, 403, { error: "This phone number was not found in the enabled day-chat member lists" });
      }
      const browserToken = randomBytes(32).toString("base64url");
      const challengeCode = `BT-${randomBytes(6).toString("hex").toUpperCase()}`;
      const now = Date.now();
      const expiresAt = now + 10 * 60 * 1000;
      database.prepare("UPDATE account_verifications SET status = 'replaced' WHERE phone_e164 = ? AND status IN ('pending', 'verified')")
        .run(phone);
      database.prepare(`
        INSERT INTO account_verifications
          (browser_token_hash, phone_e164, name, code_hash, status, expires_at, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).run(hashSessionToken(browserToken), phone, name, hashSessionToken(challengeCode), expiresAt, now);
      sendJson(res, 201, {
        token: browserToken,
        code: challengeCode,
        destinationPhone: verificationInfo.phone,
        expiresAt,
        existingAccount: Boolean(database.prepare("SELECT id FROM users WHERE phone_e164 = ?").get(phone)),
      });
      return;
    }

    if (req.method === "POST" && path === "/api/auth/register/status") {
      const body = await readJsonBody(req);
      const tokenHash = hashSessionToken(String(body.token || ""));
      const challenge = database.prepare("SELECT * FROM account_verifications WHERE browser_token_hash = ?").get(tokenHash);
      if (!challenge) return sendJson(res, 404, { error: "Verification request not found" });
      if (challenge.expires_at <= Date.now() && challenge.status === "pending") {
        database.prepare("UPDATE account_verifications SET status = 'expired' WHERE id = ?").run(challenge.id);
        return sendJson(res, 410, { status: "expired", error: "Verification code expired" });
      }
      if (challenge.status === "pending") return sendJson(res, 200, { status: "pending", expiresAt: challenge.expires_at });
      if (challenge.status !== "verified") return sendJson(res, 410, { status: challenge.status, error: "Verification is no longer active" });

      database.exec("BEGIN IMMEDIATE");
      let user;
      try {
        user = getOrCreatePhoneVerifiedUser(challenge);
        if (!user.active) throw authValidationError("This account has been disabled");
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      sendJson(res, 200, { status: "password_required", name: user.name, phone: user.phone_e164 });
      return;
    }

    if (req.method === "POST" && path === "/api/auth/register/set-password") {
      const body = await readJsonBody(req);
      const password = validatePassword(body.password);
      if (password !== String(body.confirmPassword || "")) return sendJson(res, 400, { error: "Passwords do not match" });
      const challenge = database.prepare("SELECT * FROM account_verifications WHERE browser_token_hash = ?")
        .get(hashSessionToken(String(body.token || "")));
      if (!challenge || challenge.status !== "verified" || challenge.expires_at <= Date.now()) {
        return sendJson(res, 410, { error: "Phone verification has expired" });
      }
      const user = getOrCreatePhoneVerifiedUser(challenge);
      if (!user.active) return sendJson(res, 403, { error: "This account has been disabled" });
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("UPDATE users SET password_hash = ?, auth_method = 'phone_password', phone_verified_at = ?, updated_at = ? WHERE id = ?")
          .run(hashPassword(password), Date.now(), Date.now(), user.id);
        database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(user.id);
        database.prepare("UPDATE account_verifications SET status = 'consumed', consumed_at = ? WHERE id = ? AND status = 'verified'")
          .run(Date.now(), challenge.id);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      const updated = database.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
      createAuthSession(req, res, user.id);
      sendJson(res, 200, { status: "authenticated", user: publicUser(updated) });
      return;
    }

    if (req.method === "POST" && path === "/api/auth/setup") {
      if (database.prepare("SELECT COUNT(*) AS count FROM users").get().count !== 0) {
        return sendJson(res, 409, { error: "Initial setup has already been completed" });
      }
      const body = await readJsonBody(req);
      if (database.prepare("SELECT COUNT(*) AS count FROM users").get().count !== 0) {
        return sendJson(res, 409, { error: "Initial setup has already been completed" });
      }
      const user = createUser(body, "admin");
      createAuthSession(req, res, user.id);
      sendJson(res, 201, { user: publicUser(user) });
      return;
    }

    if (req.method === "POST" && path === "/api/auth/login") {
      const body = await readJsonBody(req);
      const identifier = String(body.identifier || body.email || "").trim();
      const normalizedIdentifier = identifier.includes("@") ? normalizeEmail(identifier) : normalizePhoneForLogin(identifier);
      const attemptKey = `${req.socket.remoteAddress || "unknown"}:${normalizedIdentifier || identifier.toLowerCase()}`;
      if (isLoginRateLimited(attemptKey)) return sendJson(res, 429, { error: "Too many login attempts. Try again in 15 minutes." });
      const user = normalizedIdentifier?.startsWith("+")
        ? database.prepare("SELECT * FROM users WHERE phone_e164 = ? AND auth_method = 'phone_password' AND active = 1").get(normalizedIdentifier)
        : database.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(normalizedIdentifier);
      if (!user || !verifyPassword(body.password, user.password_hash)) {
        recordFailedLogin(attemptKey);
        return sendJson(res, 401, { error: "Invalid email/phone number or password" });
      }
      loginAttempts.delete(attemptKey);
      createAuthSession(req, res, user.id);
      sendJson(res, 200, { user: publicUser(user) });
      return;
    }

    if (req.method === "POST" && path === "/api/auth/logout") {
      const token = parseCookies(req.headers.cookie || "")[authCookieName];
      if (token) database.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashSessionToken(token));
      clearAuthCookie(req, res);
      sendJson(res, 200, { loggedOut: true });
      return;
    }

    const currentUser = getAuthenticatedUser(req);
    if (!currentUser) return sendJson(res, 401, { error: "Authentication required" });
    if (currentUser.role !== "admin") return sendJson(res, 403, { error: "Administrator access required" });

    if (req.method === "GET" && path === "/api/auth/users") {
      const users = database.prepare("SELECT id, name, email, phone_e164, phone_verified_at, auth_method, role, active, created_at, updated_at FROM users ORDER BY name, email").all()
        .map(publicUser);
      sendJson(res, 200, users);
      return;
    }

    if (req.method === "POST" && path === "/api/auth/users") {
      const body = await readJsonBody(req);
      const user = createUser(body, normalizeRole(body.role));
      sendJson(res, 201, { user: publicUser(user) });
      return;
    }

    const userMatch = path.match(/^\/api\/auth\/users\/(\d+)$/);
    if (req.method === "DELETE" && userMatch) {
      const target = database.prepare("SELECT * FROM users WHERE id = ?").get(userMatch[1]);
      if (!target) return sendJson(res, 404, { error: "User not found" });
      if (target.id === currentUser.id) return sendJson(res, 400, { error: "You cannot delete your own account" });
      if (target.role === "admin" && target.active) {
        const activeAdmins = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
        if (activeAdmins <= 1) return sendJson(res, 400, { error: "At least one active administrator is required" });
      }
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(target.id);
        database.prepare("DELETE FROM users WHERE id = ?").run(target.id);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      sendJson(res, 200, { deleted: true, id: target.id });
      return;
    }
    if (req.method === "PUT" && userMatch) {
      const body = await readJsonBody(req);
      const target = database.prepare("SELECT * FROM users WHERE id = ?").get(userMatch[1]);
      if (!target) return sendJson(res, 404, { error: "User not found" });
      const role = normalizeRole(body.role ?? target.role);
      const active = body.active === undefined ? Boolean(target.active) : Boolean(body.active);
      if (target.role === "admin" && target.active && (!active || role !== "admin")) {
        const activeAdmins = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
        if (activeAdmins <= 1) return sendJson(res, 400, { error: "At least one active administrator is required" });
      }
      const name = normalizeName(body.name ?? target.name);
      const passwordChanged = Boolean(body.password);
      if (passwordChanged && target.id === currentUser.id && !verifyPassword(body.currentPassword, target.password_hash)) {
        return sendJson(res, 400, { error: "Current password is incorrect" });
      }
      const passwordHash = passwordChanged ? hashPassword(validatePassword(body.password)) : target.password_hash;
      const authMethod = passwordChanged && target.phone_e164 ? "phone_password" : target.auth_method;
      database.prepare("UPDATE users SET name = ?, role = ?, active = ?, password_hash = ?, auth_method = ?, updated_at = ? WHERE id = ?")
        .run(name, role, active ? 1 : 0, passwordHash, authMethod, Date.now(), target.id);
      if (!active || passwordChanged) database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(target.id);
      const updated = database.prepare("SELECT id, name, email, phone_e164, phone_verified_at, auth_method, role, active, created_at, updated_at FROM users WHERE id = ?").get(target.id);
      sendJson(res, 200, { user: publicUser(updated) });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const isValidation = error.name === "AuthValidationError";
    const isDuplicate = String(error.message).includes("UNIQUE constraint failed: users.email");
    console.error("Auth API error", isValidation ? error.message : error);
    const status = error.statusCode || (isValidation || isDuplicate ? 400 : 500);
    sendJson(res, status, { error: isDuplicate ? "An account with that email already exists" : status < 500 ? error.message : "Authentication request failed" });
  }
}

function createUser(body, role) {
  const name = normalizeName(body.name);
  const email = normalizeEmail(body.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw authValidationError("Enter a valid email address");
  const passwordHash = hashPassword(validatePassword(body.password));
  const now = Date.now();
  const result = database.prepare(`
    INSERT INTO users (name, email, password_hash, role, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(name, email, passwordHash, role, now, now);
  return database.prepare("SELECT id, name, email, phone_e164, phone_verified_at, auth_method, role, active, created_at, updated_at FROM users WHERE id = ?").get(result.lastInsertRowid);
}

function getAuthenticatedUser(req) {
  const token = parseCookies(req.headers.cookie || "")[authCookieName];
  if (!token || token.length > 200) return null;
  return database.prepare(`
    SELECT u.id, u.name, u.email, u.phone_e164, u.phone_verified_at, u.auth_method,
           u.role, u.active, u.created_at, u.updated_at
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
  `).get(hashSessionToken(token), Date.now()) || null;
}

function createAuthSession(req, res, userId) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  database.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(hashSessionToken(token), userId, now + sessionLifetimeMs, now);
  const secure = process.env.AUTH_SECURE_COOKIE === "true" || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${authCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure ? "; Secure" : ""}`);
}

function clearAuthCookie(req, res) {
  const secure = process.env.AUTH_SECURE_COOKIE === "true" || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${authCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`);
}

function requireAdmin(req, res) {
  if (req.authUser?.role === "admin") return true;
  sendJson(res, 403, { error: "Administrator access required" });
  return false;
}

function publicUser(user) {
  const email = String(user.email || "").endsWith("@phone.boattracker.invalid") ? null : user.email;
  return { ...user, email, active: Boolean(user.active), password_hash: undefined };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== "string" || !stored?.startsWith("scrypt:")) return false;
  const [, salt, expectedHex] = stored.split(":");
  const expected = Buffer.from(expectedHex || "", "hex");
  if (expected.length !== 64) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, expected);
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map((part) => part.trim().split(/=(.*)/s)).filter(([key]) => key));
}

function normalizeName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) throw authValidationError("Name must be between 2 and 100 characters");
  return name;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  return value === "admin" ? "admin" : "viewer";
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 12) throw authValidationError("Password must contain at least 12 characters");
  if (password.length > 200) throw authValidationError("Password is too long");
  return password;
}

function authValidationError(message) {
  const error = new Error(message);
  error.name = "AuthValidationError";
  return error;
}

function recordFailedLogin(key) {
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) loginAttempts.set(key, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  else current.count += 1;
}

function isLoginRateLimited(key) {
  const attempt = loginAttempts.get(key);
  if (!attempt) return false;
  if (attempt.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return attempt.count >= 8;
}

function recordRegistrationAttempt(key) {
  const current = registrationAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) registrationAttempts.set(key, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  else current.count += 1;
}

function isRegistrationRateLimited(key, limit) {
  const attempt = registrationAttempts.get(key);
  if (!attempt) return false;
  if (attempt.resetAt <= Date.now()) {
    registrationAttempts.delete(key);
    return false;
  }
  return attempt.count >= limit;
}

function normalizePhoneNumber(value) {
  let phone = String(value || "").trim().replace(/\(0\)/g, "").replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (phone.startsWith("+310")) phone = `+31${phone.slice(4)}`;
  if (/^0\d{9}$/.test(phone)) phone = `+31${phone.slice(1)}`;
  if (/^6\d{8}$/.test(phone)) phone = `+31${phone}`;
  if (/^31\d{9}$/.test(phone)) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw authValidationError("Enter a valid phone number, for example +31 6 12345678");
  return phone;
}

function normalizePhoneForLogin(value) {
  try { return normalizePhoneNumber(value); } catch { return null; }
}

async function handleFleetApi(req, requestUrl, res) {
  const path = requestUrl.pathname;

  try {
    if (req.method === "GET" && path === "/api/fleet/summary") {
      const boats = database.prepare(`
        SELECT b.id, b.name, b.mmsi, b.registration, b.capacity, b.notes, b.active,
               b.license_required, b.open_boat, b.length_m, b.width_m, b.boat_type,
               b.propulsion, b.home_dock, b.has_toilet, b.niceness_rating, b.photo_mime, b.created_at, b.updated_at,
               v.data AS ais_data
        FROM fleet_boats b
        LEFT JOIN vessels v ON v.mmsi = b.mmsi
        WHERE b.active = 1
        ORDER BY b.name
      `).all().map((boat) => ({
        ...formatFleetBoat(boat),
      }));
      const date = requestUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const assignments = database.prepare(`
        SELECT a.*, b.name AS boat_name, b.mmsi
        FROM fleet_assignments a
        LEFT JOIN fleet_boats b ON b.id = a.boat_id
        WHERE a.service_date = ?
        ORDER BY COALESCE(a.start_time, '99:99'), b.name
      `).all(date);
      sendJson(res, 200, { date, boats, assignments });
      return;
    }

    if (req.method === "POST" && path === "/api/fleet/boats") {
      const body = await readJsonBody(req);
      if (!body.name?.trim()) return sendJson(res, 400, { error: "Boat name is required" });
      const now = Date.now();
      const result = database.prepare(`
        INSERT INTO fleet_boats
        (name, mmsi, registration, capacity, notes, license_required, open_boat, length_m, width_m, boat_type, propulsion, home_dock, has_toilet, niceness_rating, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.name.trim(),
        normalizeMmsi(body.mmsi),
        cleanOptional(body.registration),
        normalizeInteger(body.capacity),
        cleanOptional(body.notes),
        cleanOptional(body.licenseRequired),
        normalizeBoolean(body.openBoat),
        normalizePositiveDecimal(body.lengthM),
        normalizePositiveDecimal(body.widthM),
        cleanOptional(body.boatType),
        cleanOptional(body.propulsion),
        cleanOptional(body.homeDock),
        normalizeBoolean(body.hasToilet),
        normalizeNicenessRating(body.nicenessRating),
        now,
        now,
      );
      sendJson(res, 201, getFleetBoat(result.lastInsertRowid));
      return;
    }

    const boatMatch = path.match(/^\/api\/fleet\/boats\/(\d+)$/);
    if (boatMatch && req.method === "PUT") {
      const body = await readJsonBody(req);
      if (!body.name?.trim()) return sendJson(res, 400, { error: "Boat name is required" });
      database.prepare(`
        UPDATE fleet_boats SET name = ?, mmsi = ?, registration = ?, capacity = ?, notes = ?, active = ?,
          license_required = ?, open_boat = ?, length_m = ?, width_m = ?, boat_type = ?, propulsion = ?, home_dock = ?, has_toilet = ?, niceness_rating = ?, updated_at = ?
        WHERE id = ?
      `).run(
        body.name.trim(),
        normalizeMmsi(body.mmsi),
        cleanOptional(body.registration),
        normalizeInteger(body.capacity),
        cleanOptional(body.notes),
        body.active === false ? 0 : 1,
        cleanOptional(body.licenseRequired),
        normalizeBoolean(body.openBoat),
        normalizePositiveDecimal(body.lengthM),
        normalizePositiveDecimal(body.widthM),
        cleanOptional(body.boatType),
        cleanOptional(body.propulsion),
        cleanOptional(body.homeDock),
        normalizeBoolean(body.hasToilet),
        normalizeNicenessRating(body.nicenessRating),
        Date.now(),
        boatMatch[1],
      );
      sendJson(res, 200, getFleetBoat(boatMatch[1]));
      return;
    }

    const photoMatch = path.match(/^\/api\/fleet\/boats\/(\d+)\/photo$/);
    if (photoMatch && req.method === "GET") {
      const photo = database.prepare("SELECT photo, photo_mime FROM fleet_boats WHERE id = ?").get(photoMatch[1]);
      if (!photo?.photo) return sendJson(res, 404, { error: "Photo not found" });
      res.statusCode = 200;
      res.setHeader("Content-Type", photo.photo_mime);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.end(photo.photo);
      return;
    }

    if (photoMatch && req.method === "POST") {
      const body = await readJsonBody(req, 7_000_000);
      const match = String(body.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return sendJson(res, 400, { error: "Use a JPEG, PNG, or WebP image" });
      const photo = Buffer.from(match[2], "base64");
      if (photo.length > 5_000_000) return sendJson(res, 400, { error: "Photo must be smaller than 5 MB" });
      database.prepare("UPDATE fleet_boats SET photo = ?, photo_mime = ?, updated_at = ? WHERE id = ?")
        .run(photo, match[1], Date.now(), photoMatch[1]);
      sendJson(res, 200, { photoUrl: `/api/fleet/boats/${photoMatch[1]}/photo?v=${Date.now()}` });
      return;
    }

    if (req.method === "POST" && path === "/api/fleet/whatsapp") {
      const body = await readJsonBody(req);
      if (!body.rawText?.trim()) return sendJson(res, 400, { error: "WhatsApp message text is required" });
      const result = database.prepare(`
        INSERT INTO whatsapp_inbox (raw_text, sender, message_date, status, created_at)
        VALUES (?, ?, ?, 'new', ?)
      `).run(body.rawText.trim(), cleanOptional(body.sender), cleanOptional(body.messageDate), Date.now());
      const message = database.prepare("SELECT * FROM whatsapp_inbox WHERE id = ?").get(result.lastInsertRowid);
      sendJson(res, 201, { ...message, suggestions: parseWhatsAppMessage(message.raw_text) });
      return;
    }

    if (req.method === "GET" && path === "/api/fleet/whatsapp") {
      const messages = database.prepare(`
        SELECT * FROM whatsapp_inbox ORDER BY created_at DESC LIMIT 100
      `).all().map((message) => ({ ...message, suggestions: parseWhatsAppMessage(message.raw_text) }));
      sendJson(res, 200, messages);
      return;
    }

    if (req.method === "POST" && path === "/api/fleet/assignments") {
      const body = await readJsonBody(req);
      const now = Date.now();
      const result = database.prepare(`
        INSERT INTO fleet_assignments
        (boat_id, service_date, start_time, end_time, skipper, guide, route, status, source_message_id, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.boatId || null,
        body.serviceDate || null,
        cleanOptional(body.startTime),
        cleanOptional(body.endTime),
        cleanOptional(body.skipper),
        cleanOptional(body.guide),
        cleanOptional(body.route),
        body.status || "planned",
        body.sourceMessageId || null,
        cleanOptional(body.notes),
        now,
        now,
      );
      if (body.sourceMessageId) {
        database.prepare("UPDATE whatsapp_inbox SET status = 'processed' WHERE id = ?").run(body.sourceMessageId);
      }
      sendJson(res, 201, database.prepare("SELECT * FROM fleet_assignments WHERE id = ?").get(result.lastInsertRowid));
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    if (!error.statusCode) console.error("Fleet API error", error);
    sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Fleet request failed" });
  }
}

async function handlePlanningApi(req, requestUrl, res) {
  const path = requestUrl.pathname;

  try {
    if (req.method === "POST" && path === "/api/planning/analyze") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req, 17_000_000);
      const knownBoats = database.prepare("SELECT name FROM fleet_boats WHERE active = 1 ORDER BY length(name) DESC").all().map(({ name }) => name);
      const analysis = await analyzePlanningImage(body.image, knownBoats, body.contextText);
      pendingPlanningAnalyses.set(analysis.imageHash, { imagePath: analysis.imagePath, tsv: analysis.tsv, createdAt: Date.now() });
      for (const [hash, entry] of pendingPlanningAnalyses) {
        if (entry.createdAt < Date.now() - 60 * 60 * 1000) pendingPlanningAnalyses.delete(hash);
      }
      const { imagePath: _imagePath, tsv: _tsv, ...publicAnalysis } = analysis;
      sendJson(res, 200, publicAnalysis);
      return;
    }

    if (req.method === "POST" && path === "/api/planning/manual-import") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req, 3_000_000);
      const location = normalizePlanningLocation(body.location);
      if (!location) throw planningValidationError("location is required");
      const source = pendingPlanningAnalyses.get(cleanOptional(body.sourceImageHash));
      if (body.replaceExisting === false && body.sourceImageHash) {
        const duplicate = database.prepare(`
          SELECT id FROM planning_imports
          WHERE source_image_hash = ? AND service_date = ? AND location = ?
          LIMIT 1
        `).get(body.sourceImageHash, body.serviceDate, location);
        if (duplicate) throw requestValidationError("This image part has already been imported for this date and location", 409);
      }
      let items = (Array.isArray(body.items) ? body.items : []).map((item) => ({
        ...item,
        from: item.from || (["shift", "tour", "private"].includes(item.eventType) ? location : null),
      }));
      if (body.replaceExisting === false) {
        const existingItems = database.prepare(`
          SELECT p.boat_name AS boat, p.event_type AS eventType,
                 p.start_time AS startTime, p.end_time AS endTime
          FROM planning_items p
          JOIN planning_imports i ON i.id = p.import_id
          WHERE p.service_date = ? AND i.location = ?
        `).all(body.serviceDate, location);
        items = addCrossPartTours(existingItems, items);
      }
      const staff = (Array.isArray(body.staff) ? body.staff : []).map((member) => ({ ...member, location }));
      const imported = importPlanningMessage({
        externalMessageId: `manual:${randomBytes(16).toString("hex")}`,
        chatId: `manual:${location.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        chatTitle: `Manual image import · ${location}`,
        sender: req.authUser.email,
        receivedAt: Date.now(),
        serviceDate: body.serviceDate,
        location,
        sourceText: cleanOptional(body.sourceText),
        sourceOcrTsv: source?.tsv || null,
        sourceImageHash: cleanOptional(body.sourceImageHash),
        sourceImagePath: source?.imagePath || null,
        imageType: "manual",
        snapshot: body.replaceExisting !== false,
        items,
        staff,
      });
      if (body.sourceImageHash) pendingPlanningAnalyses.delete(body.sourceImageHash);
      sendJson(res, 201, imported);
      return;
    }

    if (req.method === "GET" && path === "/api/planning/options") {
      const homeDocks = database.prepare("SELECT DISTINCT home_dock AS name FROM fleet_boats WHERE active = 1 AND home_dock IS NOT NULL AND trim(home_dock) <> '' ORDER BY home_dock").all().map(({ name }) => name);
      const locations = [...new Set(["Anne Frank", "Central Station", "Rijksmuseum", "Zwanenburgwal", "Sea Palace", "Staverno", "E-Harbour", "Strandzuid", "Olympisch Stadion", ...homeDocks])];
      sendJson(res, 200, { locations });
      return;
    }

    if (req.method === "GET" && path === "/api/planning/day") {
      const date = requestUrl.searchParams.get("date") || localIsoDate();
      if (!isIsoDate(date)) return sendJson(res, 400, { error: "date must use YYYY-MM-DD" });
      const items = database.prepare(`
        SELECT p.*, b.mmsi, i.external_message_id, i.sender, i.received_at,
               i.location AS group_location, i.chat_title
        FROM planning_items p
        LEFT JOIN fleet_boats b ON b.id = p.boat_id
        JOIN planning_imports i ON i.id = p.import_id
        WHERE p.service_date = ?
        ORDER BY COALESCE(p.start_time, '99:99'), p.boat_name, p.id
      `).all(date);
      const staff = database.prepare(`
        SELECT s.*, i.external_message_id, i.sender, i.received_at
        FROM planning_staff s
        JOIN planning_imports i ON i.id = s.import_id
        WHERE s.service_date = ?
        ORDER BY CASE s.role WHEN 'ops' THEN 1 WHEN 'runner' THEN 2 ELSE 3 END, s.person_name
      `).all(date);
      const importedLocations = database.prepare(`
        SELECT DISTINCT location AS name FROM planning_imports
        WHERE service_date = ? AND location IS NOT NULL AND trim(location) <> ''
        ORDER BY location
      `).all(date);
      const chatLocations = database.prepare("SELECT title FROM whatsapp_chats WHERE is_community = 0 AND is_announcement = 0").all()
        .flatMap(({ title }) => {
          const context = parseDatedPlanningGroup(title, Date.now());
          return context?.serviceDate === date ? [{ name: context.location }] : [];
        });
      const locations = [...new Map([...importedLocations, ...chatLocations].map((location) => [location.name, location])).values()]
        .sort((left, right) => left.name.localeCompare(right.name));
      sendJson(res, 200, { date, locations, items, staff });
      return;
    }

    if (req.method === "GET" && path === "/api/planning/imports") {
      const imports = database.prepare(`
        SELECT id, external_message_id, chat_id, chat_title, sender, received_at, service_date,
               location, image_type, source_image_hash, status, item_count, created_at
        FROM planning_imports ORDER BY created_at DESC LIMIT 100
      `).all();
      sendJson(res, 200, imports);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const status = error.statusCode || (error.name === "PlanningValidationError" ? 400 : 500);
    if (status >= 500) console.error("Planning API error", error);
    sendJson(res, status, { error: status < 500 ? error.message : "Planning request failed" });
  }
}

async function handleWhatsAppApi(req, requestUrl, res) {
  const path = requestUrl.pathname;
  try {
    if (req.method === "GET" && path === "/api/whatsapp/status") {
      sendJson(res, 200, { ...whatsapp.getState(), verification: whatsapp.getVerificationInfo() });
      return;
    }
    if (req.method === "GET" && path === "/api/whatsapp/chats") {
      sendJson(res, 200, database.prepare(`
        SELECT c.chat_id AS id, c.title, c.enabled, c.linked_parent AS linkedParent,
               c.is_community AS isCommunity, c.is_announcement AS isAnnouncement,
               p.title AS communityTitle, p.enabled AS communityEnabled
        FROM whatsapp_chats c
        LEFT JOIN whatsapp_chats p ON p.chat_id = c.linked_parent
        ORDER BY c.is_community DESC, COALESCE(p.title, c.title), c.title
      `).all().map((chat) => ({
        ...chat,
        enabled: Boolean(chat.enabled),
        isCommunity: Boolean(chat.isCommunity),
        isAnnouncement: Boolean(chat.isAnnouncement),
        communityEnabled: Boolean(chat.communityEnabled),
      })));
      return;
    }
    const chatMatch = path.match(/^\/api\/whatsapp\/chats\/(.+)$/);
    if (req.method === "PUT" && chatMatch) {
      const body = await readJsonBody(req);
      const chatId = decodeURIComponent(chatMatch[1]);
      database.prepare("UPDATE whatsapp_chats SET enabled = ?, updated_at = ? WHERE chat_id = ?")
        .run(body.enabled ? 1 : 0, Date.now(), chatId);
      await whatsapp.refreshGroups();
      sendJson(res, 200, { id: chatId, enabled: Boolean(body.enabled) });
      return;
    }
    if (req.method === "POST" && path === "/api/whatsapp/reconnect") {
      whatsapp.restart().catch((error) => console.error("WhatsApp reconnect failed", error));
      sendJson(res, 202, { status: "connecting" });
      return;
    }
    if (req.method === "POST" && path === "/api/whatsapp/refresh") {
      await whatsapp.refreshGroups();
      sendJson(res, 200, { status: "refreshed" });
      return;
    }
    if (req.method === "POST" && path === "/api/whatsapp/rescan") {
      const result = await rescanAllWhatsAppPlanning();
      sendJson(res, 202, result);
      return;
    }
    if (req.method === "POST" && path === "/api/whatsapp/logout") {
      await whatsapp.logout();
      sendJson(res, 200, { status: "logged-out" });
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    if (!error.statusCode) console.error("WhatsApp API error", error);
    sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : "WhatsApp request failed" });
  }
}

function upsertWhatsAppChats(chats) {
  const statement = database.prepare(`
    INSERT INTO whatsapp_chats
      (chat_id, title, enabled, linked_parent, is_community, is_announcement, updated_at)
    VALUES (?, ?, 0, ?, ?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      title = excluded.title,
      linked_parent = excluded.linked_parent,
      is_community = excluded.is_community,
      is_announcement = excluded.is_announcement,
      updated_at = excluded.updated_at
  `);
  const now = Date.now();
  for (const chat of chats) statement.run(
    chat.id,
    chat.title,
    chat.linkedParent || null,
    chat.isCommunity ? 1 : 0,
    chat.isAnnouncement ? 1 : 0,
    now,
  );
}

function isWhatsAppChatEnabled(chatId, metadata = {}) {
  if (metadata.id) upsertWhatsAppChats([metadata]);
  const chat = database.prepare(`
    SELECT c.title, c.enabled, c.linked_parent, c.is_community, c.is_announcement,
           COALESCE(p.enabled, 0) AS parent_enabled
    FROM whatsapp_chats c
    LEFT JOIN whatsapp_chats p ON p.chat_id = c.linked_parent
    WHERE c.chat_id = ?
  `).get(chatId);
  if (!chat || chat.is_community || chat.is_announcement) return false;
  return Boolean(chat.enabled || (chat.linked_parent && chat.parent_enabled));
}

function recordWhatsAppGroupAnchor(message) {
  const previous = database.prepare("SELECT message_timestamp FROM whatsapp_message_anchors WHERE chat_id = ?").get(message.chatId);
  database.prepare(`
    INSERT INTO whatsapp_message_anchors
      (chat_id, message_id, message_timestamp, from_me, history_requested_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      message_id = CASE WHEN excluded.message_timestamp >= message_timestamp THEN excluded.message_id ELSE message_id END,
      message_timestamp = MAX(message_timestamp, excluded.message_timestamp),
      from_me = CASE WHEN excluded.message_timestamp >= message_timestamp THEN excluded.from_me ELSE from_me END,
      updated_at = excluded.updated_at
  `).run(message.chatId, message.externalMessageId, Number(message.receivedAt), message.fromMe ? 1 : 0, Date.now());
  const isNewAnchor = !previous || Number(message.receivedAt) > Number(previous.message_timestamp);
  const lastScan = whatsappChatRescanAt.get(message.chatId) || 0;
  if (isNewAnchor && Date.now() - lastScan > 10 * 60 * 1000) {
    whatsappChatRescanAt.set(message.chatId, Date.now());
    setTimeout(() => whatsapp.rescanHistory([{
      chatId: message.chatId,
      anchorId: message.externalMessageId,
      anchorTimestamp: Number(message.receivedAt),
      fromMe: message.fromMe,
    }]).catch((error) => console.error(`Read-only history scan failed for ${message.chatId}`, error.message)), 250);
  }
}

async function rescanAllWhatsAppPlanning() {
  const requests = database.prepare(`
    SELECT c.chat_id AS chatId, c.title,
           a.message_id AS anchorId, a.message_timestamp AS anchorTimestamp,
           COALESCE(a.from_me, 0) AS fromMe
    FROM whatsapp_chats c
    LEFT JOIN whatsapp_chats p ON p.chat_id = c.linked_parent
    LEFT JOIN whatsapp_message_anchors a ON a.chat_id = c.chat_id
    WHERE c.is_community = 0 AND c.is_announcement = 0
      AND (c.enabled = 1 OR COALESCE(p.enabled, 0) = 1)
  `).all();
  const results = await whatsapp.rescanHistory(requests);
  const requested = results.filter((item) => item.requested).length;
  console.log(`WhatsApp read-only rescan: ${requested}/${requests.length} groups requested`);
  return { requested, total: requests.length, readOnly: true };
}

async function importReadOnlyWhatsAppPlanningMessage(message) {
  try {
    if (!message.externalMessageId || database.prepare("SELECT 1 FROM planning_imports WHERE external_message_id = ?").get(message.externalMessageId)) return;
    const context = parseDatedPlanningGroup(message.chatTitle, message.receivedAt);
    if (!context) return console.log(`Ignored WhatsApp image: no dated location in ${message.chatTitle}`);
    if (!isNearPlanningDate(message.receivedAt, context.serviceDate)) return console.log(`Ignored WhatsApp image outside ${context.serviceDate} window: ${message.chatTitle}`);
    const knownBoats = database.prepare("SELECT name FROM fleet_boats WHERE active = 1 ORDER BY length(name) DESC").all().map(({ name }) => name);
    const mimeType = message.mimeType === "image/png" || message.mimeType === "image/webp" ? message.mimeType : "image/jpeg";
    const analysis = await analyzePlanningImage(`data:${mimeType};base64,${message.image.toString("base64")}`, knownBoats, message.contextText);
    const accepted = selectCredibleWhatsAppPlanning(analysis.text, analysis.items);
    const locationStaff = analysis.staff.filter((member) => ['runner', 'ops', 'kade'].includes(member.role)
      && isCredibleCrewName(member.person));
    if (!accepted.length && !locationStaff.length) return console.log(`Ignored non-planning WhatsApp image: ${message.chatTitle}`);
    const items = accepted.map((item) => ({
      ...item,
      from: item.from || (["shift", "tour", "private"].includes(item.eventType) ? context.location : null),
    }));
    importPlanningMessage({
      externalMessageId: message.externalMessageId,
      chatId: message.chatId,
      chatTitle: message.chatTitle,
      sender: message.sender,
      receivedAt: message.receivedAt,
      serviceDate: context.serviceDate,
      location: context.location,
      sourceText: analysis.text,
      sourceOcrTsv: analysis.tsv,
      sourceImageHash: analysis.imageHash,
      sourceImagePath: analysis.imagePath,
      imageType: "whatsapp-read-only",
      snapshot: false,
      items,
      staff: locationStaff.map((member) => ({ ...member, location: context.location })),
    });
    deduplicateWhatsAppPlanningRows(context.serviceDate, context.location);
    console.log(`Imported ${items.length} planning rows and ${locationStaff.length} location staff from ${message.chatTitle}`);
  } catch (error) {
    console.error(`Could not import read-only WhatsApp planning from ${message.chatTitle}`, error.message);
  }
}

function importReadOnlyWhatsAppLocationStaff(message) {
  try {
    const externalMessageId = `${message.externalMessageId}:staff`;
    if (!message.externalMessageId || database.prepare("SELECT 1 FROM planning_imports WHERE external_message_id = ?").get(externalMessageId)) return;
    const context = parseDatedPlanningGroup(message.chatTitle, message.receivedAt);
    if (!context || !isNearPlanningDate(message.receivedAt, context.serviceDate)) return;
    const knownBoats = database.prepare("SELECT name FROM fleet_boats WHERE active = 1").all().map(({ name }) => name);
    const parsed = parseStaffingPlanning(message.text, "", knownBoats);
    const crew = parsed.items.filter((member) => member.eventType === "shift"
      && ['skipper', 'host', 'solo'].includes(member.role)
      && isCredibleCrewName(member.person));
    const staff = parsed.staff.filter((member) => ['runner', 'ops', 'kade'].includes(member.role)
      && isCredibleCrewName(member.person));
    if (!crew.length && !staff.length) return;
    importPlanningMessage({
      externalMessageId,
      chatId: message.chatId,
      chatTitle: message.chatTitle,
      sender: message.sender,
      receivedAt: message.receivedAt,
      serviceDate: context.serviceDate,
      location: context.location,
      sourceText: message.text,
      imageType: "whatsapp-read-only-text",
      snapshot: false,
      items: crew.map((member) => ({ ...member, from: context.location })),
      staff: staff.map((member) => ({ ...member, location: context.location })),
    });
    deduplicateWhatsAppPlanningRows(context.serviceDate, context.location);
    console.log(`Imported ${crew.length} crew and ${staff.length} OPS/Kade rows from ${message.chatTitle}`);
  } catch (error) {
    console.error(`Could not import read-only WhatsApp crew/staff from ${message.chatTitle}`, error.message);
  }
}

function parseDatedPlanningGroup(title, receivedAt) {
  const normalized = String(title || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const dateMatch = normalized.match(/\b(\d{1,2})\s+(\d{1,2})(?:\s+(20\d{2}))?\b/);
  if (!dateMatch) return null;
  const received = new Date(Number(receivedAt) || Date.now());
  let year = Number(dateMatch[3] || new Intl.DateTimeFormat("en", { timeZone: "Europe/Amsterdam", year: "numeric" }).format(received));
  const month = Number(dateMatch[2]);
  const receivedMonth = Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Amsterdam", month: "numeric" }).format(received));
  if (!dateMatch[3] && receivedMonth === 12 && month === 1) year += 1;
  if (!dateMatch[3] && receivedMonth === 1 && month === 12) year -= 1;
  const serviceDate = `${year}-${String(month).padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  const locations = [
    ["GERMAN TOUR", "German Tour"], ["FABEL FRIET", "Fabel Friet"], ["COOKIE", "Cookie"],
    ["RIJKS", "Rijksmuseum"], ["HOMO", "Homomonument"], [" AF ", "Anne Frank"], [" CS ", "Central Station"],
  ];
  const padded = ` ${normalized} `;
  const location = locations.find(([key]) => padded.includes(key))?.[1];
  return location ? { serviceDate, location } : null;
}

function isNearPlanningDate(receivedAt, serviceDate) {
  const messageDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(Number(receivedAt)));
  const previous = new Date(`${serviceDate}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return messageDate === serviceDate || messageDate === previous.toISOString().slice(0, 10);
}

function selectCredibleWhatsAppPlanning(sourceText, items) {
  const source = String(sourceText || "");
  const normalized = source.toUpperCase();
  if (/KLEARLY|PAYMENT DEVICES|MAPS\s*&\s*VHF|VIATOR|REBOOK|BRACELET|COOKIES STATEMENT/.test(normalized)) return [];

  const normalizedItems = items.map((item) => ({
    ...item,
    eventType: item.eventType || item.event_type,
    startTime: item.startTime || item.start_time,
    endTime: item.endTime || item.end_time,
    person: item.person || item.person_name,
    boat: item.boat || item.boat_name,
  }));
  const shifts = normalizedItems.filter((item) => item.eventType === "shift"
    && isCredibleCrewName(item.person)
    && ((!item.startTime && !item.endTime) || (item.startTime && item.endTime && validPlanningDuration(item))));
  const schedule = normalizedItems.filter((item) => item.eventType !== "shift" && validPlanningDuration(item));
  const breaks = schedule.filter((item) => item.eventType === "break").length;
  const preparations = schedule.filter((item) => item.eventType === "preparation").length;
  const movements = schedule.filter((item) => item.eventType === "movement").length;
  const boats = new Set(schedule.map((item) => normalizePlanningBoatName(item.boat)).filter(Boolean));
  const explicitScheduleLabel = /BOTENSCHEMA|BOAT\s*SCHEDULE|SLOOP\s*SCHEDULE|UPDATED?\s+SLOOP/.test(normalized);
  const credibleSchedule = (explicitScheduleLabel && breaks >= 2 && boats.size >= 1)
    || (breaks >= 3 && boats.size >= 1)
    || (preparations >= 1 && movements >= 1 && breaks >= 2);
  const credibleCrew = shifts.length > 0
    && (/\b(?:SL\d*|SP\d*|SOLO|H(?:OST)?|HEX\d*|CCH\d*)\b/i.test(source) || /(?:^|\n)\s*[@＠]/.test(source));
  return [...(credibleSchedule ? schedule : []), ...(credibleCrew ? shifts : [])];
}

function validPlanningDuration(item) {
  if (!item.startTime || !item.endTime || !/^\d{2}:\d{2}$/.test(item.startTime) || !/^\d{2}:\d{2}$/.test(item.endTime)) return false;
  let duration = planningMinutes(item.endTime) - planningMinutes(item.startTime);
  if (duration <= 0) duration += 24 * 60;
  const limits = { preparation: 60, movement: 180, break: 45, tour: 120, private: 180, shift: 18 * 60 };
  return duration >= 5 && duration <= (limits[item.eventType] || 180);
}

function isCredibleCrewName(value) {
  const text = String(value || "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  return text.length >= 4 && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(text) && !/^@?\d+$/.test(text)
    && words.every((word) => word.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "").length >= 2);
}

function cleanupInvalidWhatsAppPlanningImports() {
  const imports = database.prepare("SELECT id, source_text FROM planning_imports WHERE image_type = 'whatsapp-read-only' ORDER BY id").all();
  if (!imports.length) return;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const planningImport of imports) {
      const rows = database.prepare("SELECT * FROM planning_items WHERE import_id = ? ORDER BY id").all(planningImport.id);
      const accepted = selectCredibleWhatsAppPlanning(planningImport.source_text, rows);
      const acceptedIds = new Set(accepted.map((item) => item.id).filter(Boolean));
      for (const row of rows) {
        if (!acceptedIds.has(row.id)) database.prepare("DELETE FROM planning_items WHERE id = ?").run(row.id);
      }
      const staffRows = database.prepare("SELECT id, person_name, role FROM planning_staff WHERE import_id = ?").all(planningImport.id);
      for (const member of staffRows) {
        if (!['runner', 'ops', 'kade'].includes(member.role) || !isCredibleCrewName(member.person_name)) {
          database.prepare("DELETE FROM planning_staff WHERE id = ?").run(member.id);
        }
      }
      const count = database.prepare("SELECT COUNT(*) AS count FROM planning_items WHERE import_id = ?").get(planningImport.id).count;
      if (!count) database.prepare("DELETE FROM planning_imports WHERE id = ?").run(planningImport.id);
      else database.prepare("UPDATE planning_imports SET item_count = ? WHERE id = ?").run(count, planningImport.id);
    }
    const duplicates = database.prepare(`
      SELECT service_date, location, source_image_hash, GROUP_CONCAT(id) AS ids
      FROM planning_imports
      WHERE image_type = 'whatsapp-read-only' AND source_image_hash IS NOT NULL
      GROUP BY service_date, location, source_image_hash HAVING COUNT(*) > 1
    `).all();
    for (const duplicate of duplicates) {
      const [, ...removeIds] = String(duplicate.ids).split(",").map(Number).sort((left, right) => left - right);
      for (const id of removeIds) database.prepare("DELETE FROM planning_imports WHERE id = ?").run(id);
    }
    const scopes = database.prepare("SELECT DISTINCT service_date, location FROM planning_imports WHERE image_type = 'whatsapp-read-only'").all();
    for (const scope of scopes) deduplicateWhatsAppPlanningRows(scope.service_date, scope.location, false);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function deduplicateWhatsAppPlanningRows(serviceDate, location, manageTransaction = true) {
  if (manageTransaction) database.exec("BEGIN IMMEDIATE");
  try {
    const rows = database.prepare(`
      SELECT p.*, i.received_at, i.id AS source_import_id
      FROM planning_items p JOIN planning_imports i ON i.id = p.import_id
      WHERE i.image_type = 'whatsapp-read-only' AND i.service_date = ? AND i.location = ?
      ORDER BY i.received_at DESC, i.id DESC, p.id DESC
    `).all(serviceDate, location);
    const seen = new Set();
    for (const row of rows) {
      const key = row.event_type === "shift"
        ? [row.boat_name, row.event_type, row.role, row.person_name, row.start_time].join("|")
        : [row.boat_name, row.event_type, row.start_time].join("|");
      if (seen.has(key)) database.prepare("DELETE FROM planning_items WHERE id = ?").run(row.id);
      else seen.add(key);
    }
    const consolidatedRows = database.prepare(`
      SELECT p.*, i.received_at, i.id AS source_import_id
      FROM planning_items p JOIN planning_imports i ON i.id = p.import_id
      WHERE i.image_type = 'whatsapp-read-only' AND i.service_date = ? AND i.location = ?
      ORDER BY i.received_at DESC, i.id DESC, p.id DESC
    `).all(serviceDate, location);
    const sourceGroups = new Map();
    for (const row of consolidatedRows.filter((item) => item.event_type !== "shift" && item.start_time && item.end_time)) {
      const key = `${row.source_import_id}|${row.boat_name}`;
      if (!sourceGroups.has(key)) sourceGroups.set(key, { receivedAt: row.received_at, boat: row.boat_name, rows: [] });
      sourceGroups.get(key).rows.push(row);
    }
    const newerCoverage = new Map();
    for (const group of [...sourceGroups.values()].sort((left, right) => right.receivedAt - left.receivedAt)) {
      const intervals = group.rows.map(scheduleInterval).filter(Boolean);
      if (!intervals.length) continue;
      const coverage = { start: Math.min(...intervals.map((item) => item.start)), end: Math.max(...intervals.map((item) => item.end)) };
      const newer = newerCoverage.get(group.boat) || [];
      for (const row of group.rows) {
        const interval = scheduleInterval(row);
        if (interval && newer.some((range) => interval.start < range.end && interval.end > range.start)) {
          database.prepare("DELETE FROM planning_items WHERE id = ?").run(row.id);
        }
      }
      newer.push(coverage);
      newerCoverage.set(group.boat, newer);
    }

    const structuralRows = database.prepare(`
      SELECT p.*, i.received_at, i.id AS source_import_id
      FROM planning_items p JOIN planning_imports i ON i.id = p.import_id
      WHERE i.image_type = 'whatsapp-read-only' AND i.service_date = ? AND i.location = ?
        AND p.event_type <> 'shift' AND p.start_time IS NOT NULL AND p.end_time IS NOT NULL
      ORDER BY p.boat_name, p.start_time, i.received_at DESC, p.id
    `).all(serviceDate, location);
    const bySourceBoat = new Map();
    const byBoat = new Map();
    for (const row of structuralRows) {
      const sourceKey = `${row.source_import_id}|${row.boat_name}`;
      if (!bySourceBoat.has(sourceKey)) bySourceBoat.set(sourceKey, []);
      bySourceBoat.get(sourceKey).push(row);
      if (!byBoat.has(row.boat_name)) byBoat.set(row.boat_name, []);
      byBoat.get(row.boat_name).push(row);
    }
    for (const sourceRows of bySourceBoat.values()) {
      const earliest = Math.min(...sourceRows.map((row) => scheduleInterval(row)?.start ?? Infinity));
      for (const row of sourceRows) {
        if (row.event_type === "preparation" && scheduleInterval(row)?.start !== earliest) {
          database.prepare("DELETE FROM planning_items WHERE id = ?").run(row.id);
        }
      }
    }
    for (const boatRows of byBoat.values()) {
      const active = boatRows.filter((row) => database.prepare("SELECT 1 FROM planning_items WHERE id = ?").get(row.id));
      active.sort((left, right) => scheduleInterval(left).start - scheduleInterval(right).start || right.received_at - left.received_at);
      for (let index = 0; index < active.length - 1; index += 1) {
        const current = active[index], next = active[index + 1];
        const currentInterval = scheduleInterval(current), nextInterval = scheduleInterval(next);
        if (currentInterval.start === nextInterval.start && currentInterval.end === nextInterval.end) {
          const priority = { movement: 4, preparation: 3, break: 2, private: 1, tour: 0 };
          const remove = (priority[current.event_type] || 0) >= (priority[next.event_type] || 0) ? next : current;
          database.prepare("DELETE FROM planning_items WHERE id = ?").run(remove.id);
        }
      }
    }

    // A boat schedule alternates breaks with tours. OCR images are often split into
    // multiple parts, so the implicit tour between two break blocks can be absent.
    // Resolve overlapping/touching break blocks first, then materialise a tour for
    // a credible empty interval. Re-querying avoids decisions based on deleted rows.
    const finalBoats = database.prepare(`
      SELECT DISTINCT p.boat_name
      FROM planning_items p JOIN planning_imports i ON i.id = p.import_id
      WHERE i.image_type = 'whatsapp-read-only' AND i.service_date = ? AND i.location = ?
        AND p.event_type <> 'shift'
    `).all(serviceDate, location);
    for (const { boat_name: boatName } of finalBoats) {
      let changed = true;
      while (changed) {
        changed = false;
        const active = whatsappBoatScheduleRows(serviceDate, location, boatName);
        for (let index = 0; index < active.length - 1; index += 1) {
          const current = active[index], next = active[index + 1];
          if (current.event_type !== "break" || next.event_type !== "break") continue;
          const currentInterval = scheduleInterval(current), nextInterval = scheduleInterval(next);
          if (nextInterval.start <= currentInterval.end) {
            const remove = current.received_at <= next.received_at ? current : next;
            database.prepare("DELETE FROM planning_items WHERE id = ?").run(remove.id);
            changed = true;
            break;
          }
          const gap = nextInterval.start - currentInterval.end;
          if (gap < 60 || gap > 120) continue;
          const tourDuration = gap === 70 ? 70 : 60;
          const source = current.received_at >= next.received_at ? current : next;
          database.prepare(`
            INSERT INTO planning_items
            (import_id, boat_id, boat_name, service_date, start_time, end_time, event_type,
             from_location, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'tour', ?, 'Inferred between OCR break blocks', ?)
          `).run(source.import_id, source.boat_id, boatName, serviceDate,
            planningTimeFromMinutes(currentInterval.end), planningTimeFromMinutes(currentInterval.end + tourDuration),
            location, Date.now());
          changed = true;
          break;
        }
      }
    }
    const imports = database.prepare("SELECT id FROM planning_imports WHERE image_type = 'whatsapp-read-only' AND service_date = ? AND location = ?").all(serviceDate, location);
    for (const planningImport of imports) {
      const count = database.prepare("SELECT COUNT(*) AS count FROM planning_items WHERE import_id = ?").get(planningImport.id).count;
      if (!count) database.prepare("DELETE FROM planning_imports WHERE id = ?").run(planningImport.id);
      else database.prepare("UPDATE planning_imports SET item_count = ? WHERE id = ?").run(count, planningImport.id);
    }
    if (manageTransaction) database.exec("COMMIT");
  } catch (error) {
    if (manageTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

function whatsappBoatScheduleRows(serviceDate, location, boatName) {
  return database.prepare(`
    SELECT p.*, i.received_at
    FROM planning_items p JOIN planning_imports i ON i.id = p.import_id
    WHERE i.image_type = 'whatsapp-read-only' AND i.service_date = ? AND i.location = ?
      AND p.boat_name = ? AND p.event_type <> 'shift'
      AND p.start_time IS NOT NULL AND p.end_time IS NOT NULL
    ORDER BY p.start_time, i.received_at DESC, p.id
  `).all(serviceDate, location, boatName)
    .sort((left, right) => scheduleInterval(left).start - scheduleInterval(right).start || right.received_at - left.received_at);
}

function planningTimeFromMinutes(minutes) {
  const normalized = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function scheduleInterval(row) {
  if (!row.start_time || !row.end_time) return null;
  let start = planningMinutes(row.start_time);
  let end = planningMinutes(row.end_time);
  if (start < 4 * 60) start += 24 * 60;
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function verifyInboundAccountMessage(message) {
  const code = String(message.text || "").trim().toUpperCase();
  if (!/^BT-[A-F0-9]{12}$/.test(code)) return false;
  let phone;
  try {
    phone = normalizePhoneNumber(message.phone);
  } catch {
    return false;
  }
  const result = database.prepare(`
    UPDATE account_verifications
    SET status = 'verified', verified_at = ?, external_message_id = ?
    WHERE phone_e164 = ? AND code_hash = ? AND status = 'pending' AND expires_at > ?
  `).run(Date.now(), cleanOptional(message.externalMessageId), phone, hashSessionToken(code), Date.now());
  if (result.changes > 0) {
    const challenge = database.prepare("SELECT * FROM account_verifications WHERE phone_e164 = ? AND code_hash = ? AND status = 'verified'")
      .get(phone, hashSessionToken(code));
    if (challenge) getOrCreatePhoneVerifiedUser(challenge);
  }
  return result.changes > 0;
}

function getOrCreatePhoneVerifiedUser(challenge) {
  let user = database.prepare("SELECT * FROM users WHERE phone_e164 = ?").get(challenge.phone_e164);
  if (user) return user;
  const now = Date.now();
  const syntheticEmail = `${challenge.phone_e164.replace(/\D/g, "")}.${randomBytes(5).toString("hex")}@phone.boattracker.invalid`;
  const result = database.prepare(`
    INSERT INTO users
      (name, email, password_hash, phone_e164, phone_verified_at, auth_method, role, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'whatsapp_pending', 'viewer', 1, ?, ?)
  `).run(challenge.name, syntheticEmail, hashPassword(randomBytes(32).toString("base64url")), challenge.phone_e164, now, now, now);
  return database.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
}

function importPlanningMessage(body) {
  const externalMessageId = cleanOptional(body.externalMessageId);
  const serviceDate = cleanOptional(body.serviceDate);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const rawStaff = Array.isArray(body.staff) ? body.staff : [];
  const receivedAt = normalizeTimestamp(body.receivedAt);
  if (!externalMessageId) throw planningValidationError("externalMessageId is required");
  if (!isIsoDate(serviceDate)) throw planningValidationError("serviceDate must use YYYY-MM-DD");
  if (!rawItems.length && !rawStaff.length) throw planningValidationError("At least one planning item or staff assignment is required");
  if (rawItems.length > 200) throw planningValidationError("A message can contain at most 200 planning items");
  if (rawStaff.length > 50) throw planningValidationError("A message can contain at most 50 staff assignments");

  const existing = database.prepare("SELECT id, item_count FROM planning_imports WHERE external_message_id = ?").get(externalMessageId);
  if (existing && !body.force) return { duplicate: true, importId: existing.id, itemCount: existing.item_count };
  if (body.snapshot && body.chatId && body.imageType) {
    const newer = database.prepare(`
      SELECT id, external_message_id, received_at FROM planning_imports
      WHERE chat_id = ? AND service_date = ? AND image_type = ?
      ORDER BY received_at DESC LIMIT 1
    `).get(cleanOptional(body.chatId), serviceDate, cleanOptional(body.imageType));
    if (newer && newer.external_message_id !== externalMessageId && Number(newer.received_at) > receivedAt) {
      return { ignored: true, reason: "A newer image snapshot already exists", importId: newer.id };
    }
    if (body.sourceImageHash && ["timeline", "mixed"].includes(body.imageType)) {
      const reused = database.prepare(`
        SELECT id, chat_id, service_date FROM planning_imports
        WHERE source_image_hash = ? AND external_message_id <> ?
          AND (chat_id <> ? OR service_date <> ?)
        LIMIT 1
      `).get(body.sourceImageHash, externalMessageId, cleanOptional(body.chatId), serviceDate);
      if (reused) return { ignored: true, reason: "The same timeline image was already used by another group or date", duplicateOf: reused.id };
    }
    if (body.sourceOcrTsv && ["timeline", "mixed"].includes(body.imageType)) {
      const reusedOcr = database.prepare(`
        SELECT id, chat_id, service_date FROM planning_imports
        WHERE source_ocr_tsv = ? AND external_message_id <> ?
          AND (chat_id <> ? OR service_date <> ?)
        LIMIT 1
      `).get(body.sourceOcrTsv, externalMessageId, cleanOptional(body.chatId), serviceDate);
      if (reusedOcr) return { ignored: true, reason: "The same OCR timeline was already used by another group or date", duplicateOf: reusedOcr.id };
    }
  }

  const boats = database.prepare("SELECT id, name FROM fleet_boats WHERE active = 1").all();
  const boatLookup = new Map(boats.map((boat) => [normalizePlanningBoatName(boat.name), boat]));
  const items = rawItems.map((item, index) => normalizePlanningItem(item, index, serviceDate, boatLookup));
  const staff = rawStaff.map((item, index) => normalizePlanningStaff(item, index, serviceDate));
  const now = Date.now();
  let importId;

  database.exec("BEGIN IMMEDIATE");
  try {
    if (existing && body.force) database.prepare("DELETE FROM planning_imports WHERE id = ?").run(existing.id);
    if (body.replaceExisting && body.chatId && body.imageType) {
      database.prepare(`
        DELETE FROM planning_imports
        WHERE chat_id = ? AND service_date = ? AND image_type = ?
      `).run(cleanOptional(body.chatId), serviceDate, cleanOptional(body.imageType));
    }
    if (body.snapshot && body.chatId && body.imageType) {
      database.prepare(`
        DELETE FROM planning_imports
        WHERE chat_id = ? AND service_date = ? AND image_type = ? AND external_message_id <> ?
      `).run(cleanOptional(body.chatId), serviceDate, cleanOptional(body.imageType), externalMessageId);
    }
    const result = database.prepare(`
      INSERT INTO planning_imports
      (external_message_id, chat_id, chat_title, sender, received_at, service_date, location,
       source_text, source_ocr_tsv, source_image_hash, source_image_path, image_type, status, item_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?)
    `).run(
      externalMessageId,
      cleanOptional(body.chatId),
      cleanOptional(body.chatTitle),
      cleanOptional(body.sender),
      receivedAt,
      serviceDate,
      cleanOptional(body.location),
      cleanOptional(body.sourceText),
      cleanOptional(body.sourceOcrTsv),
      cleanOptional(body.sourceImageHash),
      cleanOptional(body.sourceImagePath),
      cleanOptional(body.imageType),
      items.length + staff.length,
      now,
    );
    importId = Number(result.lastInsertRowid);
    const insertItem = database.prepare(`
      INSERT INTO planning_items
      (import_id, boat_id, boat_name, service_date, start_time, end_time, person_name, role,
       event_type, from_location, to_location, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insertItem.run(importId, item.boatId, item.boatName, serviceDate, item.startTime, item.endTime,
        item.personName, item.role, item.eventType, item.fromLocation, item.toLocation, item.notes, now);
    }
    const insertStaff = database.prepare(`
      INSERT INTO planning_staff
      (import_id, service_date, person_name, role, location, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of staff) {
      insertStaff.run(importId, serviceDate, item.personName, item.role, item.location, item.notes, now);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return {
    duplicate: false,
    importId,
    itemCount: items.length + staff.length,
    boatItemCount: items.length,
    staffCount: staff.length,
    linkedBoats: items.filter((item) => item.boatId).length,
    unlinkedBoats: [...new Set(items.filter((item) => !item.boatId).map((item) => item.boatName))],
  };
}

function addCrossPartTours(existingItems, newItems) {
  const combined = [...existingItems, ...newItems];
  const tours = new Set(combined.filter((item) => item.eventType === "tour")
    .map((item) => `${normalizePlanningBoatName(item.boat)}|${item.startTime}|${item.endTime}`));
  const explicitByBoat = new Map();
  for (const item of combined.filter((candidate) => candidate.eventType !== "tour" && candidate.startTime && candidate.endTime)) {
    const boat = normalizePlanningBoatName(item.boat);
    if (!explicitByBoat.has(boat)) explicitByBoat.set(boat, []);
    explicitByBoat.get(boat).push(item);
  }
  const inferred = [];
  for (const [boat, events] of explicitByBoat) {
    events.sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 0; index < events.length - 1; index += 1) {
      const current = events[index];
      const next = events[index + 1];
      if (current.eventType !== "break" || current.endTime >= next.startTime) continue;
      const key = `${boat}|${current.endTime}|${next.startTime}`;
      if (tours.has(key)) continue;
      const minutes = planningMinutes(next.startTime) - planningMinutes(current.endTime);
      if (minutes < 15) continue;
      inferred.push({ boat, eventType: "tour", startTime: current.endTime, endTime: next.startTime,
        notes: minutes === 70 ? "70 min sailing" : null, from: current.from || null });
      tours.add(key);
    }
  }
  return [...newItems, ...inferred];
}

function planningMinutes(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

function normalizePlanningItem(item, index, serviceDate, boatLookup) {
  if (!item || typeof item !== "object") throw planningValidationError(`items[${index}] must be an object`);
  const suppliedBoatName = cleanOptional(item.boat);
  if (!suppliedBoatName) throw planningValidationError(`items[${index}].boat is required`);
  const normalizedBoatName = normalizePlanningBoatName(suppliedBoatName);
  const boat = boatLookup.get(normalizedBoatName);
  const startTime = normalizePlanningTime(item.startTime, `items[${index}].startTime`);
  const endTime = normalizePlanningTime(item.endTime, `items[${index}].endTime`);
  const eventType = normalizePlanningEventType(item.eventType);
  if (eventType === "shift" && Boolean(startTime) !== Boolean(endTime)) {
    throw planningValidationError(`items[${index}] shifts require both startTime and endTime, or neither for a day assignment`);
  }

  return {
    boatId: boat?.id || null,
    boatName: boat?.name || canonicalPlanningBoatName(suppliedBoatName),
    serviceDate,
    startTime,
    endTime,
    personName: cleanOptional(item.person),
    role: normalizePlanningRole(item.role),
    eventType,
    fromLocation: normalizePlanningLocation(item.from),
    toLocation: normalizePlanningLocation(item.to),
    notes: cleanOptional(item.notes),
  };
}

function normalizePlanningStaff(item, index, serviceDate) {
  if (!item || typeof item !== "object") throw planningValidationError(`staff[${index}] must be an object`);
  const personName = cleanOptional(item.person);
  const role = String(item.role || "").toLowerCase().trim();
  if (!personName) throw planningValidationError(`staff[${index}].person is required`);
  if (!['runner', 'ops', 'kade'].includes(role)) throw planningValidationError(`staff[${index}].role must be runner, ops, or kade`);
  return {
    serviceDate,
    personName,
    role,
    location: normalizePlanningLocation(item.location),
    notes: cleanOptional(item.notes),
  };
}

function normalizePlanningBoatName(value) {
  const name = String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const aliases = {
    AZ: "AMELIE ZAHRA",
    FS: "FLAGSHIP",
    LS: "LUCKY STRIPPER",
    PC: "PIERRE CUYPERS",
    RS: "RUSSIAN STAR",
    "RUSSIAN S": "RUSSIAN STAR",
    "PIERRE CUYPER": "PIERRE CUYPERS",
    "FLAGSHIP SLOEP": "FLAGSHIP",
    "JAN VD HEIJDEN": "JAN VAN DER HEIJDEN",
    "ZONNE BOOT": "ZONNEBOOT",
    CREUSEN: "CREUSEN 1",
  };
  return aliases[name] || name;
}

function canonicalPlanningBoatName(value) {
  return normalizePlanningBoatName(value).replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\B\w/g, (letter) => letter.toLowerCase());
}

function normalizePlanningLocation(value) {
  const location = cleanOptional(value);
  if (!location) return null;
  const key = location.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return {
    AF: "Anne Frank",
    "ANNE FRANK": "Anne Frank",
    CS: "Central Station",
    "CENTRAL STATION": "Central Station",
    RIJKS: "Rijksmuseum",
    RIJKSMUSEUM: "Rijksmuseum",
    "SEA PALACE": "Sea Palace",
    SEAPALACE: "Sea Palace",
    ROSEWOOD: "Rosewood",
    "E H": "E-Harbour",
    "E HARBOR": "E-Harbour",
    "E HARBOUR": "E-Harbour",
  }[key] || location.trim();
}

function normalizePlanningRole(value) {
  const role = String(value || "").toUpperCase().trim();
  return { DRIVER: "skipper", SL: "skipper", SKIPPER: "skipper", H: "host", HOST: "host", GUIDE: "host", SOLO: "solo" }[role]
    || (role ? role.toLowerCase() : null);
}

function normalizePlanningEventType(value) {
  const type = String(value || "shift").toLowerCase().trim();
  return ["preparation", "shift", "break", "movement", "tour", "private", "other"].includes(type) ? type : "other";
}

function normalizePlanningTime(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (!match) throw planningValidationError(`${field} must use HH:mm`);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeTimestamp(value) {
  if (!value) return Date.now();
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

function localIsoDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

function planningValidationError(message) {
  const error = new Error(message);
  error.name = "PlanningValidationError";
  return error;
}

function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      req.resume();
      reject(requestValidationError("Request body is too large", 413));
      return;
    }
    let body = "";
    let size = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        body = "";
        reject(requestValidationError("Request body is too large", 413));
        return;
      }
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (failed) return;
      if (body && !String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
        reject(requestValidationError("Content-Type must be application/json", 415));
        return;
      }
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(requestValidationError("Invalid JSON", 400));
      }
    });
    req.on("error", (error) => { if (!failed) reject(error); });
  });
}

function requestValidationError(message, statusCode) {
  const error = new Error(message);
  error.name = "RequestValidationError";
  error.statusCode = statusCode;
  return error;
}

function parseWhatsAppMessage(text) {
  const timeRange = text.match(/\b([01]?\d|2[0-3])[:.](\d{2})\s*[-–]\s*([01]?\d|2[0-3])[:.](\d{2})\b/);
  const date = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/) || text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  return {
    startTime: timeRange ? `${timeRange[1].padStart(2, "0")}:${timeRange[2]}` : null,
    endTime: timeRange ? `${timeRange[3].padStart(2, "0")}:${timeRange[4]}` : null,
    serviceDate: date ? normalizeParsedDate(date) : null,
  };
}

function normalizeParsedDate(match) {
  if (match[1].length === 4) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizeMmsi(value) {
  const mmsi = String(value || "").trim();
  return /^\d{9}$/.test(mmsi) ? mmsi : null;
}

function cleanOptional(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function getFleetBoat(id) {
  return database.prepare(`
    SELECT id, name, mmsi, registration, capacity, notes, active, license_required,
      open_boat, length_m, width_m, boat_type, propulsion, home_dock, photo_mime,
      has_toilet, niceness_rating,
      created_at, updated_at
    FROM fleet_boats WHERE id = ?
  `).get(id);
}

function formatFleetBoat(boat) {
  let ais = null;
  try {
    ais = boat.ais_data ? JSON.parse(boat.ais_data) : null;
  } catch {
    ais = null;
  }

  const lastSeenAt = ais?.receivedAt ? parseAisTime(ais.receivedAt) : null;
  const age = lastSeenAt ? Date.now() - lastSeenAt : Infinity;
  const aisStatus = age <= 15 * 60 * 1000 ? "working" : age <= 24 * 60 * 60 * 1000 ? "stale" : "offline";

  return {
    ...boat,
    active: Boolean(boat.active),
    open_boat: boat.open_boat === null ? null : Boolean(boat.open_boat),
    has_toilet: boat.has_toilet === null ? null : Boolean(boat.has_toilet),
    photoUrl: boat.photo_mime ? `/api/fleet/boats/${boat.id}/photo?v=${boat.updated_at}` : null,
    ais,
    aisStatus,
    aisLastSeenAt: lastSeenAt,
    ais_data: undefined,
  };
}

function normalizePositiveDecimal(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeBoolean(value) {
  if (value === true || value === "true" || value === 1) return 1;
  if (value === false || value === "false" || value === 0) return 0;
  return null;
}

function normalizeNicenessRating(value) {
  const rating = String(value || "").toUpperCase();
  return ["S", "A", "B", "C", "D", "E", "F"].includes(rating) ? rating : null;
}

function ensureFleetBoatColumns() {
  const existing = new Set(database.prepare("PRAGMA table_info(fleet_boats)").all().map((column) => column.name));
  const columns = {
    license_required: "TEXT",
    open_boat: "INTEGER",
    length_m: "REAL",
    width_m: "REAL",
    boat_type: "TEXT",
    propulsion: "TEXT",
    home_dock: "TEXT",
    has_toilet: "INTEGER",
    niceness_rating: "TEXT",
    photo: "BLOB",
    photo_mime: "TEXT",
  };
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) database.exec(`ALTER TABLE fleet_boats ADD COLUMN ${name} ${type}`);
  }
}

function ensureWhatsAppChatColumns() {
  const existing = new Set(database.prepare("PRAGMA table_info(whatsapp_chats)").all().map((column) => column.name));
  const columns = {
    linked_parent: "TEXT",
    is_community: "INTEGER NOT NULL DEFAULT 0",
    is_announcement: "INTEGER NOT NULL DEFAULT 0",
  };
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) database.exec(`ALTER TABLE whatsapp_chats ADD COLUMN ${name} ${type}`);
  }
}

function ensurePlanningImportColumns() {
  const existing = new Set(database.prepare("PRAGMA table_info(planning_imports)").all().map((column) => column.name));
  const columns = {
    chat_title: "TEXT",
    location: "TEXT",
    source_ocr_tsv: "TEXT",
    source_image_hash: "TEXT",
    source_image_path: "TEXT",
    image_type: "TEXT",
  };
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) database.exec(`ALTER TABLE planning_imports ADD COLUMN ${name} ${type}`);
  }
}

function ensureUserColumns() {
  const existing = new Set(database.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
  const columns = {
    phone_e164: "TEXT",
    phone_verified_at: "INTEGER",
    auth_method: "TEXT NOT NULL DEFAULT 'password'",
  };
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) database.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_unique ON users (phone_e164) WHERE phone_e164 IS NOT NULL");
}

function normalizeAisMessage(message) {
  const meta = message?.MetaData || {};
  const data = message?.Message?.[message.MessageType] || {};
  const mmsi = String(meta.MMSI || data.UserID || "");
  if (!mmsi) return null;

  if (message.MessageType === "ShipStaticData") {
    return {
      type: "vessel-static",
      mmsi,
      name: cleanAisText(data.Name || meta.ShipName),
      callSign: cleanAisText(data.CallSign),
      imo: normalizePositiveNumber(data.ImoNumber),
      shipType: data.Type ?? null,
      destination: cleanAisText(data.Destination),
      length: getVesselLength(data.Dimension),
      width: getVesselWidth(data.Dimension),
      draught: normalizePositiveNumber(data.MaximumStaticDraught),
    };
  }

  if (message.MessageType === "StaticDataReport") {
    return {
      type: "vessel-static",
      mmsi,
      name: cleanAisText(data.ReportA?.Name || meta.ShipName),
      callSign: cleanAisText(data.ReportB?.CallSign),
      shipType: data.ReportB?.ShipType ?? null,
      length: getVesselLength(data.ReportB?.Dimension),
      width: getVesselWidth(data.ReportB?.Dimension),
    };
  }

  const positionMessageTypes = new Set([
    "PositionReport",
    "StandardClassBPositionReport",
    "ExtendedClassBPositionReport",
  ]);
  if (!positionMessageTypes.has(message.MessageType)) return null;

  const latitude = Number(meta.Latitude ?? data.Latitude);
  const longitude = Number(meta.Longitude ?? data.Longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const position = {
    type: "vessel-position",
    mmsi,
    name: cleanAisText(data.Name || meta.ShipName),
    latitude,
    longitude,
    course: normalizeHeading(data.Cog),
    heading: normalizeHeading(data.TrueHeading),
    speed: Number.isFinite(Number(data.Sog)) ? Number(data.Sog) : null,
    navigationStatus: data.NavigationalStatus ?? null,
    receivedAt: meta.time_utc || new Date().toISOString(),
    aisClass: message.MessageType === "PositionReport" ? "A" : "B",
  };
  const shipType = data.Type ?? null;
  const length = getVesselLength(data.Dimension);
  const width = getVesselWidth(data.Dimension);
  if (shipType !== null) position.shipType = shipType;
  if (length !== null) position.length = length;
  if (width !== null) position.width = width;
  return position;
}

function cleanAisText(value) {
  return String(value || "").replace(/@+$/g, "").trim();
}

function normalizeHeading(value) {
  const heading = Number(value);
  return Number.isFinite(heading) && heading >= 0 && heading < 360 ? heading : null;
}

function getVesselLength(dimension) {
  if (!dimension) return null;
  const length = Number(dimension.A) + Number(dimension.B);
  return Number.isFinite(length) && length > 0 ? length : null;
}

function getVesselWidth(dimension) {
  if (!dimension) return null;
  const width = Number(dimension.C) + Number(dimension.D);
  return Number.isFinite(width) && width > 0 ? width : null;
}

function normalizePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function broadcast(message) {
  for (const client of clients) send(client, message);
}

function send(client, message) {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
}

function loadLocalEnv() {
  if (!existsSync(".env")) return;

  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function serveProductionFile(req, res) {
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".geojson": "application/geo+json",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
  };
  const requestPath = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  const relativePath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
  let filePath = join(process.cwd(), "dist", relativePath || "index.html");

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(process.cwd(), "dist", "index.html");
  }

  res.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
  createReadStream(filePath).pipe(res);
}
