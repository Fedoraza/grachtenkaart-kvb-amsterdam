# Huidig gegevens- en opslagschema

Gecontroleerd op 20 oktober 2026 tegen broncode en het daadwerkelijke productieschema. Er zijn geen gegevensrecords geëxporteerd. Het exacte SQL-schema, inclusief constraints en indexen, staat in [database-schema-2026-10-20.sql](database-schema-2026-10-20.sql).

## Opslaglagen

| Laag | Opslag | Inhoud |
|---|---|---|
| Bedrijfsgegevens | SQLite `data/ais.sqlite` | Accounts, vloot, planning, voorraad, kaartcorrecties, AIS en gebruiksstatistieken |
| Externe kaartdata | JSON/GeoJSON-bestanden en RAM | Bruggen, stremmingen en andere externe kaartlagen |
| Uploads en verbindingen | Bestanden onder `data/` | Planningafbeeldingen, WhatsApp-sleutels, importmateriaal en back-ups |
| Applicatiegegevens | Bestanden in broncode/build | Vaarwegnetwerk, vaste bronaanvullingen en automatische brugkoppelingen |
| Persoonlijke browsergegevens | localStorage, sessionStorage en cookies | Voorkeuren, eigen routes, groepen, kaartpositie en sessie-identificatie |

Productie draait vanuit `/home/fedor/boat-tracker`. Docker koppelt het persistente volume `boat-tracker-data` aan `/app/data`. De laptop gebruikt een afzonderlijke lokale database. `DATABASE_PATH` kan de standaarddatabase wijzigen.

SQLite gebruikt WAL, foreign keys en een busy timeout. JSON wordt in TEXT-kolommen opgeslagen; bootfoto’s staan als BLOB in de database. Booleans worden meestal als INTEGER 0/1 opgeslagen. Applicatietimestamps zijn doorgaans Unix-milliseconden; dienstdata zijn tekst (`YYYY-MM-DD`), tijden doorgaans `HH:mm`. Bronvelden kunnen eigen datumformaten hebben.

## Alle applicatietabellen

De kolommen hieronder komen uit het actuele productieschema, inclusief eerder toegevoegde kolommen. `sqlite_sequence`, `sqlite_stat1` en `sqlite_stat4` zijn interne SQLite-tabellen en geen bedrijfsobjecten. Er zijn 29 applicatietabellen.

### account_verifications

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `browser_token_hash` | TEXT | ja |  |
| `phone_e164` | TEXT | ja |  |
| `name` | TEXT | ja |  |
| `code_hash` | TEXT | ja |  |
| `status` | TEXT | ja |  |
| `expires_at` | INTEGER | ja |  |
| `verified_at` | INTEGER | nee |  |
| `consumed_at` | INTEGER | nee |  |
| `external_message_id` | TEXT | nee |  |
| `created_at` | INTEGER | ja |  |

### auth_sessions

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `token_hash` | TEXT | ja | 1 |
| `user_id` | INTEGER | ja |  |
| `expires_at` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |

### boat_day_assignments

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `user_id` | INTEGER | ja |  |
| `boat_id` | INTEGER | ja |  |
| `service_date` | TEXT | ja |  |
| `created_by` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |
| `serviced_at` | INTEGER | nee |  |

### boat_day_lists

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `assignment_id` | INTEGER | ja |  |
| `items_json` | TEXT | ja |  |
| `submitted_at` | INTEGER | nee |  |
| `created_at` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |
| `restock_json` | TEXT | nee |  |

### boat_inventory

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `boat_id` | INTEGER | ja | 1 |
| `service_date` | TEXT | ja | 2 |
| `product_id` | INTEGER | ja | 3 |
| `onboard_quantity` | REAL | ja |  |
| `requested_quantity` | REAL | ja |  |
| `updated_by` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |

### fleet_assignments

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `boat_id` | INTEGER | nee |  |
| `service_date` | TEXT | nee |  |
| `start_time` | TEXT | nee |  |
| `end_time` | TEXT | nee |  |
| `skipper` | TEXT | nee |  |
| `guide` | TEXT | nee |  |
| `route` | TEXT | nee |  |
| `status` | TEXT | ja |  |
| `source_message_id` | INTEGER | nee |  |
| `notes` | TEXT | nee |  |
| `created_at` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |

### fleet_boats

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `name` | TEXT | ja |  |
| `mmsi` | TEXT | nee |  |
| `registration` | TEXT | nee |  |
| `capacity` | INTEGER | nee |  |
| `notes` | TEXT | nee |  |
| `active` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |
| `license_required` | TEXT | nee |  |
| `open_boat` | INTEGER | nee |  |
| `length_m` | REAL | nee |  |
| `width_m` | REAL | nee |  |
| `boat_type` | TEXT | nee |  |
| `propulsion` | TEXT | nee |  |
| `home_dock` | TEXT | nee |  |
| `photo` | BLOB | nee |  |
| `photo_mime` | TEXT | nee |  |
| `has_toilet` | INTEGER | nee |  |
| `niceness_rating` | TEXT | nee |  |

