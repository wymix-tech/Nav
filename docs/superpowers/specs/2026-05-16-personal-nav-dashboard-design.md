# 个人导航页 — 设计规格

## 概述

一个可自定义的个人导航页，支持拖拽布局、组件化扩展和跨设备同步。用户可以从组件库中选择组件（搜索框、时钟、天气、Docker 状态等），自由拖拽排列在页面上。第三方开发者可通过 GitHub 仓库发布自定义组件，用户输入仓库地址即可安装使用。

**核心差异**：区别于 gethomepage 的 YAML 配置驱动，本项目采用可视化拖拽编辑 + 动态组件加载的模式。

## 技术栈

| 层级 | 技术选型 | 用途 |
|------|---------|------|
| 前端框架 | Vue 3 + Vite | SPA 核心 |
| 状态管理 | Pinia | 全局状态（布局、组件实例、配置） |
| 拖拽网格 | vue-grid-layout | 组件拖拽和布局 |
| 本地存储 | Dexie.js | IndexedDB 封装，离线数据 |
| 后端框架 | Hono | 轻量 API 服务 |
| 数据库 | better-sqlite3 | SQLite 驱动 |
| Monorepo | pnpm workspace + Turborepo | 多包管理 |
| 类型系统 | TypeScript | 前后端共享类型 |

## 系统架构

```
┌─────────────────────────────────────────────────┐
│                  浏览器 (客户端)                    │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Vue SPA  │  │ Pinia    │  │ IndexedDB    │  │
│  │  (前端)    │  │ (状态管理) │  │ (本地存储)    │  │
│  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│        │             │               │           │
│        └──────┬──────┘               │           │
│               │ HTTP API (+ JWT)     │           │
└───────────────┼──────────────────────┘───────────┘
                │
┌───────────────┼──────────────────────────────────┐
│               ▼        服务端 (可选)                │
│  ┌─────────────────┐  ┌───────────────────────┐  │
│  │   Hono Server   │  │   SQLite Database     │  │
│  │   (API + Auth)  │◄─│   (数据持久化)          │  │
│  └─────────────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## 项目结构

```
nav/
├── packages/
│   ├── frontend/              # 前端 SPA
│   │   ├── src/
│   │   │   ├── components/    # 通用 UI 组件
│   │   │   ├── widgets/       # 内置组件（搜索、时钟、天气等）
│   │   │   ├── composables/   # 组合式函数
│   │   │   ├── stores/        # Pinia 状态管理
│   │   │   ├── services/      # 数据层（IndexedDB、API 调用）
│   │   │   ├── types/         # TypeScript 类型定义
│   │   │   └── App.vue
│   │   └── package.json
│   │
│   ├── server/                # 后端 API
│   │   ├── src/
│   │   │   ├── routes/        # API 路由
│   │   │   ├── middleware/    # 中间件（认证等）
│   │   │   ├── db/            # SQLite 数据库操作
│   │   │   └── index.ts       # Hono 入口
│   │   └── package.json
│   │
│   └── shared/                # 前后端共享类型和工具
│       ├── types/
│       └── package.json
│
├── pnpm-workspace.yaml
├── package.json
└── turbo.json
```

## 组件系统

### 组件生命周期

```
1. 发现 → 用户输入 GitHub 仓库地址
2. 读取 → 从仓库获取 manifest.json
3. 安装 → 下载组件代码到本地缓存
4. 注册 → 组件信息写入 Pinia store
5. 渲染 → 拖拽到画布上，动态加载 Vue 组件
6. 配置 → 用户通过自动生成的表单修改组件配置
7. 卸载 → 从画布移除（可选保留或删除）
```

### Manifest 规范

每个组件仓库的根目录必须包含 `manifest.json`：

```jsonc
{
  "name": "weather",              // 组件唯一标识
  "displayName": "天气",           // 显示名称
  "version": "1.0.0",             // 语义化版本
  "description": "显示当前天气信息",
  "author": "wymix",
  "icon": "🌤️",                   // 图标（emoji 或 icon name）
  "repository": "https://github.com/wymix/nav-widget-weather",
  "entry": "widget.js",           // 组件入口文件（构建后的 UMD/ESM）
  "schema": {                     // 配置 JSON Schema
    "type": "object",
    "properties": {
      "city": { "type": "string", "title": "城市", "default": "北京" },
      "apiKey": { "type": "string", "title": "API Key" },
      "unit": { "type": "string", "enum": ["celsius", "fahrenheit"], "default": "celsius" }
    },
    "required": ["apiKey"]
  },
  "size": {                       // 默认尺寸（网格单位）
    "w": 4, "h": 3
  },
  "minSize": {                    // 最小尺寸
    "w": 2, "h": 2
  },
  "responsive": {
    "behavior": "adaptive",       // adaptive | collapse | hide
    "breakpoints": {
      "xs": { "minWidth": 0, "layout": "compact" },
      "sm": { "minWidth": 200, "layout": "normal" },
      "md": { "minWidth": 300, "layout": "normal" },
      "lg": { "minWidth": 400, "layout": "full" }
    }
  },
  "permissions": []               // 声明需要的权限
}
```

### 组件接口约定

```typescript
// 组件接收的 props
interface WidgetProps {
  config: Record<string, any>   // 用户配置（来自 manifest schema）
  editing: boolean              // 是否处于编辑模式（已登录 + 点击编辑按钮）
  editable: boolean             // 是否有编辑权限（已登录为 true，未登录为 false）
}

