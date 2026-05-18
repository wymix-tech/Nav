# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

个人导航页（Nav），支持拖拽布局、组件化扩展、跨设备同步和组件商店。用户可从组件库中选择组件（搜索框、时钟、天气等）自由排列在页面上，第三方开发者可通过 GitHub 仓库发布自定义组件。

设计规格：`docs/superpowers/specs/2026-05-16-personal-nav-dashboard-design.md`
实现计划：`docs/superpowers/plans/2026-05-16-personal-nav-dashboard.md`
实现进度：`docs/superpowers/progress.md`

## 常用命令

**pnpm 全局路径需手动设置：**
```bash
export PATH="/Users/wymix/.hermes/node/bin:$PATH"
```

**开发：**
```bash
pnpm install
pnpm dev                           # 同时启动前端和后端（通过 Turborepo）
cd packages/frontend && pnpm dev   # 仅启动前端（Vite, port 3000）
cd packages/server && pnpm dev     # 仅启动后端（Hono, port 4000）
```

**类型检查：**
```bash
cd packages/shared && npx tsc --noEmit
cd packages/frontend && npx vue-tsc --noEmit
cd packages/server && npx tsc --noEmit
```

**构建 shared 包（前端依赖它）：**
```bash
cd packages/shared && npx tsc --build
```

## 架构

### Monorepo 结构（pnpm workspace + Turborepo）

```
packages/
├── shared/      # @nav/shared — 前后端共享 TypeScript 类型定义
├── frontend/    # @nav/frontend — Vue 3 + Vite SPA
└── server/      # @nav/server — Hono + better-sqlite3 后端（可选）
```

### 前端（packages/frontend）

- **框架：** Vue 3 Composition API + Vite
- **状态管理：** Pinia（3 个 store：dashboardStore, widgetStore, authStore）
- **布局系统：** vue3-grid-layout-next（12 列响应式网格，支持拖拽/调整大小）
- **本地存储：** Dexie.js（IndexedDB 封装，LocalAdapter 实现）
- **CSS 变量：** 定义在 `src/styles/main.css`（--bg-primary, --bg-secondary, --bg-card, --text-primary, --text-secondary, --accent, --border, --radius）

**核心数据流：**
- `StorageAdapter` 接口（定义在 `@nav/shared`）屏蔽本地/后端存储差异
- `storageAdapter.ts` 运行时自动检测后端可用性，选择 `LocalAdapter` 或 `SyncAdapter`
- Pinia store 通过 adapter 读写数据，组件通过 store 间接操作数据

**组件系统：**
- 内置组件在 `src/widgets/` 目录，使用 `defineAsyncComponent` 延迟加载
- 第三方组件从 GitHub CDN 动态加载，遵循 manifest.json 规范
- `WidgetRenderer` 根据组件来源（builtin/installed）选择加载方式
- `WidgetWrapper` 提供编辑模式下的工具栏（配置/删除按钮）

### 后端（packages/server）

- **框架：** Hono（轻量 Web 框架）
- **数据库：** better-sqlite3（SQLite，文件存储）
- **认证：** JWT（密码通过环境变量 `NAV_PASSWORD` 配置）
- **API 代理：** Vite dev server 将 `/api` 请求代理到 localhost:4000

### 共享类型（packages/shared）

`tsconfig.json` 需要 `"composite": true` 以支持 project reference。

## 关键类型

```typescript
// 仪表盘
Dashboard { id, name, widgets: WidgetInstance[], columns, rowHeight }

// 组件实例（按断点存储布局）
WidgetInstance { id, widgetId, source, config, layouts: { lg, md, sm, xs } }

// 组件清单（第三方组件仓库根目录的 manifest.json）
WidgetManifest { name, displayName, version, entry, schema, size, minSize, ... }

// 存储适配器接口
StorageAdapter { getDashboard, saveDashboard, getInstalledWidgets, installWidget, ... }
```

## 组件开发规范

第三方组件需在仓库根目录包含 `manifest.json`，组件导出一个 Vue SFC，接收 `config`、`editing`、`editable` props，发出 `update:config` 和 `resize` 事件。

manifest 中的 `schema` 字段为 JSON Schema，用于自动生成配置表单。

## 当前状态

项目处于开发阶段（8/22 Task 完成）。`syncAdapter.ts` 为占位实现，内置组件（search, clock, weather, bookmark）尚未创建。详见 `docs/superpowers/progress.md`。