### fleet_photo_imports

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `boat_id` | INTEGER | ja | 1 |
| `boat_name` | TEXT | ja |  |
| `mmsi` | TEXT | ja |  |
| `source_page` | TEXT | ja |  |
| `image_url` | TEXT | ja |  |
| `sha256` | TEXT | ja |  |
| `imported_at` | INTEGER | ja |  |

### inventory_bundle_items

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `bundle_product_id` | INTEGER | ja | 1 |
| `component_product_id` | INTEGER | ja | 2 |
| `quantity` | REAL | ja |  |

### inventory_categories

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `name` | TEXT | ja |  |
| `sort_order` | INTEGER | ja |  |
| `active` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |

### inventory_locations

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `name` | TEXT | ja |  |
| `location_type` | TEXT | ja |  |
| `active` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |

### inventory_movements

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `location_id` | INTEGER | ja |  |
| `product_id` | INTEGER | ja |  |
| `quantity_delta` | REAL | ja |  |
| `movement_type` | TEXT | ja |  |
| `assignment_id` | INTEGER | nee |  |
| `note` | TEXT | nee |  |
| `created_by` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |

### inventory_products

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `name` | TEXT | ja |  |
| `sku` | TEXT | nee |  |
| `unit` | TEXT | ja |  |
| `is_bundle` | INTEGER | ja |  |
| `active` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |
| `show_on_boat_menu` | INTEGER | ja |  |
| `category_id` | INTEGER | nee |  |

### inventory_stock

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `location_id` | INTEGER | ja | 1 |
| `product_id` | INTEGER | ja | 2 |
| `quantity` | REAL | ja |  |
| `updated_at` | INTEGER | ja |  |

### map_object_overrides

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `layer` | TEXT | ja | 1 |
| `object_key` | TEXT | ja | 2 |
| `action` | TEXT | ja |  |
| `feature_json` | TEXT | nee |  |
| `updated_by` | INTEGER | nee |  |
| `updated_at` | INTEGER | ja |  |

### planning_imports

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `external_message_id` | TEXT | ja |  |
| `chat_id` | TEXT | nee |  |
| `sender` | TEXT | nee |  |
| `received_at` | INTEGER | nee |  |
| `service_date` | TEXT | ja |  |
| `source_text` | TEXT | nee |  |
| `status` | TEXT | ja |  |
| `item_count` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |
| `chat_title` | TEXT | nee |  |
| `location` | TEXT | nee |  |
| `source_ocr_tsv` | TEXT | nee |  |
| `image_type` | TEXT | nee |  |
| `source_image_hash` | TEXT | nee |  |
| `source_image_path` | TEXT | nee |  |
| `source_context_text` | TEXT | nee |  |

### planning_items

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `import_id` | INTEGER | ja |  |
| `boat_id` | INTEGER | nee |  |
| `boat_name` | TEXT | ja |  |
| `service_date` | TEXT | ja |  |
| `start_time` | TEXT | nee |  |
| `end_time` | TEXT | nee |  |
| `person_name` | TEXT | nee |  |
| `role` | TEXT | nee |  |
| `event_type` | TEXT | ja |  |
| `from_location` | TEXT | nee |  |
| `to_location` | TEXT | nee |  |
| `notes` | TEXT | nee |  |
| `created_at` | INTEGER | ja |  |

### planning_message_contexts

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `external_message_id` | TEXT | ja | 1 |
| `chat_id` | TEXT | ja |  |
| `received_at` | INTEGER | ja |  |
| `text` | TEXT | ja |  |
| `created_at` | INTEGER | ja |  |

### planning_staff

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `import_id` | INTEGER | ja |  |
| `service_date` | TEXT | ja |  |
| `person_name` | TEXT | ja |  |
| `role` | TEXT | ja |  |
| `location` | TEXT | nee |  |
| `notes` | TEXT | nee |  |
| `created_at` | INTEGER | ja |  |
| `start_time` | TEXT | nee |  |
| `end_time` | TEXT | nee |  |

### positions

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `mmsi` | TEXT | ja |  |
| `latitude` | REAL | ja |  |
| `longitude` | REAL | ja |  |
| `speed` | REAL | nee |  |
| `course` | REAL | nee |  |
| `heading` | REAL | nee |  |
| `received_at` | INTEGER | ja |  |

### route_link_overrides

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `bucket` | TEXT | ja | 1 |
| `item_id` | TEXT | ja | 2 |
| `value_json` | TEXT | ja |  |

