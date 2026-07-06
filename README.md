# Boat Tracker

[Demo](https://teuncm.nl/grachtenkaart-kvb-amsterdam/)

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
