import { closureSnapshot } from './shared/closure-snapshot.mjs';
import { ACCOUNT_ROLES, canReadFlagshipPlanning, canUseOperations } from './shared/account-access.mjs';
import { migrateAccountRoles } from './server/account-role-migration.mjs';
import { parseAgentRoute } from './server/agent-routing.mjs';
import { sharedRouteDocument, renderSharedRoutePage, unavailableSharedRoutePage } from './server/shared-route-page.mjs';
import { reportingPointsAlongRoute } from './shared/reporting-route.mjs';
import { statisticsRange } from './server/fleet-statistics.mjs';
import { hasVerifiedBoatPhoto } from './server/boat-photo-verification.mjs';
import { buildOperatorDirectories, operatorById, inferVesselOperator } from './shared/vessel-operators.mjs';
import { createOperatorStore, publicOperatorGroups } from './server/vessel-operators.mjs';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { backup, DatabaseSync } from "node:sqlite";
import { WebSocket, WebSocketServer } from "ws";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";
import { sendAsset, sendJsonResponse } from "./server/http-transfer.mjs";
import { DATA_SAVER_INTERVAL_MS, queueLatestAis, takeAisBatch } from "./server/ais-delivery.mjs";
import { createWhatsAppConnector } from "./server/whatsapp.mjs";
import { analyzePlanningImage, getOcrQueueStats } from "./server/planning-ocr-client.mjs";
import { createDatabaseReadClient } from "./server/database-read-client.mjs";
import { matchCrewFingerprint, parseStaffingPlanning } from "./server/planning-staff.mjs";
import { consolidateDayPlanning } from "./server/planning-consolidation.mjs";
import { deriveTourPerformance } from "./server/tour-performance.mjs";
import { findPlanningLocationPin } from "./shared/planning-locations.mjs";
import { reportingPointsGeoJson } from "./server/reporting-points.mjs";
import { POSITION_MESSAGE_TYPES, feedState, mergeAisState, shouldAcceptPosition, sourceLatencyMs, validAisCoordinates } from "./server/ais-live.mjs";

import { validateReportingRules } from "./shared/reporting-movements.mjs";
import { loadCurrentClosures } from "./server/navigation-closures.mjs";
import { isPublicMapRead } from "./server/public-map-access.mjs";
import { fetchSurinamekadeWaterLevel } from "./server/water-level.mjs";
import { loadBridgeCatalog } from "./server/bridge-catalog.mjs";
import { amsterdamDayBounds, amsterdamRaceDate, calculateFleetDistances } from "./server/fleet-leaderboard.mjs";

import { isPublicInformationPage, PUBLIC_PAGES, pageHead, publicFleetEntries, renderPublicPage, robotsTxt, sitemapXml } from "./server/public-pages.mjs";
import { createUsageAnalytics } from "./server/usage-analytics.mjs";
import { createRouteLinkStore } from "./server/route-links.mjs";

loadLocalEnv();

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST?.trim() || "0.0.0.0";
const authSetupToken = process.env.AUTH_SETUP_TOKEN?.trim();
const apiKey = process.env.AISSTREAM_API_KEY?.trim();
const historyDays = Math.min(30, Math.max(1, Number(process.env.AIS_HISTORY_DAYS || 30)));
const aisHistorySampleMs = Math.max(1_000, Number(process.env.AIS_HISTORY_SAMPLE_MS || 5_000));
const aisWatchdogMs = Math.max(30_000, Number(process.env.AIS_WATCHDOG_MS || 120_000));
const aisMovingStaleMs = Math.max(10_000, Number(process.env.AIS_MOVING_STALE_MS || 15 * 60_000));
const aisStationaryStaleMs = Math.max(30_000, Number(process.env.AIS_STATIONARY_STALE_MS || 15 * 60_000));
const aisRemoveAfterMs = Math.max(24 * 60 * 60 * 1000, Number(process.env.AIS_REMOVE_AFTER_MS || historyDays * 24 * 60 * 60 * 1000));
const aisNamedRemoveAfterMs = Math.max(15 * 60_000, Number(process.env.AIS_NAMED_REMOVE_AFTER_MS || 3 * 60 * 60_000));
const aisUnnamedRemoveAfterMs = Math.max(5 * 60_000, Number(process.env.AIS_UNNAMED_REMOVE_AFTER_MS || 60 * 60_000));
const aisBatchIntervalMs = Math.min(2_000, Math.max(100, Number(process.env.AIS_BATCH_INTERVAL_MS || 750)));
const websocketGuestPerIpLimit = Math.max(1, Number(process.env.WEBSOCKET_GUEST_PER_IP_LIMIT || 10));
const websocketGlobalLimit = Math.max(25, Number(process.env.WEBSOCKET_GLOBAL_LIMIT || 500));
const websocketMaxBufferedBytes = Math.max(64_000, Number(process.env.WEBSOCKET_MAX_BUFFERED_BYTES || 1_000_000));
const clients = new Set();
const latestVessels = new Map();
const lastStoredPositionAt = new Map();
const pendingPlanningAnalyses = new Map();
let bridgeDataCache = null;
const navigationLayerCache = new Map();
let pendingClosureLoad;
let waterLevelCache = null;
let pendingWaterLevelLoad;
const geocodeCache = new Map();
let whatsappRescanStarted = false;
const whatsappChatRescanAt = new Map();
let upstream = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let upstreamConnectedAt = 0;
let lastUpstreamMessageAt = 0;
let lastUpstreamPongAt = 0;
let lastPositionMessageAt = 0;
let upstreamReconnectCount = 0;
let upstreamOpenCount = 0;
const recentAisLatencies = [];
const DAY_MS = 24 * 60 * 60 * 1000;
const temporaryDataRetention = {
  verificationMs: 24 * 60 * 60 * 1000,
  planningContextMs: Math.max(1, Number(process.env.PLANNING_CONTEXT_RETENTION_DAYS || 14)) * DAY_MS,
  whatsappInboxMs: Math.max(1, Number(process.env.WHATSAPP_INBOX_RETENTION_DAYS || 30)) * DAY_MS,
  boatDutyMs: Math.max(30, Number(process.env.BOAT_DUTY_RETENTION_DAYS || 400)) * DAY_MS,
  planningSourceMs: Math.max(30, Number(process.env.PLANNING_SOURCE_RETENTION_DAYS || 90)) * DAY_MS,
};
const backupDirectory = process.env.DATABASE_BACKUP_DIRECTORY || join(process.cwd(), "data", "backups");
const backupRetentionDays = Math.max(2, Number(process.env.DATABASE_BACKUP_RETENTION_DAYS || 14));
let databaseBackupRunning = false;

