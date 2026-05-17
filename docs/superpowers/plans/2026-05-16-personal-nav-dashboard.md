# 个人导航页实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可自定义的个人导航页，支持拖拽布局、组件化扩展、跨设备同步和组件商店。

**Architecture:** Vue 3 + Vite 前端 SPA，Hono + better-sqlite3 可选后端。Monorepo 结构（pnpm workspace + Turborepo）。前端优先，IndexedDB 本地存储，可接入后端实现 SQLite 同步。组件通过 manifest.json + 动态 import 从 CDN 加载。

**Tech Stack:** Vue 3, Vite, TypeScript, Pinia, vue-grid-layout, Dexie.js, Hono, better-sqlite3, pnpm, Turborepo

---

## 文件结构总览

```
nav/
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   └── types/
│   │   │       ├── dashboard.ts      # Dashboard, WidgetInstance, WidgetLayout
│   │   │       ├── widget.ts         # WidgetManifest, InstalledWidget, WidgetProps, WidgetEmits
│   │   │       ├── storage.ts        # StorageAdapter, Change, SyncState
│   │   │       └── auth.ts           # AuthState, LoginResponse
│   │   ├── src/index.ts              # 统一导出
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── App.vue
│   │   │   ├── components/
│   │   │   │   ├── DashboardGrid.vue        # vue-grid-layout 网格容器
│   │   │   │   ├── WidgetWrapper.vue        # 组件外壳（编辑 UI、拖拽手柄）
│   │   │   │   ├── WidgetRenderer.vue       # 动态加载并渲染组件
│   │   │   │   ├── TopBar.vue               # 顶栏（登录/编辑按钮）
│   │   │   │   ├── WidgetLibrary.vue        # 组件库面板
│   │   │   │   ├── WidgetConfigForm.vue     # JSON Schema 自动生成配置表单
│   │   │   │   ├── LoginDialog.vue          # 登录弹窗
│   │   │   │   └── InstallWidgetDialog.vue  # 安装组件弹窗
│   │   │   ├── widgets/
│   │   │   │   ├── SearchWidget.vue
│   │   │   │   ├── ClockWidget.vue
│   │   │   │   ├── WeatherWidget.vue
│   │   │   │   └── BookmarkWidget.vue
│   │   │   ├── stores/
│   │   │   │   ├── dashboardStore.ts
│   │   │   │   ├── widgetStore.ts
│   │   │   │   └── authStore.ts
│   │   │   ├── services/
│   │   │   │   ├── storageAdapter.ts        # 接口定义
│   │   │   │   ├── localAdapter.ts          # IndexedDB 实现
│   │   │   │   ├── syncAdapter.ts           # 后端同步实现
│   │   │   │   └── widgetLoader.ts          # 组件动态加载逻辑
│   │   │   └── styles/
│   │   │       └── main.css
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── server/
│       ├── src/
│       │   ├── index.ts                      # Hono 入口
│       │   ├── routes/
│       │   │   ├── auth.ts                   # POST /api/auth/login, /api/auth/verify
│       │   │   ├── dashboards.ts             # GET/PUT /api/dashboards
│       │   │   ├── widgets.ts                # CRUD /api/widgets
│       │   │   ├── installedWidgets.ts       # CRUD /api/installed-widgets
│       │   │   └── sync.ts                   # POST /api/sync/push, GET /api/sync/pull
│       │   ├── middleware/
│       │   │   └── auth.ts                   # JWT 认证中间件
│       │   └── db/
│       │       ├── database.ts               # SQLite 初始化 + 表创建
│       │       └── queries.ts                # 数据库查询封装
│       ├── package.json
│       └── tsconfig.json
│
├── pnpm-workspace.yaml
├── package.json
├── turbo.json
└── .gitignore
```

---

## Task 1: 项目脚手架 — Monorepo 初始化

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`

- [ ] **Step 1: 初始化 git 仓库并创建根 package.json**

```bash
cd /Users/wymix/Projects/Nav
git init
```

创建 `package.json`：

```json
{
  "name": "nav",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

- [ ] **Step 2: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: 创建 turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {}
  }
}
```

- [ ] **Step 4: 创建 .gitignore**

```gitignore
node_modules
dist
.turbo
*.local
.env
.env.*
```

- [ ] **Step 5: 安装依赖并验证**

```bash
pnpm install
```

Expected: turbo 安装成功，无报错。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: 初始化 monorepo 脚手架"
```

---

## Task 2: Shared 包 — 类型定义

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types/dashboard.ts`
- Create: `packages/shared/src/types/widget.ts`
- Create: `packages/shared/src/types/storage.ts`
- Create: `packages/shared/src/types/auth.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 shared 包结构**

`packages/shared/package.json`：

```json
{
  "name": "@nav/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

`packages/shared/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: 创建 dashboard.ts**

```typescript
export interface WidgetLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface WidgetInstance {
  id: string
  widgetId: string
  source: 'builtin' | 'installed'
  config: Record<string, any>
  layouts: {
    lg: WidgetLayout
    md: WidgetLayout
    sm: WidgetLayout
    xs: WidgetLayout
  }
}

export interface Dashboard {
  id: string
  name: string
  widgets: WidgetInstance[]
  columns: number
  rowHeight: number
}
```

- [ ] **Step 3: 创建 widget.ts**

```typescript
export interface WidgetManifest {
  name: string
  displayName: string
  version: string
  description: string
  author: string
  icon: string
  repository: string
  entry: string
  schema: Record<string, any>
  size: { w: number; h: number }
  minSize: { w: number; h: number }
  responsive?: {
    behavior: 'adaptive' | 'collapse' | 'hide'
    breakpoints: Record<string, { minWidth: number; layout: string }>
  }
  permissions?: string[]
}

export interface InstalledWidget {
  widgetId: string
  manifest: WidgetManifest
  cdnUrl: string
  installedAt: string
}

export interface WidgetProps {
  config: Record<string, any>
  editing: boolean
  editable: boolean
}

export interface WidgetEmits {
  'update:config': [value: Record<string, any>]
  'resize': [size: { w: number; h: number }]
}
```

- [ ] **Step 4: 创建 storage.ts**

```typescript
import type { Dashboard, WidgetInstance } from './dashboard'
import type { InstalledWidget } from './widget'

export type ChangeOperation = 'create' | 'update' | 'delete'
export type ChangeEntityType = 'dashboard' | 'widget_instance' | 'installed_widget'

export interface Change {
  entityType: ChangeEntityType
  entityId: string
  operation: ChangeOperation
  payload: any
  timestamp: string
}

export interface SyncState {
  lastSyncAt: string | null
  pendingChanges: number
}

export interface StorageAdapter {
  getDashboard(): Promise<Dashboard>
  saveDashboard(dashboard: Dashboard): Promise<void>
  getInstalledWidgets(): Promise<InstalledWidget[]>
  installWidget(widget: InstalledWidget): Promise<void>
  uninstallWidget(widgetId: string): Promise<void>
  getSyncState(): Promise<SyncState>
  push(changes: Change[]): Promise<void>
  pull(): Promise<Change[]>
}
```

- [ ] **Step 5: 创建 auth.ts**

```typescript
export interface AuthState {
  isAuthenticated: boolean
  token: string | null
}

export interface LoginResponse {
  token: string
  expiresIn: number
}
```

- [ ] **Step 6: 创建 index.ts 统一导出**

```typescript
export * from './types/dashboard'
export * from './types/widget'
export * from './types/storage'
export * from './types/auth'
```

- [ ] **Step 7: 验证类型检查**

```bash
cd packages/shared && pnpm lint
```

Expected: 无报错。

- [ ] **Step 8: 安装并验证 monorepo 依赖**

