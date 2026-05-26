# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## 常用命令

**环境设置：**
```bash
export PATH="/Users/wymix/.hermes/node/bin:$PATH" # pnpm 全局路径，macOS 环境需要手动设置
```

**开发：**
```bash
pnpm install                 # 安装所有依赖
pnpm dev                     # 通过 Turborepo 同时启动前端 (3000) 和后端 (4000)
pnpm dev:frontend            # 仅启动前端 Vite 开发服务器
pnpm dev:server              # 仅启动后端 Hono 开发服务器
```

**类型检查（构建 shared 包后执行）：**
```bash
cd packages/shared && npx tsc --noEmit
cd packages/frontend && npx vue-tsc --noEmit
cd packages/server && npx tsc --noEmit
```

**构建 shared 包（前端类型依赖它，修改 shared 后必须执行）：**
```bash
cd packages/shared && npx tsc --build
```

**生产部署：**
```bash
pnpm prod:build              # 构建前端和后端，输出到 dist/
pnpm prod:start              # 通过 nohup 启动后端 Node 服务
pnpm prod:stop               # 通过 PID 文件停止服务
pnpm prod:status             # 通过 curl /api/health 检查服务状态
```

## 架构概述

### Monorepo 结构

pnpm workspace + Turborepo 管理三个包：

| 包 | 名称 | 技术栈 |
|---|---|---|
| `packages/shared` | `@nav/shared` | 纯 TypeScript 类型定义 |
| `packages/frontend` | `@nav/frontend` | Vue 3 + Vite + Pinia + Dexie.js |
| `packages/server` | `@nav/server` | Hono + better-sqlite3 + JWT |

`turbo.json` 中 `build` 任务配置了 `dependsOn: ["^build"]`，确保先构建依赖包。`dev` 任务为 persistent 模式。

### 共享类型层 (`@nav/shared`)

`tsconfig.json` 必须设置 `"composite": true` 以支持 project reference（前端和后端通过 references 引用它）。

核心类型：
- **Dashboard** — 仪表盘实体，包含 id、name、title、widgets 数组、columns（4-24）、rowHeight、background 配置
- **WidgetInstance** — 组件实例，包含 widgetId（对应哪个组件类型）、source（`builtin` 或 `installed`）、config（任意 JSON 配置）、layouts（按断点 lg/md/sm/xs 分别存储 x/y/w/h）
- **WidgetManifest** — 第三方组件清单，包含 name、displayName、version、entry（入口文件路径）、schema（JSON Schema，用于自动生成配置表单）、size、minSize、responsive、permissions
- **DashboardBackground** — 背景配置，mode 支持 color/image/slideshow
- **StorageAdapter** — 核心接口，定义 getDashboard、saveDashboard、getInstalledWidgets、installWidget、uninstallWidget、getSyncState、push、pull 方法

### 前端架构 (`@nav/frontend`)

**存储适配器路由：** `services/storageAdapter.ts` 是存储层的核心路由。应用启动时通过 `GET /api/health`（2s 超时）探测后端是否可用。可用则返回 `SyncAdapter`（与后端 API 通信），否则返回 `LocalAdapter`（基于 Dexie.js 的 IndexedDB 实现）。检测结果会被缓存，`resetAdapter()` 可清除缓存重新检测。

**Pinia Store 层（3 个 store）：**
- `authStore` — 管理 JWT token（存储在 localStorage），提供 login/logout/verify/getAuthHeaders
- `dashboardStore` — 管理当前仪表盘数据（Dashboard + WidgetInstance[]）。load/save 通过 adapter 操作，增删改 widget 时同步调用后端 API 并更新本地状态
- `widgetStore` — 管理已安装的第三方组件列表（InstalledWidget[]），通过 adapter 读写

**核心组件树：**
```
App.vue（根组件，管理编辑模式、背景、拖拽状态）
├── TopBar（浮动控制面板，左下角圆点 hover 展开）
├── DashboardGrid（网格布局容器）
│   └── GridLayout（vue-grid-layout-v3，responsive=false）
│       └── WidgetWrapper（hover 显示工具栏：配置齿轮、删除按钮）
│           └── WidgetRenderer（动态组件加载器）
│               ├── builtin → SearchWidget / ClockWidget / WeatherWidget / BookmarkWidget
│               └── installed → defineAsyncComponent 懒加载
├── WidgetLibrary（组件库浮动面板，可折叠，拖拽时自动隐藏）
├── LoginDialog / InstallWidgetDialog / PreferencesPanel（模态弹窗）
```

**DashboardGrid 的断点系统：** 禁用了 `vue-grid-layout-v3` 内置的响应式模式（因其内部布局覆盖问题），改用手动断点检测。通过 ResizeObserver 监听容器宽度，映射到 lg/md/sm/xs/xxs 断点，每个 WidgetInstance 在不同断点下可存储不同布局，切换断点时计算并应用缩放。

