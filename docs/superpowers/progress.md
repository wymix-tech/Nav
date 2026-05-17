# 个人导航页 — 实现进度

**计划文档：** `docs/superpowers/plans/2026-05-16-personal-nav-dashboard.md`
**设计规格：** `docs/superpowers/specs/2026-05-16-personal-nav-dashboard-design.md`
**最后更新：** 2026-05-16

## 总览

- 总 Task 数：22
- 已完成：6
- 进行中：0
- 待执行：16

## 进度详情

| Task | 名称 | 状态 | 说明 |
|------|------|------|------|
| 1 | Monorepo 脚手架初始化 | ✅ 完成 | git init, pnpm-workspace, turbo.json, .gitignore |
| 2 | Shared 包 — 类型定义 | ✅ 完成 | Dashboard, WidgetManifest, StorageAdapter, Auth 类型 |
| 3 | 前端包初始化 — Vue 3 + Vite | ✅ 完成 | Vite 配置, TypeScript, Pinia, 基础样式 |
| 4 | 本地存储层 — Dexie.js | ✅ 完成 | LocalAdapter (IndexedDB), storageAdapter 工厂, SyncAdapter 占位 |
| 5 | Pinia 状态管理 | ✅ 完成 | dashboardStore, widgetStore, authStore |
| 6 | TopBar 顶栏组件 | ✅ 完成 | 登录/编辑/退出按钮，集成到 App.vue |
| 7 | DashboardGrid 网格布局 | ⏳ 待执行 | vue-grid-layout 集成 |
| 8 | WidgetWrapper 和 WidgetRenderer | ⏳ 待执行 | 组件外壳和动态加载 |
| 9 | SearchWidget 搜索组件 | ⏳ 待执行 | 多引擎搜索 |
| 10 | ClockWidget 时钟组件 | ⏳ 待执行 | 实时时钟 |
| 11 | WeatherWidget 天气组件 | ⏳ 待执行 | OpenWeatherMap API |
| 12 | BookmarkWidget 书签组件 | ⏳ 待执行 | 分组书签 |
| 13 | LoginDialog 登录弹窗 | ⏳ 待执行 | 密码登录 |
| 14 | WidgetConfigForm 配置表单 | ⏳ 待执行 | JSON Schema 表单 |
| 15 | WidgetLibrary + InstallWidgetDialog | ⏳ 待执行 | 组件库和安装弹窗 |
| 16 | 后端初始化 — Hono + SQLite | ⏳ 待执行 | Hono 入口, SQLite 数据库 |
| 17 | 数据库查询封装 | ⏳ 待执行 | queries.ts |
| 18 | 认证中间件 | ⏳ 待执行 | JWT 中间件, 登录 API |
| 19 | 仪表盘和组件 API 路由 | ⏳ 待执行 | CRUD 路由 |
| 20 | SyncAdapter 后端同步 | ⏳ 待执行 | 替换占位实现 |
| 21 | App.vue 整合所有组件 | ⏳ 待执行 | 整合完整功能 |
| 22 | 端到端验证 | ⏳ 待执行 | 完整流程测试 |

## 已完成 Task 遗留问题

**Task 2 — Shared 包：**
- tsconfig 缺少 `composite: true`，导致前端通过 project reference 引用时报错 TS6306。已在 Task 3 中修复。
- 修复后需要手动执行 `tsc --build` 构建 shared 包，前端才能正常引用。后续需考虑在 turbo 的 `dev` 任务中自动构建依赖。

**Task 3 — 前端初始化：**
- 无遗留问题。

**Task 4 — 本地存储层：**
- `syncAdapter.ts` 为占位实现（所有方法抛出异常），Task 20 会替换为完整的后端同步实现。
- `storageAdapter.ts` 中的 `SyncAdapter` 动态导入依赖后端可用，当前后端未实现时会自动 fallback 到 `LocalAdapter`，逻辑正确。
- pnpm 全局安装路径不在默认 PATH 中，需使用 `export PATH="/Users/wymix/.hermes/node/bin:$PATH"` 才能执行 pnpm 命令。

**Task 5 — Pinia 状态管理：**
- 无遗留问题。三个 Store 均使用 Composition API 风格，类型检查通过。

**Task 6 — TopBar 顶栏组件：**
- `handleLogin` 函数中 TODO 待实现（弹出登录对话框），将在 Task 13 LoginDialog 中完成。

## 全局已知问题

- `syncAdapter.ts` 当前为占位实现，Task 20 会替换
- vue-grid-layout 在 Task 7 中需要确认具体使用哪个 Vue 3 兼容包
- pnpm 全局安装路径需手动设置 PATH：`/Users/wymix/.hermes/node/bin`
- shared 包构建需手动执行 `tsc --build`，未集成到 turbo dev 流程

## Git 提交记录

```
1deb387 feat(frontend): 实现 TopBar 顶栏组件
9802cf7 feat(frontend): 实现 Pinia 状态管理（dashboard, widget, auth）
8c6c205 feat(frontend): 实现 LocalAdapter 本地存储层
b2317c5 feat(frontend): 初始化 Vue 3 + Vite 前端项目
468da4c feat(shared): 添加共享类型定义
aed33b0 chore: 初始化 monorepo 脚手架
```
