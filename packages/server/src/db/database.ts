import Database from 'better-sqlite3'
import { resolve } from 'path'

const DB_PATH = process.env.NAV_DB_PATH ?? resolve(process.cwd(), 'nav.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS dashboards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    columns     INTEGER DEFAULT 12,
    row_height  INTEGER DEFAULT 80,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS widget_instances (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
    widget_id    TEXT NOT NULL,
    source       TEXT NOT NULL,
    config       TEXT,
    layouts      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS installed_widgets (
    widget_id    TEXT PRIMARY KEY,
    manifest     TEXT NOT NULL,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS change_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    operation   TEXT NOT NULL,
    payload     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced      INTEGER DEFAULT 0
  );
`)

export default db