```bash
pnpm install
```

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat(shared): 添加共享类型定义"
```

---

## Task 3: 前端包初始化 — Vue 3 + Vite

**Files:**
- Create: `packages/frontend/package.json`
- Create: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/tsconfig.json`
- Create: `packages/frontend/index.html`
- Create: `packages/frontend/src/main.ts`
- Create: `packages/frontend/src/App.vue`
- Create: `packages/frontend/src/styles/main.css`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@nav/frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "lint": "vue-tsc --noEmit"
  },
  "dependencies": {
    "vue": "^3.5.0",
    "pinia": "^3.0.0",
    "vue-grid-layout": "^3.0.0-beta.1",
    "dexie": "^4.0.0",
    "@nav/shared": "workspace:*"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "vite": "^6.0.0",
    "vue-tsc": "^2.2.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "env.d.ts"],
  "references": [{ "path": "../shared" }]
}
```

创建 `packages/frontend/env.d.ts`：

```typescript
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
```

- [ ] **Step 4: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nav - 个人导航页</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: 创建 main.ts**

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
```

- [ ] **Step 6: 创建 App.vue**

```vue
<script setup lang="ts">
</script>

<template>
  <div class="app">
    <h1>Nav</h1>
    <p>个人导航页</p>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  padding: 16px;
}
</style>
```

- [ ] **Step 7: 创建 main.css**

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-card: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --border: #334155;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
}

button {
  cursor: pointer;
  border: none;
  border-radius: var(--radius);
  padding: 8px 16px;
  font-size: 14px;
  transition: background-color 0.2s;
}

button.primary {
  background-color: var(--accent);
  color: white;
}

button.primary:hover {
  background-color: var(--accent-hover);
}
```

- [ ] **Step 8: 安装依赖并验证 dev 启动**

```bash
pnpm install
cd packages/frontend && pnpm dev
```

Expected: Vite 启动在 http://localhost:3000，页面显示 "Nav - 个人导航页"。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat(frontend): 初始化 Vue 3 + Vite 前端项目"
```

---

## Task 4: 本地存储层 — Dexie.js (LocalAdapter)

**Files:**
- Create: `packages/frontend/src/services/localAdapter.ts`
- Create: `packages/frontend/src/services/storageAdapter.ts`

- [ ] **Step 1: 创建 storageAdapter.ts 接口**

从 shared 包复用 StorageAdapter 接口，添加工厂函数：

```typescript
import type { StorageAdapter } from '@nav/shared'
import { LocalAdapter } from './localAdapter'

let adapter: StorageAdapter | null = null

export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (adapter) return adapter

  // 尝试检测后端
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const { SyncAdapter } = await import('./syncAdapter')
      adapter = new SyncAdapter()
      return adapter
    }
  } catch {
    // 后端不可用
  }

  adapter = new LocalAdapter()
  return adapter
}
```

- [ ] **Step 2: 创建 localAdapter.ts**

```typescript
import Dexie, { type Table } from 'dexie'
import type {
  Dashboard,
  InstalledWidget,
  StorageAdapter,
  Change,
  SyncState,
} from '@nav/shared'

interface DashboardRow {
  id: string
  data: string
  updatedAt: string
}

interface InstalledWidgetRow {
  widgetId: string
  data: string
  installedAt: string
}

class NavDatabase extends Dexie {
  dashboards!: Table<DashboardRow>
  installedWidgets!: Table<InstalledWidgetRow>

  constructor() {
    super('nav')
    this.version(1).stores({
      dashboards: 'id',
      installedWidgets: 'widgetId',
    })
  }
}

const db = new NavDatabase()

const DEFAULT_DASHBOARD: Dashboard = {
  id: 'default',
  name: '我的导航',
  widgets: [],
  columns: 12,
  rowHeight: 80,
}

export class LocalAdapter implements StorageAdapter {
  async getDashboard(): Promise<Dashboard> {
    const row = await db.dashboards.get('default')
    if (!row) {
      await db.dashboards.put({
        id: 'default',
        data: JSON.stringify(DEFAULT_DASHBOARD),
        updatedAt: new Date().toISOString(),
      })
      return DEFAULT_DASHBOARD
    }
    return JSON.parse(row.data)
  }

  async saveDashboard(dashboard: Dashboard): Promise<void> {
    await db.dashboards.put({
      id: dashboard.id,
      data: JSON.stringify(dashboard),
      updatedAt: new Date().toISOString(),
    })
  }

  async getInstalledWidgets(): Promise<InstalledWidget[]> {
    const rows = await db.installedWidgets.toArray()
    return rows.map((r) => JSON.parse(r.data))
  }

  async installWidget(widget: InstalledWidget): Promise<void> {
    await db.installedWidgets.put({
      widgetId: widget.widgetId,
      data: JSON.stringify(widget),
      installedAt: new Date().toISOString(),
    })
  }

  async uninstallWidget(widgetId: string): Promise<void> {
    await db.installedWidgets.delete(widgetId)
  }

  async getSyncState(): Promise<SyncState> {
    return { lastSyncAt: null, pendingChanges: 0 }
  }

  async push(_changes: Change[]): Promise<void> {
    // 本地模式无需 push
  }

  async pull(): Promise<Change[]> {
    return []
  }
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd packages/frontend && pnpm lint
```

Expected: 无报错。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(frontend): 实现 LocalAdapter 本地存储层"
```

---

## Task 5: Pinia 状态管理

**Files:**
- Create: `packages/frontend/src/stores/dashboardStore.ts`
- Create: `packages/frontend/src/stores/widgetStore.ts`
- Create: `packages/frontend/src/stores/authStore.ts`

- [ ] **Step 1: 创建 dashboardStore.ts**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Dashboard, WidgetInstance } from '@nav/shared'
import { getStorageAdapter } from '../services/storageAdapter'

export const useDashboardStore = defineStore('dashboard', () => {
  const dashboard = ref<Dashboard | null>(null)
  const loading = ref(true)

  async function load() {
    const adapter = await getStorageAdapter()
    dashboard.value = await adapter.getDashboard()
    loading.value = false
  }

  async function save() {
    if (!dashboard.value) return
    const adapter = await getStorageAdapter()
    await adapter.saveDashboard(dashboard.value)
  }

  function addWidget(instance: WidgetInstance) {
    if (!dashboard.value) return
    dashboard.value.widgets.push(instance)
    save()
  }

  function removeWidget(instanceId: string) {
    if (!dashboard.value) return
    dashboard.value.widgets = dashboard.value.widgets.filter(
      (w) => w.id !== instanceId
    )
    save()
  }

  function updateWidgetConfig(instanceId: string, config: Record<string, any>) {
    if (!dashboard.value) return
    const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
    if (widget) {
      widget.config = config
      save()
    }
  }

  function updateWidgetLayouts(instanceId: string, layouts: WidgetInstance['layouts']) {
    if (!dashboard.value) return
    const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
    if (widget) {
      widget.layouts = layouts
      save()
    }
  }

  return {
    dashboard,
    loading,
    load,
    save,
    addWidget,
    removeWidget,
    updateWidgetConfig,
    updateWidgetLayouts,
  }
})
```

- [ ] **Step 2: 创建 widgetStore.ts**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { InstalledWidget } from '@nav/shared'
import { getStorageAdapter } from '../services/storageAdapter'

