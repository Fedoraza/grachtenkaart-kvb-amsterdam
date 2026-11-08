-- Productieschema uit sqlite_master, 20 oktober 2026. Geen gegevensrecords.
-- SQLite; de applicatie schakelt foreign_keys en WAL in.

CREATE TABLE account_verifications (
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

CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

CREATE TABLE boat_day_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    boat_id INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, serviced_at INTEGER,
    UNIQUE(user_id, service_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (boat_id) REFERENCES fleet_boats(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

CREATE TABLE boat_day_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL UNIQUE,
    items_json TEXT NOT NULL DEFAULT '[]',
    submitted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, restock_json TEXT,
    FOREIGN KEY (assignment_id) REFERENCES boat_day_assignments(id) ON DELETE CASCADE
  );

CREATE TABLE boat_inventory (
    boat_id INTEGER NOT NULL, service_date TEXT NOT NULL, product_id INTEGER NOT NULL,
    onboard_quantity REAL NOT NULL DEFAULT 0, requested_quantity REAL NOT NULL DEFAULT 0,
    updated_by INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (boat_id, service_date, product_id),
    FOREIGN KEY (boat_id) REFERENCES fleet_boats(id), FOREIGN KEY (product_id) REFERENCES inventory_products(id), FOREIGN KEY (updated_by) REFERENCES users(id)
  );

CREATE TABLE fleet_assignments (
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

CREATE TABLE fleet_boats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mmsi TEXT UNIQUE,
    registration TEXT,
    capacity INTEGER,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  , license_required TEXT, open_boat INTEGER, length_m REAL, width_m REAL, boat_type TEXT, propulsion TEXT, home_dock TEXT, photo BLOB, photo_mime TEXT, has_toilet INTEGER, niceness_rating TEXT);

CREATE TABLE fleet_photo_imports (
        boat_id INTEGER PRIMARY KEY REFERENCES fleet_boats(id) ON DELETE CASCADE,
        boat_name TEXT NOT NULL, mmsi TEXT NOT NULL, source_page TEXT NOT NULL,
        image_url TEXT NOT NULL, sha256 TEXT NOT NULL, imported_at INTEGER NOT NULL
      );

CREATE TABLE inventory_bundle_items (
    bundle_product_id INTEGER NOT NULL, component_product_id INTEGER NOT NULL, quantity REAL NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (bundle_product_id, component_product_id),
    FOREIGN KEY (bundle_product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    FOREIGN KEY (component_product_id) REFERENCES inventory_products(id)
  );

CREATE TABLE inventory_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );

CREATE TABLE inventory_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    location_type TEXT NOT NULL CHECK (location_type IN ('harbour', 'warehouse')),
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );

CREATE TABLE inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, location_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    quantity_delta REAL NOT NULL, movement_type TEXT NOT NULL, assignment_id INTEGER, note TEXT,
    created_by INTEGER NOT NULL, created_at INTEGER NOT NULL,
    FOREIGN KEY (location_id) REFERENCES inventory_locations(id), FOREIGN KEY (product_id) REFERENCES inventory_products(id),
    FOREIGN KEY (assignment_id) REFERENCES boat_day_assignments(id), FOREIGN KEY (created_by) REFERENCES users(id)
  );

CREATE TABLE inventory_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, sku TEXT UNIQUE COLLATE NOCASE,
    unit TEXT NOT NULL DEFAULT 'piece', is_bundle INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  , show_on_boat_menu INTEGER NOT NULL DEFAULT 1, category_id INTEGER);

CREATE TABLE inventory_stock (
    location_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL, PRIMARY KEY (location_id, product_id),
    FOREIGN KEY (location_id) REFERENCES inventory_locations(id), FOREIGN KEY (product_id) REFERENCES inventory_products(id)
  );

CREATE TABLE map_object_overrides (
    layer TEXT NOT NULL,
    object_key TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('upsert', 'delete')),
    feature_json TEXT,
    updated_by INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (layer, object_key)
  );

