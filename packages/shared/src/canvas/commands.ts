import type { Dashboard, CanvasLayout, WidgetInstance } from '../types/dashboard.js'
import type { Point } from './types.js'
import { assert, validateDashboard } from '../validation.js'
import { validateCanvasTransition } from './transition.js'
import { arrange, commonDelta, type AlignAction } from './alignment.js'
import {
  canonical,
  effectiveLocked,
  groupFor,
  normalizeSelection,
  refKey,
  selectionWidgets,
  widgetRect,
  type CanvasRegion,
  type SelectionRef,
} from './scene.js'
export type LayerAction = 'forward' | 'backward' | 'front' | 'back'
export type CanvasCommand =
  | { type: 'move'; refs: SelectionRef[]; delta: Point }
  | {
      type: 'geometry'
      widgets?: Record<string, CanvasLayout>
      regions?: Record<string, Partial<CanvasRegion>>
    }
  | { type: 'delete' | 'ungroup'; refs: SelectionRef[] }
  | { type: 'group'; widgetIds: string[]; title: string; id: string }
  | { type: 'reorder-members'; groupId: string; memberIds: string[]; action: LayerAction }
  | { type: 'join-group'; groupId: string; widgetIds: string[] }
  | { type: 'remove-members'; groupId: string; widgetIds: string[] }
  | { type: 'set-lock'; refs: SelectionRef[]; locked: boolean }
  | { type: 'rename'; ref: SelectionRef; title: string }
  | { type: 'reorder'; refs: SelectionRef[]; action: LayerAction }
  | { type: 'align'; refs: SelectionRef[]; action: AlignAction }
  | { type: 'distribute'; refs: SelectionRef[]; axis: 'x' | 'y' }
  | { type: 'create-region'; region: CanvasRegion; bounded?: boolean }
  | { type: 'region-color'; id: string; color: CanvasRegion['color'] }
  | { type: 'add-widget'; widget: WidgetInstance }
  | { type: 'clear' }
