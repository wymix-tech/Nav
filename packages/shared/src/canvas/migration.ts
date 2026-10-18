import type { Dashboard, DashboardViewport } from '../types/dashboard.js'
import type { CanvasCamera, Size } from './types.js'
import { boundCamera } from './geometry.js'
import { initialScene } from './scene.js'
import { validateDashboard } from '../validation.js'
import { CANVAS } from './constants.js'
export function legacyCamera(view: DashboardViewport, size: Size, ref: Size): CanvasCamera {
  if (size.width <= 0 || size.height <= 0 || ref.width <= 0 || ref.height <= 0)
    throw new Error('尚未测量画布')
  const ratio = Math.max(0.01, Math.min(size.width / ref.width, size.height / ref.height))
  return boundCamera({
    centerX: (size.width / (2 * ratio) - view.panX) / view.zoom,
    centerY: (size.height / (2 * ratio) - view.panY) / view.zoom,
    zoom: ratio * view.zoom,
  })
}
// Pure and idempotent. Callers own the backup and transaction boundary.
export function migrateCanvasDocument(input: Dashboard): Dashboard {
  if (input.documentVersion !== undefined && ![2, 3].includes(input.documentVersion))
    throw new Error('文档版本需要更新客户端')
  const d: Dashboard = JSON.parse(JSON.stringify(input))
  if (d.documentVersion === 3) {
    validateDashboard(d)
    return d
  }
  if (d.documentVersion === 2) {
    validateDashboard(d)
    d.documentVersion = 3
    d.canvasScene = initialScene(d.widgets.map((w) => w.id))
    validateDashboard(d)
    return d
  }
  const width = d.viewportWidth ?? 1920,
    height = d.viewportHeight ?? 1080
  const v = d.viewport ?? { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 }
  if (![width, height, v.panX, v.panY, v.zoom].every(Number.isFinite) || v.zoom <= 0)
    throw new Error('旧视角数值无效')
  const home = Number.isFinite(v.homeX) && Number.isFinite(v.homeY)
  d.canvasSettings ??= {
    version: 1,
    defaultCamera: legacyCamera(
      home ? { ...v, panX: v.homeX, panY: v.homeY, zoom: 1 } : v,
      { width, height },
      { width, height },
    ),
  }
  d.documentVersion = 2
  return migrateCanvasDocument(d)
}
export function withLegacyMirror(d: Dashboard): Dashboard {
  if (!d.canvasSettings) return d
  const c = d.canvasSettings.defaultCamera,
    width = d.viewportWidth ?? 1920,
    height = d.viewportHeight ?? 1080
  const limit = (n: number) => Math.max(-CANVAS.positionLimit, Math.min(CANVAS.positionLimit, n))
  const z = Math.max(0.1, Math.min(3, c.zoom))
  return {
    ...d,
    viewport: {
      panX: limit(width / 2 - c.centerX * z),
      panY: limit(height / 2 - c.centerY * z),
      zoom: z,
      homeX: limit(width / 2 - c.centerX),
      homeY: limit(height / 2 - c.centerY),
    },
  }
}
