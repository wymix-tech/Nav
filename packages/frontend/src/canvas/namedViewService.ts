import { normalizeTextKey, validCamera, validTitle, type CanvasCamera } from '@nav/shared'
import { localDatabase as db, clone } from '../services/localDatabase'
export interface NamedView {
  spaceKey: string
  id: string
  version: 1
  name: string
  nameKey: string
  camera: CanvasCamera
  revision: number
  createdAt: string
  updatedAt: string
}
export const viewNameKey = normalizeTextKey
function valid(row: NamedView) {
  return (
    row.version === 1 &&
    validTitle(row.name) &&
    row.nameKey === viewNameKey(row.name) &&
    validCamera(row.camera) &&
    Number.isSafeInteger(row.revision) &&
    row.revision >= 1 &&
    typeof row.id === 'string' &&
    /^[\w-]{1,100}$/.test(row.id) &&
    typeof row.createdAt === 'string' &&
    typeof row.updatedAt === 'string'
  )
}
export async function listNamedViews(spaceKey: string) {
  const rows = await db.namedViews.where('spaceKey').equals(spaceKey).toArray()
  return {
    views: rows
      .filter(valid)
      .sort((a, b) => a.nameKey.localeCompare(b.nameKey) || a.id.localeCompare(b.id)),
    invalid: rows.filter((r) => !valid(r)).length,
  }
}
export async function changeNamedView(
  spaceKey: string,
  action:
    | { type: 'create'; name: string; camera: CanvasCamera }
    | { type: 'rename'; id: string; revision: number; name: string }
    | { type: 'update'; id: string; revision: number; camera: CanvasCamera }
    | { type: 'delete'; id: string; revision: number },
) {
  if (spaceKey.includes(':unconfirmed:') || !spaceKey)
    throw new Error('空间身份未确认，暂不能保存视角')
  return db.transaction('rw', db.namedViews, async () => {
    const now = new Date().toISOString()
    if (action.type === 'create') {
      const rows = await db.namedViews.where('spaceKey').equals(spaceKey).count()
      if (rows >= 50) throw new Error('每个空间最多保存 50 个视角')
      const row: NamedView = {
        spaceKey,
        id: crypto.randomUUID(),
        version: 1,
        name: action.name.trim(),
        nameKey: viewNameKey(action.name),
        camera: clone(action.camera),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }
      if (!valid(row)) throw new Error('视角名称或相机无效')
      await db.namedViews.add(row)
      return row
    }
    const row = await db.namedViews.get([spaceKey, action.id])
    if (!row || row.revision !== action.revision)
      throw new Error('另一标签页已修改或删除此视角，请重新读取')
    if (!valid(row)) throw new Error('视角记录无效或来自未来版本，原数据已保留')
    if (action.type === 'delete') {
      await db.namedViews.delete([spaceKey, row.id])
      return
    }
    if (action.type === 'rename') {
      row.name = action.name.trim()
      row.nameKey = viewNameKey(action.name)
    } else row.camera = clone(action.camera)
    row.revision++
    row.updatedAt = now
    if (!valid(row)) throw new Error('视角名称或相机无效')
    await db.namedViews.put(row)
    return row
  })
}
