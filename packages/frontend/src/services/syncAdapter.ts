import {
  migrateDashboard,
  validateDashboard,
  validateInstalled,
  type Dashboard,
  type InstalledWidget,
  type StorageAdapter,
  type SyncState,
} from '@nav/shared'
import { localDatabase as db, clone, type SyncRow } from './localDatabase'
import { apiJson, ApiError } from './apiClient'

export class SyncAdapter implements StorageAdapter {
  readonly key = `server:${location.origin}:default`
  private owner = crypto.randomUUID()
  private observedGeneration = 0
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
  constructor() {
    window.addEventListener('nav-unsaved-changed', (e) => {
      this.unsaved = !!(e as CustomEvent).detail
    })
    window.addEventListener('nav-editing-changed', (e) => {
      this.editing = !!(e as CustomEvent).detail
    })
    window.addEventListener('online', () => {
      void this.flush()
    })
    window.addEventListener('nav-auth-changed', () => {
      void this.flush()
    })
    window.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.refresh()
    })
    this.heartbeat = setInterval(() => {
      if (!document.hidden) void this.refresh()
    }, 30000)
    this.channel?.addEventListener('message', (e) => {
      if (e.data === this.key)
        window.dispatchEvent(new CustomEvent('nav-storage-changed', { detail: { external: true } }))
    })
  }
  async dispose() {
    this.disposed = true
    clearInterval(this.heartbeat)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    await this.sending?.catch(() => {})
    this.channel?.close()
  }
  private changed(external = false) {
    if (this.disposed) return
    window.dispatchEvent(new CustomEvent('nav-storage-changed', { detail: { external } }))
    this.channel?.postMessage(this.key)
  }
  private async refresh() {
    if (this.editing || this.unsaved) return
    try {
      await this.getDashboard()
      this.changed(this.externalChange)
      this.externalChange = false
      await this.flush()
    } catch {
      /* the last snapshot remains available */
    }
  }
  async getDashboard(): Promise<Dashboard> {
    try {
      const remote = migrateDashboard(await apiJson<Dashboard>('/dashboards'))
      return await db.transaction('rw', db.sync, db.backups, async () => {
        const row = await db.sync.get(this.key)
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
        this.externalChange = !!row && row.revision !== remote.revision
        const next: SyncRow = {
          generation,
          key: this.key,
          snapshot: remote,
          revision: remote.revision ?? 0,
          pending: [],
          lastSyncAt: new Date().toISOString(),
        }
        await db.sync.put(next)
        return clone(remote)
      })
    } catch (error) {
      const cached = await db.sync.get(this.key)
      if (cached) {
        this.observedGeneration = cached.generation ?? 0
        return clone(cached.snapshot)
      }
      throw error
    }
  }
  async cached(): Promise<Dashboard | null> {
    const row = await db.sync.get(this.key)
    if (row) this.observedGeneration = row.generation ?? 0
    return clone(row?.snapshot ?? null)
  }
  async saveDashboard(d: Dashboard): Promise<void> {
    validateDashboard(d)
    let committedGeneration = this.observedGeneration
    await db.transaction('rw', db.sync, async () => {
      const row = await db.sync.get(this.key)
      if (!row) throw new Error('尚未获取服务端快照，不能覆盖远端数据')
      if ((row.generation ?? 0) !== this.observedGeneration)
        throw new Error('另一标签页已修改草稿，请先导出当前草稿，再重新加载处理')
      const snapshot = clone(d)
      row.generation = (row.generation ?? 0) + 1
      committedGeneration = row.generation
      // An in-flight operation is immutable; only unsent successors may be coalesced.
      const keep = row.lease && row.lease.until > Date.now() ? row.pending.slice(0, 1) : []
      row.pending = [...keep, { id: crypto.randomUUID(), snapshot }]
      row.snapshot = snapshot
      row.error = undefined
      await db.sync.put(row)
    })
    this.observedGeneration = committedGeneration
    this.changed()
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
    if (!navigator.onLine) return
    let retry = 0
    try {
      for (;;) {
        const row = await db.transaction('rw', db.sync, async () => {
          const r = await db.sync.get(this.key)
          if (
            !r?.pending.length ||
            r.conflict ||
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
          body: JSON.stringify({ operationId: op.id, snapshot: op.snapshot }),
        })
        await db.transaction('rw', db.sync, async () => {
          const r = await db.sync.get(this.key)
          if (!r || r.pending[0]?.id !== op.id) return
          r.pending.shift()
          r.revision = ack.revision!
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
  async resolveConflict(useLocal: boolean) {
    await db.transaction('rw', db.sync, db.backups, async () => {
      const r = await db.sync.get(this.key)
      if (!r?.conflict) return
      await db.backups.put({
        key: `conflict:${this.key}:${Date.now()}`,
        data: JSON.stringify({ local: r.snapshot, remote: r.conflict }),
      })
      r.revision = r.conflict.revision ?? 0
      if (useLocal) {
        r.snapshot.instanceId = r.conflict.instanceId
        r.pending = [{ id: crypto.randomUUID(), snapshot: clone(r.snapshot) }]
      } else {
        r.snapshot = r.conflict
        r.pending = []
      }
      r.generation = (r.generation ?? 0) + 1
      this.observedGeneration = r.generation
      r.conflict = undefined
      r.error = undefined
      r.lease = undefined
      await db.sync.put(r)
    })
    this.changed()
    await this.flush()
  }
  async getSyncState(): Promise<SyncState> {
    const r = await db.sync.get(this.key)
    return {
      lastSyncAt: r?.lastSyncAt ?? null,
      pendingChanges: r?.pending.length ?? 0,
      status: r?.conflict
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
