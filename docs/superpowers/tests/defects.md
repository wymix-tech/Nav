# 个人导航页 — 缺陷报告

**报告日期：** 2026-05-22
**测试环境：** 前端 http://localhost:3000，后端 http://localhost:4000

---

## BUG-001：手机端侧边栏未隐藏

| 字段 | 内容 |
|------|------|
| **严重程度** | Important |
| **模块** | 布局系统 / UI 交互 |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-22 |
| **修复日期** | 2026-05-22 |
| **验证日期** | 2026-05-22 |

**复现步骤：**
1. 登录并进入编辑模式
2. 将浏览器视口缩小至 375px（手机宽度）
3. 观察页面布局

**预期结果：** 侧边栏隐藏或以全屏覆盖/底部抽屉形式显示

**实际结果：** 侧边栏（280px 宽）固定在右侧，超出视口右边界（375px），与主内容区域重叠。侧边栏右侧坐标为 500px，超过视口宽度。

**影响：** 手机端无法正常使用编辑功能，组件库面板遮挡主画布内容。

**修复建议：**
```css
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    width: 100%;
    max-height: 50vh;
    border-left: none;
    border-top: 1px solid var(--border);
    border-radius: 12px 12px 0 0;
  }
}
```

**关联测试用例：** TC-LAYOUT-003, TC-RESP-003

**验证结果：** 375px 视口下，侧边栏正确显示为底部抽屉，不再与主内容重叠。

---

## BUG-002：桌面端组件垂直排列

| 字段 | 内容 |
|------|------|
| **严重程度** | Minor |
| **模块** | 布局系统 |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-22 |
| **修复日期** | 2026-05-22 |
| **验证日期** | 2026-05-22 |

**复现步骤：**
1. 登录并进入编辑模式
2. 依次添加搜索框、时钟、天气、书签 4 个组件
3. 退出编辑模式查看布局

**预期结果：** 组件利用 12 列网格空间并排排列（如 2x2 或 3+1 布局）

**实际结果：** 所有 4 个组件垂直排列，每个组件占满整列宽度（约 475px），从上到下依次排列。

**影响：** 桌面端屏幕空间利用率低，页面需要大量滚动。

**分析：** 组件默认尺寸为 4x3 网格单位，在 12 列网格中占 1/3 宽度。但组件库添加组件时默认 `x: 0`，导致所有组件从第一列开始垂直堆叠。

**修复建议：**
修改 `WidgetLibrary.vue` 中的 `addToDashboard` 函数，根据当前已有组件数量自动计算 `x` 位置：

```typescript
function addToDashboard(widgetId: string, source: 'builtin' | 'installed') {
  const existingWidgets = dashboardStore.dashboard?.widgets ?? []
  const maxY = existingWidgets.reduce((max, w) => {
    const lg = w.layouts.lg
    return Math.max(max, lg.y + lg.h)
  }, 0)

  // 自动计算 x 位置，尝试并排排列
  const lastWidget = existingWidgets[existingWidgets.length - 1]
  let newX = 0
  let newY = maxY
  if (lastWidget) {
    const lastLg = lastWidget.layouts.lg
    newX = lastLg.x + lastLg.w
    if (newX + 4 > 12) { // 超出列数，换行
      newX = 0
      newY = lastLg.y + lastLg.h
    }
  }

  // ...
}
```

**关联测试用例：** TC-LAYOUT-001

**验证结果：** 添加 4 个组件后，3 个并排在第一行，第 4 个换到第二行。布局正确。

---

## BUG-003：天气组件无配置入口

| 字段 | 内容 |
|------|------|
| **严重程度** | Minor |
| **模块** | 组件系统 |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-22 |
| **修复日期** | 2026-05-22 |
| **验证日期** | 2026-05-22 |

**复现步骤：**
1. 登录并进入编辑模式
2. 添加天气组件到画布
3. 退出编辑模式

**预期结果：** 天气组件显示配置提示或自动生成配置表单

**实际结果：** 显示"请配置 API Key"文字，但无法点击配置。编辑模式下的配置按钮（⚙）只在组件有 schema 时显示，而内置组件没有 manifest/schema。

**影响：** 用户首次添加天气组件时无法配置 API Key，组件无法正常工作。

**分析：** 内置组件（search/clock/weather/bookmark）没有对应的 manifest.json 文件，因此 WidgetWrapper 中 `widgetSchema` 计算结果为 null，配置按钮不显示。

**修复建议：**
为内置组件创建 manifest 定义，或者在 WidgetWrapper 中为内置组件提供默认的 schema 配置。更简单的方案是为天气组件添加一个内联的配置区域。

**关联测试用例：** TC-WIDGET-005, TC-WIDGET-009

**验证结果：** 天气组件显示"点击配置天气"，点击后弹出配置表单（API Key、城市、单位）。

---

## BUG-004：拖拽功能异常

| 字段 | 内容 |
|------|------|
| **严重程度** | Critical |
| **模块** | 布局系统 |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-22 |
| **修复日期** | 2026-05-22 |
| **验证日期** | 2026-05-22 |