// 组件发出的事件
interface WidgetEmits {
  'update:config': [value: Record<string, any>]  // 配置变更
  'resize': [size: { w: number; h: number }]      // 请求调整尺寸
}
```

组件根据 `editable` 和 `editing` 决定行为：
- `editable=false`：纯展示，所有操作按钮隐藏
- `editable=true, editing=false`：查看模式，组件可交互但不显示编辑 UI
- `editable=true, editing=true`：编辑模式，显示配置/删除按钮，禁用组件交互

### 组件加载流程

```
用户安装组件（输入 GitHub 仓库地址）
  │
  ├─ 1. 从 raw.githubusercontent.com 获取 manifest.json
  ├─ 2. 校验 manifest 完整性
  ├─ 3. 根据 manifest.entry 拼接 CDN URL
  │     └─ https://cdn.jsdelivr.net/gh/{owner}/{repo}@{version}/{entry}
  ├─ 4. 预加载测试（动态 import，验证组件可加载）
  ├─ 5. 将 manifest + CDN URL 存入已安装组件列表（IndexedDB / SQLite）
  └─ 6. 组件代码本身不缓存，每次从 CDN 动态加载（利用 CDN 缓存）
  │
  ▼
用户将组件拖入画布
  │
  ├─ 1. Pinia 创建组件实例（instanceId + config + layouts）
  ├─ 2. Vue 的 defineAsyncComponent 从 CDN 动态加载组件
  ├─ 3. 传入 config 和 editing props
  └─ 4. 渲染完成
```

### 内置组件

| 组件 | 功能 |
|------|------|
| 搜索框 | 多引擎搜索，支持自定义引擎 |
| 时钟 | 数字/模拟时钟，支持时区 |
| 天气 | 接入 OpenWeatherMap 等 API |
| 书签 | 分组管理常用链接 |
| Docker 状态 | 显示容器运行状态 |
| 音乐播放器 | 播放本地/在线音乐 |
| 待办事项 | 简单任务列表 |
| 系统监控 | CPU/内存/磁盘使用率 |

内置组件同样遵循 manifest 规范，代码结构与第三方组件一致。

## 布局系统

### 网格模型

页面划分为 **12 列** 的响应式网格，行高固定为 **80px**。

### 布局数据结构

```typescript
interface WidgetLayout {
  x: number
  y: number
  w: number
  h: number
}

interface WidgetInstance {
  id: string              // 实例唯一 ID
  widgetId: string        // 组件类型 ID（对应 manifest.name）
  source: 'builtin' | 'installed'
  config: Record<string, any>
  layouts: {
    lg: WidgetLayout      // 桌面 ≥1200px, 12列
    md: WidgetLayout      // 平板横屏 ≥992px, 8列
    sm: WidgetLayout      // 平板竖屏 ≥768px, 6列
    xs: WidgetLayout      // 手机 <768px, 4列
  }
}