export const useWidgetStore = defineStore('widget', () => {
  const installedWidgets = ref<InstalledWidget[]>([])
  const loading = ref(true)

  async function load() {
    const adapter = await getStorageAdapter()
    installedWidgets.value = await adapter.getInstalledWidgets()
    loading.value = false
  }

  async function install(widget: InstalledWidget) {
    const adapter = await getStorageAdapter()
    await adapter.installWidget(widget)
    installedWidgets.value.push(widget)
  }

  async function uninstall(widgetId: string) {
    const adapter = await getStorageAdapter()
    await adapter.uninstallWidget(widgetId)
    installedWidgets.value = installedWidgets.value.filter(
      (w) => w.widgetId !== widgetId
    )
  }

  function getWidget(widgetId: string): InstalledWidget | undefined {
    return installedWidgets.value.find((w) => w.widgetId === widgetId)
  }

  return {
    installedWidgets,
    loading,
    load,
    install,
    uninstall,
    getWidget,
  }
})
```

- [ ] **Step 3: 创建 authStore.ts**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const TOKEN_KEY = 'nav_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const isAuthenticated = computed(() => !!token.value)

  async function login(password: string): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) return false
      const data = await res.json()
      token.value = data.token
      localStorage.setItem(TOKEN_KEY, data.token)
      return true
    } catch {
      return false
    }
  }

  function logout() {
    token.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  async function verify(): Promise<boolean> {
    if (!token.value) return false
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      if (!res.ok) {
        logout()
        return false
      }
      return true
    } catch {
      return false
    }
  }

  function getAuthHeaders(): Record<string, string> {
    if (!token.value) return {}
    return { Authorization: `Bearer ${token.value}` }
  }

  return {
    token,
    isAuthenticated,
    login,
    logout,
    verify,
    getAuthHeaders,
  }
})
```

- [ ] **Step 4: 验证编译**

```bash
cd packages/frontend && pnpm lint
```

Expected: 无报错。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(frontend): 实现 Pinia 状态管理（dashboard, widget, auth）"
```

---

## Task 6: 顶栏组件 — TopBar

**Files:**
- Create: `packages/frontend/src/components/TopBar.vue`
- Modify: `packages/frontend/src/App.vue`

- [ ] **Step 1: 创建 TopBar.vue**

```vue
<script setup lang="ts">
import { useAuthStore } from '../stores/authStore'

const auth = useAuthStore()

defineProps<{
  editing: boolean
}>()

const emit = defineEmits<{
  'toggle-edit': []
  'login': []
}>()
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <h1 class="logo">Nav</h1>
    </div>
    <div class="topbar-right">
      <template v-if="auth.isAuthenticated">
        <button class="primary" @click="emit('toggle-edit')">
          {{ editing ? '完成编辑' : '编辑' }}
        </button>
        <button @click="auth.logout()">退出登录</button>
      </template>
      <template v-else>
        <button class="primary" @click="emit('login')">登录</button>
      </template>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.logo {
  font-size: 20px;
  font-weight: 700;
}

.topbar-right {
  display: flex;
  gap: 8px;
}

button {
  padding: 6px 16px;
  font-size: 13px;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

button.primary {
  border: none;
}
</style>
```

- [ ] **Step 2: 更新 App.vue 集成 TopBar**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import { useDashboardStore } from './stores/dashboardStore'
import { useWidgetStore } from './stores/widgetStore'
import { useAuthStore } from './stores/authStore'

const dashboardStore = useDashboardStore()
const widgetStore = useWidgetStore()
const authStore = useAuthStore()
const editing = ref(false)

onMounted(async () => {
  await Promise.all([dashboardStore.load(), widgetStore.load()])
  // 有后端时自动验证 token
  try {
    await authStore.verify()
  } catch {
    // 无后端，忽略
  }
})

function toggleEdit() {
  editing.value = !editing.value
}

function handleLogin() {
  // TODO: 弹出登录对话框
}
</script>

<template>
  <div class="app">
    <TopBar :editing="editing" @toggle-edit="toggleEdit" @login="handleLogin" />
    <main class="main">
      <p v-if="dashboardStore.loading">加载中...</p>
      <p v-else>仪表盘已加载，共 {{ dashboardStore.dashboard?.widgets.length ?? 0 }} 个组件</p>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main {
  flex: 1;
  padding: 24px;
}
</style>
```

- [ ] **Step 3: 验证 dev 启动**

```bash
cd packages/frontend && pnpm dev
```

Expected: 页面显示顶栏，含 Nav logo 和登录按钮。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(frontend): 实现 TopBar 顶栏组件"
```

---

## Task 7: 网格布局系统 — DashboardGrid

**Files:**
- Create: `packages/frontend/src/components/DashboardGrid.vue`
- Modify: `packages/frontend/src/App.vue`

- [ ] **Step 1: 创建 DashboardGrid.vue**

vue-grid-layout 在 Vue 3 中需使用 `vue-grid-layout@next` 或社区 fork。此处使用 `vue3-grid-layout` 作为替代（API 兼容）。

先安装：

```bash
cd packages/frontend && pnpm add vue3-grid-layout-next
```

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import type { WidgetInstance, WidgetLayout } from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'

const props = defineProps<{
  widgets: WidgetInstance[]
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update-layout': [instanceId: string, layouts: WidgetInstance['layouts']]
  'remove-widget': [instanceId: string]
  'update-config': [instanceId: string, config: Record<string, any>]
}>()

// 将多断点布局转换为 vue-grid-layout 需要的格式
function toGridLayouts(widgets: WidgetInstance[]) {
  const result: Record<string, any[]> = { lg: [], md: [], sm: [], xs: [] }
  for (const w of widgets) {
    for (const [bp, layout] of Object.entries(w.layouts)) {
      result[bp].push({
        i: w.id,
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h,
        minW: 2,
        minH: 2,
      })
    }
  }
  return result
}

const layouts = computed(() => toGridLayouts(props.widgets))

function handleLayoutUpdated(newLayout: any[]) {
  for (const item of newLayout) {
    const widget = props.widgets.find((w) => w.id === item.i)
    if (!widget) continue
    // 只更新当前断点的布局，其他断点保持不变
    // vue-grid-layout 会通过 breakpoint 参数告知当前断点
    emit('update-layout', item.i, {
      ...widget.layouts,
      lg: { x: item.x, y: item.y, w: item.w, h: item.h },
    })
  }
}
</script>

<template>
  <div class="dashboard-grid">
    <GridLayout
      :layout="layouts.lg"
      :col-num="12"
      :row-height="80"
      :is-draggable="editing"
      :is-resizable="editing"
      :responsive="true"
      :breakpoints="{ lg: 1200, md: 992, sm: 768, xs: 480 }"
      :cols="{ lg: 12, md: 8, sm: 6, xs: 4 }"
      @layout-updated="handleLayoutUpdated"
    >
      <GridItem
        v-for="widget in widgets"
        :key="widget.id"
        :i="widget.id"
        :x="layouts.lg.find((l: any) => l.i === widget.id)?.x ?? 0"
        :y="layouts.lg.find((l: any) => l.i === widget.id)?.y ?? 0"
        :w="layouts.lg.find((l: any) => l.i === widget.id)?.w ?? 4"
        :h="layouts.lg.find((l: any) => l.i === widget.id)?.h ?? 3"
        :min-w="2"
        :min-h="2"
      >
        <WidgetWrapper
          :widget="widget"
          :editing="editing"
          :editable="editable"
          @remove="emit('remove-widget', widget.id)"
          @update-config="(config) => emit('update-config', widget.id, config)"
        />
      </GridItem>
    </GridLayout>
  </div>
</template>

<style scoped>
.dashboard-grid {
  width: 100%;
}
</style>
```

- [ ] **Step 2: 更新 App.vue 集成 DashboardGrid**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import DashboardGrid from './components/DashboardGrid.vue'
import { useDashboardStore } from './stores/dashboardStore'
import { useWidgetStore } from './stores/widgetStore'
import { useAuthStore } from './stores/authStore'

const dashboardStore = useDashboardStore()
const widgetStore = useWidgetStore()
const authStore = useAuthStore()
const editing = ref(false)

onMounted(async () => {
  await Promise.all([dashboardStore.load(), widgetStore.load()])
  try { await authStore.verify() } catch {}
})

function toggleEdit() { editing.value = !editing.value }
function handleLogin() { /* Task 8 实现 */ }
</script>

<template>
  <div class="app">
    <TopBar :editing="editing" @toggle-edit="toggleEdit" @login="handleLogin" />
    <main class="main">
      <p v-if="dashboardStore.loading">加载中...</p>
      <DashboardGrid
        v-else-if="dashboardStore.dashboard"
        :widgets="dashboardStore.dashboard.widgets"
        :editing="editing"
        :editable="authStore.isAuthenticated"
        @remove-widget="dashboardStore.removeWidget"
        @update-config="(id, cfg) => dashboardStore.updateWidgetConfig(id, cfg)"
        @update-layout="(id, layouts) => dashboardStore.updateWidgetLayouts(id, layouts)"
      />
    </main>
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; }
.main { flex: 1; padding: 24px; }
</style>
```

- [ ] **Step 3: 验证 dev 启动**

```bash
cd packages/frontend && pnpm dev
```

Expected: 空的网格布局页面渲染正常，无报错。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(frontend): 实现 DashboardGrid 网格布局系统"
```

