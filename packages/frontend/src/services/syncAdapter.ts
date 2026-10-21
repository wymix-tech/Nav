import {
  migrateDashboard,
  migrateCanvasDocument,
  validateDashboard,
  validateCurrentDashboard,
  validateCanvasTransition,
  canonical,
  canvasSceneDifferences,
  validateInstalled,
  type Dashboard,
  type InstalledWidget,
  type StorageAdapter,
  type SyncState,
  type RecoveryPreview,
} from '@nav/shared'
import { localDatabase as db, clone, type SyncRow } from './localDatabase'
import { apiJson, ApiError } from './apiClient'
import type { StorageNotice } from './storageEvents'

export class SyncAdapter implements StorageAdapter {
  readonly key = `server:${location.origin}:default`
  private schemaReady = false
  private owner = crypto.randomUUID()
  private observedGeneration = 0
  private observedRevision = 0
  private unsaved = false
  private editing = false
  private externalChange = false
  private sending: Promise<void> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private failures = 0
  private disposed = false
  private heartbeat: ReturnType<typeof setInterval>
  private channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nav-storage') : null
  private cleanups: (() => void)[] = []
  private listen(type: string, listener: EventListener) {
    window.addEventListener(type, listener)
    this.cleanups.push(() => window.removeEventListener(type, listener))
  }
  constructor() {
    this.listen('nav-unsaved-changed', (e) => {
      this.unsaved = !!(e as CustomEvent).detail
    })
    this.listen('nav-editing-changed', (e) => {
      this.editing = !!(e as CustomEvent).detail
    })
    this.listen('online', () => {
      void this.flush()
    })
    this.listen('nav-auth-changed', () => {
      void this.flush()
    })
    this.listen('visibilitychange', () => {
      if (!document.hidden) void this.refresh()
    })
    this.heartbeat = setInterval(() => {
      if (!document.hidden) void this.refresh()
    }, 30000)
    this.channel?.addEventListener('message', (e) => {
      const message = e.data
      // Old tabs send only a key. The store still verifies content before
      // invalidating history, so their idle heartbeats remain harmless.
      if (message === this.key)
        window.dispatchEvent(
          new CustomEvent('nav-storage-changed', {
            detail: { key: this.key, external: true },
          }),
        )
      else if (
        message?.key === this.key &&
        message.source !== this.owner &&
        ['document', 'status'].includes(message.kind)
      )
        window.dispatchEvent(
          new CustomEvent('nav-storage-changed', {
            detail: { ...message, external: message.kind === 'document' },
          }),
        )
    })
  }
  async dispose() {
    this.disposed = true
    this.cleanups.forEach((dispose) => dispose())
    this.cleanups = []
    clearInterval(this.heartbeat)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    await this.sending?.catch(() => {})
    this.channel?.close()
  }
  private changed(external = false, documentChanged = false) {
    if (this.disposed) return
    const notice: StorageNotice = {
      key: this.key,
      source: this.owner,
      kind: documentChanged ? 'document' : 'status',
      generation: this.observedGeneration,
      revision: this.observedRevision,
    }
    window.dispatchEvent(
      new CustomEvent('nav-storage-changed', { detail: { ...notice, external } }),
    )
    this.channel?.postMessage(notice)
  }
  private async refresh() {
    if (this.editing || this.unsaved) return
    try {
      await this.getDashboard()
      this.changed(this.externalChange, this.externalChange)
      this.externalChange = false
      await this.flush()
    } catch {
      /* the last snapshot remains available */
    }
  }
  private async quarantineLegacy() {
    await db.transaction('rw', db.sync, db.backups, async () => {
      const r = await db.sync.get(this.key)
      if (!r) return
      if (
        (r.snapshot.documentVersion ?? 0) > 3 ||
        r.pending.some((op) => (op.snapshot.documentVersion ?? 0) > 3)
      ) {
        const key = `future-document:${this.key}:${r.generation ?? 0}`
        if (!(await db.backups.get(key))) await db.backups.add({ key, data: JSON.stringify(r) })
        r.upgradeRequired = true
        r.error = '未来文档版本，请更新客户端；原草稿已保留'
        await db.sync.put(r)
        return
      }
      if (r.snapshot.documentVersion !== 3) {
        const backupKey = `canvas-cache-v1:${this.key}:${r.generation ?? 0}`
        if (!(await db.backups.get(backupKey)))
          await db.backups.add({ key: backupKey, data: JSON.stringify(r) })
        const seedKey = `canvas-seed:${r.snapshot.instanceId}:${r.snapshot.id}`
        if (!(await db.backups.get(seedKey)))
          await db.backups.add({ key: seedKey, data: JSON.stringify(r.snapshot) })
      }
      if (!r.pending.some((op) => op.snapshot.documentVersion !== 3)) return
      const key = `canvas-queue-v1:${this.key}:${r.generation ?? 0}`
      if (!(await db.backups.get(key))) await db.backups.add({ key, data: JSON.stringify(r) })
      r.upgradeRequired = true
      r.error = '旧版离线草稿已备份，请恢复草稿后继续同步'
      await db.sync.put(r)
    })
  }
  async getDashboard(): Promise<Dashboard> {
    await this.quarantineLegacy()
    try {
      const remote = migrateDashboard(
        await apiJson<Dashboard>('/dashboards', {}, (h) => {
          this.schemaReady = h.get('X-Nav-State-Schema') === '3'
        }),
      )
      this.schemaReady = this.schemaReady && remote.documentVersion === 3
      return await db.transaction('rw', db.sync, db.backups, async () => {
        const row = await db.sync.get(this.key)
        this.observedRevision = row?.revision ?? remote.revision ?? 0
        if (
          remote.documentVersion !== 3 &&
          !(await db.backups.get(`canvas-seed:${remote.instanceId}:${remote.id}`))
        )
          await db.backups.put({
            key: `canvas-seed:${remote.instanceId}:${remote.id}`,
            data: JSON.stringify(remote),
          })
        if (
          row &&
          ((row.snapshot.documentVersion !== undefined &&
            ![2, 3].includes(row.snapshot.documentVersion)) ||
            row.pending.some((op) => op.snapshot.documentVersion !== 3))
        ) {
          if (!row.upgradeRequired)
            await db.backups.put({
              key: `canvas-queue-v1:${this.key}:${row.generation ?? 0}`,
              data: JSON.stringify(row),
            })
          row.upgradeRequired = true
          row.conflict = remote
          row.error = '旧版离线草稿已备份，请更新服务端后选择采用远端或重新提交本地草稿'
          this.observedGeneration = row.generation ?? 0
          await db.sync.put(row)
          return migrateCanvasDocument(migrateDashboard(row.snapshot))
        }
        if (row && row.snapshot.instanceId !== remote.instanceId) {
          if (!row.conflict || row.conflict.instanceId !== remote.instanceId)
            await db.backups.put({
              key: `instance-change:${this.key}:${Date.now()}`,
              data: JSON.stringify(row),
            })
          if (row.pending.length) {
            row.conflict = remote
            row.error = '服务实例已改变，旧草稿已隔离备份'
            await db.sync.put(row)
            return clone(row.snapshot)
          }
        }
        if (row?.pending.length) {
          this.observedGeneration = row.generation ?? 0
          // Retry the immutable operation before deciding that a newer revision is
          // a conflict: its earlier response may have been lost after a commit.
          return clone(row.snapshot)
        }
        const generation =
          (row?.generation ?? 0) + (row && row.revision !== remote.revision ? 1 : 0)
        this.observedGeneration = generation
        this.observedRevision = remote.revision ?? 0
        this.externalChange =
          !!row &&
          (row.revision !== remote.revision || row.snapshot.instanceId !== remote.instanceId)
        const next: SyncRow = {
          generation,
          key: this.key,
          snapshot: migrateCanvasDocument(remote),
          revision: remote.revision ?? 0,
          pending: [],
          upgradeRequired: !this.schemaReady,
          error: this.schemaReady
            ? undefined
            : '服务端协议或文档尚未升级到版本 3，请管理员完成升级和数据迁移；本地草稿已保留',
          lastSyncAt: new Date().toISOString(),
        }
        await db.sync.put(next)
        return migrateCanvasDocument(clone(remote))
      })
    } catch (error) {
      const cached = await db.sync.get(this.key)
      if (cached) {
        this.observedGeneration = cached.generation ?? 0
        this.observedRevision = cached.revision
        return migrateCanvasDocument(migrateDashboard(clone(cached.snapshot)))
      }
      throw error
    }
  }
  async cached(): Promise<Dashboard | null> {
    const row = await db.sync.get(this.key)
    if (row) {
      this.observedGeneration = row.generation ?? 0
      this.observedRevision = row.revision
    }
    return row ? migrateCanvasDocument(migrateDashboard(clone(row.snapshot))) : null
  }
  async saveDashboard(d: Dashboard): Promise<void> {
    validateCurrentDashboard(d)
    let committedGeneration = this.observedGeneration
    let upgradeBlocked = false
    await db.transaction('rw', db.sync, db.backups, async () => {
      const row = await db.sync.get(this.key)
      if (
        row &&
        ((row.snapshot.documentVersion !== undefined &&
          ![2, 3].includes(row.snapshot.documentVersion)) ||
          row.pending.some((op) => op.snapshot.documentVersion !== 3))
      ) {
        if (
          row.snapshot.documentVersion !== undefined &&
          ![2, 3].includes(row.snapshot.documentVersion)
        ) {
          const key = `future-document:${this.key}:${row.generation ?? 0}`
          if (!(await db.backups.get(key))) await db.backups.add({ key, data: JSON.stringify(row) })
          row.upgradeRequired = true
          row.error = '未来或未知文档版本，请更新客户端；原数据和新增草稿已保留'
          await db.sync.put(row)
        }
        await db.backups.put({
          key: `upgrade-edit:${this.key}:${crypto.randomUUID()}`,
          data: JSON.stringify(d),
        })
        await db.backups.put({ key: `upgrade-edit:${this.key}`, data: JSON.stringify(d) })
        upgradeBlocked = true
        return
      }
      if (!row) throw new Error('尚未获取服务端快照，不能覆盖远端数据')
      if ((row.generation ?? 0) !== this.observedGeneration)
        throw new Error('另一标签页已修改草稿，请先导出当前草稿，再重新加载处理')
      const snapshot = clone(d)
      row.generation = (row.generation ?? 0) + 1
      committedGeneration = row.generation
      this.observedRevision = row.revision
      // An in-flight operation is immutable; only unsent successors may be coalesced.
      const keep = row.lease && row.lease.until > Date.now() ? row.pending.slice(0, 1) : []
      row.pending = [...keep, { id: crypto.randomUUID(), snapshot }]
      row.snapshot = snapshot
      row.error = undefined
      await db.sync.put(row)
    })
    if (upgradeBlocked) throw new Error('存储文档版本不兼容，请先处理升级/恢复；当前编辑已备份')
    this.observedGeneration = committedGeneration
    this.changed(false, true)
    void this.flush()
  }
  async flush(): Promise<void> {
    if (this.disposed) return
    if (this.sending) return this.sending
    this.sending = this.send().finally(() => {
      this.sending = null
    })
    return this.sending
  }
  private async send() {
    await this.quarantineLegacy()
    if (!navigator.onLine) return
    if (!this.schemaReady) {
      const capability = await apiJson<Dashboard>('/dashboards', {}, (h) => {
        this.schemaReady = h.get('X-Nav-State-Schema') === '3'
      }).catch(() => null)
      this.schemaReady = this.schemaReady && capability?.documentVersion === 3
      if (!this.schemaReady) {
        await db.sync.update(this.key, {
          error: '服务端协议或文档尚未升级到版本 3，请管理员完成升级和数据迁移；本地草稿已保留',
          upgradeRequired: true,
        })
        return
      }
    }
    await db.transaction('rw', db.sync, async () => {
      const r = await db.sync.get(this.key)
      if (
        r?.upgradeRequired &&
        r.snapshot.documentVersion === 3 &&
        !r.pending.some((op) => op.snapshot.documentVersion !== 3)
      ) {
        r.upgradeRequired = false
        r.error = undefined
        await db.sync.put(r)
      }
    })
    let retry = 0
    try {
      for (;;) {
        const row = await db.transaction('rw', db.sync, async () => {
          const r = await db.sync.get(this.key)
          if (
            !r?.pending.length ||
            r.conflict ||
            r.upgradeRequired ||
            r.pending.some((op) => op.snapshot.documentVersion !== 3) ||
            (r.lease && r.lease.until > Date.now() && r.lease.owner !== this.owner)
          )
            return null
          if (!localStorage.getItem('nav_token')) {
            r.authRequired = true
            await db.sync.put(r)
            return null
          }
          r.lease = { owner: this.owner, until: Date.now() + 20000 }
          r.authRequired = false
          await db.sync.put(r)
          return r
        })
        if (!row) break
        const op = row.pending[0]
        const ack = await apiJson<Dashboard>(`/dashboards/${row.snapshot.id}/state`, {
          method: 'PUT',
          headers: { 'If-Match': `"${row.revision}"` },
          body: JSON.stringify({ schemaVersion: 3, operationId: op.id, snapshot: op.snapshot }),
        })
        await db.transaction('rw', db.sync, async () => {
          const r = await db.sync.get(this.key)
          if (!r || r.pending[0]?.id !== op.id) return
          r.pending.shift()
          r.revision = ack.revision!
          this.observedRevision = r.revision
          r.lastSyncAt = new Date().toISOString()
          r.error = undefined
          r.authRequired = false
          if (!r.pending.length) r.snapshot = ack
          r.lease = undefined
          await db.sync.put(r)
        })
        this.failures = 0
        this.changed()
      }
    } catch (error) {
      const remote =
        error instanceof ApiError && error.status === 412
          ? await apiJson<Dashboard>('/dashboards').catch(() => null)
          : null
      await db.transaction('rw', db.sync, async () => {
        const r = await db.sync.get(this.key)
        if (!r) return
        if (remote) r.conflict = remote
        if (error instanceof ApiError && error.status === 426) {
          r.upgradeRequired = true
          this.schemaReady = false
        }
        r.error = error instanceof Error ? error.message : '同步失败'
        r.authRequired = error instanceof ApiError && [401, 403].includes(error.status)
        await db.sync.put(r)
      })
      if (error instanceof ApiError && error.status === 401)
        window.dispatchEvent(new Event('nav-auth-invalid'))
      if (!(error instanceof ApiError) || [408, 429, 500, 502, 503, 504].includes(error.status))
        retry = Math.max(
          error instanceof ApiError ? error.retryAfter * 1000 : 0,
          Math.min(60000, 1000 * 2 ** Math.min(6, this.failures++)) * (0.75 + Math.random() / 2),
        )
    } finally {
      await db.transaction('rw', db.sync, async () => {
        const r = await db.sync.get(this.key)
        if (r?.lease?.owner === this.owner) {
          r.lease = undefined
          await db.sync.put(r)
        }
      })
      this.changed()
      if (retry && !this.retryTimer)
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null
          void this.flush()
        }, retry)
    }
  }
  async getRecoveryPreview(): Promise<RecoveryPreview | null> {
    let r = await db.sync.get(this.key)
    if (!r?.conflict) return null
    let remoteFresh = false
    try {
      const fresh = migrateDashboard(await apiJson<Dashboard>('/dashboards'))
      validateDashboard(fresh)
      await db.transaction('rw', db.sync, async () => {
        const latest = await db.sync.get(this.key)
        if (!latest?.conflict || (latest.generation ?? 0) !== (r!.generation ?? 0))
          throw new Error('另一标签页已处理草稿，请重新加载')
        latest.conflict = fresh
        await db.sync.put(latest)
        r = latest
      })
      remoteFresh = true
    } catch {
      /* Cached preview remains available offline; resolution requires a fresh read. */
    }
    const local = migrateCanvasDocument(migrateDashboard(r.snapshot)),
      remote = migrateCanvasDocument(migrateDashboard(r.conflict))
    const differences: string[] = []
    // Revision/instance identity and legacy camera mirrors are not editable content.
    for (const field of [
      'id',
      'title',
      'name',
      'documentVersion',
      'layoutVersion',
      'columns',
      'baseColumns',
      'rowHeight',
      'layoutMode',
      'layoutSettings',
      'widgetAppearance',
      'layoutProfiles',
      'background',
      'canvasSettings',
    ] as const)
      if (canonical(local[field]) !== canonical(remote[field]))
        differences.push(
          `${field}: 本地 ${JSON.stringify(local[field])}；远端 ${JSON.stringify(remote[field])}`,
        )
    differences.push(...canvasSceneDifferences(local.canvasScene!, remote.canvasScene!))
    const ids = new Set([...local.widgets.map((w) => w.id), ...remote.widgets.map((w) => w.id)])
    for (const id of ids) {
      const a = local.widgets.find((w) => w.id === id),
        b = remote.widgets.find((w) => w.id === id)
      if (!a || !b) differences.push(`${id}: ${a ? '仅本地存在' : '仅远端存在'}`)
      else
        for (const field of [
          'widgetId',
          'source',
          'appearance',
          'config',
          'canvas',
          'layouts',
        ] as const)
          if (canonical(a[field]) !== canonical(b[field]))
            differences.push(
              `${id}.${field}: 本地 ${JSON.stringify(a[field])}；远端 ${JSON.stringify(b[field])}`,
            )
    }
    return { localTitle: local.title, remoteTitle: remote.title, differences, remoteFresh }
  }
  async resolveConflict(useLocal: boolean) {
    const before = await db.sync.get(this.key)
    if (!before?.conflict) return
    const fresh = migrateDashboard(await apiJson<Dashboard>('/dashboards'))
    validateDashboard(fresh)
    if (fresh.documentVersion !== 3) throw new Error('请先完成服务端文档迁移，再恢复草稿')
    if (canonical(fresh) !== canonical(migrateDashboard(before.conflict))) {
      await db.transaction('rw', db.sync, async () => {
        const latest = await db.sync.get(this.key)
        if (latest && (latest.generation ?? 0) === (before.generation ?? 0)) {
          latest.conflict = fresh
          await db.sync.put(latest)
        }
      })
      throw new Error('远端已变化，请重新核对恢复预览')
    }
    await db.transaction('rw', db.sync, db.backups, async () => {
      const r = await db.sync.get(this.key)
      if (!r?.conflict) return
      if ((r.generation ?? 0) !== this.observedGeneration)
        throw new Error('另一标签页已处理草稿，请先重新加载')
      await db.backups.put({
        key: `conflict:${this.key}:${Date.now()}`,
        data: JSON.stringify({ local: r.snapshot, remote: r.conflict }),
      })
      r.revision = r.conflict.revision ?? 0
      this.observedRevision = r.revision
      if (useLocal) {
        r.snapshot = migrateCanvasDocument(migrateDashboard(r.snapshot))
        validateCanvasTransition(migrateCanvasDocument(migrateDashboard(r.conflict)), r.snapshot)
        r.snapshot.instanceId = r.conflict.instanceId
        r.pending = [{ id: crypto.randomUUID(), snapshot: clone(r.snapshot) }]
      } else {
        r.snapshot = migrateCanvasDocument(migrateDashboard(r.conflict))
        r.pending = []
      }
      r.generation = (r.generation ?? 0) + 1
      this.observedGeneration = r.generation
      r.upgradeRequired = false
      r.conflict = undefined
      r.error = undefined
      r.lease = undefined
      await db.sync.put(r)
    })
    this.changed(true, true)
    await this.flush()
  }
  async getSyncState(): Promise<SyncState> {
    const r = await db.sync.get(this.key)
    return {
      lastSyncAt: r?.lastSyncAt ?? null,
      pendingChanges: r?.pending.length ?? 0,
      status: r?.upgradeRequired
        ? 'upgrade-required'
        : r?.conflict
          ? 'conflict'
          : r?.authRequired
            ? 'auth-required'
            : r?.error
              ? 'error'
              : r?.lease
                ? 'syncing'
                : r?.pending.length
                  ? 'pending-sync'
                  : 'synced',
      error: r?.error,
    }
  }
  async getInstalledWidgets(): Promise<InstalledWidget[]> {
    const key = `catalog:${location.origin}`
    try {
      const list = await apiJson<InstalledWidget[]>('/installed-widgets')
      await db.backups.put({ key, data: JSON.stringify(list) })
      return list
    } catch (e) {
      const cache = await db.backups.get(key)
      if (cache) return JSON.parse(cache.data)
      throw e
    }
  }
  async installWidget(w: InstalledWidget): Promise<void> {
    validateInstalled(w)
    const { revision } = await apiJson<{ revision: number }>('/installed-widgets/revision')
    await apiJson('/installed-widgets', {
      method: 'POST',
      headers: { 'If-Match': String(revision), 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(w),
    })
    const key = `catalog:${location.origin}`,
      old = await db.backups.get(key)
    const list: InstalledWidget[] = old ? JSON.parse(old.data) : []
    await db.backups.put({
      key,
      data: JSON.stringify([...list.filter((x) => x.widgetId !== w.widgetId), w]),
    })
  }
  async uninstallWidget(id: string): Promise<void> {
    const { revision } = await apiJson<{ revision: number }>('/installed-widgets/revision')
    await apiJson(`/installed-widgets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'If-Match': String(revision), 'Idempotency-Key': crypto.randomUUID() },
    })
    const key = `catalog:${location.origin}`,
      old = await db.backups.get(key)
    if (old)
      await db.backups.put({
        key,
        data: JSON.stringify(
          JSON.parse(old.data).filter((x: InstalledWidget) => x.widgetId !== id),
        ),
      })
  }
  async push(): Promise<void> {
    await this.flush()
  }
  async pull(): Promise<never[]> {
    await this.refresh()
    return []
  }
}