interface Dashboard {
  id: string
  name: string
  widgets: WidgetInstance[]
  columns: number         // 默认 12
  rowHeight: number       // 默认 80
}
```

### 响应式断点

| 断点 | 屏幕宽度 | 列数 | 典型设备 |
|------|---------|------|---------|
| lg | ≥ 1200px | 12 | 桌面显示器 |
| md | ≥ 992px | 8 | 平板横屏 |
| sm | ≥ 768px | 6 | 平板竖屏 |
| xs | < 768px | 4 | 手机 |

每个断点下组件有独立的布局位置。切换断点时自动适配。用户可以分别调整每个断点下的布局。

### 多端编辑与同步

一端编辑，多端通用：
- 桌面端编辑只修改 `layouts.lg`，其他断点不变
- 手机端使用 `layouts.xs` 渲染
- 同步时所有断点的布局一起同步

缺失断点布局自动生成规则：
- 从最近的较大断点按比例缩放
- x/w 按列数比例换算（如 lg 的 x=6, w=4 → md 的 x=4, w=3）
- h 保持不变
- 换算后检测重叠，自动向下推移解决冲突

### 页面状态

页面有三种状态，由登录状态和编辑开关共同决定：

**未登录（默认）**：
- 组件纯展示，所有编辑 UI 隐藏
- Docker/系统监控等敏感组件只读展示，操作按钮禁用
- 顶栏显示"登录"按钮
- 不可拖拽、不可调整大小、不可添加/删除组件

**已登录 — 查看模式**：
- 组件可交互（搜索框能输入、播放器能播放）
- 拖拽和调整大小禁用
- 配置按钮隐藏
- 顶栏显示"编辑"按钮和"退出登录"按钮

**已登录 — 编辑模式**：
- 组件显示配置按钮和删除按钮
- 可拖拽移动位置
- 可拖拽边缘调整大小
- 可从组件库拖入新组件
- Docker/系统监控等组件可执行操作（重启容器等）
- 组件本身交互禁用（防止误操作）
- 顶栏显示"完成编辑"按钮和"退出登录"按钮

## 数据层

### 存储适配层

前端通过统一接口读写数据，不直接依赖具体存储方式：

```typescript
interface StorageAdapter {
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

两个实现：

| 实现 | 场景 | 存储位置 |
|------|------|---------|
| `LocalAdapter` | 无后端，纯本地 | IndexedDB（Dexie.js） |
| `SyncAdapter` | 有后端 | IndexedDB（缓存）+ API → SQLite |

运行时自动检测后端可用性：

```
应用启动
  ├─ 尝试 GET /api/health
  │   ├─ 成功 → 使用 SyncAdapter
  │   └─ 失败 → 使用 LocalAdapter
  ▼
Pinia Store 初始化（从适配器加载数据）
```

### SQLite 数据库结构

```sql
CREATE TABLE dashboards (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  columns     INTEGER DEFAULT 12,
  row_height  INTEGER DEFAULT 80,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE widget_instances (
  id          TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id),
  widget_id   TEXT NOT NULL,
  source      TEXT NOT NULL,       -- 'builtin' | 'installed'
  config      TEXT,                -- JSON: 用户配置
  layouts     TEXT,                -- JSON: { lg, md, sm, xs } 多断点布局
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE installed_widgets (
  widget_id   TEXT PRIMARY KEY,
  manifest    TEXT NOT NULL,
  installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE change_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  operation   TEXT NOT NULL,
  payload     TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced      INTEGER DEFAULT 0
);
```

### 同步策略

简单冲突覆盖（个人工具不需要复杂冲突解决）：
- 本地有变更、远端无变更 → push
- 本地无变更、远端有变更 → pull
- 双方都有变更 → 远端覆盖本地

同步触发时机：
- 用户手动点击"同步"按钮
- 后端可用时，页面加载自动拉取一次
- 定期轮询（可选，间隔 30 秒）

## 组件商店

### 安装流程

```
用户输入 GitHub 仓库地址
  │
  ├─ 1. 解析仓库地址 → owner/repo
  ├─ 2. 获取 manifest（main 分支，失败则尝试 master）
  ├─ 3. 校验 manifest（必填字段、版本格式、Schema 格式）
  ├─ 4. 构建 CDN 地址
  ├─ 5. 预加载测试（动态 import，捕获错误）
  ├─ 6. 写入已安装组件列表
  └─ 7. 组件出现在组件库面板中
```

### 更新机制

- 重新获取 manifest，比较 version 字段
- 有新版本则提示用户更新
- 更新后已存在的组件实例自动使用新版本

### 后端索引 API（后续扩展）

```
GET /api/widgets/index          # 推荐组件列表
GET /api/widgets/search?q=xxx   # 搜索组件
```

初期手动维护（JSON 文件），后续可扩展为自动从 GitHub 抓取。

## 安全设计

### 加载安全

- 只允许从 jsDelivr/unpkg 等可信 CDN 加载
- 组件 URL 必须与 manifest 中声明的仓库地址匹配
- 支持 Subresource Integrity（SRI）校验

### 运行隔离

- 第三方组件运行在受限的 Vue 组件作用域中
- 不提供原生 DOM 操作的直接访问
- CSP 策略限制 `eval`、`new Function`

### 权限控制

manifest 中声明 `permissions` 字段：

```json
{
  "permissions": ["network:openweathermap.org", "storage:local"]
}
```

- 组件只能访问声明过的 API/域名
- 用户安装时展示权限请求列表

### CSP 策略

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' cdn.jsdelivr.net unpkg.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' https: data:;
  connect-src 'self' https:;
```

## 认证与权限

### 认证方式

简单密码认证，适合个人自托管场景：

- 后端通过环境变量或配置文件设置访问密码（`NAV_PASSWORD`）
- 前端输入密码，后端验证后返回 JWT token
- Token 存储在 localStorage，后续请求通过 `Authorization: Bearer <token>` 携带
- Token 有效期可配置（默认 7 天），过期需重新登录

### 登录流程

```
用户输入密码
  │
  ├─ 前端 POST /api/auth/login { password }
  ├─ 后端验证密码（bcrypt 比对）
  │   ├─ 成功 → 返回 JWT token
  │   └─ 失败 → 返回 401
  ├─ 前端存储 token 到 localStorage
  └─ Pinia auth store 更新状态为已登录
```

### API 权限划分

| 接口 | 未登录 | 已登录 |
|------|--------|--------|
| GET /api/dashboards | ✅ | ✅ |
| PUT /api/dashboards/:id | ❌ | ✅ |
| POST /api/dashboards/:id/widgets | ❌ | ✅ |
| PUT /api/widgets/:instanceId | ❌ | ✅ |
| DELETE /api/widgets/:instanceId | ❌ | ✅ |
| GET /api/installed-widgets | ✅ | ✅ |
| POST /api/installed-widgets | ❌ | ✅ |
| DELETE /api/installed-widgets/:widgetId | ❌ | ✅ |
| POST /api/sync/push | ❌ | ✅ |
| GET /api/sync/pull | ✅ | ✅ |

未登录用户只能读取数据，所有写操作需要认证。

### 前端权限控制

- `useAuthStore()` 管理登录状态和 token
- 路由守卫不做拦截（导航页本身不需要路由切换），而是通过 `editable` 状态控制 UI
- API 请求拦截器自动附加 token，401 时自动清除登录状态

### 无后端模式

纯前端模式（LocalAdapter）下：
- 不显示登录按钮
- 所有功能默认可用（因为是本地使用，无需认证）
- 编辑模式通过顶栏按钮直接切换

## 后端 API（核心骨架）

```
# 认证
POST /api/auth/login              # 登录，返回 JWT
POST /api/auth/verify             # 验证 token 有效性

# 仪表盘（需认证写操作）
GET  /api/dashboards
GET  /api/dashboards/:id
PUT  /api/dashboards/:id

# 组件实例（需认证写操作）
POST /api/dashboards/:id/widgets
PUT  /api/widgets/:instanceId
DELETE /api/widgets/:instanceId

# 已安装组件（需认证写操作）
GET  /api/installed-widgets
POST /api/installed-widgets
DELETE /api/installed-widgets/:widgetId

# 同步（需认证写操作）
POST /api/sync/push
GET  /api/sync/pull
```

API 先定核心骨架，后续按需扩展。
