import type { Dashboard, WidgetLayout } from './types/dashboard.js'
import type { InstalledWidget } from './types/widget.js'

export class ValidationError extends Error {}
const safeKey = (s: string) => !['__proto__', 'prototype', 'constructor'].includes(s)
function checkStructure(root: unknown) {
  const pending = [{ value: root, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const { value, depth } = pending.pop()!
    assert(++nodes <= 50000 && depth <= 32, '配置嵌套过深或内容过多')
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        assert(safeKey(key), '配置包含保留字段')
        pending.push({ value: child, depth: depth + 1 })
      }
    }
  }
}
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message)
}
export function record(x: unknown): x is Record<string, any> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}
export function validUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
export function validateLayout(l: unknown, cols = 24): asserts l is WidgetLayout {
  assert(record(l), '布局必须是对象')
  for (const key of ['x', 'y', 'w', 'h']) assert(Number.isInteger(l[key]), '布局坐标必须是整数')
  assert(
    l.x >= 0 &&
      l.y >= 0 &&
      l.y <= 1000 &&
      l.w >= 1 &&
      l.w <= cols &&
      l.x + l.w <= cols &&
      l.h >= 1 &&
      l.h <= 100,
    '布局坐标或尺寸超出范围',
  )
}
export function validateDashboard(d: unknown): asserts d is Dashboard {
  assert(record(d), '仪表盘必须是对象')
  checkStructure(d)
  assert(typeof d.id === 'string' && /^[\w-]{1,80}$/.test(d.id), '仪表盘 ID 无效')
  assert(
    typeof d.name === 'string' &&
      d.name.length <= 200 &&
      typeof d.title === 'string' &&
      d.title.length <= 200,
    '标题过长或格式无效',
  )
  assert(
    Number.isInteger(d.columns) &&
      d.columns >= 1 &&
      d.columns <= 24 &&
      Number.isInteger(d.rowHeight) &&
      d.rowHeight >= 40 &&
      d.rowHeight <= 200,
    '列数或行高无效',
  )
  assert(
    d.baseColumns === undefined ||
      (Number.isInteger(d.baseColumns) && d.baseColumns >= 1 && d.baseColumns <= 24),
    '基准列数无效',
  )
  assert(d.layoutMode === undefined || ['grid', 'canvas'].includes(d.layoutMode), '布局模式无效')
  for (const dimension of ['viewportWidth', 'viewportHeight'])
    assert(
      d[dimension] === undefined ||
        (Number.isFinite(d[dimension]) && d[dimension] >= 1 && d[dimension] <= 16384),
      '视口尺寸无效',
    )
  if (d.viewport !== undefined) {
    assert(record(d.viewport), '视口必须是对象')
    for (const key of ['panX', 'panY', 'homeX', 'homeY'])
      assert(
        Number.isFinite(d.viewport[key]) && Math.abs(d.viewport[key]) <= 1000000,
        '视口坐标无效',
      )
    assert(
      Number.isFinite(d.viewport.zoom) && d.viewport.zoom >= 0.1 && d.viewport.zoom <= 3,
      '视口缩放无效',
    )
  }
  assert(Array.isArray(d.widgets) && d.widgets.length <= 100, '组件最多 100 个')
  const ids = new Set<string>()
  for (const w of d.widgets) {
    assert(
      record(w) && typeof w.id === 'string' && /^[\w-]{1,100}$/.test(w.id) && !ids.has(w.id),
      '组件 ID 无效或重复',
    )
    ids.add(w.id)
    assert(
      typeof w.widgetId === 'string' &&
        /^[\w.-]{1,100}$/.test(w.widgetId) &&
        ['builtin', 'installed'].includes(w.source),
      '组件类型无效',
    )
    assert(
      record(w.config) && new TextEncoder().encode(JSON.stringify(w.config)).length <= 16384,
      '组件配置过大或格式无效',
    )
    if (Array.isArray(w.config.groups))
      for (const group of w.config.groups) {
        assert(
          record(group) && typeof group.name === 'string' && Array.isArray(group.bookmarks),
          '书签分组格式无效',
        )
        for (const b of group.bookmarks)
          assert(
            record(b) &&
              typeof b.title === 'string' &&
              typeof b.url === 'string' &&
              validUrl(b.url),
            '书签仅支持 http/https 地址',
          )
      }
    if (w.canvas !== undefined) {
      assert(record(w.canvas), '画布布局必须是对象')
      for (const key of ['x', 'y'])
        assert(Number.isFinite(w.canvas[key]) && Math.abs(w.canvas[key]) <= 1000000, '画布坐标无效')
      for (const key of ['w', 'h', 'originalW', 'originalH'])
        assert(
          (key.startsWith('original') && w.canvas[key] === undefined) ||
            (Number.isFinite(w.canvas[key]) && w.canvas[key] >= 1 && w.canvas[key] <= 16384),
          '画布尺寸无效',
        )
    }
    if (w.source === 'builtin' && w.widgetId === 'chat')
      assert(!w.config.apiKey, 'API Key 请配置到服务端环境变量，不可保存到公开仪表盘')
    assert(record(w.layouts), '缺少组件布局')
    validateLayout(w.layouts.lg, d.baseColumns ?? d.columns)
  }
  assert(
    record(d.background) && ['color', 'image', 'slideshow'].includes(d.background.mode),
    '背景格式无效',
  )
  assert(
    typeof d.background.color === 'string' &&
      /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(d.background.color),
    '背景色无效',
  )
  assert(
    Number.isInteger(d.background.interval) &&
      d.background.interval >= 5 &&
      d.background.interval <= 3600 &&
      Array.isArray(d.background.images) &&
      d.background.images.length <= 50,
    '背景配置超限',
  )
  for (const img of d.background.images)
    assert(
      record(img) &&
        typeof img.src === 'string' &&
        (validUrl(img.src) || /^\/uploads\/[\w.-]+$/.test(img.src)) &&
        !/\.svg(?:[?#]|$)/i.test(img.src),
      '图片地址无效或 SVG 不受支持',
    )
  if (d.layoutVersion !== undefined) {
    assert(
      d.layoutVersion === 2 && record(d.layoutSettings) && record(d.layoutProfiles),
      '布局版本无效',
    )
    assert(
      ['auto', 'custom'].includes(d.layoutSettings.columnMode) &&
        ['centered', 'fluid'].includes(d.layoutSettings.contentWidthMode),
      '布局设置无效',
    )
    assert(
      Number.isInteger(d.layoutSettings.maxContentWidth) &&
        d.layoutSettings.maxContentWidth >= 800 &&
        d.layoutSettings.maxContentWidth <= 3840,
      '内容宽度无效',
    )
    assert(Object.keys(d.layoutProfiles).length <= 24, '断点布局过多')
    for (const [key, map] of Object.entries(d.layoutProfiles)) {
      const cols = Number(key.replace('cols-', ''))
      assert(/^cols-\d+$/.test(key) && cols >= 1 && cols <= 24 && record(map), '断点格式无效')
      for (const [id, layout] of Object.entries(map)) {
        assert(ids.has(id), '断点引用了不存在的组件')
        validateLayout(layout, cols)
      }
    }
  }
}
export function validateInstalled(widget: unknown): asserts widget is InstalledWidget {
  assert(record(widget) && record(widget.manifest), '缺少插件 manifest')
  checkStructure(widget)
  const m = widget.manifest
  assert(
    record(m.schema) &&
      record(m.schema.properties ?? {}) &&
      Object.keys(m.schema.properties ?? {}).length <= 50,
    '插件配置 schema 无效',
  )
  for (const field of Object.values(m.schema.properties ?? {}))
    assert(
      record(field) &&
        ['string', 'number', 'boolean'].includes(field.type ?? 'string') &&
        (!field.enum || (Array.isArray(field.enum) && field.enum.length <= 100)),
      '插件配置字段格式无效',
    )
  for (const size of [m.size, m.minSize])
    assert(
      record(size) &&
        Number.isInteger(size.w) &&
        size.w >= 1 &&
        size.w <= 24 &&
        Number.isInteger(size.h) &&
        size.h >= 1 &&
        size.h <= 100,
      '插件尺寸无效',
    )
  assert(
    m.manifestVersion === 2 &&
      typeof widget.widgetId === 'string' &&
      safeKey(widget.widgetId) &&
      /^[\w.-]{1,100}$/.test(widget.widgetId) &&
      widget.widgetId === m.name,
    '需要 manifestVersion 2 插件',
  )
  assert(
    typeof m.displayName === 'string' &&
      m.displayName.length <= 100 &&
      typeof m.entry === 'string' &&
      m.entry.endsWith('.js'),
    '插件必须提供预构建 JS 入口',
  )
  assert(
    typeof widget.commit === 'string' && /^[a-f0-9]{40}$/.test(widget.commit),
    '插件必须固定到提交',
  )
  assert(typeof widget.cdnUrl === 'string', '插件地址无效')
  let url: URL
  try {
    url = new URL(widget.cdnUrl)
  } catch {
    throw new ValidationError('插件地址无效')
  }
  assert(
    url.protocol === 'https:' &&
      url.host === 'cdn.jsdelivr.net' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      /^\/gh\/[\w.-]+\/[\w.-]+@[a-f0-9]{40}\/[\w./-]+\.js$/.test(url.pathname) &&
      url.pathname.includes('@' + widget.commit + '/') &&
      !m.entry.includes('..') &&
      /^(?:[\w.-]+\/)*[\w.-]+\.js$/.test(m.entry) &&
      url.pathname.endsWith('/' + m.entry),
    '插件入口必须来自固定提交的 jsDelivr 资源',
  )
  assert(
    Array.isArray(m.networkOrigins ?? []) && (m.networkOrigins ?? []).length <= 10,
    '网络权限超限',
  )
  for (const origin of m.networkOrigins ?? []) {
    let u: URL
    try {
      u = new URL(origin)
    } catch {
      throw new ValidationError('网络权限无效')
    }
    assert(
      u.protocol === 'https:' && u.origin === origin && !u.username && !u.password,
      '网络权限必须是 HTTPS origin',
    )
  }
}
