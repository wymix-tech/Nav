import './env.js'
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const [command, target] = process.argv.slice(2)
const databasePath = process.env.NAV_DB_PATH ?? resolve('nav.db')
if (['canvas-preflight', 'canvas-dry-run', 'canvas-migrate'].includes(command)) {
  // Importing the application database initializes its schema, so reject typos first.
  if (!existsSync(databasePath)) throw new Error(`数据库不存在：${databasePath}`)
  const { migrateCanvasDatabase } = await import('./db/state.js')
  const { default: stateDb } = await import('./db/database.js')
  try {
    console.log(JSON.stringify(migrateCanvasDatabase(command === 'canvas-migrate'), null, 2))
  } finally {
    stateDb.close()
  }
} else if (!['backup', 'preflight'].includes(command)) {
  console.error(
    'Usage: node dist/maintenance.js preflight | backup /absolute/path/backup.db | canvas-preflight | canvas-dry-run | canvas-migrate',
  )
  process.exitCode = 1
} else {
  const db = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  })
  try {
    if (command === 'backup') {
      if (!target || !target.startsWith('/') || existsSync(target))
        throw new Error('备份目标需要是尚不存在的绝对路径')
      await db.backup(target)
      console.log('Database backup complete')
    } else {
      const dashboards = db.prepare('SELECT * FROM dashboards').all() as any[]
      const rows = db.prepare('SELECT * FROM widget_instances').all() as any[]
      const issues = rows.flatMap((w) => {
        try {
          const l = JSON.parse(w.layouts ?? '{}').lg
          return !l ||
            ![l.x, l.y, l.w, l.h].every(Number.isInteger) ||
            l.x < 0 ||
            l.y < 0 ||
            l.w < 1 ||
            l.h < 1
            ? [{ id: w.id, issue: 'invalid-layout' }]
            : []
        } catch {
          return [{ id: w.id, issue: 'invalid-json' }]
        }
      })
      console.log(
        JSON.stringify(
          {
            dashboards: dashboards.length,
            widgets: rows.length,
            issues,
            installedWidgets: (
              db.prepare('SELECT count(*) AS n FROM installed_widgets').get() as any
            ).n,
          },
          null,
          2,
        ),
      )
    }
  } finally {
    db.close()
  }
}
