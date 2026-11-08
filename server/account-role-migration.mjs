export function migrateAccountRoles(database) {
  const schema = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || ''
  if (schema.includes("'flagship_employee'")) return
  database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE')
  try {
    database.exec(`CREATE TABLE users_role_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
      phone_e164 TEXT UNIQUE, phone_verified_at INTEGER,
      auth_method TEXT NOT NULL DEFAULT 'password',
      role TEXT NOT NULL CHECK(role IN ('admin','harbour','viewer','flagship_employee')),
      active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    INSERT INTO users_role_migration SELECT id,name,email,password_hash,phone_e164,phone_verified_at,auth_method,role,active,created_at,updated_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_role_migration RENAME TO users;
    COMMIT;`)
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  } finally { database.exec('PRAGMA foreign_keys = ON') }
}