### shared_routes

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `token` | TEXT | ja | 1 |
| `route_json` | TEXT | ja |  |
| `created_at` | INTEGER | ja |  |
| `expires_at` | INTEGER | ja |  |

### usage_daily

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `session_id` | TEXT | ja | 1 |
| `day` | TEXT | ja | 2 |
| `page` | TEXT | ja | 3 |
| `views` | INTEGER | ja |  |
| `active_seconds` | REAL | ja |  |

### usage_sessions

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | TEXT | ja | 1 |
| `visitor_id` | TEXT | ja |  |
| `user_id` | INTEGER | nee |  |
| `started_at` | INTEGER | ja |  |
| `last_seen` | INTEGER | ja |  |
| `ended_at` | INTEGER | nee |  |

### users

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `name` | TEXT | ja |  |
| `email` | TEXT | ja |  |
| `password_hash` | TEXT | ja |  |
| `phone_e164` | TEXT | nee |  |
| `phone_verified_at` | INTEGER | nee |  |
| `auth_method` | TEXT | ja |  |
| `role` | TEXT | ja |  |
| `active` | INTEGER | ja |  |
| `created_at` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |

### vessels

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `mmsi` | TEXT | ja | 1 |
| `data` | TEXT | ja |  |
| `updated_at` | INTEGER | ja |  |

### whatsapp_chats

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `chat_id` | TEXT | ja | 1 |
| `title` | TEXT | ja |  |
| `enabled` | INTEGER | ja |  |
| `updated_at` | INTEGER | ja |  |
| `linked_parent` | TEXT | nee |  |
| `is_community` | INTEGER | ja |  |
| `is_announcement` | INTEGER | ja |  |

### whatsapp_inbox

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `id` | INTEGER | ja | 1 |
| `raw_text` | TEXT | ja |  |
| `sender` | TEXT | nee |  |
| `message_date` | TEXT | nee |  |
| `status` | TEXT | ja |  |
| `created_at` | INTEGER | ja |  |

### whatsapp_message_anchors

| Kolom | Type | Verplicht | Primaire sleutel |
|---|---|---|---|
| `chat_id` | TEXT | ja | 1 |
| `message_id` | TEXT | ja |  |
| `message_timestamp` | INTEGER | ja |  |
| `from_me` | INTEGER | ja |  |
| `history_requested_at` | INTEGER | nee |  |
| `updated_at` | INTEGER | ja |  |

## Relaties

- `fleet_boats.id` koppelt aan planning, dagtoewijzingen, bootvoorraad, vloottoewijzingen en foto-importherkomst.
- `users.id` koppelt aan inlogsessies, dagtoewijzingen en de uitvoerders van voorraadmutaties.
- `planning_imports.id` koppelt aan `planning_items.import_id` en `planning_staff.import_id`; verwijderen van een import verwijdert deze afhankelijke records.
- `boat_day_assignments.id` koppelt aan daglijsten en voorraadmutaties.
- Voorraadlocaties en producten vormen samen de sleutel van `inventory_stock`; boot, datum en product vormen de sleutel van `boat_inventory`.
- Bundels verwijzen tweemaal naar `inventory_products`: als bundel en als onderdeel.
- `usage_daily.session_id` verwijst naar `usage_sessions.id`.
- MMSI verbindt AIS met vlootboten op applicatieniveau; dit is geen SQL-foreign key.
- `map_object_overrides` en `route_link_overrides` gebruiken logische kaartobjectidentificaties, zonder foreign key naar een brugtabel.
- Niet iedere logische relatie heeft een foreign-keyconstraint. Het SQL-bestand is leidend voor de daadwerkelijk afgedwongen constraints.

## Bruggen en kaartgegevens

Er bestaat geen SQL-tabel `bridges`. Bruggegevens staan in `data/amsterdam-bridges-v5.json` als een GeoJSON FeatureCollection:

```text
FeatureCollection
  source: string
  fetchedAt: Unix-milliseconden
  fisEnrichedCount: integer
  features[]
    type: "Feature"
    id: bronidentificatie
    geometry: GeoJSON-geometrie, doorgaans Polygon
    properties
      name, number, bridgeType, route, updatedAt
      clearanceNap, clearanceAt4mNap, winterWaterLevelNap
      passageWidth
      fisClearanceMeters, fisOpeningName, fisSourceUrl
      fisPassageWidthMeters, fisWidthOpeningName, fisWidthSourceUrl
```

NAP-velden zijn bronhoogtes ten opzichte van NAP. `clearanceNap - winterWaterLevelNap` geeft een berekende vrije hoogte bij winterpeil. FIS-hoogtes zijn nominale doorvaarthoogtes in gesloten stand; ze zijn geen NAP-hoogtes. Maten zijn in meters. Onbekende gemeentelijke waarden zijn `null`; ontbrekende FIS-aanvullingen kunnen afwezige properties zijn.

