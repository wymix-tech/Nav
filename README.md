# INFI.NAV

无限个人导航仪表盘 — 支持无限画布和网格双模式布局，组件可自由拖拽放置，支持缩放、平移、全景预览小地图、跨设备同步和第三方组件扩展。

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

### 必填

| 变量 | 说明 |
|---|---|
| `NAV_JWT_SECRET` | JWT 签名密钥 |
| `NAV_PASSWORD` | 登录密码（明文） |

### 可选

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NAV_PASSWORD_HASH` | - | 登录密码（bcrypt 哈希，优先级高于明文） |
| `NAV_DB_PATH` | `./nav.db` | SQLite 数据库路径 |
| `NAV_CORS_ORIGIN` | `http://localhost:3000` | CORS 允许的源 |
| `PORT` | `4000` | 服务端口 |

### AI 聊天助手

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NAV_AI_BASE_URL` | `https://api.openai.com/v1` | API 地址，自动识别 OpenAI/Anthropic 协议 |
| `NAV_AI_API_KEY` | - | API Key |
| `NAV_AI_MODELS` | `gpt-4o-mini` | 可用模型列表（逗号分隔） |
| `NAV_AI_SYSTEM_PROMPT` | - | 默认系统提示词（定义 AI 性格/说话方式/原则） |

> BaseURL 会根据域名自动判断协议：包含 `anthropic` 或 `claude` 走 Anthropic 协议，其他走 OpenAI 兼容协议。支持自定义代理/中转站地址。

### Docker 监控

Docker 监控组件需要映射 Docker Socket，在 `docker-compose.yml` 中已配置：

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

## 生产部署

### Docker（推荐）

```bash
# 创建 .env 文件
cat > .env << EOF
NAV_JWT_SECRET=your-secret-key
NAV_PASSWORD=your-password
NAV_AI_BASE_URL=https://api.openai.com/v1
NAV_AI_API_KEY=sk-your-api-key
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
│   │   │   ├── components/   # UI 组件（CanvasGrid, CanvasMinimap, DashboardGrid, TopBar 等）
│   │   │   ├── composables/  # 组合式函数（useScreenOrientation 等）
│   │   │   ├── services/     # 存储适配器（LocalAdapter / SyncAdapter）
│   │   │   ├── stores/       # Pinia Store（auth, dashboard, widget, canvas）
│   │   │   └── widgets/      # 内置组件
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

## 内置组件

| 组件 | 说明 |
|---|---|
| 🔍 搜索框 | 多搜索引擎快捷搜索 |
| 🕐 时钟 | 实时时钟显示 |
| 🌤️ 天气 | 天气查询（wttr.in API） |
| 📑 书签 | 书签分组管理 |
| 📊 监控 | 系统监控（CPU/Memory/GPU/Disk） |
| 🐳 Docker | 容器状态监控（CPU/内存/实时网速） |
| ✦ AI 助手 | AI 聊天（支持 OpenAI/Anthropic，流式输出） |

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
| `/api/system/stats` | GET | 否 | 系统状态（CPU/Mem/GPU/Disk） |
| `/api/system/docker` | GET | 否 | Docker 容器列表及状态 |
| `/api/system/docker?name=xxx` | GET | 否 | 指定容器详细信息 |
| `/api/system/version` | GET | 否 | 当前版本号 |
| `/api/system/latest-release` | GET | 否 | 最新发布版本（CNB 代理） |
| `/api/chat/stream` | POST | 否 | AI 聊天流式代理 |
| `/api/chat/models` | GET | 否 | 可用模型列表 |
| `/api/chat/defaults` | GET | 否 | 默认系统提示词 |

## 第三方组件开发

第三方组件通过仓库发布，仓库根目录需包含 `manifest.json`：

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

`schema` 字段为 JSON Schema，用于自动生成配置表单。`size` 和 `minSize` 用于画布模式下的自适应缩放。

## 特性

- **无限画布模式** — 组件可自由放置在任意位置，支持鼠标拖拽平移、Ctrl+滚轮缩放、20px 网格吸附
- **网格布局模式** — 传统 CSS Grid 响应式布局，支持自定义列数
- **双模式切换** — 在偏好设置中切换画布/网格模式，切换时自动转换组件坐标
- **全景预览小地图** — 右下角工具栏内嵌小地图，可拖拽视口框快速定位，支持缩放
- **视口持久化** — 平移/缩放状态保存到后端，刷新后自动恢复
- **回到中心** — 一键回到默认中心位置，双击画布也可快速回位
- **内置组件** — 搜索框、时钟、天气、书签、系统监控、Docker 监控、AI 聊天助手
- **Docker 监控** — 实时查看容器状态、CPU/内存使用率、网络速度
- **AI 聊天助手** — 支持 OpenAI/Anthropic 双协议，流式输出，聊天记录保存在浏览器会话中
- **智能适配** — 手机竖屏自动切换堆叠模式，画布工具栏自动隐藏
- **第三方组件扩展** — 通过仓库安装自定义组件
- **离线可用** — 前端支持 IndexedDB 本地存储，后端不可用时自动降级
- **背景系统** — 支持纯色、图片、轮播三种背景模式
- **密码保护** — JWT 认证，编辑操作需登录

## License

MIT
