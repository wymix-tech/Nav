import 'fake-indexeddb/auto'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createDashboard, initialScene, type Dashboard } from '../packages/shared/src/index.ts'

const require = createRequire(new URL('../packages/frontend/package.json', import.meta.url))
const { createRenderer, ref, computed, nextTick } = require('vue')
const { createPinia, setActivePinia } = await import(
  require.resolve('pinia').replace('/index.cjs', '/dist/pinia.mjs')
)
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true })
Object.defineProperty(globalThis, 'document', {
  value: { activeElement: null },
  configurable: true,
})
const { useCanvasWorkspace } = await import('../packages/frontend/src/canvas/useCanvasWorkspace.ts')
const { useDashboardStore } = await import('../packages/frontend/src/stores/dashboardStore.ts')
const { useWidgetStore } = await import('../packages/frontend/src/stores/widgetStore.ts')
const { useCanvasLabels } = await import('../packages/frontend/src/canvas/useCanvasLabels.ts')
const { localDatabase: db } = await import('../packages/frontend/src/services/localDatabase.ts')
setActivePinia(createPinia())
const store = useDashboardStore()
const renderer = createRenderer({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
})
after(() => db.close())
function harness() {
  const d: Dashboard = createDashboard()
  d.widgets = ['one', 'two'].map((id) => ({
    id,
    widgetId: 'clock',
    source: 'builtin',
    config: {},
    layouts: {
      lg: { x: 0, y: 0, w: 2, h: 2 },
      md: { x: 0, y: 0, w: 2, h: 2 },
      sm: { x: 0, y: 0, w: 2, h: 2 },
      xs: { x: 0, y: 0, w: 2, h: 2 },
    },
    canvas: { x: 0, y: 0, w: 200, h: 200 },
  }))
  d.canvasScene = initialScene(['one', 'two'])
  d.canvasScene.groups = [{ id: 'g', title: 'Group', locked: false, memberIds: ['one', 'two'] }]
  d.canvasScene.layers = [{ kind: 'group', id: 'g' }]
  d.canvasScene.regions = [
    { id: 'r', title: 'Region', color: 'blue', locked: false, x: 0, y: 0, w: 500, h: 500 },
  ]
  const dashboard = ref(d),
    presentation = ref('list'),
    camera = ref({ centerX: 10, centerY: 20, zoom: 1 }),
    highlight = ref([]),
    notice = ref('')
  const queries: string[] = []
  const root = {
    scrollLeft: 7,
    scrollTop: 12,
    querySelector: (selector: string) => {
      queries.push(selector)
      return {
        scrollIntoView() {
          root.scrollLeft = 80
          root.scrollTop = 900
        },
      }
    },
  }
  let workspace!: ReturnType<typeof useCanvasWorkspace>
  const app = renderer.createApp({
    setup() {
      workspace = useCanvasWorkspace({
        dashboard: () => dashboard.value,
        canEdit: ref(false),
        root: ref(root),
        tool: ref('interact'),
        hand: ref(false),
        selected: ref([]),
        additive: ref(false),
        panel: ref('search'),
        notice,
        highlight,
        camera,
        list: computed(() => presentation.value === 'list'),
        presentation,
        names: ref({ builtin: { clock: '时钟' } }),
        ordered: computed(() => [...dashboard.value.widgets].reverse()),
        interaction: { cancel() {} } as any,
        fit() {
          camera.value = { centerX: 999, centerY: 999, zoom: 2 }
        },
        settleNavigation() {},
        choose: () => true,
      })
      return () => null
    },
  })
  app.mount({})
  return {
    workspace,
    root,
    camera,
    presentation,
    dashboard,
    highlight,
    queries,
    notice,
    unmount: () => app.unmount(),
  }
}

test('list widget/group search returns to the original scroll and camera without document history or writes', async (t) => {
  const h = harness()
  t.after(h.unmount)
  let writes = 0
  t.mock.method(store, 'applyCanvasCommand', async () => {
    writes++
    return true
  })
  const document = JSON.stringify(h.dashboard.value)
  await h.workspace.locate({ kind: 'widget', id: 'one' })
  assert.equal(h.root.scrollTop, 900)
  await h.workspace.locate({ kind: 'group', id: 'g' })
  assert.equal(h.queries.at(-1), '[data-widget-id="two"]')
  assert.deepEqual(h.highlight.value, ['two', 'one'])
  await h.workspace.back()
  assert.equal(h.root.scrollLeft, 7)
  assert.equal(h.root.scrollTop, 12)
  assert.equal(h.presentation.value, 'list')
  assert.deepEqual(h.camera.value, { centerX: 10, centerY: 20, zoom: 1 })
  assert.equal(JSON.stringify(h.dashboard.value), document)
  assert.equal(store.history.length, 0)
  assert.equal(writes, 0)
})

test('list region search returns to list presentation and scroll; a late return cannot scroll a new space', async (t) => {
  const h = harness()
  t.after(h.unmount)
  await h.workspace.locate({ kind: 'region', id: 'r' })
  assert.equal(h.presentation.value, 'spatial')
  h.root.scrollTop = 0
  await h.workspace.back()
  assert.equal(h.presentation.value, 'list')
  assert.equal(h.root.scrollTop, 12)
  assert.deepEqual(h.camera.value, { centerX: 10, centerY: 20, zoom: 1 })
  await h.workspace.locate({ kind: 'widget', id: 'one' })
  const returning = h.workspace.back()
  h.dashboard.value = { ...h.dashboard.value, instanceId: 'another-space' }
  h.root.scrollTop = 33
  await returning
  assert.equal(h.root.scrollTop, 33)
  await nextTick()
  await h.workspace.back()
  assert.equal(h.root.scrollTop, 33)
})

test('shared labels retain the builtin namespace when an installed catalog name collides', () => {
  const widgets = useWidgetStore()
  widgets.installedWidgets = [
    { widgetId: 'clock', manifest: { displayName: 'Plugin Clock' } },
  ] as any
  const names = useCanvasLabels()
  assert.equal(names.value.builtin!.clock, '时钟')
  assert.equal(names.value.installed!.clock, 'Plugin Clock')
})
