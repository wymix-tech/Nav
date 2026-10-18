import { validCamera, type CanvasViewPreference } from '@nav/shared'
import { localDatabase as db, clone } from '../services/localDatabase'
// One ordered writer per key. Different tabs deliberately keep independent sessions.
const queues = new Map<string, Promise<void>>()
export async function readViewPreference(key: string) {
  const row = await db.viewPreferences.get(key)
  return row?.version === 1 &&
    validCamera(row.camera) &&
    ['spatial', 'list'].includes(row.presentation)
    ? row
    : null
}
export function writeViewPreference(row: CanvasViewPreference): Promise<void> {
  const next = (queues.get(row.key) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await db.viewPreferences.put(clone(row))
    })
  queues.set(row.key, next)
  return next
}
export async function viewSpaceKey(instanceId: string | undefined, id: string, local: boolean) {
  if (!local) return `server:${instanceId ?? 'unconfirmed'}:${id}`
  return db.transaction('rw', db.backups, async () => {
    let row = await db.backups.get('standalone-space-id')
    if (!row) {
      row = { key: 'standalone-space-id', data: crypto.randomUUID() }
      await db.backups.add(row)
    }
    return `standalone:${row.data}:${id}`
  })
}
