# Nav

一个可自定义的个人导航仪表盘，支持内置组件和第三方组件扩展。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + Pinia + Dexie.js |
| 后端 | Hono + better-sqlite3 + JWT |
| 共享类型 | TypeScript |
| 构建工具 | Turborepo + pnpm workspace |
| 部署 | Docker / 直接运行 |

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9.15.0

### 安装与开发

```bash
pnpm install
pnpm dev          # 同时启动前端 (3000) 和后端 (4000)
pnpm dev:frontend # 仅启动前端
pnpm dev:server   # 仅启动后端
```

### 类型检查

修改 `packages/shared` 后，需要重新构建类型声明：

```bash
cd packages/shared && npx tsc --build
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `NAV_JWT_SECRET` | 是 | - | JWT 签名密钥 |
| `NAV_PASSWORD` | 是 | - | 登录密码（明文） |
| `NAV_PASSWORD_HASH` | 否 | - | 登录密码（bcrypt 哈希，优先级高于明文） |
| `NAV_DB_PATH` | 否 | `./nav.db` | SQLite 数据库路径 |
| `NAV_CORS_ORIGIN` | 否 | `http://localhost:3000` | CORS 允许的源 |
| `PORT` | 否 | `4000` | 服务端口 |

## 生产部署

### Docker（推荐）

```bash
# 创建 .env 文件
cat > .env << EOF
NAV_JWT_SECRET=your-secret-key
NAV_PASSWORD=your-password
EOF

# 构建并启动
docker compose up -d --build

# 查看状态
docker compose ps

# 停止
docker compose down
```

### 直接部署

```bash
export NAV_JWT_SECRET=your-secret-key
export NAV_PASSWORD=your-password

pnpm prod:build    # 构建前端和后端
pnpm prod:start    # 启动服务
pnpm prod:status   # 检查健康状态
pnpm prod:stop     # 停止服务
pnpm prod:restart  # 重启服务
```

服务启动后访问 `http://localhost:4000`。

## 项目结构

```
nav/
├── packages/
│   ├── shared/          # 共享类型定义（Dashboard, Widget, StorageAdapter 等）
│   ├── frontend/        # Vue 3 前端
│   │   ├── src/
│   │   │   ├── components/   # UI 组件（DashboardGrid, WidgetRenderer 等）
│   │   │   ├── services/     # 存储适配器（LocalAdapter / SyncAdapter）
│   │   │   ├── stores/       # Pinia Store（auth, dashboard, widget）
│   │   │   └── widgets/      # 内置组件（Search, Clock, Weather, Bookmark）
│   │   └── ...
│   └── server/          # Hono 后端
│       └── src/
│           ├── db/           # SQLite 数据库层
│           ├── middleware/   # 认证中间件（JWT + 限流）
│           └── routes/       # API 路由
├── scripts/             # 生产部署脚本
├── docker-compose.yml   # Docker Compose 配置
├── Dockerfile           # 多阶段 Docker 构建
└── turbo.json           # Turborepo 构建配置
```

## API 端点

| 端点 | 方法 | 认证 | 说明 |
|---|---|---|---|
| `/api/health` | GET | 否 | 健康检查 |
| `/api/auth/login` | POST | 否 | 密码登录，返回 JWT |
| `/api/auth/verify` | POST | Token | 验证 token 有效性 |
| `/api/dashboards` | GET | 否 | 获取仪表盘数据 |
| `/api/dashboards/:id` | PUT | Token | 更新仪表盘元数据 |
| `/api/dashboards/:id/widgets` | POST | Token | 添加组件实例 |
| `/api/widgets/:id` | PUT | Token | 更新组件配置/布局 |
| `/api/widgets/:id` | DELETE | Token | 删除组件实例 |
| `/api/installed-widgets` | GET | 否 | 列出已安装组件 |
| `/api/installed-widgets` | POST | Token | 安装第三方组件 |
| `/api/installed-widgets/:id` | DELETE | Token | 卸载组件 |

## 第三方组件开发

第三方组件通过 GitHub 仓库发布，仓库根目录需包含 `manifest.json`：

```json
{
  "name": "my-widget",
  "displayName": "我的组件",
  "version": "1.0.0",
  "entry": "index.vue",
  "schema": { ... },
  "size": { "w": 4, "h": 3 },
  "minSize": { "w": 2, "h": 2 },
  "responsive": true,
  "permissions": []
}
```

组件为 Vue SFC，接收 `config`、`editing`、`editable` Props，发出 `update:config` 和 `resize` 事件。

## 特性

- **拖拽式网格布局** — 自由拖拽和调整组件大小，支持多断点布局
- **内置组件** — 搜索框、时钟、天气、书签等开箱即用
- **第三方组件扩展** — 通过 GitHub 安装自定义组件
- **离线可用** — 前端支持 IndexedDB 本地存储，后端不可用时自动降级
- **背景系统** — 支持纯色、图片、轮播三种背景模式
- **密码保护** — JWT 认证，编辑操作需登录

## License

MIT