const databasePath = process.env.DATABASE_PATH || join(process.cwd(), "data", "ais.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
const routeLinkStore = createRouteLinkStore(database);
const operatorStore = createOperatorStore(database);
const databaseReads = createDatabaseReadClient(databasePath);
const fleetSummaryCache = new Map();
const fleetStatisticsCache = new Map();
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();
const serviceMetrics = {
  startedAt: Date.now(), requests: 0, errors: 0, totalResponseMs: 0,
  websocketAccepted: 0, websocketRejected: 0, websocketDroppedMessages: 0,
  aisBatches: 0, aisMessagesBatched: 0,
};
const pendingAisBroadcasts = new Map();
const aisBatchTimer = setInterval(flushAisBroadcasts, aisBatchIntervalMs);
aisBatchTimer.unref();
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA wal_autocheckpoint = 1000;
  PRAGMA journal_size_limit = 67108864;
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
  CREATE TABLE IF NOT EXISTS map_object_overrides (
    layer TEXT NOT NULL,
    object_key TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('upsert', 'delete')),
    feature_json TEXT,
    updated_by INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (layer, object_key)
  );
  CREATE TABLE IF NOT EXISTS shared_routes (
    token TEXT PRIMARY KEY,
    route_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS shared_routes_expiry ON shared_routes (expires_at);
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
    source_context_text TEXT,
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
    start_time TEXT,
    end_time TEXT,
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
  CREATE TABLE IF NOT EXISTS planning_message_contexts (
    external_message_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS planning_message_contexts_chat_time ON planning_message_contexts (chat_id, received_at);
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    phone_e164 TEXT UNIQUE,
    phone_verified_at INTEGER,
    auth_method TEXT NOT NULL DEFAULT 'password',
    role TEXT NOT NULL CHECK (role IN ('admin', 'harbour', 'viewer', 'flagship_employee')),
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
  CREATE TABLE IF NOT EXISTS boat_day_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    boat_id INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(user_id, service_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (boat_id) REFERENCES fleet_boats(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS boat_day_assignments_date ON boat_day_assignments(service_date);
  CREATE TABLE IF NOT EXISTS boat_day_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL UNIQUE,
    items_json TEXT NOT NULL DEFAULT '[]',
    submitted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (assignment_id) REFERENCES boat_day_assignments(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS inventory_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    location_type TEXT NOT NULL CHECK (location_type IN ('harbour', 'warehouse')),
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, sku TEXT UNIQUE COLLATE NOCASE,
    unit TEXT NOT NULL DEFAULT 'piece', is_bundle INTEGER NOT NULL DEFAULT 0,
    show_on_boat_menu INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory_bundle_items (
    bundle_product_id INTEGER NOT NULL, component_product_id INTEGER NOT NULL, quantity REAL NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (bundle_product_id, component_product_id),
    FOREIGN KEY (bundle_product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    FOREIGN KEY (component_product_id) REFERENCES inventory_products(id)
  );
  CREATE TABLE IF NOT EXISTS inventory_stock (
    location_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL, PRIMARY KEY (location_id, product_id),
    FOREIGN KEY (location_id) REFERENCES inventory_locations(id), FOREIGN KEY (product_id) REFERENCES inventory_products(id)
  );
  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    quantity_delta REAL NOT NULL, movement_type TEXT NOT NULL, assignment_id INTEGER, note TEXT,
    created_by INTEGER NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY (location_id) REFERENCES inventory_locations(id), FOREIGN KEY (product_id) REFERENCES inventory_products(id),
    FOREIGN KEY (assignment_id) REFERENCES boat_day_assignments(id), FOREIGN KEY (created_by) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS inventory_movements_time ON inventory_movements(created_at DESC);
  CREATE TABLE IF NOT EXISTS boat_inventory (
    boat_id INTEGER NOT NULL, service_date TEXT NOT NULL, product_id INTEGER NOT NULL,
    onboard_quantity REAL NOT NULL DEFAULT 0, requested_quantity REAL NOT NULL DEFAULT 0,
    updated_by INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (boat_id, service_date, product_id),
    FOREIGN KEY (boat_id) REFERENCES fleet_boats(id), FOREIGN KEY (product_id) REFERENCES inventory_products(id), FOREIGN KEY (updated_by) REFERENCES users(id)
  );
`);
const usageAnalytics = createUsageAnalytics(database);
ensureUserColumns();
migrateAccountRoles(database);
ensureFleetBoatColumns();
ensureBoatDayAssignmentColumns();
ensureBoatDayListColumns();
ensureWhatsAppChatColumns();
ensurePlanningImportColumns();
ensurePlanningStaffColumns();
ensureUserColumns();
ensureInventoryProductColumns();
migrateLegacyBoatListsToInventory();
cleanupInvalidWhatsAppPlanningImports();
ensureIncrementalAutoVacuum();
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
  enabled: process.env.WHATSAPP_ENABLED !== "false",
  isChatEnabled: isWhatsAppChatEnabled,
  onChats: upsertWhatsAppChats,
  onGroupMessage: recordWhatsAppGroupAnchor,
  onPlanningMessage: importReadOnlyWhatsAppPlanningMessage,
  onLocationStaffMessage: importReadOnlyWhatsAppLocationStaff,
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

let agentRouteRequests = 0;
const server = createServer(async (req, res) => {
  const requestStartedAt = performance.now();
  serviceMetrics.requests += 1;
  res.once("finish", () => {
    serviceMetrics.totalResponseMs += performance.now() - requestStartedAt;
    if (res.statusCode >= 500) serviceMetrics.errors += 1;
  });
  applySecurityHeaders(req, res);
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const apiPath = decodeURIComponent(requestUrl.pathname).replace(/\/+$/, "") || "/";
  if (requestUrl.pathname === '/' && requestUrl.searchParams.has('route') && ['GET', 'HEAD'].includes(req.method)) {
    const token = requestUrl.searchParams.get('route');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const stored = requestUrl.searchParams.getAll('route').length === 1 && /^[A-Za-z0-9_-]{20,40}$/.test(token || '')
      ? database.prepare('SELECT route_json, created_at, expires_at FROM shared_routes WHERE token = ? AND expires_at > ?').get(token, Date.now()) : null;
    if (!stored) { res.statusCode = 404; return res.end(req.method === 'HEAD' ? undefined : unavailableSharedRoutePage()); }
    try {
      const document = readableSharedRoute(stored);
      let html = readFileSync(join(process.cwd(), isProduction ? 'dist/index.html' : 'index.html'), 'utf8');
      html = renderSharedRoutePage(html, document, token);
      if (vite) html = await vite.transformIndexHtml(req.url, html);
      res.setHeader('Link', `</api/shared-routes/${token}>; rel="alternate"; type="application/json"`);
      return res.end(req.method === 'HEAD' ? undefined : html);
    } catch (error) {
      console.warn('Shared route page failed:', error.message);
      res.statusCode = 503; res.setHeader('Retry-After', '60');
      return res.end(req.method === 'HEAD' ? undefined : '<!doctype html><html lang="nl"><h1>Gedeelde route tijdelijk niet beschikbaar</h1><p>Probeer het later opnieuw.</p></html>');
    }
  }
  if (['/llms.txt', '/openapi.json'].includes(requestUrl.pathname)) {
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return sendJson(res, 405, { error: 'method_not_allowed' }); }
    const asset = requestUrl.pathname.slice(1);
    res.setHeader('Content-Type', asset.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const bundled = new URL(`./dist/${asset}`, import.meta.url);
    return res.end(req.method === 'HEAD' ? undefined : readFileSync(isProduction && existsSync(bundled) ? bundled : new URL(`./public/${asset}`, import.meta.url)));
  }
  if (requestUrl.pathname === '/api/routeplanner/route') {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return sendJson(res, 405, { error: 'method_not_allowed' }); }
    let input;
    try {
      if (requestUrl.search.length > 4096) throw new Error('Query exceeds 4096 characters');
      input = parseAgentRoute(requestUrl.searchParams);
    } catch (error) { return sendJson(res, 400, { error: 'invalid_request', message: error.message, documentation: '/routeplanner-api' }); }
    if (agentRouteRequests >= 4) { res.setHeader('Retry-After', '5'); return sendJson(res, 429, { error: 'busy', message: 'Retry after 5 seconds' }); }
    agentRouteRequests += 1;
    try {
      const bridges = applyMapObjectOverrides('bridges', await loadAmsterdamBridgeCollection());
      let closures = navigationLayerCache.get('closures');
      if (!closures) {
        try {
          const data = JSON.parse(readFileSync(join(process.cwd(), 'data', 'navigation-closures-v1.json'), 'utf8'));
          const fetchedAt = Date.parse(data.fetchedAt);
          if (!data.stale && data.type === 'FeatureCollection' && Array.isArray(data.features) && fetchedAt <= Date.now() && Date.now() - fetchedAt < 60_000) closures = { data, expiresAt: fetchedAt + 60_000 };
        } catch {}
      }
      if (!closures || closures.expiresAt <= Date.now()) {
        pendingClosureLoad ||= loadCurrentClosures({ previous: navigationLayerCache.get('closures')?.data }).finally(() => { pendingClosureLoad = null; });
        closures = { data: await pendingClosureLoad, expiresAt: Date.now() + 60_000 };
        navigationLayerCache.set('closures', closures);
      }
      const edits = database.prepare("SELECT object_key AS objectKey, action, feature_json FROM map_object_overrides WHERE layer = 'routing-lines'").all().map(row => ({ ...row, feature: row.feature_json ? JSON.parse(row.feature_json) : null }));
      const result = await databaseReads.run('agent-route', { input, bridges, links: routeLinkStore.read(), edits, closures: applyMapObjectOverrides('closures', closures.data) });
      res.setHeader('Link', '</openapi.json>; rel="service-desc", </routeplanner-api>; rel="service-doc"');
      return sendJson(res, 200, result, 'no-store');
    } catch (error) {
      console.warn('Public route calculation unavailable:', error.message);
      res.setHeader('Retry-After', '60');
      return sendJson(res, 503, { error: 'routing_unavailable', message: 'Route or current restriction data unavailable; retry later.' });
    } finally { agentRouteRequests -= 1; }
  }
  if (req.method === "GET" && apiPath === "/healthz") {
    sendJson(res, 200, { status: "ok" });
    return;
  }
  if (["GET", "HEAD"].includes(req.method)) {
    const cleanPath = requestUrl.pathname.replace(/\/+$/, "") || "/";
    if (PUBLIC_PAGES[cleanPath] && cleanPath !== requestUrl.pathname) {
      res.writeHead(301, { Location: cleanPath + requestUrl.search });
      return res.end();
    }
    if (cleanPath === "/robots.txt" || cleanPath === "/sitemap.xml") {
      res.setHeader("Content-Type", cleanPath.endsWith(".xml") ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.end(req.method === "HEAD" ? undefined : cleanPath.endsWith(".xml") ? sitemapXml() : robotsTxt());
    }
    if (isPublicInformationPage(cleanPath)) {
      let scriptUrl = "/src/publicPages.js";
      if (isProduction) {
        const manifest = JSON.parse(readFileSync(join(process.cwd(), "dist", ".vite", "manifest.json"), "utf8"));
        scriptUrl = `/${manifest["src/publicPages.js"].file}`;
      }
      let bridgeCollection;
      if (cleanPath.startsWith("/bruggen-amsterdam/")) {
        try { bridgeCollection = applyMapObjectOverrides("bridges", await loadAmsterdamBridgeCollection()); }
        catch (error) {
          console.warn(`Public bridge page unavailable: ${error.message}`);
          res.statusCode = 503;
          res.setHeader("Retry-After", "300");
          res.setHeader("X-Robots-Tag", "noindex");
        }
      }
      const operatorGroups = cleanPath.startsWith("/rederijen-amsterdam") || cleanPath === "/flagship-vloot" ? publicOperatorGroups(database, operatorStore.read()) : [];
      const flagshipMmsis = new Set(operatorGroups.find((group) => group.id === "flagship")?.mmsis || []);
      if (cleanPath === '/kennisbank' && (requestUrl.searchParams.has('q') || requestUrl.searchParams.has('categorie'))) res.setHeader('X-Robots-Tag', 'noindex, follow');
      const html = renderPublicPage(cleanPath, { searchParams: requestUrl.searchParams, scriptUrl, bridgeCollection, operatorGroups, boats: cleanPath === "/flagship-vloot" ? publicFleetEntries(database).filter((boat) => flagshipMmsis.has(String(boat.mmsi))) : [] });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", res.statusCode === 503 ? "no-store" : "public, max-age=30");
      return res.end(req.method === "HEAD" ? undefined : html);
    }
  }
  if (isMutationMethod(req.method) && !isTrustedOrigin(req)) {
    sendJson(res, 403, { error: "Untrusted request origin" });
    return;
  }
  if (apiPath === "/api/analytics/usage" && req.method === "POST") {
    try {
      const body = await readJsonBody(req, 2048);
      if (!body || typeof body !== "object" || Array.isArray(body)) return sendJson(res, 400, { error: "Invalid usage event" });
      let token = parseCookies(req.headers.cookie || "").boat_usage;
      if (!/^[a-f0-9]{48}$/.test(token || "")) {
        token = randomBytes(24).toString("hex");
        const secure = process.env.AUTH_SECURE_COOKIE === "true" || req.headers["x-forwarded-proto"] === "https";
        res.setHeader("Set-Cookie", `boat_usage=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7776000${secure ? "; Secure" : ""}`);
      }
      usageAnalytics.record({
        visitorId: createHash("sha256").update(token).digest("hex"),
        userId: getAuthenticatedUser(req)?.id ?? null,
        page: body.page, type: body.type, activeSeconds: body.activeSeconds,
      });
      return sendJson(res, 200, { recorded: true });
    } catch (error) {
      const status = error.statusCode || (error instanceof TypeError ? 400 : 500);
      return sendJson(res, status, { error: status === 500 ? "Usage recording unavailable" : "Invalid usage event" });
    }
  }
  if (apiPath === "/api/geocode" || apiPath.startsWith("/api/geocode/") || apiPath.includes("/geocode/")) {
    await handleGeocodeApi(requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/auth/")) {
    await handleAuthApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname === "/api/shared-routes" || requestUrl.pathname.startsWith("/api/shared-routes/")) {
    await handleSharedRoutesApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/")) {
    const user = getAuthenticatedUser(req);
    const publicMapRead = isPublicMapRead(req.method, requestUrl.pathname);
    if (!user && !publicMapRead) {
      sendJson(res, 401, { error: "Authentication required" });
      return;
    }
    req.authUser = user;
  }
  if (requestUrl.pathname === "/api/admin/usage") {
    if (!requireAdmin(req, res)) return;
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    const days = Number(requestUrl.searchParams.get("days") || 7);
    if (![1, 7, 30, 90].includes(days)) return sendJson(res, 400, { error: "Invalid usage period" });
    return sendJson(res, 200, usageAnalytics.summary(days));
  }
  if (requestUrl.pathname === "/api/admin/metrics") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, applicationMetrics());
    return;
  }
  if (requestUrl.pathname === "/api/water-level/surinamekade") {
    await handleSurinamekadeWaterLevel(res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/ais/")) {
    await handleAisApi(requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/boat-duty")) {
    if (!canUseOperations(req.authUser)) return sendJson(res, 403, { error: "Staff access required" });
    await handleBoatDutyApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/inventory")) {
    if (!canUseOperations(req.authUser)) return sendJson(res, 403, { error: "Staff access required" });
    await handleInventoryApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/fleet/")) {
    if (req.method !== "GET" && !requireAdmin(req, res)) return;
    if (requestUrl.pathname.includes("/whatsapp") && !requireAdmin(req, res)) return;
    await handleFleetApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/planning/")) {
    if (!canReadFlagshipPlanning(req.authUser)) return sendJson(res, 403, { error: "Flagship employee access required" });
    await handlePlanningApi(req, requestUrl, res);
    return;
  }
  if (requestUrl.pathname === "/api/map/operator-groups") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
    return sendJson(res, 200, { assignments: operatorStore.read(), groups: publicOperatorGroups(database, operatorStore.read()) }, "public, max-age=15");
  }
  const operatorMembership = requestUrl.pathname.match(/^\/api\/map\/operator-membership\/(\d{9})$/);
  if (operatorMembership) {
    if (!requireAdmin(req, res)) return;
    if (req.method !== "PUT" && req.method !== "DELETE") return sendJson(res, 405, { error: "Method not allowed" });
    try {
      if (req.method === "DELETE") operatorStore.reset(operatorMembership[1]);
      else { const body = await readJsonBody(req); operatorStore.write(operatorMembership[1], body.operatorId, req.authUser.id); }
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
    return sendJson(res, 200, { saved: true, assignments: operatorStore.read() });
  }
  if (requestUrl.pathname === "/api/map/route-links") {
    if (req.method === "GET") return sendJson(res, 200, routeLinkStore.read());
    if (req.method !== "PUT") return sendJson(res, 405, { error: "Method not allowed" });
    if (!requireAdmin(req, res)) return;
    const body = await readJsonBody(req);
    try { routeLinkStore.write(body.bucket, body.id, body.value); }
    catch { return sendJson(res, 400, { error: "Invalid route link" }); }
    return sendJson(res, 200, { saved: true });
  }
  if (requestUrl.pathname === "/api/map/bridges") {
    await handleBridgeDataApi(res);
    return;
  }
  if (requestUrl.pathname === "/api/map/navigation-layer") {
    await handleNavigationLayerApi(requestUrl, res);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/map/objects")) {
    if (req.method !== "GET" && !requireAdmin(req, res)) return;
    await handleMapObjectsApi(req, requestUrl, res);
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

function readableSharedRoute(stored) {
  const route = JSON.parse(stored.route_json);
  const features = applyMapObjectOverrides('reporting-points', reportingPointsGeoJson()).features;
  return sharedRouteDocument(stored, reportingPointsAlongRoute(features, route.result, routeLinkStore.read()));
}

async function handleSharedRoutesApi(req, requestUrl, res) {
  const routeToken = requestUrl.pathname.match(/^\/api\/shared-routes\/([A-Za-z0-9_-]{20,40})$/)?.[1];
  const now = Date.now();
  database.prepare("DELETE FROM shared_routes WHERE expires_at <= ?").run(now);
  try {
    if (req.method === "POST" && requestUrl.pathname === "/api/shared-routes") {
      const body = await readJsonBody(req, 500_000);
      const route = normalizeSharedRoute(body.route);
      if (!route) return sendJson(res, 400, { error: "Plan a valid route before sharing" });
      const token = randomBytes(18).toString("base64url");
      const expiresAt = now + 7 * DAY_MS;
      database.prepare("INSERT INTO shared_routes (token, route_json, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .run(token, JSON.stringify(route), now, expiresAt);
      sendJson(res, 201, { token, url: `/?route=${token}`, expiresAt: new Date(expiresAt).toISOString() });
      return;
    }
    if (req.method === "GET" && routeToken) {
      const stored = database.prepare("SELECT route_json, created_at, expires_at FROM shared_routes WHERE token = ? AND expires_at > ?")
        .get(routeToken, now);
      if (!stored) return sendJson(res, 404, { error: "This shared route was not found or has expired" });
      res.setHeader('X-Robots-Tag', 'noindex, follow');
      if (requestUrl.searchParams.has('format')) {
        if (requestUrl.searchParams.get('format') !== 'geojson') return sendJson(res, 400, { error: 'Unknown route format; use geojson' });
        const document = readableSharedRoute(stored);
        res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Robots-Tag', 'noindex, follow');
        return res.end(JSON.stringify({ type: 'Feature', geometry: document.geometry, properties: { ...document, geometry: undefined } }));
      }
      sendJson(res, 200, {
        route: JSON.parse(stored.route_json),
        createdAt: new Date(stored.created_at).toISOString(),
        expiresAt: new Date(stored.expires_at).toISOString(),
      });
      return;
    }
    sendJson(res, 404, { error: "Shared route not found" });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error("Shared route API error", status < 500 ? error.message : error);
    sendJson(res, status, { error: status < 500 ? error.message : "Could not share route" });
  }
}

function normalizeSharedRoute(input) {
  if (!input || typeof input !== "object") return null;
  const points = Array.isArray(input.points) ? input.points.slice(0, 50).map((point) => ({
    role: ["start", "end", "waypoint"].includes(point?.role) ? point.role : "waypoint",
    latitude: Number(point?.latitude),
    longitude: Number(point?.longitude),
    name: String(point?.name || "").trim().slice(0, 120) || null,
  })).filter((point) => validSharedCoordinate(point.latitude, point.longitude)) : [];
  const result = input.result && typeof input.result === "object" ? { ...input.result } : null;
  if (!result || !Array.isArray(result.coordinates)) return null;
  result.coordinates = result.coordinates.slice(0, 5_000).map((coordinate) => [Number(coordinate?.[0]), Number(coordinate?.[1])])
    .filter(([latitude, longitude]) => validSharedCoordinate(latitude, longitude));
  if (result.coordinates.length < 2 || (!points.length && result.coordinates.length < 2)) return null;
  result.steps = Array.isArray(result.steps) ? result.steps.slice(0, 500) : [];
  result.segments = Array.isArray(result.segments) ? result.segments.slice(0, 5_000) : [];
  result.warnings = Array.isArray(result.warnings) ? result.warnings.slice(0, 50).map((warning) => String(warning).slice(0, 300)) : [];
  return {
    name: String(input.name || "Shared route").trim().slice(0, 100) || "Shared route",
    savedAt: new Date().toISOString(),
    routeType: input.routeType === "loop" ? "loop" : "manual",
    points,
    result,
    settings: input.settings && typeof input.settings === "object" ? input.settings : {},
  };
}

function validSharedCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

let bridgeDataLoadPromise;
function loadAmsterdamBridgeCollection() {
  if (bridgeDataCache && Date.now() - bridgeDataCache.fetchedAt < 24 * 60 * 60 * 1000) return Promise.resolve(bridgeDataCache);
  if (!bridgeDataLoadPromise) bridgeDataLoadPromise = fetchAmsterdamBridgeCollection().finally(() => { bridgeDataLoadPromise = null; });
  return bridgeDataLoadPromise;
}

async function fetchAmsterdamBridgeCollection() {
  const cachePath = join(process.cwd(), "data", "amsterdam-bridges-v6.json");
  const maxAge = 24 * 60 * 60 * 1000;
  let stored;
  if (existsSync(cachePath)) {
    try { stored = JSON.parse(readFileSync(cachePath, "utf8")); } catch {}
  }
  if (stored?.catalogVersion === 6 && Date.now() - stored.fetchedAt < maxAge) {
    bridgeDataCache = stored;
    return bridgeDataCache;
  }
  try {
    const catalog = await loadBridgeCatalog();
    // Audit rows are retained separately by the audit command, not in every map response.
    const { audit, ...data } = catalog;
    writeFileSync(cachePath + '.tmp', JSON.stringify(data));
    renameSync(cachePath + '.tmp', cachePath);
    bridgeDataCache = data;
  } catch (error) {
    if (!stored?.features?.length || stored.catalogVersion !== 6) throw error;
    console.warn(`Bridge sources unavailable; serving explicitly stale catalogue: ${error.message}`);
    return { ...stored, stale: true, sourceWarning: 'Brugbron tijdelijk niet bereikbaar; eerder opgehaalde gegevens worden getoond.' };
  }
  return bridgeDataCache;
}

async function handleBridgeDataApi(res) {
  try {
    const data = await loadAmsterdamBridgeCollection();
    sendJson(res, 200, applyMapObjectOverrides("bridges", data), "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
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

async function handleSurinamekadeWaterLevel(res) {
  const cacheMaxAgeMs = 5 * 60_000;
  if (waterLevelCache && Date.now() - waterLevelCache.fetchedAt < cacheMaxAgeMs) {
    sendJson(res, 200, waterLevelCache.data, "public, max-age=60, s-maxage=300, stale-while-revalidate=900");
    return;
  }
  try {
    pendingWaterLevelLoad ||= fetchSurinamekadeWaterLevel()
      .then(data => {
        waterLevelCache = { data: { ...data, fetchedAt: new Date().toISOString() }, fetchedAt: Date.now() };
        return waterLevelCache.data;
      })
      .finally(() => { pendingWaterLevelLoad = null; });
    const data = await pendingWaterLevelLoad;
    sendJson(res, 200, data, "public, max-age=60, s-maxage=300, stale-while-revalidate=900");
  } catch (error) {
    console.error("Surinamekade water level API error", error.message);
    if (waterLevelCache) {
      sendJson(res, 200, { ...waterLevelCache.data, stale: true }, "public, max-age=30");
      return;
    }
    sendJson(res, 502, { error: "Actuele waterstand Surinamekade kon niet worden geladen" });
  }
}

async function handleNavigationLayerApi(requestUrl, res) {
  const layer = requestUrl.searchParams.get("layer");
  const cached = navigationLayerCache.get(layer);
  if (layer === "closures") res.setHeader("Cache-Control", "no-store");
  if (cached && cached.expiresAt > Date.now()) return sendJson(res, 200, applyMapObjectOverrides(layer, layer === "closures" ? closureSnapshot(cached.data) : cached.data), layer === "closures" ? "no-store" : "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
  try {
    let data;
    let maxAge = 6 * 60 * 60 * 1000;
    if (layer === "reporting-points") {
      data = reportingPointsGeoJson();
      maxAge = 24 * 60 * 60 * 1000;
    } else if (layer === "locks") {
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
    } else if (layer === "closures") {
      pendingClosureLoad ||= loadCurrentClosures({ previous: navigationLayerCache.get('closures')?.data }).finally(() => { pendingClosureLoad = null; });
      data = await pendingClosureLoad;
      maxAge = 60 * 1000;
      try {
        writeFileSync(join(process.cwd(), "data", "navigation-closures-v1.json"), JSON.stringify(data));
      } catch (cacheError) {
        console.warn("Could not persist closure cache:", cacheError.message);
      }
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
    sendJson(res, 200, applyMapObjectOverrides(layer, layer === "closures" ? closureSnapshot(data) : data), layer === "closures" ? "no-store" : "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
  } catch (error) {
    console.error(`Navigation layer ${layer} failed`, error.message);
    if (layer === "closures") {
      let fallback = cached?.data;
      const cachePath = join(process.cwd(), "data", "navigation-closures-v1.json");
      if (!fallback && existsSync(cachePath)) {
        try { fallback = JSON.parse(readFileSync(cachePath, "utf8")); } catch {}
      }
      if (!fallback) {
        const manual = applyMapObjectOverrides(layer, { type: "FeatureCollection", features: [] });
        if (manual.features.length) fallback = manual;
      }
      if (fallback?.type === "FeatureCollection" && Array.isArray(fallback.features)) {
        return sendJson(res, 200, { ...applyMapObjectOverrides(layer, closureSnapshot(fallback)), stale: true });
      }
    }
    sendJson(res, 502, { error: `Could not load ${layer}` });
  }
}

function mapFeatureKey(feature) {
  if (feature?.properties?._mapObjectKey) return String(feature.properties._mapObjectKey);
  if (feature?.id !== null && feature?.id !== undefined) return `id:${feature.id}`;
  const properties = feature?.properties || {};
  const identity = properties.number || properties.code || properties.obj_naam || properties.name || properties.locationName;
  if (identity) return `value:${String(identity).trim().toLowerCase()}`;
  return `geometry:${createHash("sha256").update(JSON.stringify(feature?.geometry || null)).digest("hex").slice(0, 20)}`;
}

function applyMapObjectOverrides(layer, collection) {
  const rows = database.prepare("SELECT object_key, action, feature_json FROM map_object_overrides WHERE layer = ?").all(layer);
  const overrides = new Map(rows.map((row) => [row.object_key, row]));
  const seen = new Set();
  const features = [];
  for (const sourceFeature of collection?.features || []) {
    const key = mapFeatureKey(sourceFeature);
    seen.add(key);
    const override = overrides.get(key);
    if (override?.action === "delete") continue;
    const feature = override?.feature_json ? JSON.parse(override.feature_json) : sourceFeature;
    features.push({ ...feature, properties: { ...(feature.properties || {}), _mapObjectKey: key, _mapObjectSource: override ? "admin" : "source" } });
  }
  for (const row of rows) {
    if (seen.has(row.object_key) || row.action !== "upsert" || !row.feature_json) continue;
    const feature = JSON.parse(row.feature_json);
    features.push({ ...feature, properties: { ...(feature.properties || {}), _mapObjectKey: row.object_key, _mapObjectSource: "admin" } });
  }
  return { ...(collection || {}), type: "FeatureCollection", features };
}

async function handleMapObjectsApi(req, requestUrl, res) {
  const allowedLayers = new Set(["routing-lines", "bridges", "bridge-openings", "closures", "water-levels", "locks", "moorings", "markers", "reporting-points"]);
  const layer = String(requestUrl.searchParams.get("layer") || "");
  if (!allowedLayers.has(layer)) return sendJson(res, 400, { error: "Unknown map layer" });
  if (req.method === "GET") {
    const rows = database.prepare("SELECT layer, object_key AS objectKey, action, feature_json AS featureJson, updated_at AS updatedAt FROM map_object_overrides WHERE layer = ? ORDER BY updated_at DESC").all(layer);
    return sendJson(res, 200, rows.map((row) => ({ ...row, feature: row.featureJson ? JSON.parse(row.featureJson) : null, featureJson: undefined })));
  }
  const body = await readJsonBody(req);
  const objectKey = String(body.objectKey || body.feature?.properties?._mapObjectKey || `custom:${randomBytes(12).toString("hex")}`);
  const now = Date.now();
  if (req.method === "DELETE") {
    database.prepare(`INSERT INTO map_object_overrides (layer, object_key, action, feature_json, updated_by, updated_at) VALUES (?, ?, 'delete', NULL, ?, ?)
      ON CONFLICT(layer, object_key) DO UPDATE SET action='delete', feature_json=NULL, updated_by=excluded.updated_by, updated_at=excluded.updated_at`).run(layer, objectKey, req.authUser.id, now);
  } else if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const feature = body.feature;
    if (feature?.type !== "Feature" || !feature.geometry || !feature.properties) return sendJson(res, 400, { error: "A valid GeoJSON feature is required" });
    if (layer === "reporting-points" && feature.properties.movementRules !== undefined) {
      const ruleError = validateReportingRules(feature.properties.movementRules);
      if (ruleError) return sendJson(res, 400, { error: ruleError });
    }
    feature.properties = { ...feature.properties, _mapObjectKey: objectKey, _mapObjectSource: "admin" };
    database.prepare(`INSERT INTO map_object_overrides (layer, object_key, action, feature_json, updated_by, updated_at) VALUES (?, ?, 'upsert', ?, ?, ?)
      ON CONFLICT(layer, object_key) DO UPDATE SET action='upsert', feature_json=excluded.feature_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at`).run(layer, objectKey, JSON.stringify(feature), req.authUser.id, now);
  } else return sendJson(res, 405, { error: "Method not allowed" });
  navigationLayerCache.delete(layer);
  if (layer === "bridges") bridgeDataCache = null;
  sendJson(res, 200, { layer, objectKey, saved: true });
}

async function handleGeocodeApi(requestUrl, res) {
  const query = cleanOptional(requestUrl.searchParams.get("q"));
  const limit = Math.min(8, Math.max(1, Number(requestUrl.searchParams.get("limit") || 5)));
  if (!query || query.length < 2) return sendJson(res, 200, { query: query || "", results: [] });

  const cacheKey = `${query.toLowerCase()}|${limit}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return sendJson(res, 200, cached.data);

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("countrycodes", "nl");
    url.searchParams.set("viewbox", "4.72,52.45,5.05,52.25");
    url.searchParams.set("bounded", "0");
    url.searchParams.set("q", /amsterdam/i.test(query) ? query : `${query}, Amsterdam`);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "boat-tracker/1.0 route-planner",
      },
    });
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
    const raw = await response.json();
    const results = (Array.isArray(raw) ? raw : [])
      .map(normalizeGeocodeResult)
      .filter(Boolean)
      .filter((item) => item.latitude >= 52.25 && item.latitude <= 52.45 && item.longitude >= 4.72 && item.longitude <= 5.05);
    const data = { query, results };
    geocodeCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, data });
    if (geocodeCache.size > 200) geocodeCache.delete(geocodeCache.keys().next().value);
    sendJson(res, 200, data);
  } catch (error) {
    console.error("Geocode API error", error.message);
    sendJson(res, 502, { error: "Adres zoeken is tijdelijk niet bereikbaar" });
  }
}