export function reordered<T>(items: T[], selected: (v: T) => boolean, action: LayerAction): T[] {
  const out = [...items]
  if (action === 'front') return [...out.filter((x) => !selected(x)), ...out.filter(selected)]
  if (action === 'back') return [...out.filter(selected), ...out.filter((x) => !selected(x))]
  if (action === 'forward')
    for (let i = out.length - 2; i >= 0; i--) {
      if (selected(out[i]) && !selected(out[i + 1])) [out[i], out[i + 1]] = [out[i + 1], out[i]]
    }
  if (action === 'backward')
    for (let i = 1; i < out.length; i++) {
      if (selected(out[i]) && !selected(out[i - 1])) [out[i], out[i - 1]] = [out[i - 1], out[i]]
    }
  return out
}
export function applyCanvasCommand(current: Dashboard, command: CanvasCommand): Dashboard {
  validateDashboard(current)
  assert(current.documentVersion === 3 && current.canvasScene, '需要场景文档版本 3')
  const d: Dashboard = JSON.parse(JSON.stringify(current)),
    s = d.canvasScene!
  const refs =
    'refs' in command
      ? command.type === 'set-lock'
        ? command.refs
        : normalizeSelection(d, command.refs)
      : []
  if ('refs' in command)
    assert(refs.length === command.refs.length && refs.length > 0, '目标不存在、重复或选择未归一化')
  const protect = (targets: SelectionRef[]) =>
    assert(!targets.some((r) => effectiveLocked(current, r)), '所选对象含布局锁，请先解锁')
  const move = (targets: SelectionRef[], delta: Point, strict = false) => {
    protect(targets)
    const bounded = commonDelta(d, targets, delta)
    assert([delta.x, delta.y].every(Number.isFinite), '位移无效')
    assert(
      !strict || (Math.abs(delta.x - bounded.x) < 1e-7 && Math.abs(delta.y - bounded.y) < 1e-7),
      '目标超出世界边界',
    )
    for (const id of selectionWidgets(d, targets)) {
      const w = d.widgets.find((w) => w.id === id)!
      const c = widgetRect(d, id)
      w.canvas = { ...c, x: c.x + bounded.x, y: c.y + bounded.y }
    }
    for (const r of targets.filter((r) => r.kind === 'region')) {
      const region = s.regions.find((x) => x.id === r.id)!
      region.x += bounded.x
      region.y += bounded.y
    }
  }
  const dissolve = (id: string) => {
    const g = s.groups.find((g) => g.id === id)!
    s.layers = s.layers.flatMap((r) =>
      r.kind === 'group' && r.id === id
        ? g.memberIds.map((id) => ({ kind: 'widget' as const, id }))
        : [r],
    )
    s.groups = s.groups.filter((g) => g.id !== id)
  }
  switch (command.type) {
    case 'move':
      move(refs, command.delta)
      break
    case 'geometry':
      for (const [id, c] of Object.entries(command.widgets ?? {})) {
        assert(!groupFor(d, id), '请先解组再调整组件尺寸')
        protect([{ kind: 'widget', id }])
        const w = d.widgets.find((w) => w.id === id)
        assert(w, '组件已不存在')
        w.canvas = c
      }
      for (const [id, c] of Object.entries(command.regions ?? {})) {
        protect([{ kind: 'region', id }])
        const r = s.regions.find((r) => r.id === id)
        assert(r, '区域已不存在')
        for (const key of ['x', 'y', 'w', 'h'] as const) if (c[key] !== undefined) r[key] = c[key]!
      }
      break
    case 'align':
    case 'distribute': {
      protect(refs)
      const deltas = arrange(d, refs, command.type === 'align' ? command.action : command.axis)
      for (const r of refs) move([r], deltas.get(refKey(r))!, true)
      break
    }
    case 'group': {
      const ids = new Set(command.widgetIds)
      assert(
        ids.size >= 2 &&
          ids.size === command.widgetIds.length &&
          [...ids].every((id) => d.widgets.some((w) => w.id === id) && !groupFor(d, id)),
        '只能分组两个以上自由组件',
      )
      protect([...ids].map((id) => ({ kind: 'widget', id })))
      const ordered = s.layers.filter((r) => r.kind === 'widget' && ids.has(r.id)).map((r) => r.id),
        anchor = Math.max(
          ...s.layers.map((r, i) => (r.kind === 'widget' && ids.has(r.id) ? i : -1)),
        ),
        index = s.layers.slice(0, anchor).filter((r) => !ids.has(r.id)).length
      s.layers = s.layers.filter((r) => !ids.has(r.id))
      s.layers.splice(index, 0, { kind: 'group', id: command.id })
      s.groups.push({
        id: command.id,
        title: command.title.trim(),
        memberIds: ordered,
        locked: false,
      })
      break
    }
    case 'ungroup':
      protect(refs)
      assert(
        refs.every((r) => r.kind === 'group'),
        '只能解组',
      )
      refs.forEach((r) => dissolve(r.id))
      break
    case 'join-group':
    case 'remove-members': {
      const g = s.groups.find((g) => g.id === command.groupId)
      assert(g, '组已不存在')
      protect([{ kind: 'group', id: g.id }])
      assert(
        new Set(command.widgetIds).size === command.widgetIds.length &&
          command.widgetIds.length > 0,
        '成员无效',
      )
      if (command.type === 'join-group') {
        assert(
          command.widgetIds.every((id) => d.widgets.some((w) => w.id === id) && !groupFor(d, id)),
          '只能加入自由组件',
        )
        protect(command.widgetIds.map((id) => ({ kind: 'widget', id })))
        const ids = new Set(command.widgetIds)
        g.memberIds.push(
          ...s.layers.filter((r) => r.kind === 'widget' && ids.has(r.id)).map((r) => r.id),
        )
        s.layers = s.layers.filter((r) => !ids.has(r.id))
      } else {
        assert(
          command.widgetIds.every((id) => g.memberIds.includes(id)),
          '成员不属于此组',
        )
        const ids = new Set(command.widgetIds),
          removed = g.memberIds.filter((id) => ids.has(id))
        g.memberIds = g.memberIds.filter((id) => !ids.has(id))
        s.layers.splice(
          s.layers.findIndex((r) => r.id === g.id) + 1,
          0,
          ...removed.map((id) => ({ kind: 'widget' as const, id })),
        )
        if (g.memberIds.length < 2) dissolve(g.id)
      }
      break
    }
    case 'delete': {
      protect(refs)
      const ids = new Set(selectionWidgets(d, refs)),
        regionIds = new Set(refs.filter((r) => r.kind === 'region').map((r) => r.id))
      d.widgets = d.widgets.filter((w) => !ids.has(w.id))
      ids.forEach((id) => delete s.widgetMeta[id])
      s.groups = s.groups.filter((g) => !g.memberIds.some((id) => ids.has(id)))
      s.regions = s.regions.filter((r) => !regionIds.has(r.id))
      s.layers = s.layers.filter((r) =>
        r.kind === 'widget' ? !ids.has(r.id) : s.groups.some((g) => g.id === r.id),
      )
      for (const map of Object.values(d.layoutProfiles ?? {})) ids.forEach((id) => delete map[id])
      break
    }
    case 'set-lock':
      for (const r of refs) {
        if (r.kind === 'widget') s.widgetMeta[r.id].locked = command.locked
        else
          (r.kind === 'group' ? s.groups : s.regions).find((x) => x.id === r.id)!.locked =
            command.locked
      }
      break
    case 'rename': {
      const r = command.ref
      assert(normalizeSelection(d, [r]).length, '目标已不存在')
      if (r.kind === 'widget') s.widgetMeta[r.id].title = command.title.trim()
      else
        (r.kind === 'group' ? s.groups : s.regions).find((x) => x.id === r.id)!.title =
          command.title.trim()
      break
    }
    case 'reorder-members': {
      const g = s.groups.find((g) => g.id === command.groupId)
      assert(g && command.memberIds.every((id) => g.memberIds.includes(id)), '成员已不存在')
      g.memberIds = reordered(g.memberIds, (id) => command.memberIds.includes(id), command.action)
      break
    }
    case 'reorder': {
      assert(
        refs.every((r) => r.kind === 'region') || refs.every((r) => r.kind !== 'region'),
        '请分别调整内容与区域层序',
      )
      const keys = new Set(refs.map(refKey))
      if (refs[0].kind === 'region')
        s.regions = reordered(
          s.regions,
          (r) => keys.has(refKey({ kind: 'region', id: r.id })),
          command.action,
        )
      else s.layers = reordered(s.layers, (r) => keys.has(refKey(r)), command.action)
      break
    }
    case 'create-region':
      s.regions.push(command.region)
      break
    case 'region-color': {
      const r = s.regions.find((r) => r.id === command.id)
      assert(r, '区域已不存在')
      r.color = command.color
      break
    }
    case 'add-widget':
      d.widgets.push(command.widget)
      s.widgetMeta[command.widget.id] = { title: '', locked: false }
      s.layers.push({ kind: 'widget', id: command.widget.id })
      break
    case 'clear':
      protect([...s.layers, ...s.regions.map((r) => ({ kind: 'region' as const, id: r.id }))])
      d.widgets = []
      d.layoutProfiles = {}
      s.widgetMeta = {}
      s.groups = []
      s.regions = []
      s.layers = []
      break
  }
  validateDashboard(d)
  validateCanvasTransition(current, d)
  return canonical(current) === canonical(d) ? current : d
}
