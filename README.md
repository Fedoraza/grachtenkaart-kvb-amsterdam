## Development and production

Run `npm run dev` on the laptop for the local **Boat Tracker · Testversie**. The
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
   key and WhatsApp verification number.

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
enabled day groups and verify employee phone numbers. History synchronization
is read-only: the application does not send chat messages or automatic replies.

## Accounts and roles

On the first visit, the app asks you to create the initial administrator. No
default password is generated. Administrators can manage boats, WhatsApp setup,
and other accounts. Viewers can read fleet, planning, map, and AIS information,
but server write endpoints reject their changes.

Sessions use an HttpOnly SameSite cookie and expire after 30 days. Passwords are
stored as salted scrypt hashes and require at least 12 characters. When
deploying behind HTTPS, set
`AUTH_SECURE_COOKIE=true` in `.env`.

Employees can also create a read-only account with their name and phone number.
The number must occur in an enabled community day-chat member list. The website
then displays a one-time code which the employee sends privately to the linked
WhatsApp account. The connector never sends replies or confirmation messages;
the website detects the inbound message and then requires the employee to set
and confirm a password. Future sign-ins use the verified phone number and that
password without requiring another WhatsApp message.