function normalizeGeocodeResult(item) {
  const latitude = Number(item?.lat);
  const longitude = Number(item?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const address = item.address || {};
  const primary = item.namedetails?.name || item.name || address.amenity || address.tourism || address.shop || address.office || address.road || address.pedestrian;
  const street = address.house_number && (address.road || address.pedestrian) ? `${address.road || address.pedestrian} ${address.house_number}` : null;
  const secondary = [street, address.suburb || address.neighbourhood, address.city || address.town || "Amsterdam"].filter(Boolean);
  const label = [primary, ...secondary].filter(Boolean).join(", ") || String(item.display_name || "").split(",").slice(0, 3).join(",");
  return {
    id: String(item.place_id || `${latitude},${longitude}`),
    label,
    displayName: item.display_name || label,
    type: item.type || item.class || "place",
    latitude,
    longitude,
  };
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

const localSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true, concurrencyLimit: 4, zlibDeflateOptions: { level: 4 } } });

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
  const clientIp = getRequestIp(request);
  const matchingClients = user
    ? [...clients].filter((client) => client.authUserId === user.id)
    : [...clients].filter((client) => !client.authUserId && client.clientIp === clientIp);
  const connectionLimit = user ? 5 : websocketGuestPerIpLimit;
  if (clients.size >= websocketGlobalLimit || matchingClients.length >= connectionLimit) {
    serviceMetrics.websocketRejected += 1;
    socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  localSocketServer.handleUpgrade(request, socket, head, (client) => {
    client.dataSaver = new URL(request.url, "http://localhost").searchParams.get("dataSaver") === "1";
    client.pendingAis = new Map();
    client.lastAisSentAt = Date.now();
    client.authUserId = user?.id || null;
    client.clientIp = clientIp;
    localSocketServer.emit("connection", client, request);
  });
});