**编辑模式：** 由 App.vue 管理 `isEditing` 状态。启用时 grid 可拖拽/调整大小，工具栏可见；禁用时所有交互被阻止。WidgetLibrary 面板仅在编辑模式下显示。

**背景系统：** DashboardBackground 支持三种模式 — 纯色（CSS color）、图片（URL 或 base64）、轮播（多张图片定时切换）。轮播由 App.vue 中的 setInterval 驱动。

### 后端架构 (`@nav/server`)

**启动入口 (`src/index.ts`)：** 创建 Hono 应用，注册全局 logger 和 CORS（`NAV_CORS_ORIGIN` 或 localhost:3000）中间件，挂载四个路由模块，监听 `PORT` 环境变量（默认 4000）。

**数据库 (`src/db/`)：** SQLite（better-sqlite3），启用 WAL 模式和 foreign keys。表结构：
- `dashboards` — id（TEXT PK）、name、title、background（JSON 字符串）、columns、row_height、updated_at
- `widget_instances` — id（TEXT PK）、dashboard_id（FK）、widget_id、source、config（JSON）、layouts（JSON）、created_at、updated_at
- `installed_widgets` — widget_id（TEXT PK）、manifest（JSON）、installed_at
- `change_log` — 变更日志，记录 entity_type、entity_id、operation、payload，支持 sync

启动时通过 ALTER TABLE 执行向后兼容迁移（添加 title、background 列）。

**认证中间件 (`src/middleware/auth.ts`)：** 启动时强制要求 `NAV_JWT_SECRET` 环境变量，否则 crash。`authMiddleware` 从 Authorization header 提取 Bearer token 并验证。密码通过 `NAV_PASSWORD`（明文）或 `NAV_PASSWORD_HASH`（bcrypt 哈希）配置。

**API 路由：**

| 端点 | 方法 | 认证 | 说明 |
|---|---|---|---|
| `/api/health` | GET | 否 | 健康检查 |
| `/api/auth/login` | POST | 否 | 密码登录，5次/15分钟/IP 限流，返回 JWT |
| `/api/auth/verify` | POST | Token | 验证 token 有效性 |
| `/api/dashboards` | GET | 否 | 返回默认仪表盘（不存在则创建）及所有 widget |
| `/api/dashboards/:id` | PUT | 是 | 更新仪表盘元数据 |
| `/api/dashboards/:dashboardId/widgets` | POST | 是 | 创建 widget 实例 |
| `/api/widgets/:instanceId` | PUT | 是 | 更新 widget config 和/或 layouts |
| `/api/widgets/:instanceId` | DELETE | 是 | 删除 widget 实例 |
| `/api/installed-widgets` | GET | 否 | 列出已安装组件 |
| `/api/installed-widgets` | POST | 是 | 安装组件（验证 manifest 含 name/version/entry） |
| `/api/installed-widgets/:widgetId` | DELETE | 是 | 卸载组件 |

### 组件开发规范

第三方组件通过 GitHub 仓库发布。仓库根目录必须包含 `manifest.json`，定义 name、displayName、version、entry（入口文件相对路径）、schema（JSON Schema，自动生成配置表单）、size、minSize、responsive、permissions。

组件导出 Vue SFC，接收 Props：`config`（组件配置对象）、`editing`（是否编辑模式）、`editable`（是否可编辑），发出 Events：`update:config`（配置变更）、`resize`（请求调整网格大小）。

### 数据流全景

1. **启动：** App.vue `onMounted` → `dashboardStore.load()` + `widgetStore.load()` + `authStore.verify()` → 检测后端可用性 → 选择 adapter → 加载数据
2. **添加组件：** WidgetLibrary 点击 → `dashboardStore.addWidget()` → 写入本地（adapter） + POST 到后端 → grid 重新渲染
3. **布局变更：** DashboardGrid 检测拖拽结束 → 发射 `update-layout` 事件 → App.vue 调用 `dashboardStore.updateWidgetLayouts()` → PUT 到后端
4. **认证流程：** LoginDialog → `authStore.login()` → POST `/api/auth/login` → 存储 JWT 到 localStorage → `resetAdapter()` → 重新加载数据
5. **安装组件：** InstallWidgetDialog 输入 GitHub URL → fetch `manifest.json` → 验证 → `widgetStore.install()` → POST 到后端

### 已知约束

- 后端启动需要 `NAV_JWT_SECRET` 环境变量，否则抛出异常退出
- `vue-grid-layout-v3` 的响应式模式已被禁用，所有断点逻辑改为手动实现
- CORS 限制未配置（已知 BUG-005，暂不修复）
- 修改 `packages/shared` 后必须重新 `tsc --build`，否则前端类型检查会失败
