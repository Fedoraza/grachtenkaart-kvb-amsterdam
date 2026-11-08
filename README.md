## Development and production

Run `npm run dev` on the laptop for the local **Boottracker · Testversie**. The
test label is displayed in the interface and the browser tab. Local development
uses the laptop's `.env` and `data/ais.sqlite`; it does not update the production
server.

Keep `WHATSAPP_ENABLED=false` on the laptop and set it to `true` only in
production. WhatsApp permits one active linked-device connector, so a local
connector must never compete with the production session.

Production runs separately on `192.168.1.90` from `/home/fedor/boat-tracker`
with `.env.production` and its Docker volume. Changes are deployed only after an
explicit request to publish or push them to production. A normal change request
therefore means: edit and verify the laptop version only.

### Capacity controls

Live AIS updates are combined into short batches and slow WebSocket clients are
skipped before their outbound buffer can grow without limit. Guest connections
are limited per source IP, with a separate global safety limit. Configure these
with `AIS_BATCH_INTERVAL_MS`, `WEBSOCKET_GUEST_PER_IP_LIMIT`,
`WEBSOCKET_GLOBAL_LIMIT`, and `WEBSOCKET_MAX_BUFFERED_BYTES`.

OCR and large AIS-history reads run in worker threads so they do not block map
and WebSocket requests. Public fleet and map responses include short shared-cache
headers. Administrators can inspect request latency, event-loop delay, memory,
WebSocket usage, AIS batching, and the OCR queue at `GET /api/admin/metrics`.

## Public beta deployment

The application can run as a single container with its Vue frontend, Node API,
WebSocket gateway, and SQLite database. Copy `.env.production.example` to
`.env.production`, replace every placeholder, and deploy with:

```sh
docker compose -f compose.beta.yaml up -d --build
```

This compose file starts the named Cloudflare Tunnel configured through
`.env.tunnel`. Set `TUNNEL_TOKEN` in that server-only file before starting the
stack. The tunnel uses host networking so a remotely configured origin of
`http://localhost:5173` reaches the app without exposing the port publicly.

Expose port 5173 through an HTTPS reverse proxy. Keep the `boat-tracker-data`
volume persistent: it contains accounts, fleet data, schedules, AIS history,
uploaded planning images, WhatsApp credentials, and database backups. The
platform health check is `GET /healthz` and does not expose operational data.

Before inviting testers:

1. Use a long random `AUTH_SETUP_TOKEN`; the first administrator must enter it.
2. Open the HTTPS site yourself and create that administrator before sharing it.
3. Create individual viewer accounts in the account menu. Do not share an admin
   login with testers.
4. Confirm `/healthz` returns `{"status":"ok"}` and that login, the map, and the
   live AIS status work through the public hostname.
5. Back up the persistent volume and decide how testers should report feedback.

The beta remains private to signed-in accounts even though its URL is public.
Set `AUTH_SECURE_COOKIE=true`; never put `.env.production` in version control.

### Proxmox

Run the beta inside a dedicated Debian VM, not on the Proxmox VE host. A useful
starting size is 2 vCPU, 4 GB RAM, and a 32 GB disk. Give the VM a fixed LAN IP
and enable **Start at boot** in Proxmox.

Inside the VM, install Docker Engine and the Compose plugin, clone or copy this
repository to `/opt/boat-tracker`, then create the private configuration:

```sh
cd /opt/boat-tracker
cp .env.production.example .env.production
editor .env.production
docker compose --env-file .env.production -f compose.proxmox.yaml up -d --build
```

The Proxmox stack includes Caddy. It obtains and renews the TLS certificate and
proxies HTTP and WebSocket traffic to the application. Before starting it:

1. Set `BETA_DOMAIN` to a DNS name whose A/AAAA record reaches your public IP.
2. Forward TCP 80 and TCP/UDP 443 from the router to the VM's fixed LAN IP.
3. Allow only SSH, HTTP, and HTTPS through the VM and Proxmox firewalls.
4. Generate `AUTH_SETUP_TOKEN` with `openssl rand -hex 32` and configure the AIS
   key and optional WhatsApp planning connection.

Check the deployment with:

```sh
docker compose --env-file .env.production -f compose.proxmox.yaml ps
curl https://beta.example.com/healthz
```

Replace the example hostname in the second command. Open the site and create
the administrator using `AUTH_SETUP_TOKEN` before sending invitations. Useful
operations are:

```sh
# Follow logs
docker compose --env-file .env.production -f compose.proxmox.yaml logs -f

# Deploy a new version after updating the repository
docker compose --env-file .env.production -f compose.proxmox.yaml up -d --build

# Stop without deleting persistent data
docker compose --env-file .env.production -f compose.proxmox.yaml down
```

Use both Proxmox VM backups and an application-level copy of the
`boat-tracker-data` volume. Do not restore an older VM snapshot without
considering the newer operational data that would be lost.

## Install as an app and offline use

Production builds register `public/sw.js` and serve `public/manifest.webmanifest`,
so the map can be installed to a phone's home screen. Development (`npm run dev`)
registers no service worker, so cached code never hides local changes.

After one online visit, the map and route planner work without a connection.
Route calculation runs in the browser; the worker caches the app shell, the
hashed `/assets/` bundles, the canal network (`export.geojson`), visited public
pages and these public reads: bridges, navigation layers (closures), route links,
map objects, operator groups and the Surinamekade water level. Data is fetched
from the network first; the cached copy is only used when the network fails, and
it keeps its own `fetchedAt`/`measuredAt`. An amber notice tells users when they
are offline.

Never cached: account, admin, planning, fleet, inventory and AIS-history APIs,
WebSocket traffic, non-GET requests and other origins. OpenStreetMap tiles are
not cached by the worker because the tile usage policy does not allow offline
use; tiles still in the browser's normal HTTP cache may appear.

When changing caching rules, bump `VERSION` in `public/sw.js` so old caches are
deleted on activation. Regenerate the icons in `public/icons` after changing the
favicon with `node scripts/generate-app-icons.mjs`.

## Run locally with live AIS

The map displays live positions from AISStream for vessels transmitting AIS in
the Amsterdam area. Small boats without an AIS transponder cannot appear.