localSocketServer.on("connection", (client) => {
  clients.add(client);
  serviceMetrics.websocketAccepted += 1;
  send(client, {
    type: "snapshot",
    vessels: getActiveVesselSnapshot(),
    config: { movingStaleMs: aisMovingStaleMs, stationaryStaleMs: aisStationaryStaleMs, removeAfterMs: aisRemoveAfterMs, namedRemoveAfterMs: aisNamedRemoveAfterMs, unnamedRemoveAfterMs: aisUnnamedRemoveAfterMs },
  });

  if (!apiKey) {
    send(client, {
      type: "status",
      status: "offline",
      message: "Set AISSTREAM_API_KEY in .env to receive live AIS positions.",
      reason: "AISStream API key is not configured",
      configured: false,
      config: { movingStaleMs: aisMovingStaleMs, stationaryStaleMs: aisStationaryStaleMs, removeAfterMs: aisRemoveAfterMs, namedRemoveAfterMs: aisNamedRemoveAfterMs, unnamedRemoveAfterMs: aisUnnamedRemoveAfterMs },
    });
  } else {
    const state = currentAisFeedState();
    send(client, {
      type: "status",
      status: state.status,
      message: aisStatusMessage(state),
      reason: state.reason,
      configured: true,
      config: { movingStaleMs: aisMovingStaleMs, stationaryStaleMs: aisStationaryStaleMs, removeAfterMs: aisRemoveAfterMs, namedRemoveAfterMs: aisNamedRemoveAfterMs, unnamedRemoveAfterMs: aisUnnamedRemoveAfterMs },
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

server.listen(port, host, () => {
  console.log(`Boottracker: http://${host}:${port}/`);
  console.log(apiKey ? "AIS: configured" : "AIS: not configured (copy .env.example to .env)");
  console.log(`AIS history: ${historyDays} days in data/ais.sqlite`);
  connectUpstream();
  whatsapp.start().catch((error) => console.error("WhatsApp connector failed to start", error));
});

const upstreamWatchdog = setInterval(checkUpstreamHealth, 30_000);
upstreamWatchdog.unref();
runDatabaseMaintenance();
createDatabaseBackupIfDue().catch((error) => console.error("Database backup failed", error));
const databaseMaintenanceTimer = setInterval(runDatabaseMaintenance, 60 * 60 * 1000);
databaseMaintenanceTimer.unref();
const databaseBackupTimer = setInterval(() => createDatabaseBackupIfDue().catch((error) => console.error("Database backup failed", error)), 6 * 60 * 60 * 1000);
databaseBackupTimer.unref();

function connectUpstream() {
  if (!apiKey) return;
  if (upstream && [WebSocket.CONNECTING, WebSocket.OPEN].includes(upstream.readyState)) return;

  clearTimeout(reconnectTimer);
  broadcast({ type: "status", status: "reconnecting", message: "Connecting to AISStream…", reason: "Opening upstream WebSocket" });
  upstream = new WebSocket("wss://stream.aisstream.io/v0/stream");

  upstream.on("open", () => {
    upstreamOpenCount += 1;
    if (upstreamOpenCount > 1) upstreamReconnectCount += 1;
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
    broadcast({ type: "status", status: "reconnecting", message: "AISStream connected; waiting for vessel positions", reason: "Waiting for first position report" });
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
      if (normalizedMessage.type === "vessel-position") lastPositionMessageAt = Date.now();
      if (persistAisMessage(normalizedMessage)) queueAisBroadcast(normalizedMessage);
    }
  });

  upstream.on("error", (error) => {
    console.error(`AIS upstream error: ${error.message}`);
    broadcast({ type: "status", status: "degraded", message: "AISStream connection error; reconnecting…", reason: error.message });
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

  if (connectionAge > aisWatchdogMs && (messageAge > aisWatchdogMs || pongAge > Math.max(30_000, aisWatchdogMs * 0.75))) {
    console.warn(`AIS watchdog: restarting stalled stream (message age ${Math.round(messageAge / 1000)}s)`);
    broadcast({ type: "status", status: "reconnecting", message: "AIS feed stalled; reconnecting automatically…" });
    upstream.terminate();
    return;
  }

  upstream.ping();
  const state = currentAisFeedState(now);
  broadcast({
    type: "status",
    status: state.status,
    message: aisStatusMessage(state, now),
    reason: state.reason,
  });
}

function currentAisFeedState(now = Date.now()) {
  return feedState({ configured: Boolean(apiKey), open: upstream?.readyState === WebSocket.OPEN,
    messageAgeMs: lastUpstreamMessageAt ? now - lastUpstreamMessageAt : Infinity, positionAgeMs: lastPositionMessageAt ? now - lastPositionMessageAt : Infinity, watchdogMs: aisWatchdogMs });
}

function latencySummary() {
  if (!recentAisLatencies.length) return { average: null, maximum: null };
  return {
    average: Math.round(recentAisLatencies.reduce((total, value) => total + value, 0) / recentAisLatencies.length),
    maximum: Math.max(...recentAisLatencies),
  };
}

function aisStatusMessage(state, now = Date.now()) {
  const age = lastUpstreamMessageAt ? Math.max(0, Math.round((now - lastUpstreamMessageAt) / 1000)) : null;
  const latency = latencySummary().average;
  if (state.status === "live") return `Live positions · feed ${age}s ago${latency === null ? "" : ` · avg latency ${(latency / 1000).toFixed(1)}s`}`;
  if (state.status === "degraded") return `${state.reason} · last message ${age}s ago`;
  return state.reason;
}

function persistAisMessage(message) {
  const existing = latestVessels.get(message.mmsi) || { mmsi: message.mmsi };
  if (message.type === "vessel-position" && !shouldAcceptPosition(existing, message)) return false;
  const merged = mergeAisState(existing, message);
  latestVessels.set(message.mmsi, merged);

  const now = Date.now();
  try {
    upsertVesselStatement.run(message.mmsi, JSON.stringify(merged), now);
  } catch (error) {
    if (error.errcode !== 5) throw error;
    console.warn("AIS vessel cache write skipped: database is busy");
  }

  if (message.type !== "vessel-position") return true;

  const receivedAt = parseAisTime(message.receivedAt);
  const lastStoredAt = lastStoredPositionAt.get(message.mmsi) || 0;
  if (receivedAt - lastStoredAt < aisHistorySampleMs) return true;

  try {
    insertPositionStatement.run(message.mmsi, message.latitude, message.longitude, message.speed, message.course, message.heading, receivedAt);
    lastStoredPositionAt.set(message.mmsi, receivedAt);
  } catch (error) {
    if (error.errcode !== 5) throw error;
    console.warn("AIS history point skipped: database is busy");
  }
  return true;
}

function parseAisTime(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function loadLatestVessels() {
  const cutoff = Date.now() - aisRemoveAfterMs;
  const assignments = operatorStore.read();
  const rows = database.prepare("SELECT mmsi, data, updated_at FROM vessels").all();
  for (const row of rows) {
    try {
      const vessel = JSON.parse(row.data);
      if (row.updated_at >= cutoff || inferVesselOperator(vessel, assignments)) latestVessels.set(row.mmsi, vessel);
    } catch {
      // Ignore malformed legacy rows.
    }
  }
}

function getActiveVesselSnapshot() {
  const assignments = operatorStore.read();
  const cutoff = Date.now() - Math.min(aisRemoveAfterMs, aisNamedRemoveAfterMs);
  const unnamedCutoff = Date.now() - aisUnnamedRemoveAfterMs;
  return Array.from(latestVessels.values()).filter((vessel) => {
    if (inferVesselOperator(vessel, assignments)) return true;
    const receivedAt = parseAisTime(vessel.receivedAt);
    return receivedAt >= cutoff && (String(vessel.name || "").trim() || receivedAt >= unnamedCutoff);
  });
}

function pruneHistory() {
  const cutoff = Date.now() - historyDays * DAY_MS;
  database.prepare("DELETE FROM positions WHERE received_at < ?").run(cutoff);
  database.prepare(`
    DELETE FROM vessels
    WHERE updated_at < ?
      AND mmsi NOT IN (SELECT value FROM json_each(?))
  `).run(cutoff, JSON.stringify(publicOperatorGroups(database, operatorStore.read()).flatMap((group) => group.mmsis)));
}

function runDatabaseMaintenance() {
  const now = Date.now();
  try {
    usageAnalytics.prune(now);
    database.exec("BEGIN IMMEDIATE");
    pruneHistory();
    database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now);
    database.prepare("DELETE FROM account_verifications WHERE expires_at <= ? OR (consumed_at IS NOT NULL AND consumed_at <= ?)")
      .run(now, now - temporaryDataRetention.verificationMs);
    database.prepare("DELETE FROM planning_message_contexts WHERE received_at < ?").run(now - temporaryDataRetention.planningContextMs);
    database.prepare("DELETE FROM whatsapp_inbox WHERE created_at < ?").run(now - temporaryDataRetention.whatsappInboxMs);
    database.prepare("DELETE FROM boat_day_assignments WHERE service_date < ?")
      .run(new Date(now - temporaryDataRetention.boatDutyMs).toISOString().slice(0, 10));
    expirePlanningSourceData(now - temporaryDataRetention.planningSourceMs);
    database.exec("COMMIT");
    const assignments = operatorStore.read();
    for (const [mmsi, vessel] of latestVessels) {
      if (!inferVesselOperator(vessel, assignments) && parseAisTime(vessel.receivedAt) < now - historyDays * DAY_MS) latestVessels.delete(mmsi);
    }
    database.exec("PRAGMA optimize");
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.exec("PRAGMA incremental_vacuum(2000)");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* No active transaction. */ }
    console.error("Database maintenance failed", error);
  }
}

function expirePlanningSourceData(cutoff) {
  const paths = database.prepare(`
    SELECT DISTINCT source_image_path AS path FROM planning_imports
    WHERE created_at < ? AND source_image_path IS NOT NULL AND trim(source_image_path) <> ''
  `).all(cutoff).map((row) => row.path);
  database.prepare(`
    UPDATE planning_imports SET source_text = NULL, source_context_text = NULL, source_ocr_tsv = NULL, source_image_path = NULL
    WHERE created_at < ?
  `).run(cutoff);
  const stillReferenced = database.prepare("SELECT 1 FROM planning_imports WHERE source_image_path = ? LIMIT 1");
  for (const path of paths) {
    if (!stillReferenced.get(path) && existsSync(path)) {
      try { unlinkSync(path); } catch (error) { console.warn(`Old planning image could not be deleted: ${error.message}`); }
    }
  }
}

async function createDatabaseBackupIfDue(force = false) {
  if (databaseBackupRunning) return;
  mkdirSync(backupDirectory, { recursive: true });
  removeExpiredDatabaseBackups();
  const backups = databaseBackupFiles();
  const newest = backups.reduce((latest, file) => Math.max(latest, statSync(join(backupDirectory, file)).mtimeMs), 0);
  if (!force && Date.now() - newest < DAY_MS) return;
  databaseBackupRunning = true;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const temporaryPath = join(backupDirectory, `.boat-tracker-${stamp}.tmp.sqlite`);
  const finalPath = join(backupDirectory, `boat-tracker-${stamp}.sqlite`);
  try {
    const integrity = database.prepare("PRAGMA quick_check").all();
    if (integrity.some((row) => row.quick_check !== "ok")) throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
    await backup(database, temporaryPath);
    const backupDatabase = new DatabaseSync(temporaryPath);
    try {
      backupDatabase.exec("PRAGMA foreign_keys = ON; DELETE FROM positions; DELETE FROM vessels; VACUUM; PRAGMA optimize;");
    } finally {
      backupDatabase.close();
    }
    renameSync(temporaryPath, finalPath);
    removeExpiredDatabaseBackups();
    console.log(`Database backup created: ${finalPath} (operational data only; AIS history excluded)`);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  } finally {
    databaseBackupRunning = false;
  }
}

function databaseBackupFiles() {
  return readdirSync(backupDirectory).filter((file) => /^boat-tracker-.*\.sqlite$/.test(file));
}

function removeExpiredDatabaseBackups() {
  const cutoff = Date.now() - backupRetentionDays * DAY_MS;
  for (const file of databaseBackupFiles()) {
    const path = join(backupDirectory, file);
    if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
  }
}

async function handleAisApi(requestUrl, res) {
  if (requestUrl.pathname === "/api/ais/health") {
    const now = Date.now();
    const state = currentAisFeedState(now);
    const latency = latencySummary();
    sendJson(res, 200, {
      status: state.status,
      statusReason: state.reason,
      connectedAt: upstreamConnectedAt || null,
      lastMessageAt: lastUpstreamMessageAt || null,
      lastPositionAt: lastPositionMessageAt || null,
      messageAgeSeconds: lastUpstreamMessageAt ? Math.round((now - lastUpstreamMessageAt) / 1000) : null,
      averageLatencyMs: latency.average,
      maximumLatencyMs: latency.maximum,
      reconnectCount: upstreamReconnectCount,
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

  const requestedFrom = Number(requestUrl.searchParams.get("from"));
  const requestedTo = Number(requestUrl.searchParams.get("to"));
  const hasRange = requestUrl.searchParams.has("from") && requestUrl.searchParams.has("to")
    && Number.isFinite(requestedFrom) && Number.isFinite(requestedTo) && requestedTo > requestedFrom;
  const hours = Math.min(historyDays * 24, Math.max(1, Number(requestUrl.searchParams.get("hours") || 1)));
  const since = hasRange ? requestedFrom : Date.now() - hours * 60 * 60 * 1000;
  const until = hasRange ? Math.min(requestedTo, since + 24 * 60 * 60 * 1000) : Date.now();
  const rows = await databaseReads.run("history", { mmsi: historyMatch[1], since, until });

  const step = Math.max(1, Math.ceil(rows.length / 1500));
  sendJson(res, 200, {
    mmsi: historyMatch[1],
    hours,
    from: since,
    to: until,
    points: rows.filter((_, index) => index % step === 0 || index === rows.length - 1),
  });
}

function sendJson(res, statusCode, value, cacheControl = "no-store") {
  return sendJsonResponse(res.req, res, statusCode, value, cacheControl);
}

function planningTimeTimestamp(serviceDate, time) {
  if (!isIsoDate(serviceDate) || !/^\d{2}:\d{2}$/.test(String(time || ""))) return null;
  const timestamp = new Date(`${serviceDate}T${time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function annotateTourPerformance(items, serviceDate) {
  const positions = database.prepare(`
    SELECT latitude, longitude, speed, received_at AS receivedAt
    FROM positions
    WHERE mmsi = ? AND received_at >= ? AND received_at <= ?
    ORDER BY received_at ASC
  `);
  const now = Date.now();
  return items.map((item) => {
    if (item.event_type !== "tour") return item;
    if (!item.mmsi) return { ...item, tour_status: "no-mmsi" };
    const scheduledStart = planningTimeTimestamp(serviceDate, item.start_time);
    let scheduledEnd = planningTimeTimestamp(serviceDate, item.end_time);
    if (scheduledStart == null || scheduledEnd == null) return { ...item, tour_status: "invalid-time" };
    if (scheduledEnd <= scheduledStart) scheduledEnd += 24 * 60 * 60_000;
    const reports = positions.all(String(item.mmsi), scheduledStart - 15 * 60_000, scheduledEnd + 30 * 60_000);
    const locationPin = findPlanningLocationPin(item.from_location || item.group_location);
    const result = deriveTourPerformance({ scheduledStart, scheduledEnd, points: reports, now, locationPin });
    return {
      ...item,
      tour_status: result.status,
      scheduled_start_at: scheduledStart,
      scheduled_end_at: scheduledEnd,
      actual_start_at: result.actualStart,
      actual_end_at: result.actualEnd,
      delay_minutes: result.delayMinutes,
      return_delay_minutes: result.returnDelayMinutes,
      round_duration_minutes: result.roundDurationMinutes,
      tracking_method: result.trackingMethod,
      route_from: result.routeFrom,
      route_to: result.routeTo,
      ais_point_count: result.pointCount,
    };
  });
}

function applySecurityHeaders(req, res) {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' ws: wss: https://nominatim.openstreetmap.org",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://service.pdok.nl",
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
      sendJson(res, 200, { needsSetup, setupTokenRequired: needsSetup && Boolean(authSetupToken), authenticated: Boolean(user), user: user ? publicUser(user) : null });
      return;
    }

    if (req.method === "POST" && path === "/api/auth/register") {
      const requester = `${req.socket.remoteAddress || "unknown"}:public-registration`;
      if (isRegistrationRateLimited(requester, 20)) return sendJson(res, 429, { error: "Too many registration attempts. Try again later." });
      recordRegistrationAttempt(requester);
      const body = await readJsonBody(req, 4096);
      if (body.password !== body.confirmPassword) return sendJson(res, 400, { error: "Passwords do not match" });
      if (database.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0) return sendJson(res, 409, { error: "An administrator must complete initial setup first" });
      // The public endpoint never accepts a role, employee status or privileges.
      const user = createUser(body, "viewer");
      createAuthSession(req, res, user.id);
      return sendJson(res, 201, { user: publicUser(user) });
    }
    if (path.startsWith("/api/auth/register/")) {
      return sendJson(res, 410, { error: "Employment verification has been removed. Create an account with email and password." });
    }

    if (req.method === "POST" && path === "/api/auth/setup") {
      if (database.prepare("SELECT COUNT(*) AS count FROM users").get().count !== 0) {
        return sendJson(res, 409, { error: "Initial setup has already been completed" });
      }
      if (authSetupToken && !safeStringEqual(req.headers["x-setup-token"], authSetupToken)) {
        return sendJson(res, 403, { error: "The setup token is invalid" });
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

function safeStringEqual(value, expected) {
  const actualBuffer = Buffer.from(String(value || ""));
  const expectedBuffer = Buffer.from(String(expected));
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
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
  return ACCOUNT_ROLES.includes(value) ? value : "viewer";
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

async function handleBoatDutyApi(req, requestUrl, res) {
  const path = requestUrl.pathname.replace(/\/+$/, "") || "/";
  const user = req.authUser;
  const canReadAll = user.role === "admin" || user.role === "harbour";
  try {
    if (req.method === "GET" && path === "/api/boat-duty") {
      const serviceDate = normalizeServiceDate(requestUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10));
      const rows = database.prepare(`
        SELECT a.id, a.user_id, a.boat_id, a.service_date, a.serviced_at, a.created_at, a.updated_at,
               u.name AS user_name, b.name AS boat_name, b.home_dock,
               l.items_json, l.restock_json, l.submitted_at, l.updated_at AS list_updated_at
        FROM boat_day_assignments a
        JOIN users u ON u.id = a.user_id
        JOIN fleet_boats b ON b.id = a.boat_id
        LEFT JOIN boat_day_lists l ON l.id = (
          SELECT l2.id
          FROM boat_day_assignments a2
          JOIN boat_day_lists l2 ON l2.assignment_id = a2.id
          WHERE a2.boat_id = a.boat_id AND a2.service_date = a.service_date
          ORDER BY l2.updated_at DESC, l2.id DESC
          LIMIT 1
        )
        WHERE a.service_date = ? ${canReadAll ? "" : "AND a.user_id = ?"}
        ORDER BY b.name, u.name
      `).all(...(canReadAll ? [serviceDate] : [serviceDate, user.id])).map(formatBoatDutyAssignment);
      const boatInventory = database.prepare(`SELECT bi.*,p.name AS product_name,p.unit,p.is_bundle FROM boat_inventory bi JOIN inventory_products p ON p.id=bi.product_id WHERE bi.service_date=? AND p.active=1 ORDER BY p.name`).all(serviceDate);
      for (const row of rows) row.inventory = boatInventory.filter((item) => item.boat_id === row.boat_id);
      const response = { date: serviceDate, assignments: rows };
      response.inventoryProducts = database.prepare(`
        SELECT p.id,p.name,p.unit,p.is_bundle,p.show_on_boat_menu,p.category_id,c.name AS category_name
        FROM inventory_products p
        LEFT JOIN inventory_categories c ON c.id=p.category_id AND c.active=1
        WHERE p.active=1
        ORDER BY p.show_on_boat_menu DESC,COALESCE(c.sort_order,9999),c.name,p.name
      `).all();
      if (user.role === "admin") {
        response.users = database.prepare("SELECT id, name, role FROM users WHERE active = 1 ORDER BY name").all();
        response.boats = database.prepare("SELECT id, name FROM fleet_boats WHERE active = 1 ORDER BY name").all();
      }
      sendJson(res, 200, response);
      return;
    }

    if (req.method === "POST" && path === "/api/boat-duty/assignments") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const serviceDate = normalizeServiceDate(body.serviceDate);
      const assignedUser = database.prepare("SELECT id FROM users WHERE id = ? AND active = 1").get(Number(body.userId));
      const boat = database.prepare("SELECT id FROM fleet_boats WHERE id = ? AND active = 1").get(Number(body.boatId));
      if (!assignedUser) return sendJson(res, 400, { error: "Choose an active account" });
      if (!boat) return sendJson(res, 400, { error: "Choose an active boat" });
      const now = Date.now();
      database.prepare(`
        INSERT INTO boat_day_assignments (user_id, boat_id, service_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, service_date) DO UPDATE SET boat_id = excluded.boat_id, created_by = excluded.created_by, updated_at = excluded.updated_at
      `).run(assignedUser.id, boat.id, serviceDate, user.id, now, now);
      broadcast({ type: "boat-duty-update", action: "assignment", serviceDate, updatedAt: now });
      sendJson(res, 200, { saved: true });
      return;
    }

    const assignmentMatch = path.match(/^\/api\/boat-duty\/assignments\/(\d+)$/);
    if (req.method === "DELETE" && assignmentMatch) {
      if (!requireAdmin(req, res)) return;
      const assignmentId = Number(assignmentMatch[1]);
      const assignment = database.prepare("SELECT service_date FROM boat_day_assignments WHERE id = ?").get(assignmentId);
      database.prepare("DELETE FROM boat_day_assignments WHERE id = ?").run(assignmentId);
      if (assignment) broadcast({ type: "boat-duty-update", action: "deleted", assignmentId, serviceDate: assignment.service_date, updatedAt: Date.now() });
      sendJson(res, 200, { deleted: true });
      return;
    }

    const statusMatch = path.match(/^\/api\/boat-duty\/assignments\/(\d+)\/status$/);
    if (req.method === "PUT" && statusMatch) {
      if (!canReadAll) return sendJson(res, 403, { error: "Only administrators and harbour accounts can update boat status" });
      const assignment = database.prepare("SELECT id, service_date FROM boat_day_assignments WHERE id = ?").get(Number(statusMatch[1]));
      if (!assignment) return sendJson(res, 404, { error: "Boat assignment not found" });
      const body = await readJsonBody(req);
      const servicedAt = body.serviced ? Date.now() : null;
      database.prepare("UPDATE boat_day_assignments SET serviced_at = ?, updated_at = ? WHERE id = ?").run(servicedAt, Date.now(), assignment.id);
      broadcast({ type: "boat-duty-update", action: "status", assignmentId: assignment.id, serviceDate: assignment.service_date, updatedAt: Date.now() });
      sendJson(res, 200, { saved: true, servicedAt });
      return;
    }

    const listMatch = path.match(/^\/api\/boat-duty\/assignments\/(\d+)\/list$/);
    if (req.method === "PUT" && listMatch) {
      const assignment = database.prepare("SELECT * FROM boat_day_assignments WHERE id = ?").get(Number(listMatch[1]));
      if (!assignment) return sendJson(res, 404, { error: "Boat assignment not found" });
      if (assignment.user_id !== user.id && user.role !== "admin") return sendJson(res, 403, { error: "You can only send a list for your own assigned boat" });
      const body = await readJsonBody(req);
      const items = normalizeBoatDutyItems(body.items);
      const restock = normalizeStavernoRestock(body.restock, assignment.boat_id, Boolean(body.submit));
      const now = Date.now();
      const submittedAt = body.submit ? now : null;
      const sharedAssignments = database.prepare("SELECT id FROM boat_day_assignments WHERE boat_id = ? AND service_date = ?").all(assignment.boat_id, assignment.service_date);
      const saveSharedList = database.prepare(`
        INSERT INTO boat_day_lists (assignment_id, items_json, restock_json, submitted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(assignment_id) DO UPDATE SET items_json = excluded.items_json,
          restock_json = excluded.restock_json,
          submitted_at = CASE WHEN excluded.submitted_at IS NOT NULL THEN excluded.submitted_at ELSE boat_day_lists.submitted_at END,
          updated_at = excluded.updated_at
      `);
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const sharedAssignment of sharedAssignments) saveSharedList.run(sharedAssignment.id, JSON.stringify(items), restock ? JSON.stringify(restock) : null, submittedAt, now, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      broadcast({ type: "boat-duty-update", action: body.submit ? "submitted" : "draft", assignmentId: assignment.id, serviceDate: assignment.service_date, updatedAt: now });
      sendJson(res, 200, { saved: true, submittedAt, sharedWith: sharedAssignments.length });
      return;
    }

    const inventoryMatch = path.match(/^\/api\/boat-duty\/assignments\/(\d+)\/inventory$/);
    if (req.method === "PUT" && inventoryMatch) {
      const assignment=database.prepare("SELECT a.*,b.home_dock FROM boat_day_assignments a JOIN fleet_boats b ON b.id=a.boat_id WHERE a.id=?").get(Number(inventoryMatch[1]));
      if(!assignment)return sendJson(res,404,{error:"Boat assignment not found"});
      const isCrew=Boolean(database.prepare("SELECT 1 FROM boat_day_assignments WHERE boat_id=? AND service_date=? AND user_id=?").get(assignment.boat_id,assignment.service_date,user.id));
      if(!isCrew&&user.role!=="admin")return sendJson(res,403,{error:"Only assigned crew can update this boat inventory"});
      const body=await readJsonBody(req);const mode=assignment.home_dock?.trim().toLowerCase()==="eh"?"requested":"onboard";const lines=Array.isArray(body.lines)?body.lines:[];const now=Date.now();
      const upsert=database.prepare(`INSERT INTO boat_inventory(boat_id,service_date,product_id,onboard_quantity,requested_quantity,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(boat_id,service_date,product_id) DO UPDATE SET ${mode==="requested"?"requested_quantity=excluded.requested_quantity":"onboard_quantity=excluded.onboard_quantity"},updated_by=excluded.updated_by,updated_at=excluded.updated_at`);
      database.exec("BEGIN IMMEDIATE");try{for(const line of lines){const productId=Number(line.productId);const quantity=Math.max(0,Number(line.quantity)||0);if(!Number.isInteger(productId))continue;const current=database.prepare("SELECT onboard_quantity,requested_quantity FROM boat_inventory WHERE boat_id=? AND service_date=? AND product_id=?").get(assignment.boat_id,assignment.service_date,productId)||{};upsert.run(assignment.boat_id,assignment.service_date,productId,mode==="onboard"?quantity:Number(current.onboard_quantity||0),mode==="requested"?quantity:Number(current.requested_quantity||0),user.id,now);}const shared=database.prepare("SELECT id FROM boat_day_assignments WHERE boat_id=? AND service_date=?").all(assignment.boat_id,assignment.service_date);const markSubmitted=database.prepare(`INSERT INTO boat_day_lists(assignment_id,items_json,restock_json,submitted_at,created_at,updated_at) VALUES(?,'[]',NULL,?,?,?) ON CONFLICT(assignment_id) DO UPDATE SET submitted_at=excluded.submitted_at,updated_at=excluded.updated_at`);for(const row of shared)markSubmitted.run(row.id,now,now,now);database.exec("COMMIT");}catch(error){database.exec("ROLLBACK");throw error;}
      broadcast({type:"boat-duty-update",action:"inventory",assignmentId:assignment.id,serviceDate:assignment.service_date,updatedAt:now});return sendJson(res,200,{saved:true,mode});
    }

    sendJson(res, 404, { error: "Boat duty endpoint not found" });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error("Boat duty API error", status < 500 ? error.message : error);
    sendJson(res, status, { error: status < 500 ? error.message : "Boat duty request failed" });
  }
}

function formatBoatDutyAssignment(row) {
  let items = [];
  let restock = null;
  try { items = JSON.parse(row.items_json || "[]"); } catch { items = []; }
  try { restock = row.restock_json ? JSON.parse(row.restock_json) : null; } catch { restock = null; }
  return { ...row, items, restock, items_json: undefined, restock_json: undefined };
}

function migrateLegacyBoatListsToInventory() {
  const rows = database.prepare(`SELECT a.boat_id,a.service_date,a.user_id,l.items_json,l.updated_at FROM boat_day_lists l JOIN boat_day_assignments a ON a.id=l.assignment_id WHERE l.items_json IS NOT NULL AND l.items_json <> '[]'`).all();
  const findProduct=database.prepare("SELECT id FROM inventory_products WHERE name=? COLLATE NOCASE"); const addProduct=database.prepare("INSERT OR IGNORE INTO inventory_products(name,unit,is_bundle,created_at,updated_at) VALUES(?,'item',0,?,?)"); const addBoatItem=database.prepare("INSERT OR IGNORE INTO boat_inventory(boat_id,service_date,product_id,onboard_quantity,requested_quantity,updated_by,updated_at) VALUES(?,?,?,0,1,?,?)");
  for(const row of rows){let items=[];try{items=JSON.parse(row.items_json||"[]")}catch{continue}for(const value of items){const name=String(value||"").trim().slice(0,100);if(!name)continue;const now=row.updated_at||Date.now();addProduct.run(name,now,now);const product=findProduct.get(name);if(product)addBoatItem.run(row.boat_id,row.service_date,product.id,row.user_id,now);}}
}

function normalizeBoatDutyItems(value) {
  if (!Array.isArray(value)) throw boatDutyValidationError("List items must be an array");
  const items = value.map((item) => String(item || "").trim()).filter(Boolean);
  if (items.length > 100) throw boatDutyValidationError("A list can contain at most 100 items");
  if (items.some((item) => item.length > 500)) throw boatDutyValidationError("A list item can contain at most 500 characters");
  return items;
}

function normalizeStavernoRestock(value, boatId, requireComplete) {
  const homeDock = database.prepare("SELECT home_dock FROM fleet_boats WHERE id = ?").get(boatId)?.home_dock || "";
  if (homeDock.trim().toLowerCase() !== "staverno") return null;
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fields = ["tourType", "beer", "wine", "soda", "water", "extraStock"];
  const result = Object.fromEntries(fields.map((field) => [field, String(input[field] ?? "").trim().slice(0, 500)]));
  for (const field of ["smallSilverBowl", "smallSilverBowlComplete", "bigSilverBowl", "bigSilverBowlComplete"]) {
    result[field] = ["yes", "no"].includes(input[field]) ? input[field] : "";
  }
  result.merlot = Number.isInteger(Number(input.merlot)) && Number(input.merlot) >= 0 ? Number(input.merlot) : null;
  if (requireComplete && (fields.some((field) => !result[field]) || !result.smallSilverBowl || !result.smallSilverBowlComplete || !result.bigSilverBowl || !result.bigSilverBowlComplete || result.merlot === null)) {
    throw boatDutyValidationError("Complete all Staverno restock fields before submitting");
  }
  return result;
}

function normalizeServiceDate(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw boatDutyValidationError("Use a valid service date");
  return date;
}

function boatDutyValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function handleInventoryApi(req, requestUrl, res) {
  const path = requestUrl.pathname.replace(/\/+$/, "") || "/";
  const canManage = ["admin", "harbour"].includes(req.authUser.role);
  if (!canManage) return sendJson(res, 403, { error: "Inventory is available to harbour and administrator accounts" });
  try {
    if (req.method === "GET" && path === "/api/inventory") {
      const locations = database.prepare("SELECT * FROM inventory_locations WHERE active = 1 ORDER BY name").all();
      const categories = database.prepare("SELECT * FROM inventory_categories WHERE active=1 ORDER BY sort_order,name").all();
      const products = database.prepare("SELECT p.*,c.name AS category_name FROM inventory_products p LEFT JOIN inventory_categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY COALESCE(c.sort_order,9999),c.name,p.is_bundle,p.name").all();
      const bundleItems = database.prepare(`SELECT bi.*, p.name AS component_name, p.unit AS component_unit FROM inventory_bundle_items bi JOIN inventory_products p ON p.id = bi.component_product_id ORDER BY p.name`).all();
      const stock = database.prepare(`SELECT s.*, l.name AS location_name, p.name AS product_name, p.unit FROM inventory_stock s JOIN inventory_locations l ON l.id=s.location_id JOIN inventory_products p ON p.id=s.product_id ORDER BY l.name,p.name`).all();
      const assignments = database.prepare(`
        SELECT MIN(a.id) AS id, a.service_date, a.boat_id, b.name AS boat_name,
               GROUP_CONCAT(DISTINCT u.name) AS assigned_users,
               COUNT(DISTINCT a.id) AS assignment_count
        FROM boat_day_assignments a
        JOIN fleet_boats b ON b.id=a.boat_id
        JOIN users u ON u.id=a.user_id
        WHERE a.service_date >= ?
        GROUP BY a.service_date, a.boat_id, b.name
        ORDER BY a.service_date,b.name
      `).all(new Date(Date.now() - DAY_MS).toISOString().slice(0, 10));
      const movements = database.prepare(`SELECT m.*, l.name AS location_name, p.name AS product_name, b.name AS boat_name, u.name AS user_name FROM inventory_movements m JOIN inventory_locations l ON l.id=m.location_id JOIN inventory_products p ON p.id=m.product_id JOIN users u ON u.id=m.created_by LEFT JOIN boat_day_assignments a ON a.id=m.assignment_id LEFT JOIN fleet_boats b ON b.id=a.boat_id ORDER BY m.created_at DESC LIMIT 100`).all();
      return sendJson(res, 200, { locations, categories, products, bundleItems, stock, assignments, movements });
    }
    if (req.method === "POST" && path === "/api/inventory/locations") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req); const name = String(body.name || "").trim().slice(0, 80); const type = body.locationType;
      if (!name || !["harbour", "warehouse"].includes(type)) throw boatDutyValidationError("Enter a name and choose harbour or warehouse");
      const now = Date.now(); const result = database.prepare("INSERT INTO inventory_locations(name,location_type,created_at,updated_at) VALUES(?,?,?,?)").run(name,type,now,now);
      broadcast({ type: "inventory-update", action: "location", updatedAt: now }); return sendJson(res, 200, { id: Number(result.lastInsertRowid) });
    }
    if (req.method === "POST" && path === "/api/inventory/products") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req); const name = String(body.name || "").trim().slice(0, 100); const sku = String(body.sku || "").trim().slice(0, 50) || null; const unit = String(body.unit || "piece").trim().slice(0, 30); const categoryId=Number.isInteger(Number(body.categoryId))?Number(body.categoryId):null; const components = Array.isArray(body.components) ? body.components : [];
      if (!name) throw boatDutyValidationError("Product name is required");
      const now = Date.now(); database.exec("BEGIN IMMEDIATE");
      try {
        const result = database.prepare("INSERT INTO inventory_products(name,sku,unit,is_bundle,category_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(name,sku,unit,components.length ? 1 : 0,categoryId,now,now);
        const id = Number(result.lastInsertRowid); const insert = database.prepare("INSERT INTO inventory_bundle_items(bundle_product_id,component_product_id,quantity) VALUES(?,?,?)");
        for (const row of components) { const quantity = Number(row.quantity); if (!Number.isInteger(Number(row.productId)) || !(quantity > 0)) throw boatDutyValidationError("Every bulk component needs a product and positive quantity"); insert.run(id,Number(row.productId),quantity); }
        database.exec("COMMIT"); broadcast({ type: "inventory-update", action: "product", updatedAt: now }); return sendJson(res, 200, { id });
      } catch (error) { database.exec("ROLLBACK"); throw error; }
    }
    const deleteProductMatch=path.match(/^\/api\/inventory\/products\/(\d+)$/);
    if(req.method==="PUT"&&deleteProductMatch){
      if(!requireAdmin(req,res))return;const productId=Number(deleteProductMatch[1]);const existing=database.prepare("SELECT * FROM inventory_products WHERE id=? AND active=1").get(productId);if(!existing)return sendJson(res,404,{error:"Product not found"});const body=await readJsonBody(req);const name=String(body.name||"").trim().slice(0,100);const sku=String(body.sku||"").trim().slice(0,50)||null;const unit=String(body.unit||"piece").trim().slice(0,30);const categoryId=Number.isInteger(Number(body.categoryId))?Number(body.categoryId):null;const components=Array.isArray(body.components)?body.components:[];if(!name)throw boatDutyValidationError("Product name is required");const now=Date.now();database.exec("BEGIN IMMEDIATE");try{database.prepare("UPDATE inventory_products SET name=?,sku=?,unit=?,is_bundle=?,category_id=?,updated_at=? WHERE id=?").run(name,sku,unit,components.length?1:0,categoryId,now,productId);database.prepare("DELETE FROM inventory_bundle_items WHERE bundle_product_id=?").run(productId);const insert=database.prepare("INSERT INTO inventory_bundle_items(bundle_product_id,component_product_id,quantity) VALUES(?,?,?)");for(const row of components){const componentId=Number(row.productId);const quantity=Number(row.quantity);if(!Number.isInteger(componentId)||componentId===productId||!(quantity>0))throw boatDutyValidationError("Every box component needs another product and a positive quantity");insert.run(productId,componentId,quantity);}database.exec("COMMIT");}catch(error){database.exec("ROLLBACK");throw error;}broadcast({type:"inventory-update",action:"product-edited",updatedAt:now});broadcast({type:"boat-duty-update",action:"inventory-menu",updatedAt:now});return sendJson(res,200,{saved:true});
    }
    if(req.method==="DELETE"&&deleteProductMatch){
      if(!requireAdmin(req,res))return;const productId=Number(deleteProductMatch[1]);const product=database.prepare("SELECT id,name FROM inventory_products WHERE id=? AND active=1").get(productId);if(!product)return sendJson(res,404,{error:"Product not found"});
      const usedBy=database.prepare("SELECT p.name FROM inventory_bundle_items bi JOIN inventory_products p ON p.id=bi.bundle_product_id WHERE bi.component_product_id=? AND p.active=1 LIMIT 1").get(productId);
      if(usedBy)throw boatDutyValidationError(`${product.name} is still used inside ${usedBy.name}. Delete that box first or remove the product from its recipe.`);
      const now=Date.now();database.prepare("UPDATE inventory_products SET active=0,updated_at=? WHERE id=?").run(now,productId);broadcast({type:"inventory-update",action:"product-deleted",updatedAt:now});return sendJson(res,200,{deleted:true});
    }
    const boatMenuMatch=path.match(/^\/api\/inventory\/products\/(\d+)\/boat-menu$/);
    if(req.method==="PUT"&&boatMenuMatch){if(!requireAdmin(req,res))return;const body=await readJsonBody(req);const productId=Number(boatMenuMatch[1]);const now=Date.now();const result=database.prepare("UPDATE inventory_products SET show_on_boat_menu=?,updated_at=? WHERE id=? AND active=1").run(body.enabled?1:0,now,productId);if(!result.changes)return sendJson(res,404,{error:"Product not found"});broadcast({type:"inventory-update",action:"boat-menu",updatedAt:now});broadcast({type:"boat-duty-update",action:"inventory-menu",serviceDate:localIsoDate(),updatedAt:now});return sendJson(res,200,{saved:true});}
    if(req.method==="POST"&&path==="/api/inventory/categories"){
      if(!requireAdmin(req,res))return;
      const body=await readJsonBody(req);
      const name=String(body.name||"").trim().slice(0,60);
      if(!name)throw boatDutyValidationError("Category name is required");
      const now=Date.now();
      const sortOrder=Number.isFinite(Number(body.sortOrder))?Number(body.sortOrder):0;
      database.prepare(`
        INSERT INTO inventory_categories(name,sort_order,active,created_at,updated_at)
        VALUES(?,?,1,?,?)
        ON CONFLICT(name) DO UPDATE SET active=1,sort_order=excluded.sort_order,updated_at=excluded.updated_at
      `).run(name,sortOrder,now,now);
      const category=database.prepare("SELECT id,name FROM inventory_categories WHERE name=? COLLATE NOCASE").get(name);
      broadcast({type:"inventory-update",action:"category",updatedAt:now});
      broadcast({type:"boat-duty-update",action:"inventory-menu",updatedAt:now});
      return sendJson(res,200,{id:category.id,name:category.name});
    }
    const categoryMatch=path.match(/^\/api\/inventory\/categories\/(\d+)$/);
    if(req.method==="DELETE"&&categoryMatch){
      if(!requireAdmin(req,res))return;
      const categoryId=Number(categoryMatch[1]);
      const category=database.prepare("SELECT id,name FROM inventory_categories WHERE id=? AND active=1").get(categoryId);
      if(!category)return sendJson(res,404,{error:"Category not found"});
      const now=Date.now();
      database.exec("BEGIN IMMEDIATE");
      try{
        database.prepare("UPDATE inventory_products SET category_id=NULL,updated_at=? WHERE category_id=?").run(now,categoryId);
        database.prepare("DELETE FROM inventory_categories WHERE id=?").run(categoryId);
        database.exec("COMMIT");
      }catch(error){database.exec("ROLLBACK");throw error;}
      broadcast({type:"inventory-update",action:"category-deleted",updatedAt:now});
      broadcast({type:"boat-duty-update",action:"inventory-menu",updatedAt:now});
      return sendJson(res,200,{deleted:true});
    }
    if (req.method === "POST" && path === "/api/inventory/adjustments") {
      const body = await readJsonBody(req); const locationId = Number(body.locationId); const productId = Number(body.productId); const delta = Number(body.quantityDelta);
      const product = database.prepare("SELECT id,is_bundle FROM inventory_products WHERE id=? AND active=1").get(productId);
      if (!Number.isInteger(locationId) || !product || !Number.isFinite(delta) || delta === 0) throw boatDutyValidationError("Choose a product and enter a non-zero quantity");
      applyInventoryMovement({ locationId, productId, delta, type: "adjustment", note: body.note, userId: req.authUser.id });
      broadcast({ type: "inventory-update", action: "adjustment", updatedAt: Date.now() }); return sendJson(res, 200, { saved: true });
    }
    if (req.method === "POST" && path === "/api/inventory/conversions") {
      const body = await readJsonBody(req); const locationId=Number(body.locationId); const bundleId=Number(body.bundleProductId); const quantity=Number(body.quantity); const direction=body.direction;
      const bundle=database.prepare("SELECT id,name FROM inventory_products WHERE id=? AND is_bundle=1 AND active=1").get(bundleId); const components=database.prepare("SELECT component_product_id,quantity FROM inventory_bundle_items WHERE bundle_product_id=?").all(bundleId);
      if(!Number.isInteger(locationId)||!bundle||!(quantity>0)||!["pack","unpack"].includes(direction)||!components.length) throw boatDutyValidationError("Choose a location, bulk box, direction and positive quantity");
      database.exec("BEGIN IMMEDIATE");
      try {
        if(direction==="pack") { for(const row of components) applyInventoryMovement({locationId,productId:row.component_product_id,delta:-(row.quantity*quantity),type:"bundle_pack",note:`Packed into ${bundle.name}`,userId:req.authUser.id,inTransaction:true}); applyInventoryMovement({locationId,productId:bundleId,delta:quantity,type:"bundle_pack",note:`Packed ${bundle.name}`,userId:req.authUser.id,inTransaction:true}); }
        else { applyInventoryMovement({locationId,productId:bundleId,delta:-quantity,type:"bundle_unpack",note:`Unpacked ${bundle.name}`,userId:req.authUser.id,inTransaction:true}); for(const row of components) applyInventoryMovement({locationId,productId:row.component_product_id,delta:row.quantity*quantity,type:"bundle_unpack",note:`Unpacked from ${bundle.name}`,userId:req.authUser.id,inTransaction:true}); }
        database.exec("COMMIT");
      } catch(error){database.exec("ROLLBACK");throw error;}
      broadcast({type:"inventory-update",action:direction,updatedAt:Date.now()}); return sendJson(res,200,{saved:true});
    }
    if (req.method === "POST" && path === "/api/inventory/issues") {
      const body = await readJsonBody(req); const locationId = Number(body.locationId); const assignmentId = Number(body.assignmentId); const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!Number.isInteger(locationId) || !Number.isInteger(assignmentId) || !lines.length) throw boatDutyValidationError("Choose a location, boat and at least one product");
      const requirements = new Map();
      for (const line of lines) { const productId=Number(line.productId); const quantity=Number(line.quantity); if (!Number.isInteger(productId) || !(quantity>0)) throw boatDutyValidationError("Every issue line needs a product and positive quantity"); const product=database.prepare("SELECT id FROM inventory_products WHERE id=? AND active=1").get(productId); if(!product) throw boatDutyValidationError("Product not found"); requirements.set(productId,(requirements.get(productId)||0)+quantity); }
      database.exec("BEGIN IMMEDIATE");
      try { const assignedBoat=database.prepare("SELECT boat_id,service_date FROM boat_day_assignments WHERE id=?").get(assignmentId); if(!assignedBoat)throw boatDutyValidationError("Boat assignment not found"); for (const [productId, quantity] of requirements) { applyInventoryMovement({ locationId, productId, delta: -quantity, type: "boat_issue", assignmentId, note: body.note, userId: req.authUser.id, inTransaction: true }); database.prepare(`INSERT INTO boat_inventory(boat_id,service_date,product_id,onboard_quantity,requested_quantity,updated_by,updated_at) VALUES(?,?,?, ?,0,?,?) ON CONFLICT(boat_id,service_date,product_id) DO UPDATE SET onboard_quantity=boat_inventory.onboard_quantity+excluded.onboard_quantity,requested_quantity=MAX(0,boat_inventory.requested_quantity-excluded.onboard_quantity),updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(assignedBoat.boat_id,assignedBoat.service_date,productId,quantity,req.authUser.id,Date.now()); } database.exec("COMMIT"); }
      catch(error){ database.exec("ROLLBACK"); throw error; }
      const issuedAssignment=database.prepare("SELECT service_date FROM boat_day_assignments WHERE id=?").get(assignmentId); broadcast({ type: "inventory-update", action: "boat-issue", assignmentId, updatedAt: Date.now() }); if(issuedAssignment)broadcast({type:"boat-duty-update",action:"inventory-issued",assignmentId,serviceDate:issuedAssignment.service_date,updatedAt:Date.now()}); return sendJson(res, 200, { saved: true });
    }
    sendJson(res, 404, { error: "Inventory endpoint not found" });
  } catch (error) { const status=error.statusCode || (String(error.message).includes("UNIQUE")?409:500); console.error("Inventory API error", status<500?error.message:error); sendJson(res,status,{error:status<500?error.message:"Inventory request failed"}); }
}

function applyInventoryMovement({ locationId, productId, delta, type, assignmentId = null, note = "", userId, inTransaction = false }) {
  const current = Number(database.prepare("SELECT quantity FROM inventory_stock WHERE location_id=? AND product_id=?").get(locationId,productId)?.quantity || 0); const next=current+delta;
  if (next < 0) { const product=database.prepare("SELECT name FROM inventory_products WHERE id=?").get(productId); throw boatDutyValidationError(`Not enough stock for ${product?.name || "product"} (${current} available)`); }
  const now=Date.now(); database.prepare(`INSERT INTO inventory_stock(location_id,product_id,quantity,updated_at) VALUES(?,?,?,?) ON CONFLICT(location_id,product_id) DO UPDATE SET quantity=excluded.quantity,updated_at=excluded.updated_at`).run(locationId,productId,next,now);
  database.prepare("INSERT INTO inventory_movements(location_id,product_id,quantity_delta,movement_type,assignment_id,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)").run(locationId,productId,delta,type,assignmentId,String(note||"").slice(0,300),userId,now);
}

function normalizePhoneForLogin(value) {
  try { return normalizePhoneNumber(value); } catch { return null; }
}

async function handleFleetApi(req, requestUrl, res) {
  const path = requestUrl.pathname;

  try {
    if (req.method === "GET" && path === "/api/fleet/statistics") {
      const input = Object.fromEntries(requestUrl.searchParams);
      try {
        const range = statisticsRange(input);
        if (range.operator !== 'all' && range.operator !== 'unassigned' && !operatorById(range.operator)) throw new Error('Onbekende rederij.');
        if (range.mmsi && !/^\d{9}$/.test(range.mmsi)) throw new Error('Ongeldig MMSI.');
      } catch (error) { return sendJson(res, 400, { error: error.message }); }
      const key = JSON.stringify(Object.entries(input).filter(([key]) => ['from','to','operator','mmsi','hour','includeUnassigned'].includes(key)).sort());
      let cached = fleetStatisticsCache.get(key);
      if (!cached || cached.expiresAt < Date.now()) {
        if (fleetStatisticsCache.size >= 16) fleetStatisticsCache.delete(fleetStatisticsCache.keys().next().value);
        const promise = databaseReads.run('fleet-statistics', input).catch((error) => { fleetStatisticsCache.delete(key); throw error; });
        cached = { promise, expiresAt: Date.now() + 60_000 };
        fleetStatisticsCache.set(key, cached);
      }
      return sendJson(res, 200, await cached.promise, "public, max-age=30");
    }

    if (req.method === "GET" && path === "/api/fleet/leaderboard") {
      const date = requestUrl.searchParams.get("date") || amsterdamRaceDate();
      const bounds = amsterdamDayBounds(date);
      if (!bounds) return sendJson(res, 400, { error: "Use a valid date in YYYY-MM-DD format" });
      const requestedOperator = requestUrl.searchParams.get("operator") || "all";
      if (requestedOperator !== "all" && requestedOperator !== "unassigned" && !operatorById(requestedOperator)) return sendJson(res, 400, { error: "Unknown operator" });
      const assignments = operatorStore.read();
      const groups = publicOperatorGroups(database, assignments);
      const storedBoats = database.prepare("SELECT id, name, mmsi, operator_id FROM fleet_boats WHERE active = 1 ORDER BY name").all();
      const directories = buildOperatorDirectories(storedBoats, groups, assignments);
      const boats = directories.filter((directory) => requestedOperator === "all" || directory.id === requestedOperator)
        .flatMap((directory) => directory.boats.map((boat) => ({ id: boat.mmsi ? `mmsi:${boat.mmsi}` : `name:${directory.id}:${boat.name}`, name: boat.name, mmsi: boat.mmsi || null, operatorId: directory.id, operatorName: directory.name })));
      const positions = database.prepare(`
        SELECT mmsi, latitude, longitude, speed, received_at
        FROM positions WHERE received_at >= ? AND received_at < ?
        AND mmsi IN (SELECT value FROM json_each(?))
        ORDER BY mmsi, received_at
      `).all(bounds.from, bounds.to, JSON.stringify(boats.map((boat) => boat.mmsi).filter(Boolean)));
      const entries = calculateFleetDistances(boats, positions);
      const coverageUntil = Math.min(bounds.to, Date.now());
      const expectedSlots = Math.max(1, Math.ceil((coverageUntil - bounds.from) / (5 * 60_000)));
      const coveredSlots = coverageUntil > bounds.from ? Number(database.prepare(`
        SELECT COUNT(DISTINCT CAST((received_at - ?) / 300000 AS INTEGER)) AS count
        FROM positions WHERE received_at >= ? AND received_at < ?
        AND mmsi IN (SELECT value FROM json_each(?))
      `).get(bounds.from, bounds.from, coverageUntil, JSON.stringify(boats.map((boat) => boat.mmsi).filter(Boolean)))?.count || 0) : 0;
      const coveragePercent = Math.min(100, Math.round(coveredSlots / expectedSlots * 100));
      sendJson(res, 200, {
        date, operator: requestedOperator, entries, operators: directories.filter((directory) => directory.id !== "unassigned").map((directory) => ({ id: directory.id, name: directory.name, boatCount: directory.boats.length })), coveragePercent,
        complete: coveragePercent >= 85,
        calculatedAt: new Date().toISOString(),
      }, "public, max-age=30, stale-while-revalidate=60");
      return;
    }

    if (req.method === "GET" && path === "/api/fleet/summary") {
      const date = requestUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const cacheKey = `guest:${date}`;
      const cached = !req.authUser ? fleetSummaryCache.get(cacheKey) : null;
      if (cached?.expiresAt > Date.now()) {
        sendJson(res, 200, cached.value, "public, max-age=15, s-maxage=15, stale-while-revalidate=30");
        return;
      }
      const boats = database.prepare(`
        SELECT b.id, b.name, b.mmsi, b.operator_id, b.registration, b.capacity, b.notes, b.active,
               b.license_required, b.open_boat, b.length_m, b.width_m, b.boat_type,
               b.propulsion, b.home_dock, b.has_toilet, b.niceness_rating, b.photo_mime, b.photo_verified, b.photo_verified_mmsi, b.photo_verified_name, b.created_at, b.updated_at,
               v.data AS ais_data
        FROM fleet_boats b
        LEFT JOIN vessels v ON v.mmsi = b.mmsi
        WHERE b.active = 1
        ORDER BY b.name
      `).all().map((boat) => sanitizeFleetBoatForUser(formatFleetBoat(boat), req.authUser));
      const assignments = canReadFlagshipPlanning(req.authUser) ? database.prepare(`
        SELECT a.*, b.name AS boat_name, b.mmsi
        FROM fleet_assignments a
        LEFT JOIN fleet_boats b ON b.id = a.boat_id
        WHERE a.service_date = ?
        ORDER BY COALESCE(a.start_time, '99:99'), b.name
      `).all(date) : [];
      const planning = canReadFlagshipPlanning(req.authUser) ? database.prepare(`
        SELECT p.boat_id, p.boat_name, p.start_time, p.end_time, p.person_name,
               p.role, p.event_type, p.from_location, p.to_location,
               i.location AS group_location, b.mmsi
        FROM planning_items p
        JOIN planning_imports i ON i.id = p.import_id
        LEFT JOIN fleet_boats b ON b.id = p.boat_id
        WHERE p.service_date = ?
        ORDER BY COALESCE(p.start_time, '99:99'), p.id
      `).all(date) : [];
      const summary = { date, boats, assignments, planning };
      if (!req.authUser) fleetSummaryCache.set(cacheKey, { value: summary, expiresAt: Date.now() + 15_000 });
      sendJson(res, 200, summary, req.authUser ? "no-store" : "public, max-age=15, s-maxage=15, stale-while-revalidate=30");
      return;
    }

    if (req.method === "POST" && path === "/api/fleet/boats") {
      const body = await readJsonBody(req);
      if (Object.hasOwn(body, "operatorId") && body.operatorId !== null && !operatorById(body.operatorId)) return sendJson(res, 400, { error: "Unknown operator" });
      if (!body.name?.trim()) return sendJson(res, 400, { error: "Boat name is required" });
      if (!body.homeDock?.trim()) return sendJson(res, 400, { error: "Docking location is required" });
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
      if (Object.hasOwn(body, "operatorId")) {
        database.prepare("UPDATE fleet_boats SET operator_id = ? WHERE id = ?").run(body.operatorId, result.lastInsertRowid);
        if (normalizeMmsi(body.mmsi)) operatorStore.write(normalizeMmsi(body.mmsi), body.operatorId, req.authUser.id);
      }
      fleetSummaryCache.clear();
      sendJson(res, 201, getFleetBoat(result.lastInsertRowid));
      return;
    }

    const companyMembershipMatch = path.match(/^\/api\/fleet\/company-membership\/(\d{9})$/);
    if (companyMembershipMatch && req.method === "PUT") {
      const mmsi = normalizeMmsi(companyMembershipMatch[1]);
      const body = await readJsonBody(req);
      const existing = database.prepare("SELECT id, name FROM fleet_boats WHERE mmsi = ?").get(mmsi);
      const now = Date.now();

      if (!body.included) {
        if (existing) database.prepare("UPDATE fleet_boats SET active = 0, updated_at = ? WHERE id = ?").run(now, existing.id);
        if (existing) fleetSummaryCache.clear();
        sendJson(res, 200, { included: false, mmsi });
        return;
      }

      let aisName = cleanOptional(body.name);
      if (!aisName) {
        try {
          const vessel = database.prepare("SELECT data FROM vessels WHERE mmsi = ?").get(mmsi);
          aisName = cleanOptional(vessel?.data ? JSON.parse(vessel.data).name : null);
        } catch { /* Fall back to an AIS-number label below. */ }
      }
      if (existing) {
        const nextName = /^AIS \d{9}$/i.test(existing.name) && aisName ? aisName : existing.name;
        database.prepare("UPDATE fleet_boats SET name = ?, active = 1, updated_at = ? WHERE id = ?")
          .run(nextName, now, existing.id);
        fleetSummaryCache.clear();
        sendJson(res, 200, { included: true, boat: getFleetBoat(existing.id) });
        return;
      }

      const result = database.prepare(`
        INSERT INTO fleet_boats (name, mmsi, active, created_at, updated_at)
        VALUES (?, ?, 1, ?, ?)
      `).run(aisName || `AIS ${mmsi}`, mmsi, now, now);
      fleetSummaryCache.clear();
      sendJson(res, 201, { included: true, boat: getFleetBoat(result.lastInsertRowid) });
      return;
    }

    const boatMatch = path.match(/^\/api\/fleet\/boats\/(\d+)$/);
    if (boatMatch && req.method === "PUT") {
      const body = await readJsonBody(req);
      if (Object.hasOwn(body, "operatorId") && body.operatorId !== null && !operatorById(body.operatorId)) return sendJson(res, 400, { error: "Unknown operator" });
      if (!body.name?.trim()) return sendJson(res, 400, { error: "Boat name is required" });
      if (!body.homeDock?.trim()) return sendJson(res, 400, { error: "Docking location is required" });
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
      if (Object.hasOwn(body, "operatorId")) {
        database.prepare("UPDATE fleet_boats SET operator_id = ? WHERE id = ?").run(body.operatorId, boatMatch[1]);
        if (normalizeMmsi(body.mmsi)) operatorStore.write(normalizeMmsi(body.mmsi), body.operatorId, req.authUser.id);
      }
      fleetSummaryCache.clear();
      sendJson(res, 200, getFleetBoat(boatMatch[1]));
      return;
    }

    const photoMatch = path.match(/^\/api\/fleet\/boats\/(\d+)\/photo$/);
    if (photoMatch && req.method === "GET") {
      const photo = database.prepare("SELECT photo, photo_mime, name, mmsi, photo_verified, photo_verified_mmsi, photo_verified_name FROM fleet_boats WHERE id = ?").get(photoMatch[1]);
      if (!photo?.photo || !hasVerifiedBoatPhoto(photo)) return sendJson(res, 404, { error: "No verified photo available" }, "no-store");
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
      database.prepare("UPDATE fleet_boats SET photo = ?, photo_mime = ?, photo_verified = 1, photo_verified_mmsi = mmsi, photo_verified_name = name, updated_at = ? WHERE id = ?")
        .run(photo, match[1], Date.now(), photoMatch[1]);
      fleetSummaryCache.clear();
      sendJson(res, 200, { photoUrl: `/api/fleet/boats/${photoMatch[1]}/photo?v=${Date.now()}`, photoVerified: true });
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
      const staffRows = database.prepare(`
        SELECT s.*, i.external_message_id, i.sender, i.received_at
        FROM planning_staff s
        JOIN planning_imports i ON i.id = s.import_id
        WHERE s.service_date = ?
        ORDER BY CASE s.role WHEN 'ops' THEN 1 WHEN 'runner' THEN 2 ELSE 3 END, s.person_name
      `).all(date);
      const staff = deduplicateDayStaff(staffRows);
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
      const consolidatedItems = consolidateDayPlanning(items);
      const day = { date, locations, items: annotateTourPerformance(consolidatedItems, date), staff };
      sendJson(res, 200, day);
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
      sendJson(res, 200, whatsapp.getState());
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
    if (!message.externalMessageId) return;
    const existingImport = database.prepare("SELECT id, status FROM planning_imports WHERE external_message_id = ?").get(message.externalMessageId);
    // Images can arrive before their separate WhatsApp caption. Reprocess the
    // same image when that later caption supplies boat/driver/host context.
    if (existingImport?.status === "imported" && !message.contextText) return;
    const context = parseDatedPlanningGroup(message.chatTitle, message.receivedAt);
    if (!context) return console.log(`Ignored WhatsApp image: no dated location in ${message.chatTitle}`);
    if (!isNearPlanningDate(message.receivedAt, context.serviceDate)) return console.log(`Ignored WhatsApp image outside ${context.serviceDate} window: ${message.chatTitle}`);
    const storedContext = !message.contextText ? nearestPlanningMessageContext(message.chatId, message.receivedAt) : null;
    const effectiveContextText = message.contextText || storedContext?.text || "";
    const knownBoats = database.prepare("SELECT name FROM fleet_boats WHERE active = 1 ORDER BY length(name) DESC").all().map(({ name }) => name);
    const mimeType = message.mimeType === "image/png" || message.mimeType === "image/webp" ? message.mimeType : "image/jpeg";
    const analysis = await analyzePlanningImage(`data:${mimeType};base64,${message.image.toString("base64")}`, knownBoats, effectiveContextText);
    const locationDefaultBoat = defaultPlanningBoatForLocation(context.location);
    let accepted = selectCredibleWhatsAppPlanning(analysis.text, analysis.items);
    if (locationDefaultBoat && accepted.length) accepted = accepted.map((item) => ({ ...item, boat: locationDefaultBoat,
      notes: [item.notes, `Fixed boat for ${context.location}`].filter(Boolean).join(" · ") }));
    if (!accepted.length) {
      const unassigned = parseStaffingPlanning(analysis.text, "", [...knownBoats, "UNASSIGNED"], "UNASSIGNED").items
        .filter((item) => item.boat === "UNASSIGNED" && item.eventType === "shift");
      const existingCrew = database.prepare(`
        SELECT p.boat_name AS boatName, p.start_time AS startTime, p.end_time AS endTime, p.role
        FROM planning_items p JOIN planning_imports i ON i.id = p.import_id
        WHERE p.service_date = ? AND p.event_type = 'shift' AND i.external_message_id <> ?
      `).all(context.serviceDate, message.externalMessageId);
      const matchedBoat = locationDefaultBoat || matchCrewFingerprint(unassigned, existingCrew);
      if (matchedBoat) accepted = unassigned.map((item) => ({ ...item, boat: matchedBoat,
        notes: "Boat matched by unique same-day crew fingerprint" }));
    }
    const locationStaff = analysis.staff.filter((member) => ['runner', 'ops', 'kade'].includes(member.role)
      && isCredibleCrewName(member.person));
    if (!accepted.length && !locationStaff.length) {
      recordUnresolvedPlanningImage(message, context, analysis);
      return console.log(`Kept unresolved WhatsApp image for a later rescan: ${message.chatTitle}`);
    }
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
      sourceContextText: effectiveContextText,
      sourceOcrTsv: analysis.tsv,
      sourceImageHash: analysis.imageHash,
      sourceImagePath: analysis.imagePath,
      imageType: "whatsapp-read-only",
      snapshot: false,
      force: Boolean(existingImport),
      items,
      staff: locationStaff.map((member) => ({ ...member, location: context.location })),
    });
    deduplicateWhatsAppPlanningRows(context.serviceDate, context.location);
    console.log(`Imported ${items.length} planning rows and ${locationStaff.length} location staff from ${message.chatTitle}`);
  } catch (error) {
    console.error(`Could not import read-only WhatsApp planning from ${message.chatTitle}`, error.message);
  }
}

function nearestPlanningMessageContext(chatId, receivedAt) {
  return database.prepare(`
    SELECT text, received_at FROM planning_message_contexts
    WHERE chat_id = ? AND received_at BETWEEN ? AND ? AND instr(text, '@') > 0
    ORDER BY abs(received_at - ?) LIMIT 1
  `).get(chatId, Number(receivedAt) - 3 * 60_000, Number(receivedAt) + 3 * 60_000, Number(receivedAt));
}

function defaultPlanningBoatForLocation(location) {
  const normalized = String(location || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  return /\bCOOKIE(?:\s+TOURS?)?\b/.test(normalized) ? "HERMAN BROOD" : null;
}

function recordUnresolvedPlanningImage(message, context, analysis) {
  database.prepare(`
    INSERT INTO planning_imports
    (external_message_id, chat_id, chat_title, sender, received_at, service_date, location,
     source_text, source_context_text, source_ocr_tsv, source_image_hash, source_image_path, image_type, status, item_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'whatsapp-read-only', 'needs-review', 0, ?)
    ON CONFLICT(external_message_id) DO UPDATE SET
      source_text = excluded.source_text, source_context_text = excluded.source_context_text, source_ocr_tsv = excluded.source_ocr_tsv,
      source_image_hash = excluded.source_image_hash, source_image_path = excluded.source_image_path,
      status = 'needs-review'
  `).run(message.externalMessageId, message.chatId, message.chatTitle, message.sender, message.receivedAt,
    context.serviceDate, context.location, analysis.text, cleanOptional(message.contextText), analysis.tsv, analysis.imageHash, analysis.imagePath, Date.now());
}

function importReadOnlyWhatsAppLocationStaff(message) {
  try {
    if (message.externalMessageId && message.chatId && message.text) {
      database.prepare(`
        INSERT INTO planning_message_contexts (external_message_id, chat_id, received_at, text, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(external_message_id) DO UPDATE SET text = excluded.text, received_at = excluded.received_at
      `).run(message.externalMessageId, message.chatId, Number(message.receivedAt), message.text, Date.now());
    }
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

function isInstructionPoster(value) {
  return /KLEARLY|PAYMENT\s+DEVICES|MAPS\s*&\s*VHF|VIATOR|REBOOK|BRACELET|COOKIES\s+STATEMENT/i.test(String(value || ""));
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
        if (isInstructionPoster(planningImport.source_text) || !['runner', 'ops', 'kade'].includes(member.role) || !isCredibleCrewName(member.person_name)) {
          database.prepare("DELETE FROM planning_staff WHERE id = ?").run(member.id);
        }
      }
      const count = database.prepare("SELECT COUNT(*) AS count FROM planning_items WHERE import_id = ?").get(planningImport.id).count;
      if (!count) database.prepare("UPDATE planning_imports SET item_count = 0, status = 'needs-review' WHERE id = ?").run(planningImport.id);
      else database.prepare("UPDATE planning_imports SET item_count = ?, status = 'imported' WHERE id = ?").run(count, planningImport.id);
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
      if (!count) database.prepare("UPDATE planning_imports SET item_count = 0, status = 'needs-review' WHERE id = ?").run(planningImport.id);
      else database.prepare("UPDATE planning_imports SET item_count = ?, status = 'imported' WHERE id = ?").run(count, planningImport.id);
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
       source_text, source_context_text, source_ocr_tsv, source_image_hash, source_image_path, image_type, status, item_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?)
    `).run(
      externalMessageId,
      cleanOptional(body.chatId),
      cleanOptional(body.chatTitle),
      cleanOptional(body.sender),
      receivedAt,
      serviceDate,
      cleanOptional(body.location),
      cleanOptional(body.sourceText),
      cleanOptional(body.sourceContextText),
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
      (import_id, service_date, person_name, role, location, start_time, end_time, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of staff) {
      insertStaff.run(importId, serviceDate, item.personName, item.role, item.location,
        item.startTime, item.endTime, item.notes, now);
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
    startTime: normalizePlanningTime(item.startTime, `staff[${index}].startTime`),
    endTime: normalizePlanningTime(item.endTime, `staff[${index}].endTime`),
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
    COOKIE: "HERMAN BROOD",
    "COOKIE TOUR": "HERMAN BROOD",
    "COOKIE TOURS": "HERMAN BROOD",
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
  return { DRIVER: "skipper", SL: "skipper", SKIPPER: "skipper", H: "host", HOST: "host", GUIDE: "host", SOLO: "host" }[role]
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
    SELECT id, name, mmsi, operator_id, registration, capacity, notes, active, license_required,
      open_boat, length_m, width_m, boat_type, propulsion, home_dock, photo_mime, photo_verified, photo_verified_mmsi, photo_verified_name,
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

  const lastSeenAt = ais?.sourceReceivedAt || ais?.receivedAt
    ? parseAisTime(ais.sourceReceivedAt || ais.receivedAt) : null;
  const age = lastSeenAt ? Date.now() - lastSeenAt : Infinity;
  const aisStatus = age <= 15 * 60 * 1000 ? "working" : age <= 24 * 60 * 60 * 1000 ? "stale" : "offline";

  return {
    ...boat,
    active: Boolean(boat.active),
    open_boat: boat.open_boat === null ? null : Boolean(boat.open_boat),
    has_toilet: boat.has_toilet === null ? null : Boolean(boat.has_toilet),
    photoVerified: hasVerifiedBoatPhoto(boat),
    photoUrl: boat.photo_mime && hasVerifiedBoatPhoto(boat) ? `/api/fleet/boats/${boat.id}/photo?v=${boat.updated_at}` : null,
    ais,
    aisStatus,
    aisLastSeenAt: lastSeenAt,
    ais_data: undefined,
  };
}

function sanitizeFleetBoatForUser(boat, user) {
  if (canUseOperations(user)) return boat;
  return {
    ...boat,
    notes: null,
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
    operator_id: "TEXT",
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
    photo_verified: "INTEGER NOT NULL DEFAULT 0",
    photo_verified_mmsi: "TEXT",
    photo_verified_name: "TEXT",
  };
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) database.exec(`ALTER TABLE fleet_boats ADD COLUMN ${name} ${type}`);
  }
}

function ensureBoatDayListColumns() {
  const existing = new Set(database.prepare("PRAGMA table_info(boat_day_lists)").all().map((column) => column.name));
  if (!existing.has("restock_json")) database.exec("ALTER TABLE boat_day_lists ADD COLUMN restock_json TEXT");
}

function ensureBoatDayAssignmentColumns() {
  const existing = new Set(database.prepare("PRAGMA table_info(boat_day_assignments)").all().map((column) => column.name));
  if (!existing.has("serviced_at")) database.exec("ALTER TABLE boat_day_assignments ADD COLUMN serviced_at INTEGER");
}

function ensureInventoryProductColumns() {
  const existing=new Set(database.prepare("PRAGMA table_info(inventory_products)").all().map(column=>column.name));
  if(!existing.has("show_on_boat_menu"))database.exec("ALTER TABLE inventory_products ADD COLUMN show_on_boat_menu INTEGER NOT NULL DEFAULT 1");
  if(!existing.has("category_id"))database.exec("ALTER TABLE inventory_products ADD COLUMN category_id INTEGER");
}


function ensureIncrementalAutoVacuum() {
  const mode = Number(database.prepare("PRAGMA auto_vacuum").get()?.auto_vacuum);
  if (mode === 2) return;
  console.log("SQLite: enabling incremental auto-vacuum (one-time compaction)");
  database.exec("PRAGMA auto_vacuum = INCREMENTAL; VACUUM;");
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
    source_context_text: "TEXT",
    source_image_hash: "TEXT",
    source_image_path: "TEXT",
    image_type: "TEXT",
  };
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) database.exec(`ALTER TABLE planning_imports ADD COLUMN ${name} ${type}`);
  }
}

function ensurePlanningStaffColumns() {
  const existing = new Set(database.prepare("PRAGMA table_info(planning_staff)").all().map((column) => column.name));
  if (!existing.has("start_time")) database.exec("ALTER TABLE planning_staff ADD COLUMN start_time TEXT");
  if (!existing.has("end_time")) database.exec("ALTER TABLE planning_staff ADD COLUMN end_time TEXT");
}

function deduplicateDayStaff(rows) {
  const seen = new Set();
  return rows.filter((member) => {
    const scope = member.role === "ops" ? "day" : String(member.location || "").toUpperCase();
    const key = [scope, member.role, member.person_name, member.start_time, member.end_time]
      .map((value) => String(value || "").toUpperCase().trim()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  if (!POSITION_MESSAGE_TYPES.has(message.MessageType)) return null;

  const latitude = Number(meta.Latitude ?? data.Latitude);
  const longitude = Number(meta.Longitude ?? data.Longitude);
  if (!validAisCoordinates(latitude, longitude)) return null;
  const gatewayReceivedAtMs = Date.now();
  const parsedSourceAt = Date.parse(meta.time_utc || "");
  const sourceReceivedAt = new Date(Number.isFinite(parsedSourceAt) ? parsedSourceAt : gatewayReceivedAtMs).toISOString();
  const latencyMs = sourceLatencyMs(sourceReceivedAt, gatewayReceivedAtMs);

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
    receivedAt: sourceReceivedAt,
    sourceReceivedAt,
    gatewayReceivedAt: new Date(gatewayReceivedAtMs).toISOString(),
    latencyMs,
    messageType: message.MessageType,
    aisClass: message.MessageType === "PositionReport" ? "A" : "B",
  };
  const shipType = data.Type ?? null;
  const length = getVesselLength(data.Dimension);
  const width = getVesselWidth(data.Dimension);
  if (shipType !== null) position.shipType = shipType;
  if (length !== null) position.length = length;
  if (width !== null) position.width = width;
  if (latencyMs !== null) {
    recentAisLatencies.push(latencyMs);
    if (recentAisLatencies.length > 500) recentAisLatencies.shift();
  }
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
  const authenticatedOnly = message?.type === "boat-duty-update" || message?.type === "inventory-update";
  const serialized = JSON.stringify(message);
  for (const client of clients) {
    if (authenticatedOnly) {
      const user = client.authUserId ? database.prepare('SELECT role FROM users WHERE id = ? AND active = 1').get(client.authUserId) : null;
      if (!canUseOperations(user)) continue;
    }
    sendSerialized(client, serialized);
  }
}

function send(client, message) {
  sendSerialized(client, JSON.stringify(message));
}

function sendSerialized(client, serialized) {
  if (client.readyState !== WebSocket.OPEN) return;
  if (client.bufferedAmount > websocketMaxBufferedBytes) {
    serviceMetrics.websocketDroppedMessages += 1;
    return;
  }
  client.send(serialized);
}

function queueAisBroadcast(message) {
  pendingAisBroadcasts.set(`${message.type}:${message.mmsi}`, message);
}

function flushAisBroadcasts() {
  const messages = [...pendingAisBroadcasts.values()];
  pendingAisBroadcasts.clear();
  if (messages.length) {
    serviceMetrics.aisBatches += 1;
    serviceMetrics.aisMessagesBatched += messages.length;
  }
  const serialized = messages.length ? JSON.stringify({ type: "ais-batch", messages }) : null;
  const now = Date.now();
  for (const client of clients) {
    if (!client.dataSaver) {
      if (serialized) sendSerialized(client, serialized);
      continue;
    }
    queueLatestAis(client.pendingAis, messages);
    if (client.pendingAis.size && now - client.lastAisSentAt >= DATA_SAVER_INTERVAL_MS) {
      send(client, takeAisBatch(client.pendingAis));
      client.lastAisSentAt = now;
    }
  }
}

function getRequestIp(request) {
  const cloudflareIp = String(request.headers["cf-connecting-ip"] || "").trim();
  if (cloudflareIp) return cloudflareIp;
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "unknown";
}

function applicationMetrics() {
  const uptimeSeconds = Math.round((Date.now() - serviceMetrics.startedAt) / 1000);
  return {
    uptimeSeconds,
    requests: serviceMetrics.requests,
    serverErrors: serviceMetrics.errors,
    averageResponseMs: serviceMetrics.requests ? Math.round(serviceMetrics.totalResponseMs / serviceMetrics.requests) : 0,
    eventLoopDelayMs: {
      mean: Number((eventLoopDelay.mean / 1e6).toFixed(1)),
      maximum: Number((eventLoopDelay.max / 1e6).toFixed(1)),
      p99: Number((eventLoopDelay.percentile(99) / 1e6).toFixed(1)),
    },
    memory: process.memoryUsage(),
    websocket: {
      active: clients.size,
      globalLimit: websocketGlobalLimit,
      guestPerIpLimit: websocketGuestPerIpLimit,
      accepted: serviceMetrics.websocketAccepted,
      rejected: serviceMetrics.websocketRejected,
      droppedMessages: serviceMetrics.websocketDroppedMessages,
    },
    ais: {
      batches: serviceMetrics.aisBatches,
      messagesBatched: serviceMetrics.aisMessagesBatched,
      pendingMessages: pendingAisBroadcasts.size,
    },
    ocr: getOcrQueueStats(),
  };
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
    if (!PUBLIC_PAGES[requestPath]) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(req.method === "HEAD" ? undefined : '<!doctype html><html lang="nl"><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Pagina niet gevonden | Boottracker</title><h1>Pagina niet gevonden</h1><p><a href="/">Open de vaarkaart</a> of bekijk de <a href="/amsterdam-routeplanner">Amsterdam routeplanner</a>.</p></html>');
    }
    filePath = join(process.cwd(), "dist", "index.html");
  }
  if (["/km-leaderboard", "/vlootstatistieken"].includes(requestPath)) {
    let html = readFileSync(filePath, "utf8");
    html = html.replace(/<title>[\s\S]*?<\/title>/, "").replace(/<meta[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, "").replace(/<link[^>]*rel="canonical"[^>]*>/g, "");
    html = html.replace("</head>", `${pageHead(requestPath)}</head>`);
    if (requestPath === "/vlootstatistieken") {
      html = html.replace('<h1>Amsterdam routeplanner voor de boot</h1>', '<h1>Vlootstatistieken Amsterdam</h1>')
        .replace('Plan je vaarroute door de Amsterdamse grachten en bekijk bruggen en ontvangen AIS-bootposities met Boottracker.', 'Vergelijk rederijen en bekijk actieve boten, kilometers, vaaruren, vaarwegen en ontvangen AIS-metingen.')
        .replace('De interactieve vaarkaart wordt geladen. JavaScript is nodig voor de kaart; de informatiepagina’s kun je direct openen.', 'Het statistiekdashboard wordt geladen. JavaScript is nodig voor de filters, grafieken en de kaart. Cijfers beschrijven ontvangen AIS-metingen en kunnen onvolledig zijn.');
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    return res.end(req.method === "HEAD" ? undefined : html);
  }
  if (new URL(req.url, "http://localhost").search) res.setHeader("X-Robots-Tag", "noindex, follow");
  return sendAsset(req, res, filePath, mimeTypes[extname(filePath)] || "application/octet-stream",
    relativePath.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache");
}
