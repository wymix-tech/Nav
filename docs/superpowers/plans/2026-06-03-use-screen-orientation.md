# useScreenOrientation Composable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽取 `useScreenOrientation` composable 统一管理屏幕方向检测，修复 CanvasControls 在手机竖屏时未隐藏、canvas-mode CSS 类未受控、桌面端窗口缩放误触发等问题。

**Architecture:** 新建 composable 使用 `matchMedia('(orientation: portrait)')` 替代 `innerWidth <= innerHeight`，基于设备物理方向而非窗口尺寸判断，消除桌面端误报。App.vue 和 DashboardGrid.vue 共享同一数据源，消除重复代码。

**Tech Stack:** Vue 3 Composition API、TypeScript、matchMedia API

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `packages/frontend/src/composables/useScreenOrientation.ts` | 屏幕方向检测 composable，返回 isPortrait/isLandscape |
| Modify | `packages/frontend/src/App.vue:32-62` | 删除重复的方向检测逻辑，引入 composable |
| Modify | `packages/frontend/src/App.vue:169` | 修复 canvas-mode 类条件 |
| Modify | `packages/frontend/src/components/DashboardGrid.vue:29-46` | 删除重复的方向检测逻辑，引入 composable |

---

### Task 1: 创建 useScreenOrientation composable

**Files:**
- Create: `packages/frontend/src/composables/useScreenOrientation.ts`

- [ ] **Step 1: 创建 composables 目录并编写 composable**

```typescript
// packages/frontend/src/composables/useScreenOrientation.ts
import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 屏幕方向检测 composable
 *
 * 使用 matchMedia('(orientation: portrait)') 基于设备物理方向判断，
 * 而非 window.innerWidth <= innerHeight（后者在桌面端窗口缩放时会误报）。
 *
 * @returns isPortrait - 设备处于竖屏方向
 * @returns isLandscape - 设备处于横屏方向
 */
export function useScreenOrientation() {
  const mql = window.matchMedia('(orientation: portrait)')
  const isPortrait = ref(mql.matches)
  const isLandscape = ref(!mql.matches)

  function onChange(e: MediaQueryListEvent) {
    isPortrait.value = e.matches
    isLandscape.value = !e.matches
  }

  onMounted(() => {
    mql.addEventListener('change', onChange)
  })

  onUnmounted(() => {
    mql.removeEventListener('change', onChange)
  })

  return { isPortrait, isLandscape }
}
```

- [ ] **Step 2: 运行类型检查确认无报错**

Run: `cd packages/frontend && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: 无新增报错（vite/client 缺失是已有问题，与本次修改无关）

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/composables/useScreenOrientation.ts
git commit -m "feat: 新增 useScreenOrientation composable — 基于 matchMedia 统一屏幕方向检测"
```

---

### Task 2: App.vue 引入 composable 并清理重复代码

**Files:**
- Modify: `packages/frontend/src/App.vue:32-62`（删除旧逻辑，引入 composable）
- Modify: `packages/frontend/src/App.vue:169`（修复 canvas-mode 条件）
- Modify: `packages/frontend/src/App.vue:187`（更新 CanvasControls 条件）

- [ ] **Step 1: 替换 import 区域，添加 composable 导入**

在 `App.vue` 顶部 import 区域（约第 15 行 `import CanvasControls` 之后）添加：

```typescript
import { useScreenOrientation } from './composables/useScreenOrientation'
```

- [ ] **Step 2: 删除旧的方向检测代码（第 32-36 行）**

删除以下代码块：

```typescript
// 屏幕方向检测：竖屏模式下禁用画布相关功能
const isStackMode = ref(window.innerWidth <= window.innerHeight)
function updateScreenOrientation() {
  isStackMode.value = window.innerWidth <= window.innerHeight
}
```

替换为：

```typescript
// 屏幕方向检测（matchMedia 基于设备物理方向，桌面端窗口缩放不会误触发）
const { isPortrait } = useScreenOrientation()
```

- [ ] **Step 3: 删除 onMounted 中的方向监听（第 51-53 行）**

删除以下两行：

```typescript
  // 屏幕方向监听
  window.addEventListener('resize', updateScreenOrientation)
  window.addEventListener('orientationchange', updateScreenOrientation)
```

- [ ] **Step 4: 删除 onUnmounted 中的方向监听清理（第 60-61 行）**

删除以下两行：

```typescript
  window.removeEventListener('resize', updateScreenOrientation)
  window.removeEventListener('orientationchange', updateScreenOrientation)
```