De server haalt gemeentelijke bruggen en vaste-brugdetails op, vult ontbrekende maten aan vanuit FIS en bewaart het resultaat op schijf en in geheugen. Het bestand wordt bij eerste laden alleen gebruikt als het jonger is dan 24 uur. Een eenmaal geladen geheugencache wordt niet automatisch na 24 uur vernieuwd: herstart of cache-invalidatie is daarvoor nodig.

Handmatige correcties komen bij het API-antwoord boven op deze brondata uit `map_object_overrides`: sleutel `(layer, object_key)`, actie `upsert` of `delete`, GeoJSON in `feature_json`, uitvoerder en wijzigingsdatum. API-antwoorden kunnen bovendien `_mapObjectKey` en `_mapObjectSource` bevatten.

Routekoppelingen staan apart: `route_link_overrides(bucket, item_id, value_json)`, met buckets `bridges` en `reporting`. Ze worden gecombineerd met `src/scripts/automaticBridgeLinks.json` en koppelen objecten aan vaarweglijnen en netwerkposities. Oude browserkoppelingen kunnen bij beheerders naar de server worden gemigreerd.

`public/export.geojson` levert de basiskaart/vaarweggegevens. Aanvullingen en regels staan onder meer in `shared/waterway-edits.mjs`, `src/scripts/supplementalWaterways.js`, `bridgeNavigationRules.js` en `waterkaartBridgeInfo.js`. Deze bestanden zijn onderdeel van de applicatieversie.

## Overige bestanden en tijdelijke gegevens

| Bestand of locatie | Functie |
|---|---|
| `data/navigation-closures-v1.json` | Persistente fallback voor stremmingen |
| `data/planning-images/<hash>.<ext>` | Originele planningafbeeldingen; database bewaart pad, hash en OCR |
| `data/whatsapp-auth/` | Bestanden met WhatsApp-verbindingssleutels en credentials |
| `data/backups/boat-tracker-*.sqlite` | Automatische databaseback-ups |
| `data/fleet-photos-20261017/` | Bewaarde bestanden van de foto-import; gebruikte foto staat ook als BLOB bij de boot |
| `.env.production`, `.env.tunnel` | Serverconfiguratie en geheimen buiten de database |
| Servergeheugen | Laatste AIS-status, uitgaande AIS-batches, kaartlagen, waterstanden, zoekresultaten, vlootsamenvattingen, OCR-tussenresultaten en technische meetwaarden |

Bestandslocaties voor planningafbeeldingen, WhatsApp-auth en back-ups kunnen via omgevingsvariabelen worden gewijzigd. Externe kaarttegels en luchtfoto’s worden bij aanbieders opgehaald; de applicatie bewaart daarvoor geen eigen permanente tegelverzameling.

## Browseropslag

| Opslag | Gegevens |
|---|---|
| localStorage | Taal per gebruiker, databesparing, vlootweergave, AIS-groepen en groepscorrecties |
| localStorage | Opgeslagen eigen routes (`saved-planned-routes-v1`), eigen vaarweglijnen en meldpunten |
| localStorage | Lokale routekoppelingen (`route-link-overrides-v1`), naast de serveropslag |
| sessionStorage | Kaartpositie en zoom (`boat-tracker-map-view`, met oude sleutel als fallback) |
| Cookie `grachten_session` | Inlogtoken; de server bewaart de hash in `auth_sessions` |
| Cookie `boat_usage` | Bezoekersidentificatie; de server bewaart een afgeleide hash voor gebruiksstatistieken |

Browsergegevens worden per browser/origin bewaard. Ze worden niet automatisch op andere apparaten zichtbaar. Geheugen- en HTTP-caches zijn geen zelfstandige blijvende bedrijfsadministratie.

## Bewaartermijnen en back-ups

- AIS-posities: instelbaar via `AIS_HISTORY_DAYS`, standaard 30 dagen, begrensd op 1–30 dagen.
- Gebruiksstatistieken: opschoning na ongeveer 90 dagen volgens de dagelijkse/sessiefilters.
- Gedeelde routes, inlogsessies en verificaties hebben eigen vervaltijden en worden opgeschoond.
- Automatische databaseback-up: bij voldoende ouderdom ongeveer dagelijks; de controle wordt bij starten en iedere zes uur uitgevoerd. Standaard 14 dagen bewaren, instelbaar.
- De automatische SQLite-back-up verwijdert expliciet `positions` en `vessels` uit de back-upkopie. AIS-historie zit daar dus niet in.
- Een SQLite-back-up bevat geen losse planningafbeeldingen of WhatsApp-authbestanden. Het volledige Docker-volume moet apart worden geback-upt om ook die te behouden.