---

## Task 8: WidgetWrapper 和 WidgetRenderer

**Files:**
- Create: `packages/frontend/src/components/WidgetWrapper.vue`
- Create: `packages/frontend/src/components/WidgetRenderer.vue`

- [ ] **Step 1: 创建 WidgetRenderer.vue**

动态加载组件的核心：

```vue
<script setup lang="ts">
import { defineAsyncComponent, computed } from 'vue'
import type { WidgetInstance, WidgetManifest, WidgetProps } from '@nav/shared'

const props = defineProps<{
  widget: WidgetInstance
  manifest?: WidgetManifest
  editing: boolean
  editable: boolean
}>()

// 内置组件映射
const builtinComponents: Record<string, any> = {
  search: defineAsyncComponent(() => import('../widgets/SearchWidget.vue')),
  clock: defineAsyncComponent(() => import('../widgets/ClockWidget.vue')),
  weather: defineAsyncComponent(() => import('../widgets/WeatherWidget.vue')),
  bookmark: defineAsyncComponent(() => import('../widgets/BookmarkWidget.vue')),
}

// 外部组件通过 CDN 动态加载
const externalComponent = computed(() => {
  if (props.widget.source !== 'installed' || !props.manifest) return null
  return defineAsyncComponent({
    loader: () => import(/* @vite-ignore */ props.manifest!.entry),
    timeout: 10000,
    onError(error, retry, fail) {
      console.error('组件加载失败:', error)
      fail()
    },
  })
})

const component = computed(() => {
  if (props.widget.source === 'builtin') {
    return builtinComponents[props.widget.widgetId] ?? null
  }
  return externalComponent.value
})
</script>

<template>
  <Suspense>
    <component
      v-if="component"
      :is="component"
      :config="widget.config"
      :editing="editing"
      :editable="editable"
      @update:config="$emit('update:config', $event)"
    />
    <template #fallback>
      <div class="widget-loading">加载中...</div>
    </template>
  </Suspense>
</template>

<style scoped>
.widget-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
```

- [ ] **Step 2: 创建 WidgetWrapper.vue**

```vue
<script setup lang="ts">
import type { WidgetInstance } from '@nav/shared'
import WidgetRenderer from './WidgetRenderer.vue'

defineProps<{
  widget: WidgetInstance
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  remove: []
  'update-config': [config: Record<string, any>]
}>()
</script>

<template>
  <div class="widget-wrapper" :class="{ editing }">
    <div v-if="editing && editable" class="widget-toolbar">
      <button class="toolbar-btn config-btn" title="配置">⚙</button>
      <button class="toolbar-btn remove-btn" title="删除" @click="emit('remove')">✕</button>
    </div>
    <div class="widget-content">
      <WidgetRenderer
        :widget="widget"
        :editing="editing"
        :editable="editable"
        @update:config="(cfg) => emit('update-config', cfg)"
      />
    </div>
  </div>
</template>

<style scoped>
.widget-wrapper {
  height: 100%;
  background-color: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.widget-wrapper.editing {
  border-color: var(--accent);
  border-style: dashed;
}

.widget-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 8px;
  background-color: rgba(0, 0, 0, 0.2);
}

.toolbar-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
  border-radius: 4px;
}

.toolbar-btn:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.1);
}

.remove-btn:hover {
  color: #ef4444;
}

.widget-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
}
</style>
```

- [ ] **Step 3: 验证编译**

```bash
cd packages/frontend && pnpm lint
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(frontend): 实现 WidgetWrapper 和 WidgetRenderer 组件"
```

---

## Task 9: 内置组件 — SearchWidget

**Files:**
- Create: `packages/frontend/src/widgets/SearchWidget.vue`

- [ ] **Step 1: 创建 SearchWidget.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

const query = ref('')
const engines: Record<string, string> = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  baidu: 'https://www.baidu.com/s?wd=',
  duckduckgo: 'https://duckduckgo.com/?q=',
}

const currentEngine = ref(props.config.engine ?? 'google')

function search() {
  if (!query.value.trim()) return
  const url = (engines[currentEngine.value] ?? engines.google) + encodeURIComponent(query.value)
  window.open(url, '_blank')
}

function switchEngine(engine: string) {
  currentEngine.value = engine
  emit('update:config', { ...props.config, engine })
}
</script>