**复现步骤：**
1. 登录并进入编辑模式
2. 添加组件到画布
3. 尝试用鼠标拖拽组件到新位置

**预期结果：** 组件跟随鼠标移动，松开后固定在新位置

**实际结果：** 鼠标无法拖拽组件，组件位置不变

**影响：** 用户无法自定义组件布局，核心功能不可用

**分析：** vue3-grid-layout-next 的拖拽依赖鼠标事件（mousedown → mousemove → mouseup）。可能原因：
1. 组件被 WidgetWrapper 的 div 层级阻断了事件冒泡
2. vue3-grid-layout-next 版本与 Vue 3.5+ 不兼容
3. CSS `overflow: hidden` 或 `pointer-events` 阻止了拖拽
4. 编辑模式的 `is-draggable` 属性未正确传递

**修复建议：**
1. 检查 WidgetWrapper 的 CSS 是否有 `pointer-events: none` 或 `overflow: hidden`
2. 检查 vue3-grid-layout-next 的 drag handle 配置
3. 验证 `is-draggable` 属性是否正确绑定
4. 考虑换用其他 Vue 3 拖拽库（如 vue-draggable-plus）

**关联测试用例：** TC-LAYOUT-001, TC-LAYOUT-002

**验证结果：** 切换到 vue-grid-layout-v3 库后，拖拽和调整大小功能正常工作。单组件时水平拖拽为预期行为（网格自动紧凑）。

---

## BUG-005：CORS 未限制

| 字段 | 内容 |
|------|------|
| **严重程度** | Important |
| **模块** | 安全 |
| **状态** | ⏭️ 不修复 |
| **发现日期** | 2026-05-23 |

**复现步骤：**
1. 后端运行
2. 从任意域名发起跨域请求

**预期结果：** CORS 策略阻止非授权域名的请求

**实际结果：** 任意域名可访问 API（cors() 未配置 origin）

**影响：** 恶意网站可利用用户浏览器发起认证请求

**修复建议：** 在 Hono CORS 中间件中配置 origin：
```typescript
app.use('*', cors({ origin: process.env.NAV_CORS_ORIGIN ?? 'http://localhost:3000' }))
```

**关联测试用例：** TC-SEC-003

---

## BUG-006：布局变更始终写入 lg 断点

| 字段 | 内容 |
|------|------|
| **严重程度** | Important |
| **模块** | 布局系统 |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-24 |
| **修复日期** | 2026-05-24 |
| **验证日期** | 2026-05-24 |

**复现步骤：**
1. 在桌面端（lg 断点）添加组件并拖拽到指定位置
2. 缩小浏览器至手机宽度（xs 断点）
3. 在 xs 断点拖拽组件到不同位置
4. 恢复桌面宽度，检查组件位置

**预期结果：** xs 断点的布局变更只影响 xs 布局，lg 布局保持不变

**实际结果：** `handleLayoutUpdated` 始终将布局变更写入 `lg` 断点，手机端的拖拽操作会覆盖桌面端布局

**影响：** 多端编辑隔离失效，用户在手机端的布局调整会破坏桌面端布局

**分析：** `DashboardGrid.vue` 中 `handleLayoutUpdated` 函数硬编码写入 `lg`：
```typescript
// 修复前
emit('update-layout', item.i, {
  ...widget.layouts,
  lg: { x: item.x, y: item.y, w: item.w, h: item.h }, // 始终写入 lg
})
```
vue-grid-layout-v3 的 `@breakpoint-changed` 事件暴露当前断点名称，但未被使用。

**修复方案：** 添加 `currentBreakpoint` ref 跟踪当前断点，通过 `@breakpoint-changed` 更新，写入时使用动态键名：
```typescript
const currentBreakpoint = ref('lg')

function handleBreakpointChanged(bp: string) {
  currentBreakpoint.value = bp
}

function handleLayoutUpdated(newLayout: any[]) {
  for (const item of newLayout) {
    const widget = props.widgets.find((w) => w.id === item.i)
    if (!widget) continue
    emit('update-layout', item.i, {
      ...widget.layouts,
      [currentBreakpoint.value]: { x: item.x, y: item.y, w: item.w, h: item.h },
    })
  }
}
```

**关联测试用例：** TC-LAYOUT-005

**验证结果：** 在 xs 断点拖拽组件后，lg 布局数据未被修改，布局按断点独立存储。

---

## BUG-007：组件 CRUD API 路由 404

| 字段 | 内容 |
|------|------|
| **严重程度** | Critical |
| **模块** | 后端 API |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-24 |
| **修复日期** | 2026-05-24 |
| **验证日期** | 2026-05-24 |

**复现步骤：**
1. 登录后修改组件配置（如书签分组）
2. 刷新页面

**预期结果：** 配置数据从后端加载，刷新后保持

**实际结果：** 所有 `PUT /api/widgets/:id` 和 `DELETE /api/widgets/:id` 请求返回 404，配置数据丢失

**影响：** 组件配置和布局变更无法持久化到后端

