import { clone } from '../utils/clone'
import { pluginIdentity } from '../services/pluginRuntime'
import { reactive, shallowReactive } from 'vue'
import type { WidgetInstance, InstalledWidget } from '@nav/shared'
import { createChatRuntime, type ChatRuntime } from './chatRuntime'
export type RetentionPolicy = 'reconstructible' | 'stateful-recoverable' | 'opaque-retain'
export interface BookmarkGroup {
  name: string
  bookmarks: { title: string; url: string; icon?: string }[]
}
interface BaseOwner {
  id: string
  typeIdentity: string
  generation: number
  policy: RetentionPolicy
  dispose(reason: string): void
}
export type RuntimeOwner = BaseOwner &
  (
    | { kind: 'chat'; chat: ChatRuntime }
    | { kind: 'search'; state: { query: string; showEngines: boolean } }
    | { kind: 'bookmark'; state: { showConfig: boolean; editingGroups: BookmarkGroup[] } }
    | { kind: 'retained' | 'clock' }
  )
export function typeIdentity(w: WidgetInstance, installed?: InstalledWidget) {
  return JSON.stringify([
    w.source,
    w.widgetId,
    ...(w.source === 'installed' ? [installed ? pluginIdentity(installed) : null] : []),
  ])
}
export function createRuntimeRegistry(options: Parameters<typeof createChatRuntime>[2]) {
  const owners = shallowReactive(new Map<string, RuntimeOwner>())
  const retainedDrafts = new Map<
    string,
    {
      typeIdentity: string
      reason: 'delete' | 'space'
      expires: number
      state:
        | { kind: 'search'; query: string; showEngines: boolean }
        | { kind: 'bookmark'; showConfig: boolean; editingGroups: BookmarkGroup[] }
    }
  >()
  const privateKey = (id: string) => JSON.stringify([spaceKey, id])
  function retain(owner: RuntimeOwner, reason: 'delete' | 'space') {
    if (owner.kind === 'search' || owner.kind === 'bookmark') {
      if (
        reason === 'space' &&
        (owner.kind === 'search'
          ? !owner.state.query && !owner.state.showEngines
          : !owner.state.showConfig)
      )
        return
      retainedDrafts.set(privateKey(owner.id), {
        typeIdentity: owner.typeIdentity,
        reason,
        expires: reason === 'delete' ? Date.now() + 300000 : Infinity,
        state:
          owner.kind === 'search'
            ? { kind: 'search', ...clone(owner.state) }
            : { kind: 'bookmark', ...clone(owner.state) },
      })
      while ([...retainedDrafts.values()].filter((row) => row.reason === 'delete').length > 20) {
        const oldest = [...retainedDrafts].find(([, row]) => row.reason === 'delete')!
        retainedDrafts.delete(oldest[0])
      }
    }
  }
  function estimatedBytes() {
    return (
      [...owners.values()].reduce(
        (n, o) =>
          n +
          (o.kind === 'chat'
            ? o.chat.estimatedBytes()
            : o.kind === 'search'
              ? o.state.query.length * 2
              : o.kind === 'bookmark'
                ? JSON.stringify(o.state.editingGroups).length * 2
                : 0),
        0,
      ) +
      [...retainedDrafts.values()].reduce((n, row) => n + JSON.stringify(row.state).length * 2, 0)
    )
  }
  const attachments = new Map<number, number>()
  let spaceKey = '',
    generation = 0
  function clear(reason: string) {
    for (const owner of owners.values()) {
      retain(owner, 'space')
      owner.dispose(reason)
    }
    owners.clear()
  }
  return {
    owners,
    attach(id: string) {
      const owner = owners.get(id)
      if (!owner) return () => {}
      const generation = owner.generation
      attachments.set(generation, (attachments.get(generation) ?? 0) + 1)
      let released = false
      return () => {
        if (released) return
        released = true
        const count = (attachments.get(generation) ?? 1) - 1
        if (count) attachments.set(generation, count)
        else attachments.delete(generation)
      }
    },
    get spaceKey() {
      return spaceKey
    },
    reconcile(space: string, widgets: WidgetInstance[], installed: InstalledWidget[]) {
      for (const [key, row] of retainedDrafts)
        if (row.expires <= Date.now()) retainedDrafts.delete(key)
      if (space !== spaceKey) {
        clear('空间已切换，生成已中断')
        spaceKey = space
      }
      const ids = new Set(widgets.map((w) => w.id))
      for (const [id, owner] of owners)
        if (!ids.has(id)) {
          retain(owner, 'delete')
          owner.dispose('组件已删除，运行任务已结束')
          owners.delete(id)
        }
      for (const w of widgets) {
        const identity = typeIdentity(
          w,
          installed.find((p) => p.widgetId === w.widgetId),
        )
        let owner = owners.get(w.id)
        if (owner?.typeIdentity !== identity) {
          if (owner) retainedDrafts.delete(privateKey(w.id))
          owner?.dispose('组件类型已替换，运行任务已结束')
          const base = { id: w.id, typeIdentity: identity, generation: ++generation }
          if (w.source === 'builtin' && w.widgetId === 'chat') {
            const chat = createChatRuntime(space, w.id, {
              ...options,
              restore: !owner,
              canStart: () => estimatedBytes() < 32 * 1024 * 1024,
            })
            owner = {
              ...base,
              kind: 'chat',
              policy: 'stateful-recoverable',
              chat,
              dispose: chat.dispose,
            }
          } else if (w.source === 'builtin' && w.widgetId === 'search')
            owner = {
              ...base,
              kind: 'search',
              policy: 'stateful-recoverable',
              state: reactive({ query: '', showEngines: false }),
              dispose() {},
            }
          else if (w.source === 'builtin' && w.widgetId === 'bookmark')
            owner = {
              ...base,
              kind: 'bookmark',
              policy: 'stateful-recoverable',
              state: reactive({ showConfig: false, editingGroups: [] as BookmarkGroup[] }),
              dispose() {},
            }
          else
            owner = {
              ...base,
              kind: w.source === 'builtin' && w.widgetId === 'clock' ? 'clock' : 'retained',
              policy:
                w.source === 'builtin' &&
                ['clock', 'weather', 'monitor', 'docker'].includes(w.widgetId)
                  ? 'reconstructible'
                  : 'opaque-retain',
              dispose() {},
            }
          const saved = retainedDrafts.get(privateKey(w.id))
          if (saved?.typeIdentity === identity && saved.state.kind === owner.kind) {
            if (owner.kind === 'search' && saved.state.kind === 'search')
              Object.assign(owner.state, {
                query: saved.state.query,
                showEngines: saved.state.showEngines,
              })
            if (owner.kind === 'bookmark' && saved.state.kind === 'bookmark')
              Object.assign(owner.state, {
                showConfig: saved.state.showConfig,
                editingGroups: saved.state.editingGroups,
              })
          }
          retainedDrafts.delete(privateKey(w.id))
          owners.set(w.id, owner)
        }
        if (owner.kind === 'chat') owner.chat.updateConfig(w.config)
      }
    },
    endSpace() {
      clear('空间已切换，生成已中断')
    },
    revoke() {
      for (const o of owners.values()) if (o.kind === 'chat') o.chat.revoke()
    },
    checkpoint() {
      for (const o of owners.values()) if (o.kind === 'chat') o.chat.checkpoint()
    },
    diagnostics() {
      return {
        owners: owners.size,
        tombstones: [...retainedDrafts.values()].filter((row) => row.reason === 'delete').length,
        inactiveDrafts: [...retainedDrafts.values()].filter((row) => row.reason === 'space').length,
        views: [...attachments.values()].reduce((n, count) => n + count, 0),
        estimatedBytes: estimatedBytes(),
      }
    },
    dispose() {
      clear('页面已关闭，生成已中断')
      retainedDrafts.clear()
      spaceKey = ''
    },
  }
}