- [ ] **Step 5: 修复 canvas-mode CSS 类条件（第 169 行）**

将：

```html
<main class="main" :class="{ 'canvas-mode': dashboardStore.dashboard?.layoutMode === 'canvas' }">
```

改为：

```html
<main class="main" :class="{ 'canvas-mode': dashboardStore.dashboard?.layoutMode === 'canvas' && !isPortrait }">
```

- [ ] **Step 6: 更新 CanvasControls v-if 条件（第 187 行）**

将 `isStackMode` 替换为 `isPortrait`：

```html
<CanvasControls
  v-if="dashboardStore.dashboard?.layoutMode === 'canvas' && !isPortrait"
  :widgets="dashboardStore.dashboard?.widgets ?? []"
/>
```

- [ ] **Step 7: 运行类型检查确认无报错**

Run: `cd packages/frontend && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: 无新增报错

- [ ] **Step 8: 提交**

```bash
git add packages/frontend/src/App.vue
git commit -m "refactor: App.vue 使用 useScreenOrientation composable 替代重复的方向检测逻辑

- 删除 isStackMode ref 和 updateScreenOrientation 函数
- 删除 resize/orientationchange 事件监听器
- 修复 canvas-mode CSS 类未受方向检测控制的 bug
- CanvasControls 条件改用 isPortrait"
```

---

### Task 3: DashboardGrid.vue 引入 composable 并清理重复代码

**Files:**
- Modify: `packages/frontend/src/components/DashboardGrid.vue:29-46`（删除旧逻辑，引入 composable）

- [ ] **Step 1: 添加 composable 导入**

在 `DashboardGrid.vue` 顶部 import 区域（约第 6 行 `import CanvasGrid` 之后）添加：

```typescript
import { useScreenOrientation } from '../composables/useScreenOrientation'
```

- [ ] **Step 2: 替换方向检测代码（第 29-46 行）**

删除以下代码块：

```typescript
// 屏幕方向检测：宽 > 高 = 横屏，否则竖屏
const isLandscape = ref(window.innerWidth > window.innerHeight)
const windowWidth = ref(window.innerWidth)

function updateLayout() {
  windowWidth.value = window.innerWidth
  isLandscape.value = window.innerWidth > window.innerHeight
}

onMounted(() => {
  updateLayout()
  window.addEventListener('resize', updateLayout)
  window.addEventListener('orientationchange', updateLayout)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateLayout)
  window.removeEventListener('orientationchange', updateLayout)
})
```

替换为：

```typescript
// 屏幕方向检测（共享 composable）
const { isLandscape } = useScreenOrientation()

// 窗口宽度（用于网格列数自适应）
const windowWidth = ref(window.innerWidth)

function updateWindowWidth() {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  updateWindowWidth()
  window.addEventListener('resize', updateWindowWidth)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateWindowWidth)
})
```

- [ ] **Step 3: 确认 isStackMode computed 无需修改**

`isStackMode` 在第 68 行定义为 `computed(() => !isLandscape.value)`，其中 `isLandscape` 现在来自 composable，无需改动。

- [ ] **Step 4: 运行类型检查确认无报错**

Run: `cd packages/frontend && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: 无新增报错

- [ ] **Step 5: 提交**

```bash
git add packages/frontend/src/components/DashboardGrid.vue
git commit -m "refactor: DashboardGrid 使用 useScreenOrientation composable 替代重复的方向检测逻辑

- 删除 isLandscape ref 和 updateLayout 中的方向检测
- 保留 windowWidth ref 用于网格列数自适应
- 删除冗余的 orientationchange 监听器"
```

---

### Task 4: 端到端验证

- [ ] **Step 1: 启动开发服务器验证**

Run: `pnpm dev:frontend`

手动验证场景：
1. 桌面端浏览器全屏 → CanvasControls 正常显示
2. 桌面端浏览器缩放到竖窄窗口（如 600×900）→ CanvasControls 仍显示（matchMedia 基于设备方向，不受窗口影响）
3. 桌面端浏览器缩放到正方形窗口（如 800×800）→ CanvasControls 仍显示
4. 手机竖屏 → CanvasControls 隐藏，堆叠模式有 padding
5. 手机横屏 → CanvasControls 显示，画布模式正常

- [ ] **Step 2: 类型检查**

Run: `cd packages/frontend && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: 无新增报错

- [ ] **Step 3: 最终提交（如有遗漏修改）**

```bash
git add -A
git commit -m "chore: useScreenOrientation composable 集成完成"
```