<template>
  <div class="search-widget">
    <form @submit.prevent="search" class="search-form">
      <input
        v-model="query"
        type="text"
        placeholder="搜索..."
        class="search-input"
        :disabled="editing"
      />
      <button type="submit" class="search-btn" :disabled="editing">搜索</button>
    </form>
    <div class="engine-list">
      <button
        v-for="(url, name) in engines"
        :key="name"
        :class="['engine-btn', { active: currentEngine === name }]"
        @click="switchEngine(name as string)"
      >
        {{ name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-widget {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  justify-content: center;
}

.search-form {
  display: flex;
  gap: 8px;
}

.search-input {
  flex: 1;
  padding: 10px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-btn {
  padding: 10px 20px;
  background-color: var(--accent);
  color: white;
  font-size: 14px;
}

.engine-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.engine-btn {
  padding: 4px 10px;
  font-size: 12px;
  background-color: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.engine-btn.active {
  background-color: var(--accent);
  color: white;
  border-color: var(--accent);
}
</style>
```

- [ ] **Step 2: 验证编译**

```bash
cd packages/frontend && pnpm lint
```

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat(frontend): 实现 SearchWidget 搜索组件"
```

---

## Task 10: 内置组件 — ClockWidget

**Files:**
- Create: `packages/frontend/src/widgets/ClockWidget.vue`

- [ ] **Step 1: 创建 ClockWidget.vue**

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const time = ref('')
const date = ref('')
let timer: ReturnType<typeof setInterval>

function updateTime() {
  const now = new Date()
  time.value = now.toLocaleTimeString('zh-CN', { hour12: false })
  date.value = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  })
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>

<template>
  <div class="clock-widget">
    <div class="time">{{ time }}</div>
    <div class="date">{{ date }}</div>
  </div>
</template>

<style scoped>
.clock-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
}

.time {
  font-size: 36px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 2px;
}

.date {
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
```

- [ ] **Step 2: 验证编译并提交**

```bash
cd packages/frontend && pnpm lint
git add -A
git commit -m "feat(frontend): 实现 ClockWidget 时钟组件"
```

---

## Task 11: 内置组件 — WeatherWidget

**Files:**
- Create: `packages/frontend/src/widgets/WeatherWidget.vue`

- [ ] **Step 1: 创建 WeatherWidget.vue**

```vue
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const props = defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

const weather = ref<{ temp: number; description: string; icon: string } | null>(null)
const error = ref('')

async function fetchWeather() {
  const apiKey = props.config.apiKey
  const city = props.config.city ?? 'Beijing'
  if (!apiKey) {
    error.value = '请配置 API Key'
    return
  }
  try {
    const unit = props.config.unit === 'fahrenheit' ? 'imperial' : 'metric'
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=${unit}&lang=zh_cn`
    )
    if (!res.ok) throw new Error('请求失败')
    const data = await res.json()
    weather.value = {
      temp: Math.round(data.main.temp),
      description: data.weather[0].description,
      icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
    }
    error.value = ''
  } catch (e: any) {
    error.value = e.message ?? '获取天气失败'
  }
}

onMounted(fetchWeather)
watch(() => props.config.city, fetchWeather)
</script>

<template>
  <div class="weather-widget">
    <template v-if="error">
      <div class="error">{{ error }}</div>
    </template>
    <template v-else-if="weather">
      <img :src="weather.icon" :alt="weather.description" class="weather-icon" />
      <div class="temp">{{ weather.temp }}°</div>
      <div class="desc">{{ weather.description }}</div>
      <div class="city">{{ config.city ?? '北京' }}</div>
    </template>
    <template v-else>
      <div class="loading">加载中...</div>
    </template>
  </div>
</template>

<style scoped>
.weather-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 4px;
}

.weather-icon {
  width: 48px;
  height: 48px;
}

.temp {
  font-size: 28px;
  font-weight: 700;
}

.desc {
  font-size: 14px;
  color: var(--text-secondary);
}

.city {
  font-size: 12px;
  color: var(--text-secondary);
}

.error {
  color: #ef4444;
  font-size: 13px;
  text-align: center;
}

.loading {
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
```

- [ ] **Step 2: 验证编译并提交**

```bash
cd packages/frontend && pnpm lint
git add -A
git commit -m "feat(frontend): 实现 WeatherWidget 天气组件"
```

---

## Task 12: 内置组件 — BookmarkWidget

**Files:**
- Create: `packages/frontend/src/widgets/BookmarkWidget.vue`

- [ ] **Step 1: 创建 BookmarkWidget.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

interface Bookmark {
  title: string
  url: string
  icon?: string
}

interface BookmarkGroup {
  name: string
  bookmarks: Bookmark[]
}

const groups = computed<BookmarkGroup[]>(() => props.config.groups ?? [])

function getFavicon(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="bookmark-widget">
    <div v-if="groups.length === 0" class="empty">
      <span v-if="editable && editing">点击配置添加书签</span>
      <span v-else>暂无书签</span>
    </div>
    <div v-for="group in groups" :key="group.name" class="group">
      <div class="group-name">{{ group.name }}</div>
      <div class="bookmarks">
        <a
          v-for="bm in group.bookmarks"
          :key="bm.url"
          :href="editing ? undefined : bm.url"
          :target="editing ? undefined : '_blank'"
          class="bookmark-item"
          :class="{ 'no-link': editing }"
        >
          <img
            :src="bm.icon || getFavicon(bm.url)"
            :alt="bm.title"
            class="bookmark-icon"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <span class="bookmark-title">{{ bm.title }}</span>
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookmark-widget {
  overflow-y: auto;
  height: 100%;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 13px;
}

.group {
  margin-bottom: 12px;
}

.group:last-child {
  margin-bottom: 0;
}

.group-name {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bookmarks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bookmark-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background-color: var(--bg-primary);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text-primary);
  font-size: 13px;
  transition: background-color 0.2s;
}

.bookmark-item:not(.no-link):hover {
  background-color: var(--accent);
}

.bookmark-icon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
}

.bookmark-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}
</style>
```

- [ ] **Step 2: 验证编译并提交**

```bash
cd packages/frontend && pnpm lint
git add -A
git commit -m "feat(frontend): 实现 BookmarkWidget 书签组件"
```

---

## Task 13: 登录弹窗 — LoginDialog

**Files:**
- Create: `packages/frontend/src/components/LoginDialog.vue`
- Modify: `packages/frontend/src/App.vue`

- [ ] **Step 1: 创建 LoginDialog.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/authStore'

const auth = useAuthStore()
const password = ref('')
const error = ref('')
const loading = ref(false)

const emit = defineEmits<{
  close: []
  success: []
}>()

async function handleLogin() {
  if (!password.value) return
  loading.value = true
  error.value = ''
  const ok = await auth.login(password.value)
  loading.value = false
  if (ok) {
    emit('success')
    emit('close')
  } else {
    error.value = '密码错误'
  }
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog">
      <h2>登录</h2>
      <form @submit.prevent="handleLogin">
        <input
          v-model="password"
          type="password"
          placeholder="输入访问密码"
          class="input"
          autofocus
        />
        <p v-if="error" class="error">{{ error }}</p>
        <div class="actions">
          <button type="button" @click="emit('close')">取消</button>
          <button type="submit" class="primary" :disabled="loading">
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 360px;
}

.dialog h2 {
  margin-bottom: 16px;
  font-size: 18px;
}

.input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.input:focus {
  border-color: var(--accent);
}

.error {
  color: #ef4444;
  font-size: 13px;
  margin-top: 8px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.actions button {
  padding: 8px 20px;
  font-size: 14px;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.actions button.primary {
  border: none;
}
</style>
```

- [ ] **Step 2: 更新 App.vue 集成 LoginDialog**

在 `App.vue` 的 `<script setup>` 中添加：

```typescript
import LoginDialog from './components/LoginDialog.vue'
const showLogin = ref(false)
function handleLogin() { showLogin.value = true }
```

在模板中 `<TopBar />` 后添加：

```vue
<LoginDialog v-if="showLogin" @close="showLogin = false" />
```

- [ ] **Step 3: 验证 dev 启动**

```bash
cd packages/frontend && pnpm dev
```

Expected: 点击登录按钮弹出登录对话框。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(frontend): 实现 LoginDialog 登录弹窗"
```

---

## Task 14: 组件配置表单 — WidgetConfigForm

**Files:**
- Create: `packages/frontend/src/components/WidgetConfigForm.vue`

- [ ] **Step 1: 创建 WidgetConfigForm.vue**

根据 manifest 中的 JSON Schema 自动生成配置表单：

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  schema: Record<string, any>
  modelValue: Record<string, any>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const formData = ref<Record<string, any>>({ ...props.modelValue })

watch(
  () => props.modelValue,
  (val) => { formData.value = { ...val } },
  { deep: true }
)

const fields = computed(() => {
  if (!props.schema?.properties) return []
  return Object.entries(props.schema.properties).map(([key, prop]: [string, any]) => ({
    key,
    title: prop.title ?? key,
    type: prop.type ?? 'string',
    enum: prop.enum,
    default: prop.default,
    required: (props.schema.required ?? []).includes(key),
  }))
})

function updateField(key: string, value: any) {
  formData.value[key] = value
  emit('update:modelValue', { ...formData.value })
}
</script>

<template>
  <form class="config-form" @submit.prevent>
    <div v-for="field in fields" :key="field.key" class="form-field">
      <label class="label">
        {{ field.title }}
        <span v-if="field.required" class="required">*</span>
      </label>

      <select
        v-if="field.enum"
        :value="formData[field.key] ?? field.default"
        @change="updateField(field.key, ($event.target as HTMLSelectElement).value)"
        class="input"
      >
        <option v-for="opt in field.enum" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <input
        v-else-if="field.type === 'number'"
        type="number"
        :value="formData[field.key] ?? field.default"
        @input="updateField(field.key, Number(($event.target as HTMLInputElement).value))"
        class="input"
      />

      <input
        v-else-if="field.type === 'boolean'"
        type="checkbox"
        :checked="formData[field.key] ?? field.default"
        @change="updateField(field.key, ($event.target as HTMLInputElement).checked)"
      />

      <input
        v-else
        type="text"
        :value="formData[field.key] ?? field.default ?? ''"
        @input="updateField(field.key, ($event.target as HTMLInputElement).value)"
        class="input"
      />
    </div>
  </form>
</template>

<style scoped>
.config-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.required {
  color: #ef4444;
}

.input {
  padding: 8px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.input:focus {
  border-color: var(--accent);
}
</style>
```

- [ ] **Step 2: 验证编译并提交**

```bash
cd packages/frontend && pnpm lint
git add -A
git commit -m "feat(frontend): 实现 WidgetConfigForm JSON Schema 配置表单"
```

---

## Task 15: 组件库面板 — WidgetLibrary + InstallWidgetDialog

**Files:**
- Create: `packages/frontend/src/components/WidgetLibrary.vue`
- Create: `packages/frontend/src/components/InstallWidgetDialog.vue`

- [ ] **Step 1: 创建 WidgetLibrary.vue**

```vue
<script setup lang="ts">
import { useWidgetStore } from '../stores/widgetStore'
import { useDashboardStore } from '../stores/dashboardStore'
import type { WidgetInstance, WidgetLayout } from '@nav/shared'

const widgetStore = useWidgetStore()
const dashboardStore = useDashboardStore()

const emit = defineEmits<{
  'show-install': []
}>()

function createDefaultLayout(col: number, row: number): WidgetLayout {
  return { x: col, y: row, w: 4, h: 3 }
}

function addToDashboard(widgetId: string, source: 'builtin' | 'installed') {
  const existingWidgets = dashboardStore.dashboard?.widgets ?? []
  const maxY = existingWidgets.reduce((max, w) => {
    const lg = w.layouts.lg
    return Math.max(max, lg.y + lg.h)
  }, 0)

  const instance: WidgetInstance = {
    id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    widgetId,
    source,
    config: {},
    layouts: {
      lg: createDefaultLayout(0, maxY),
      md: createDefaultLayout(0, maxY),
      sm: createDefaultLayout(0, maxY),
      xs: createDefaultLayout(0, maxY),
    },
  }
  dashboardStore.addWidget(instance)
}

const builtinWidgets = [
  { id: 'search', name: '搜索框', icon: '🔍' },
  { id: 'clock', name: '时钟', icon: '🕐' },
  { id: 'weather', name: '天气', icon: '🌤️' },
  { id: 'bookmark', name: '书签', icon: '📑' },
]
</script>

<template>
  <div class="widget-library">
    <div class="library-header">
      <h3>组件库</h3>
      <button class="primary" @click="emit('show-install')">安装组件</button>
    </div>

    <div class="section">
      <h4>内置组件</h4>
      <div class="widget-list">
        <div
          v-for="w in builtinWidgets"
          :key="w.id"
          class="widget-item"
          @click="addToDashboard(w.id, 'builtin')"
        >
          <span class="widget-icon">{{ w.icon }}</span>
          <span class="widget-name">{{ w.name }}</span>
        </div>
      </div>
    </div>

    <div v-if="widgetStore.installedWidgets.length > 0" class="section">
      <h4>已安装组件</h4>
      <div class="widget-list">
        <div
          v-for="w in widgetStore.installedWidgets"
          :key="w.widgetId"
          class="widget-item"
          @click="addToDashboard(w.widgetId, 'installed')"
        >
          <span class="widget-icon">{{ w.manifest.icon }}</span>
          <span class="widget-name">{{ w.manifest.displayName }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-library {
  padding: 16px;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.library-header h3 {
  font-size: 16px;
}

.section {
  margin-bottom: 16px;
}

.section h4 {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.widget-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.widget-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.2s;
}

.widget-item:hover {
  border-color: var(--accent);
}

.widget-icon {
  font-size: 18px;
}
</style>
```

- [ ] **Step 2: 创建 InstallWidgetDialog.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useWidgetStore } from '../stores/widgetStore'
import type { InstalledWidget, WidgetManifest } from '@nav/shared'

const widgetStore = useWidgetStore()
const repoUrl = ref('')
const loading = ref(false)
const error = ref('')
const preview = ref<WidgetManifest | null>(null)

const emit = defineEmits<{
  close: []
}>()

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function fetchManifest(owner: string, repo: string): Promise<WidgetManifest> {
  const branches = ['main', 'master']
  for (const branch of branches) {
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/manifest.json`
      )
      if (res.ok) return await res.json()
    } catch {}
  }
  throw new Error('无法获取 manifest.json，请确认仓库地址正确')
}

function validateManifest(m: any): m is WidgetManifest {
  return m && m.name && m.displayName && m.version && m.entry
}

async function handlePreview() {
  const parsed = parseRepoUrl(repoUrl.value)
  if (!parsed) {
    error.value = '请输入有效的 GitHub 仓库地址'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const manifest = await fetchManifest(parsed.owner, parsed.repo)
    if (!validateManifest(manifest)) {
      error.value = 'manifest.json 格式不正确'
      return
    }
    preview.value = manifest
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function handleInstall() {
  if (!preview.value) return
  const parsed = parseRepoUrl(repoUrl.value)!
  const cdnUrl = `https://cdn.jsdelivr.net/gh/${parsed.owner}/${parsed.repo}@${preview.value.version}/${preview.value.entry}`

  // 预加载测试
  try {
    await import(/* @vite-ignore */ cdnUrl)
  } catch {
    error.value = '组件代码加载失败，请检查 manifest.entry 配置'
    return
  }

  const installed: InstalledWidget = {
    widgetId: preview.value.name,
    manifest: preview.value,
    cdnUrl,
    installedAt: new Date().toISOString(),
  }
  await widgetStore.install(installed)
  emit('close')
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog">
      <h2>安装组件</h2>
      <div v-if="!preview">
        <input
          v-model="repoUrl"
          type="text"
          placeholder="输入 GitHub 仓库地址，如 https://github.com/user/widget"
          class="input"
          autofocus
        />
        <p v-if="error" class="error">{{ error }}</p>
        <div class="actions">
          <button @click="emit('close')">取消</button>
          <button class="primary" :disabled="loading" @click="handlePreview">
            {{ loading ? '获取中...' : '预览' }}
          </button>
        </div>
      </div>
      <div v-else>
        <div class="preview">
          <div class="preview-row"><strong>名称：</strong>{{ preview.displayName }}</div>
          <div class="preview-row"><strong>版本：</strong>{{ preview.version }}</div>
          <div class="preview-row"><strong>作者：</strong>{{ preview.author }}</div>
          <div class="preview-row"><strong>描述：</strong>{{ preview.description }}</div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="actions">
          <button @click="preview = null">返回</button>
          <button class="primary" :disabled="loading" @click="handleInstall">
            {{ loading ? '安装中...' : '安装' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 480px;
}

.dialog h2 { margin-bottom: 16px; font-size: 18px; }

.input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.input:focus { border-color: var(--accent); }

.error { color: #ef4444; font-size: 13px; margin-top: 8px; }

.preview { margin-bottom: 16px; }

.preview-row {
  padding: 6px 0;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
}

.preview-row:last-child { border-bottom: none; }

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.actions button {
  padding: 8px 20px;
  font-size: 14px;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.actions button.primary { border: none; }
</style>
```

- [ ] **Step 3: 验证编译并提交**

```bash
cd packages/frontend && pnpm lint
git add -A
git commit -m "feat(frontend): 实现 WidgetLibrary 和 InstallWidgetDialog"
```

---

## Task 16: 后端初始化 — Hono + SQLite

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/db/database.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@nav/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "@hono/node-server": "^1.14.0",
    "better-sqlite3": "^11.8.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "@nav/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/bcryptjs": "^2.4.0",
    "@types/jsonwebtoken": "^9.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: 创建 database.ts**

```typescript
import Database from 'better-sqlite3'
import { resolve } from 'path'

const DB_PATH = process.env.NAV_DB_PATH ?? resolve(process.cwd(), 'nav.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS dashboards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    columns     INTEGER DEFAULT 12,
    row_height  INTEGER DEFAULT 80,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS widget_instances (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
    widget_id    TEXT NOT NULL,
    source       TEXT NOT NULL,
    config       TEXT,
    layouts      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS installed_widgets (
    widget_id    TEXT PRIMARY KEY,
    manifest     TEXT NOT NULL,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS change_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    operation   TEXT NOT NULL,
    payload     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced      INTEGER DEFAULT 0
  );
`)

export default db
```

- [ ] **Step 4: 创建 index.ts**

```typescript
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import './db/database.js'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/api/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT ?? 4000)
console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
```

- [ ] **Step 5: 安装依赖并验证启动**

```bash
pnpm install
cd packages/server && pnpm dev
```

Expected: 服务启动在 http://localhost:4000，`GET /api/health` 返回 `{ "status": "ok" }`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(server): 初始化 Hono + SQLite 后端服务"
```

---

## Task 17: 后端 API — 数据库查询封装

**Files:**
- Create: `packages/server/src/db/queries.ts`

- [ ] **Step 1: 创建 queries.ts**

```typescript
import db from './database.js'

// Dashboard
export function getDashboard(id: string) {
  return db.prepare('SELECT * FROM dashboards WHERE id = ?').get(id) as any
}

export function upsertDashboard(d: { id: string; name: string; columns: number; rowHeight: number }) {
  db.prepare(`
    INSERT INTO dashboards (id, name, columns, row_height, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      columns = excluded.columns,
      row_height = excluded.row_height,
      updated_at = CURRENT_TIMESTAMP
  `).run(d.id, d.name, d.columns, d.rowHeight)
}

// Widget Instances
export function getWidgetInstances(dashboardId: string) {
  return db.prepare('SELECT * FROM widget_instances WHERE dashboard_id = ?').all(dashboardId) as any[]
}

export function insertWidgetInstance(w: any) {
  db.prepare(`
    INSERT INTO widget_instances (id, dashboard_id, widget_id, source, config, layouts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(w.id, w.dashboardId, w.widgetId, w.source, JSON.stringify(w.config), JSON.stringify(w.layouts))
}

export function updateWidgetInstance(id: string, updates: { config?: any; layouts?: any }) {
  const sets: string[] = ['updated_at = CURRENT_TIMESTAMP']
  const values: any[] = []
  if (updates.config !== undefined) {
    sets.push('config = ?')
    values.push(JSON.stringify(updates.config))
  }
  if (updates.layouts !== undefined) {
    sets.push('layouts = ?')
    values.push(JSON.stringify(updates.layouts))
  }
  values.push(id)
  db.prepare(`UPDATE widget_instances SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteWidgetInstance(id: string) {
  db.prepare('DELETE FROM widget_instances WHERE id = ?').run(id)
}

// Installed Widgets
export function getInstalledWidgets() {
  return db.prepare('SELECT * FROM installed_widgets').all() as any[]
}

export function insertInstalledWidget(w: { widgetId: string; manifest: any }) {
  db.prepare(`
    INSERT OR REPLACE INTO installed_widgets (widget_id, manifest, installed_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(w.widgetId, JSON.stringify(w.manifest))
}

export function deleteInstalledWidget(widgetId: string) {
  db.prepare('DELETE FROM installed_widgets WHERE widget_id = ?').run(widgetId)
}
```

- [ ] **Step 2: 验证编译并提交**

```bash
cd packages/server && pnpm lint
git add -A
git commit -m "feat(server): 实现数据库查询封装"
```

---

## Task 18: 后端 API — 认证中间件

**Files:**
- Create: `packages/server/src/middleware/auth.ts`
- Create: `packages/server/src/routes/auth.ts`

- [ ] **Step 1: 创建 auth 中间件**

```typescript
import type { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.NAV_JWT_SECRET ?? 'nav-default-secret-change-me'
const JWT_EXPIRES_IN = process.env.NAV_JWT_EXPIRES ?? '7d'

export function generateToken(): string {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET)
    return true
  } catch {
    return false
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: '未登录' } }, 401)
  }
  const token = authHeader.slice(7)
  if (!verifyToken(token)) {
    return c.json({ error: { code: 'TOKEN_INVALID', message: 'Token 无效或已过期' } }, 401)
  }
  await next()
}
```

- [ ] **Step 2: 创建 auth 路由**

```typescript
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { generateToken, verifyToken } from '../middleware/auth.js'

const auth = new Hono()

const PASSWORD_HASH = process.env.NAV_PASSWORD_HASH
  ?? (process.env.NAV_PASSWORD
    ? bcrypt.hashSync(process.env.NAV_PASSWORD, 10)
    : null)

auth.post('/login', async (c) => {
  if (!PASSWORD_HASH) {
    return c.json({ error: { code: 'NO_PASSWORD', message: '服务端未配置密码' } }, 500)
  }
  const { password } = await c.req.json()
  if (!password || !bcrypt.compareSync(password, PASSWORD_HASH)) {
    return c.json({ error: { code: 'INVALID_PASSWORD', message: '密码错误' } }, 401)
  }
  const token = generateToken()
  return c.json({ token, expiresIn: 7 * 24 * 3600 })
})

auth.post('/verify', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ valid: false }, 401)
  }
  const valid = verifyToken(authHeader.slice(7))
  return c.json({ valid }, valid ? 200 : 401)
})

export default auth
```

- [ ] **Step 3: 注册路由到 index.ts**

更新 `packages/server/src/index.ts`：

```typescript
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import './db/database.js'
import authRoutes from './routes/auth.js'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/auth', authRoutes)

const port = Number(process.env.PORT ?? 4000)
console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
```

- [ ] **Step 4: 验证编译**

```bash
cd packages/server && pnpm lint
```

- [ ] **Step 5: 验证登录 API**

```bash
NAV_PASSWORD=test123 pnpm dev &
# 另一个终端
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"test123"}'
```

Expected: 返回 `{ "token": "...", "expiresIn": 604800 }`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(server): 实现认证中间件和登录 API"
```

---

## Task 19: 后端 API — 仪表盘和组件路由

**Files:**
- Create: `packages/server/src/routes/dashboards.ts`
- Create: `packages/server/src/routes/widgets.ts`
- Create: `packages/server/src/routes/installedWidgets.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 创建 dashboards.ts**

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import * as q from '../db/queries.js'

const dashboards = new Hono()

dashboards.get('/', (c) => {
  const d = q.getDashboard('default')
  if (!d) {
    q.upsertDashboard({ id: 'default', name: '我的导航', columns: 12, rowHeight: 80 })
    const fresh = q.getDashboard('default')
    const widgets = q.getWidgetInstances('default')
    return c.json({ ...fresh, widgets })
  }
  const widgets = q.getWidgetInstances('default')
  return c.json({ ...d, widgets })
})

dashboards.put('/:id', authMiddleware, async (c) => {
  const body = await c.req.json()
  q.upsertDashboard({ id: c.req.param('id'), name: body.name, columns: body.columns, rowHeight: body.rowHeight })
  return c.json({ success: true })
})

export default dashboards
```

- [ ] **Step 2: 创建 widgets.ts**

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import * as q from '../db/queries.js'

const widgets = new Hono()

widgets.post('/:dashboardId/widgets', authMiddleware, async (c) => {
  const body = await c.req.json()
  const id = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  q.insertWidgetInstance({
    id,
    dashboardId: c.req.param('dashboardId'),
    widgetId: body.widgetId,
    source: body.source,
    config: body.config ?? {},
    layouts: body.layouts,
  })
  return c.json({ id, ...body })
})

widgets.put('/:instanceId', authMiddleware, async (c) => {
  const body = await c.req.json()
  q.updateWidgetInstance(c.req.param('instanceId'), { config: body.config, layouts: body.layouts })
  return c.json({ success: true })
})

widgets.delete('/:instanceId', authMiddleware, (c) => {
  q.deleteWidgetInstance(c.req.param('instanceId'))
  return c.json({ success: true })
})

export default widgets
```

- [ ] **Step 3: 创建 installedWidgets.ts**

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import * as q from '../db/queries.js'

const installedWidgets = new Hono()

installedWidgets.get('/', (c) => {
  const rows = q.getInstalledWidgets()
  const result = rows.map((r: any) => ({
    widgetId: r.widget_id,
    manifest: JSON.parse(r.manifest),
    installedAt: r.installed_at,
  }))
  return c.json(result)
})

installedWidgets.post('/', authMiddleware, async (c) => {
  const body = await c.req.json()
  q.insertInstalledWidget({ widgetId: body.widgetId, manifest: body.manifest })
  return c.json({ success: true })
})

installedWidgets.delete('/:widgetId', authMiddleware, (c) => {
  q.deleteInstalledWidget(c.req.param('widgetId'))
  return c.json({ success: true })
})

export default installedWidgets
```

- [ ] **Step 4: 更新 index.ts 注册所有路由**

```typescript
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import './db/database.js'
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboards.js'
import widgetRoutes from './routes/widgets.js'
import installedWidgetRoutes from './routes/installedWidgets.js'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/auth', authRoutes)
app.route('/api/dashboards', dashboardRoutes)
app.route('/api/dashboards', widgetRoutes)
app.route('/api/installed-widgets', installedWidgetRoutes)

const port = Number(process.env.PORT ?? 4000)
console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
```

- [ ] **Step 5: 验证编译并提交**

```bash
cd packages/server && pnpm lint
git add -A
git commit -m "feat(server): 实现仪表盘和组件 CRUD API"
```

---

## Task 20: 前端 SyncAdapter — 后端同步

**Files:**
- Create: `packages/frontend/src/services/syncAdapter.ts`
- Modify: `packages/frontend/src/services/storageAdapter.ts`（更新导入）

- [ ] **Step 1: 创建 syncAdapter.ts**

```typescript
import type {
  Dashboard,
  InstalledWidget,
  StorageAdapter,
  Change,
  SyncState,
} from '@nav/shared'
import { useAuthStore } from '../stores/authStore'

const API_BASE = '/api'

async function apiFetch(path: string, options: RequestInit = {}) {
  const authStore = useAuthStore()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authStore.getAuthHeaders(),
    ...(options.headers as Record<string, string> ?? {}),
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (res.status === 401) {
    authStore.logout()
    throw new Error('未登录或 Token 已过期')
  }
  return res
}

export class SyncAdapter implements StorageAdapter {
  async getDashboard(): Promise<Dashboard> {
    const res = await apiFetch('/dashboards')
    if (!res.ok) throw new Error('获取仪表盘失败')
    const data = await res.json()
    return {
      id: data.id,
      name: data.name,
      columns: data.columns,
      rowHeight: data.row_height,
      widgets: (data.widgets ?? []).map((w: any) => ({
        id: w.id,
        widgetId: w.widget_id,
        source: w.source,
        config: JSON.parse(w.config ?? '{}'),
        layouts: JSON.parse(w.layouts ?? '{}'),
      })),
    }
  }

  async saveDashboard(dashboard: Dashboard): Promise<void> {
    await apiFetch(`/dashboards/${dashboard.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: dashboard.name,
        columns: dashboard.columns,
        rowHeight: dashboard.rowHeight,
      }),
    })
  }

  async getInstalledWidgets(): Promise<InstalledWidget[]> {
    const res = await apiFetch('/installed-widgets')
    if (!res.ok) return []
    return res.json()
  }

  async installWidget(widget: InstalledWidget): Promise<void> {
    await apiFetch('/installed-widgets', {
      method: 'POST',
      body: JSON.stringify(widget),
    })
  }

  async uninstallWidget(widgetId: string): Promise<void> {
    await apiFetch(`/installed-widgets/${widgetId}`, { method: 'DELETE' })
  }

  async getSyncState(): Promise<SyncState> {
    return { lastSyncAt: new Date().toISOString(), pendingChanges: 0 }
  }

  async push(_changes: Change[]): Promise<void> {
    // 简化实现：直接通过 API 操作，不需要额外 push
  }

  async pull(): Promise<Change[]> {
    return []
  }
}
```

- [ ] **Step 2: 验证编译并提交**

```bash
cd packages/frontend && pnpm lint
git add -A
git commit -m "feat(frontend): 实现 SyncAdapter 后端同步"
```

---

## Task 21: 完善 App.vue — 整合所有组件

**Files:**
- Modify: `packages/frontend/src/App.vue`

- [ ] **Step 1: 更新 App.vue 整合完整功能**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import DashboardGrid from './components/DashboardGrid.vue'
import LoginDialog from './components/LoginDialog.vue'
import WidgetLibrary from './components/WidgetLibrary.vue'
import InstallWidgetDialog from './components/InstallWidgetDialog.vue'
import WidgetConfigForm from './components/WidgetConfigForm.vue'
import { useDashboardStore } from './stores/dashboardStore'
import { useWidgetStore } from './stores/widgetStore'
import { useAuthStore } from './stores/authStore'

const dashboardStore = useDashboardStore()
const widgetStore = useWidgetStore()
const authStore = useAuthStore()
const editing = ref(false)
const showLogin = ref(false)
const showInstall = ref(false)
const showLibrary = ref(false)
const configuringWidget = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([dashboardStore.load(), widgetStore.load()])
  try { await authStore.verify() } catch {}
})

function toggleEdit() {
  editing.value = !editing.value
  if (!editing.value) showLibrary.value = false
}

function handleLogin() { showLogin.value = true }

function handleLoginSuccess() {
  // 登录成功后，如果有后端则自动切换到 SyncAdapter
}
</script>

<template>
  <div class="app">
    <TopBar :editing="editing" @toggle-edit="toggleEdit" @login="handleLogin" />

    <main class="main">
      <p v-if="dashboardStore.loading">加载中...</p>
      <template v-else-if="dashboardStore.dashboard">
        <DashboardGrid
          :widgets="dashboardStore.dashboard.widgets"
          :editing="editing"
          :editable="authStore.isAuthenticated"
          @remove-widget="dashboardStore.removeWidget"
          @update-config="(id, cfg) => dashboardStore.updateWidgetConfig(id, cfg)"
          @update-layout="(id, layouts) => dashboardStore.updateWidgetLayouts(id, layouts)"
        />
      </template>
    </main>

    <aside v-if="editing && authStore.isAuthenticated" class="sidebar">
      <WidgetLibrary @show-install="showInstall = true" />
    </aside>

    <LoginDialog
      v-if="showLogin"
      @close="showLogin = false"
      @success="handleLoginSuccess"
    />

    <InstallWidgetDialog
      v-if="showInstall"
      @close="showInstall = false"
    />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main {
  flex: 1;
  padding: 24px;
}

.sidebar {
  position: fixed;
  right: 0;
  top: 53px;
  bottom: 0;
  width: 280px;
  background-color: var(--bg-secondary);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  z-index: 50;
}
</style>
```

- [ ] **Step 2: 验证 dev 启动**

```bash
cd packages/frontend && pnpm dev
```

Expected: 完整的导航页界面，包含顶栏、网格、侧边栏（编辑模式下）。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat(frontend): 整合所有组件，完善 App.vue"
```

---

## Task 22: 端到端验证

- [ ] **Step 1: 启动前端**

```bash
cd packages/frontend && pnpm dev
```

- [ ] **Step 2: 验证本地模式**

- 页面正常加载
- 顶栏显示"登录"按钮
- 编辑模式下可拖拽组件（但需要先有组件）
- 组件库面板可打开

- [ ] **Step 3: 启动后端**

```bash
NAV_PASSWORD=test123 cd packages/server && pnpm dev
```

- [ ] **Step 4: 验证登录流程**

- 点击"登录"，输入密码 `test123`
- 登录成功后顶栏显示"编辑"和"退出登录"
- 可进入编辑模式

- [ ] **Step 5: 验证组件添加**

- 进入编辑模式，打开组件库
- 点击"搜索框"，组件出现在网格中
- 点击"时钟"，组件出现在网格中
- 退出编辑模式，组件正常展示

- [ ] **Step 6: 验证跨断点**

- 调整浏览器窗口大小
- 组件在不同断点下正确布局

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: 端到端验证通过"
```

---

## 后续扩展（不在本计划内）

- Docker 状态组件
- 系统监控组件
- 音乐播放器组件
- 组件配置弹窗（点击⚙弹出 WidgetConfigForm）
- 同步冲突解决 UI
- 组件更新检查
- 组件商店索引页面
- 响应式布局自动生成缺失断点
- 组件权限声明与校验
