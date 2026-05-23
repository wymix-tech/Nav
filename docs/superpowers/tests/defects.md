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

## 缺陷统计

| 严重程度 | 数量 |
|---------|------|
| Critical | 0 |
| Important | 0 |
| Minor | 0 |
| **总计** | **0** |
