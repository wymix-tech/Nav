# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

无限个人导航页（INFI.NAV），支持拖拽布局、组件化扩展、跨设备同步和组件商店。用户可从组件库中选择组件（搜索框、时钟、天气、书签）自由排列在页面上，第三方开发者可通过 GitHub 仓库发布自定义组件。

设计规格：`docs/superpowers/specs/2026-05-16-personal-nav-dashboard-design.md`
实现计划：`docs/superpowers/plans/2026-05-16-personal-nav-dashboard.md`
UI 重设计方案：`docs/superpowers/design/ui-redesign-plan.md`

## 常用命令

**pnpm 全局路径需手动设置：**
```bash
export PATH="/Users/wymix/.hermes/node/bin:$PATH"
```

**开发：**
```bash
pnpm install
pnpm dev                           # 同时启动前端和后端（通过 Turborepo）
pnpm dev:frontend                  # 仅启动前端（Vite, port 3000）
pnpm dev:server                    # 仅启动后端（Hono, port 4000）
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

**生产部署：**
```bash
pnpm prod:build    # 构建
pnpm prod:start    # 启动
pnpm prod:stop     # 停止
pnpm prod:status   # 状态
```

## 架构

### Monorepo 结构（pnpm workspace + Turborepo）

```
packages/
├── shared/      # @nav/shared — 前后端共享 TypeScript 类型定义
├── frontend/    # @nav/frontend — Vue 3 + Vite SPA
└── server/      # @nav/server — Hono + better-sqlite3 后端
```

### 前端（packages/frontend）

- **框架：** Vue 3 Composition API + Vite
- **状态管理：** Pinia（3 个 store：dashboardStore, widgetStore, authStore）
- **布局系统：** vue-grid-layout-v3（自定义列数网格，支持拖拽/调整大小）
- **本地存储：** Dexie.js（IndexedDB 封装，LocalAdapter 实现）
- **UI 风格：** Aura 设计系统（glass 效果、渐变背景、浮动控制面板）

**核心数据流：**
- `StorageAdapter` 接口（定义在 `@nav/shared`）屏蔽本地/后端存储差异
- `storageAdapter.ts` 运行时自动检测后端可用性，选择 `LocalAdapter` 或 `SyncAdapter`
- Pinia store 通过 adapter 读写数据，组件通过 store 间接操作数据

**关键组件：**
- `DashboardGrid` — 网格布局，支持自定义列数（4-24），手动断点检测和布局压缩
- `WidgetWrapper` — 组件容器，编辑模式下显示工具栏，无边框融入背景
- `WidgetRenderer` — 根据组件来源（builtin/installed）动态加载
- `TopBar` — 浮动控制面板（左下角圆点，hover 展开），替代传统 header
- `WidgetLibrary` — 组件库浮动面板，可折叠，拖拽时自动隐藏
- `PreferencesPanel` — 偏好设置面板（标题、背景、列数配置）

**内置组件（src/widgets/）：**
- `SearchWidget` — 多引擎搜索，glass 表单样式
- `ClockWidget` — 实时时钟，Outfit 字体渐变效果
- `WeatherWidget` — 天气查询，内联配置表单
- `BookmarkWidget` — 书签分组，内联配置表单

### 后端（packages/server）

- **框架：** Hono（轻量 Web 框架）
- **数据库：** better-sqlite3（SQLite，文件存储）
- **认证：** JWT（密码通过环境变量 `NAV_PASSWORD` 配置，密钥通过 `NAV_JWT_SECRET`）
- **环境变量：** `NAV_PASSWORD`（登录密码）、`NAV_JWT_SECRET`（JWT 密钥）、`NAV_DB_PATH`（数据库路径）

### 共享类型（packages/shared）

`tsconfig.json` 需要 `"composite": true` 以支持 project reference。

## 关键类型

```typescript
// 仪表盘
Dashboard { id, name, title, widgets, columns, rowHeight, background }

// 组件实例（按断点存储布局）
WidgetInstance { id, widgetId, source, config, layouts: { lg, md, sm, xs } }

// 背景配置
DashboardBackground { mode: 'color'|'image'|'slideshow', color, images, interval, index }

// 组件清单（第三方组件仓库根目录的 manifest.json）
WidgetManifest { name, displayName, version, entry, schema, size, minSize, ... }

// 存储适配器接口
StorageAdapter { getDashboard, saveDashboard, getInstalledWidgets, installWidget, ... }
```

## 组件开发规范

第三方组件需在仓库根目录包含 `manifest.json`，组件导出一个 Vue SFC，接收 `config`、`editing`、`editable` props，发出 `update:config` 和 `resize` 事件。

manifest 中的 `schema` 字段为 JSON Schema，用于自动生成配置表单。

## 已知问题

- 后端启动需要 `NAV_JWT_SECRET` 环境变量，否则报错
- `vue-grid-layout-v3` 的响应式模式被禁用，改用手动断点检测（因库内部布局覆盖问题）
- CORS 限制未配置（BUG-005，暂不修复）