1. Install dependencies: `npm ci`
2. Create a free key at [aisstream.io/apikeys](https://aisstream.io/apikeys)
3. Copy `.env.example` to `.env`
4. Add your AISStream API key to `.env`
5. Start the app: `npm run dev`
6. Open `http://127.0.0.1:5173/`

The API key is held by the local Node gateway and is never exposed to the
browser. The app still runs without a key, but the AIS status panel reports
that the stream is not configured.

The browser-facing AIS WebSocket contains only normalized vessel fields. It
requires an authenticated session, validates browser origins, is read-only,
and never receives `AISSTREAM_API_KEY`.

AISStream describes its real-time stream as free. It requires a free account
and key; there is no legitimate anonymous browser feed. Position reports from
both AIS Class A and Class B transponders are supported.

The Node server keeps the AIS connection running even when no browser is open.
It stores vessel state and position history in `data/ais.sqlite`, sends an
immediate active-vessel snapshot to new clients, and keeps 30 days of history
by default. Change `AIS_HISTORY_DAYS` in `.env` to adjust retention. History
starts accumulating when this server first runs; AISStream does not supply
retroactive positions.

## Manual schedule image import

Administrators can open **Schedule → Import a schedule image** and upload a
JPEG, PNG, or WebP screenshot. The server reads the image locally with
Tesseract OCR, shows both a plain-language result and the extracted text, and
turns recognized boats and times into editable schedule rows. Review the rows,
choose the service date and location, and then import them. No schedule is
written before this confirmation step.

The most recent manual image for a date and location can be replaced as one
snapshot, preventing duplicate rows. Original images are retained in the
ignored `data/planning-images/` directory. Image recognition may take longer on
the first upload while the OCR worker starts.

The optional WhatsApp linked-device connection can read schedule images from
enabled day groups. History synchronization
is read-only: the application does not send chat messages or automatic replies.

## Accounts and roles

Initial setup creates the first administrator (protected by `AUTH_SETUP_TOKEN`).
After setup, anyone can register with name, email and a password of at least 12
characters through `POST /api/auth/register`. New accounts always have the
`viewer` role; client-supplied roles are ignored. There is no WhatsApp or
employment verification. Existing email/password and phone/password logins remain
valid. The retired verification endpoints return HTTP 410.

Roles:
- `viewer`: normal account; public fleet/map/AIS information and personal routes,
  without internal planning, crew, boat-duty or inventory access.
- `flagship_employee`: Flagship planning and crew information, plus assigned
  boat-duty tasks. An administrator assigns this role in Account → Accounts.
- `harbour`: existing harbour/inventory permissions; no Flagship planning access.
- `admin`: full management access, including role assignment and planning imports.

Planning is enforced by the server and hidden in the UI for ordinary accounts.
Fleet summaries omit assignments, personnel and internal notes for ordinary
accounts. Role changes take effect immediately for API requests and at the next
authentication refresh in the UI (up to one visible minute). Existing accounts
keep their roles during the schema migration; no automatic employee promotion.

Sessions use an HttpOnly SameSite cookie and expire after 30 days. Passwords use
salted scrypt hashes. Set `AUTH_SECURE_COOKIE=true` behind HTTPS. Registration
is rate limited. The role migration preserves IDs, passwords, phone logins and
sessions, and runs on startup. Existing verification records are retained only
until normal retention cleanup; they no longer grant access.

### Usage analytics

Administrators can open **Account → Gebruiksstatistieken** for today's usage or
7, 30 and 90 day reports. The panel shows visits, unique signed-in accounts,
unique guest browsers, page views, foreground activity, currently active users,
a daily breakdown and usage of the map and kilometer leaderboard.

The first-party `/api/analytics/usage` endpoint accepts a page view when the app
opens and a heartbeat every 30 seconds while the page is visible and has been
used in the past two minutes. API polling and live AIS traffic do not count as
page views. Identity is determined by the server's existing authentication
session; clients cannot label themselves as logged-in users. Reports at
`GET /api/admin/usage?days=7` require an administrator account.

A random HttpOnly `boat_usage` cookie identifies guest browsers for up to 90
days; only its hash is stored. Sessions expire after 30 minutes without a signal
and change groups on login/logout. Signed-in users are deduplicated by account;
guests by browser, so a person can occur in both groups. No IP address, full
URL, search text, location, email or user-agent is collected. SQLite stores the
records for 90 days and hourly maintenance removes old data. Historical usage
before this feature was enabled is unavailable. Blocking cookies or requests
can affect the figures.


### Mobiele zoekbalk testen

`npm run test:mobile` voert browserregressietests uit tegen de lokale ontwikkelserver (poort 5173). Een bestaande lokale server wordt hergebruikt. Installeer de testbrowsers indien nodig met `npx playwright install chromium webkit`.

De tests gebruiken WebKit met iPhone 13- en iPhone SE-instellingen, Chrome met Android-instellingen en desktop Chrome. Ze controleren koud laden zonder Vue-fouten, aanraken, invoerfocus, typen, resultaten selecteren, opnieuw openen, Enter, wissen, paneelwisselingen en desktop/mobiel wisselen. De kleinere schermruimte door een toetsenbord wordt via `visualViewport` nagebootst. Dit test geen echt iOS-schermtoetsenbord; daarvoor blijft Safari op een iPhone of een geïnstalleerde iOS-simulator nodig. Screenshots en fouttraces staan in `test-results/`.

### Mobiel dataverbruik

Voor niet-ingelogde bezoekers op mobiele schermen staat **Dataspaarstand** standaard aan. Voor ingelogde gebruikers staat deze standaard uit. De instelling staat onder **Instellingen**, bereikbaar via het Boottracker-menu en via Account. Een handmatige keuze wordt op het apparaat afzonderlijk voor gasten en per account bewaard. Live bootposities worden daarin ongeveer elke vijf seconden gebundeld; volledige AIS-historie blijft op de server behouden. De live verbinding sluit wanneer het tabblad naar de achtergrond gaat en haalt bij terugkeer een actuele momentopname op. Periodieke controles voor planning, vaarlijnen, stremmingen, waterstand en de aanmeldstatus pauzeren eveneens op de achtergrond.

AIS-berichten gebruiken WebSocket-compressie waar de browser dit ondersteunt. De productieserver comprimeert tekstbestanden en JSON; kaartgegevens worden opnieuw gevalideerd en krijgen een lege 304-respons wanneer niets is veranderd. Gewijzigde brug- en kaartgegevens krijgen direct een nieuwe ETag. Kaarttegels laden na een sleep- of zoombeweging met een kleinere tegelbuffer; vlootfoto’s laden pas wanneer ze in de buurt van het zichtbare paneel komen. Externe kaarttegels en luchtfoto’s blijven data gebruiken wanneer je rondkijkt.

`npm run test:mobile` controleert ook de mobiele standaardinstelling, het onthouden van de voorkeur en het pauzeren/hervatten van de live verbinding. Dit zijn lokale tests, zonder publicatie naar productie.