CREATE TABLE planning_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_message_id TEXT NOT NULL UNIQUE,
    chat_id TEXT,
    sender TEXT,
    received_at INTEGER,
    service_date TEXT NOT NULL,
    source_text TEXT,
    status TEXT NOT NULL DEFAULT 'imported',
    item_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  , chat_title TEXT, location TEXT, source_ocr_tsv TEXT, image_type TEXT, source_image_hash TEXT, source_image_path TEXT, source_context_text TEXT);

CREATE TABLE planning_items (
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

CREATE TABLE planning_message_contexts (
    external_message_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

CREATE TABLE planning_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    service_date TEXT NOT NULL,
    person_name TEXT NOT NULL,
    role TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL, start_time TEXT, end_time TEXT,
    FOREIGN KEY (import_id) REFERENCES planning_imports(id) ON DELETE CASCADE
  );

CREATE TABLE positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mmsi TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed REAL,
    course REAL,
    heading REAL,
    received_at INTEGER NOT NULL
  );

CREATE TABLE route_link_overrides (
    bucket TEXT NOT NULL, item_id TEXT NOT NULL, value_json TEXT NOT NULL,
    PRIMARY KEY (bucket, item_id)
  );

CREATE TABLE shared_routes (
    token TEXT PRIMARY KEY,
    route_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

CREATE TABLE sqlite_sequence(name,seq);

CREATE TABLE sqlite_stat1(tbl,idx,stat);

CREATE TABLE sqlite_stat4(tbl,idx,neq,nlt,ndlt,sample);

CREATE TABLE usage_daily (
      session_id TEXT NOT NULL REFERENCES usage_sessions(id) ON DELETE CASCADE,
      day TEXT NOT NULL, page TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0,
      active_seconds REAL NOT NULL DEFAULT 0,
      PRIMARY KEY(session_id, day, page)
    );

CREATE TABLE usage_sessions (
      id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, user_id INTEGER,
      started_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, ended_at INTEGER
    );

CREATE TABLE "users" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        phone_e164 TEXT UNIQUE,
        phone_verified_at INTEGER,
        auth_method TEXT NOT NULL DEFAULT 'password',
        role TEXT NOT NULL CHECK (role IN ('admin', 'harbour', 'viewer')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

CREATE TABLE vessels (
    mmsi TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

CREATE TABLE whatsapp_chats (
    chat_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  , linked_parent TEXT, is_community INTEGER NOT NULL DEFAULT 0, is_announcement INTEGER NOT NULL DEFAULT 0);

CREATE TABLE whatsapp_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_text TEXT NOT NULL,
    sender TEXT,
    message_date TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at INTEGER NOT NULL
  );

CREATE TABLE whatsapp_message_anchors (
    chat_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    message_timestamp INTEGER NOT NULL,
    from_me INTEGER NOT NULL DEFAULT 0,
    history_requested_at INTEGER,
    updated_at INTEGER NOT NULL
  );

CREATE INDEX account_verifications_phone_status ON account_verifications (phone_e164, status, expires_at);

CREATE INDEX auth_sessions_expiry ON auth_sessions (expires_at);

CREATE INDEX boat_day_assignments_date ON boat_day_assignments(service_date);

CREATE INDEX inventory_movements_time ON inventory_movements(created_at DESC);

CREATE INDEX planning_items_boat_date ON planning_items (boat_id, service_date);

CREATE INDEX planning_items_date_time ON planning_items (service_date, start_time);

CREATE INDEX planning_message_contexts_chat_time ON planning_message_contexts (chat_id, received_at);

CREATE INDEX planning_staff_date_role ON planning_staff (service_date, role);

CREATE INDEX positions_mmsi_time ON positions (mmsi, received_at);

CREATE INDEX shared_routes_expiry ON shared_routes (expires_at);

CREATE INDEX usage_daily_day ON usage_daily(day);

CREATE INDEX usage_sessions_seen ON usage_sessions(last_seen);

CREATE INDEX usage_sessions_visitor ON usage_sessions(visitor_id, last_seen);

CREATE UNIQUE INDEX users_phone_e164_unique ON users (phone_e164) WHERE phone_e164 IS NOT NULL;
