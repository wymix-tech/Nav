# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

INFI.NAV — 无限个人导航页，支持无限画布和网格两种布局模式，组件可自由拖拽放置，支持缩放、平移、全景预览小地图、跨设备同步和第三方组件扩展。

## 常用命令

**pnpm 全局路径需手动设置：**
```bash
export PATH="/Users/wymix/.hermes/node/bin:$PATH"
```

**开发：**
```bash
pnpm install
pnpm dev                           # 同时启动前端和后端（Turborepo）
pnpm dev:frontend                  # 仅前端（Vite, port 3000）
pnpm dev:server                    # 仅后端（Hono, port 4000）
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
pnpm prod:build    # 构建（含复制前端产物到 server/public）
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
- **状态管理：** Pinia（4 个 store：dashboardStore, widgetStore, authStore, canvasStore）
- **布局系统：** 双模式 — CSS Grid（网格）+ CSS transform（无限画布），完全自定义实现
- **本地存储：** Dexie.js（IndexedDB 封装，LocalAdapter 实现）
- **UI 风格：** Aura 设计系统（glass 效果、渐变背景、浮动控制面板）

**核心数据流：**
- `StorageAdapter` 接口（定义在 `@nav/shared`）屏蔽本地/后端存储差异
- `storageAdapter.ts` 运行时自动检测后端可用性，选择 `LocalAdapter` 或 `SyncAdapter`
- Pinia store 通过 adapter 读写数据，组件通过 store 间接操作数据

**布局模式：**
- **网格模式（grid）：** CSS Grid 实现，支持自定义列数（4-24），组件吸附到 20px 网格
- **画布模式（canvas）：** CSS `transform: translate() scale()` 实现无限画布，支持平移（左键拖拽）、缩放（Ctrl+滚轮）、全景预览小地图
- 默认画布模式，在偏好设置中切换
- 画布 viewport（panX/panY/zoom）持久化，刷新后恢复

**关键组件：**
- `DashboardGrid` — 布局容器，根据 `layoutMode` 切换网格/画布模式
- `CanvasGrid` — 无限画布：平移、缩放、组件拖拽/缩放、吸附网格、视口持久化
- `CanvasControls` — 右下角缩放控件栏（+/-/适应全部/回到中心/设为默认/小地图开关）
- `CanvasMinimap` — 全景预览小地图，嵌入工具栏，可拖拽视口框定位
- `WidgetWrapper` — 组件容器，编辑模式下显示工具栏，无边框融入背景
- `WidgetRenderer` — 根据组件来源（builtin/installed）动态加载
- `TopBar` — 浮动控制面板（左下角圆点，hover 展开）
- `WidgetLibrary` — 组件库浮动面板，画布模式下自动避让重叠放置
- `PreferencesPanel` — 偏好设置（标题、布局模式切换、背景、列数）
- `ConfirmDialog` — 毛玻璃确认弹窗

**内置组件（src/widgets/）：**
- `SearchWidget` — 多引擎搜索，glass 表单样式
- `ClockWidget` — 实时时钟，Outfit 字体渐变效果
- `WeatherWidget` — 天气查询（wttr.in API），内联配置，可编辑主机名
- `BookmarkWidget` — 书签分组，内联配置表单
- `MonitorWidget` — 系统监控（CPU/Mem/GPU/Disk），支持行内编辑主机名

### 后端（packages/server）

- **框架：** Hono（轻量 Web 框架）
- **数据库：** better-sqlite3（SQLite，文件存储）
- **认证：** JWT（密码通过环境变量 `NAV_PASSWORD` 配置，密钥通过 `NAV_JWT_SECRET`）
- **环境变量：** `NAV_PASSWORD`、`NAV_JWT_SECRET`、`NAV_DB_PATH`、`NAV_UPLOAD_DIR`
- **API 路由：** `/api/dashboards`、`/api/widgets`、`/api/system/stats`（无需认证）、`/api/system/version`、`/api/system/latest-release`（CNB 代理）、`/api/upload`

### 共享类型（packages/shared）

`tsconfig.json` 需要 `"composite": true` 以支持 project reference。

## 关键类型

```typescript
// 仪表盘
Dashboard { id, name, title, widgets, columns, rowHeight, background, layoutMode, viewport }

// 布局模式
LayoutMode = 'grid' | 'canvas'

// 画布视口
DashboardViewport { panX, panY, zoom, homeX, homeY }

// 组件实例
WidgetInstance { id, widgetId, source, config, layouts: { lg, md, sm, xs }, canvas?: CanvasLayout }

// 画布坐标（像素）
CanvasLayout { x, y, w, h }

// 背景配置
DashboardBackground { mode: 'color'|'image'|'slideshow', color, images, interval, index }

// 组件清单（第三方组件仓库根目录的 manifest.json）
WidgetManifest { name, displayName, version, entry, schema, size, minSize, ... }

// 存储适配器接口
StorageAdapter { getDashboard, saveDashboard, getInstalledWidgets, installWidget, ... }
```

## 数据库 Schema

`widget_instances` 表包含 `canvas` TEXT 字段（JSON 格式），存储画布坐标。
`dashboards` 表包含 `layout_mode` 和 `viewport` 字段。
新增字段通过 ALTER TABLE 自动迁移（try-catch 方式）。

## 组件开发规范

第三方组件需在仓库根目录包含 `manifest.json`，组件导出一个 Vue SFC，接收 `config`、`editing`、`editable` props，发出 `update:config` 和 `resize` 事件。

manifest 中的 `schema` 字段为 JSON Schema，用于自动生成配置表单。
manifest 中的 `size` 和 `minSize` 用于画布模式下的自适应缩放。

## 已知问题

- 后端启动需要 `NAV_JWT_SECRET` 环境变量，否则报错
- CORS 限制未配置
- 画布模式下 `prod.sh` 构建需确保 `packages/server/public/` 目录被正确复制（已修复）