**分析：** 后端路由挂载错误。`widgets.ts` 路由定义了 `PUT /:instanceId`，但挂载在 `/api/dashboards` 下，导致路径变为 `/api/dashboards/:instanceId`，而前端调用的是 `/api/widgets/:instanceId`。

**修复方案：** 修改 `widgets.ts` 路由路径为完整路径，挂载在 `/api` 下：
```typescript
// 修复前
widgets.put('/:instanceId', ...)
app.route('/api/dashboards', widgetRoutes) // 路径变为 /api/dashboards/:instanceId

// 修复后
widgets.put('/widgets/:instanceId', ...)
app.route('/api', widgetRoutes) // 路径变为 /api/widgets/:instanceId
```

**关联测试用例：** TC-WIDGET-006, TC-DATA-002

**验证结果：** PUT/DELETE 请求返回 200，配置数据正确保存和加载。

---

## BUG-008：组件配置更新后被旧数据覆盖

| 字段 | 内容 |
|------|------|
| **严重程度** | Important |
| **模块** | 前端状态管理 |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-24 |
| **修复日期** | 2026-05-24 |
| **验证日期** | 2026-05-24 |

**复现步骤：**
1. 修改组件配置（如书签分组）并保存
2. 立即刷新页面

**预期结果：** 新配置数据保留

**实际结果：** 配置被重置为空

**影响：** 用户修改的配置在保存后立即丢失

**分析：** `dashboardStore.updateWidgetConfig` 中 `save()` 和 `fetch PUT` 存在竞态条件。`save()` 异步调用 `SyncAdapter.saveDashboard()` → 触发 `GET /api/dashboards` → 重新加载整个 dashboard（此时 config 还没被后端保存），导致刚修改的 config 被旧数据覆盖。

**修复方案：** 移除 `updateWidgetConfig` 和 `updateWidgetLayouts` 中的 `save()` 调用，仅通过 PUT 请求持久化：
```typescript
function updateWidgetConfig(instanceId: string, config: Record<string, any>) {
  if (!dashboard.value) return
  const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
  if (widget) {
    widget.config = config
    fetch(`/api/widgets/${instanceId}`, { ... }) // 仅 PUT，不调用 save()
  }
}
```

**关联测试用例：** TC-WIDGET-006, TC-DATA-002

**验证结果：** 配置修改后刷新页面，数据正确保留。

---

## BUG-009：书签组件无配置入口

| 字段 | 内容 |
|------|------|
| **严重程度** | Minor |
| **模块** | 组件系统 |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-24 |
| **修复日期** | 2026-05-24 |
| **验证日期** | 2026-05-24 |

**复现步骤：**
1. 添加书签组件到画布
2. 点击"点击配置添加书签"

**预期结果：** 打开配置表单

**实际结果：** 无反应，文本未绑定点击事件

**影响：** 用户无法配置书签组件

**分析：** 书签组件显示"点击配置添加书签"提示文本，但未实现点击处理和配置表单。

**修复方案：** 为书签组件添加内联配置表单，包括：
- 分组名称输入
- 书签标题/URL 输入
- 添加/删除分组和书签
- 保存/取消操作
- 编辑模式下显示"⚙ 配置"按钮

**关联测试用例：** TC-WIDGET-006

**验证结果：** 点击配置提示打开表单，可添加分组和书签，保存后正确显示。

---

## BUG-010：手机端组件重叠不可见

| 字段 | 内容 |
|------|------|
| **严重程度** | Critical |
| **模块** | 布局系统 |
| **状态** | ✅ 已修复并验证 |
| **发现日期** | 2026-05-24 |
| **修复日期** | 2026-05-24 |
| **验证日期** | 2026-05-24 |

**复现步骤：**
1. 在桌面端添加多个组件（如 3 个时钟并排）
2. 在手机端（375px）查看页面

**预期结果：** 所有组件垂直排列，可滚动查看

**实际结果：** 多个组件重叠在同一位置，只能看到第一个组件

**影响：** 手机端只能看到部分组件，核心体验严重受损

**分析：** vue-grid-layout-v3 的 `responsiveGridLayout()` 在初始渲染时会用 lg 布局覆盖 `state.layouts` 中的响应式断点布局。即使通过 `responsiveLayouts` prop 传入了修正后的布局，也会被库内部覆盖。

**修复方案：** 禁用库的响应式模式（`responsive: false`），手动管理断点切换：
1. 通过 `window.innerWidth` 检测当前断点
2. 生成修正后的布局（无重叠），按比例缩放到 12 列
3. 将缩放后的布局直接传递给 GridItem
4. 拖拽/调整大小时逆向缩放回实际断点列数

**关联测试用例：** TC-RESP-001~004

**验证结果：** 桌面端 2 列网格正确，手机端垂直排列无重叠，所有组件可见。

---

## 缺陷统计

| 严重程度 | 已修复 | 不修复 | 总计 |
|---------|--------|--------|------|
| Critical | 3 | 0 | 3 |
| Important | 4 | 1 | 5 |
| Minor | 3 | 0 | 3 |
| **总计** | **10** | **1** | **11** |
