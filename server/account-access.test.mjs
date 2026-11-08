import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { canReadFlagshipPlanning, canUseOperations } from '../shared/account-access.mjs'
import { migrateAccountRoles } from './account-role-migration.mjs'

test('ordinary accounts cannot access Flagship planning or staff operations', () => {
  for (const user of [null,{role:'viewer'},{role:'unknown'},{role:'harbour'}]) assert.equal(canReadFlagshipPlanning(user),false)
  for (const role of ['admin','flagship_employee']) assert.equal(canReadFlagshipPlanning({role}),true)
  assert.equal(canUseOperations({role:'viewer'}),false)
  assert.equal(canUseOperations({role:'harbour'}),true)
})
test('existing roles, phone accounts, password hashes and sessions survive the role migration', () => {
  const db=new DatabaseSync(':memory:')
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,phone_e164 TEXT UNIQUE,phone_verified_at INTEGER,auth_method TEXT NOT NULL DEFAULT 'password',role TEXT NOT NULL CHECK(role IN ('admin','viewer','harbour')),active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
      INSERT INTO users VALUES(5,'Existing staff','staff@example.invalid','existing-hash','+31612345678',123,'phone_password','viewer',1,1,1);
      INSERT INTO auth_sessions VALUES('existing-token',5);`)
    migrateAccountRoles(db)
    assert.equal(db.prepare('SELECT password_hash FROM users WHERE id=5').get().password_hash,'existing-hash')
    assert.equal(db.prepare('SELECT role FROM users WHERE id=5').get().role,'viewer')
    assert.equal(db.prepare('SELECT user_id FROM auth_sessions').get().user_id,5)
    db.exec("UPDATE users SET role='flagship_employee' WHERE id=5")
    migrateAccountRoles(db)
    assert.equal(db.prepare('SELECT role FROM users WHERE id=5').get().role,'flagship_employee')
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  } finally {db.close()}
})
