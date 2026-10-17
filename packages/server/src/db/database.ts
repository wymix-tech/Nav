import Database from 'better-sqlite3'
import { resolve } from 'path'
import { randomUUID } from 'node:crypto'

const DB_PATH = process.env.NAV_DB_PATH ?? resolve(process.cwd(), 'nav.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS dashboards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    title       TEXT DEFAULT 'Nav - 个人导航页',
    background  TEXT DEFAULT '{}',
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

// Versioned, additive schema upgrades; unexpected SQL failures are not swallowed.
for (const [name, sql] of [
  ['title', "TEXT DEFAULT 'Nav - 个人导航页'"],
  ['background', "TEXT DEFAULT '{}'"],
  ['layout_mode', "TEXT DEFAULT 'grid'"],
  ['viewport', 'TEXT'],
  ['viewport_width', 'INTEGER DEFAULT 1920'],
  ['viewport_height', 'INTEGER DEFAULT 1080'],
  ['state_json', 'TEXT'],
  ['revision', 'INTEGER NOT NULL DEFAULT 0'],
] as const) {
  const columns = db.prepare('PRAGMA table_info(dashboards)').all() as { name: string }[]
  if (!columns.some((c) => c.name === name))
    db.exec(`ALTER TABLE dashboards ADD COLUMN ${name} ${sql}`)
}
if (
  !(db.prepare('PRAGMA table_info(widget_instances)').all() as { name: string }[]).some(
    (c) => c.name === 'canvas',
  )
)
  db.exec('ALTER TABLE widget_instances ADD COLUMN canvas TEXT')
db.exec(`CREATE TABLE IF NOT EXISTS migration_backups(backup_key TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS committed_operations(operation_id TEXT PRIMARY KEY,dashboard_id TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS catalog_metadata(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO catalog_metadata(id) VALUES(1);`)
db.exec('CREATE INDEX IF NOT EXISTS operations_created_at ON committed_operations(created_at)')
db.exec('CREATE TABLE IF NOT EXISTS server_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
db.prepare('INSERT OR IGNORE INTO server_metadata(key,value) VALUES(?,?)').run(
  'instanceId',
  randomUUID(),
)
export const instanceId = (
  db.prepare('SELECT value FROM server_metadata WHERE key=?').get('instanceId') as { value: string }
).value
// Compatibility fields were migrated above.

export default db
