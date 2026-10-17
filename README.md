# Nav

可自定义的个人导航仪表盘，支持 PC 多尺寸布局、内置组件、隔离插件和本地优先保存。

兼容升级、无限画布、AI 聊天、Docker 监控与版本功能的配置参见 [main 合并兼容修复](docs/merge-repair-2026-10-17.md)。

## 开发与验证

需要 Node.js 22+、pnpm 9.15.0。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check             # 类型、ESLint、单元/路由/仓储测试、生产构建
pnpm dev               # 前端 3000，后端 4000
```

后端通过环境变量或根目录 `.env` 配置 `NAV_JWT_SECRET`，并设置 `NAV_PASSWORD_HASH` 或 `NAV_PASSWORD`。密码登录最多 72 字节，推荐使用 bcrypt 哈希。

仅使用本地 IndexedDB 的独立模式需显式启用：

```bash
VITE_STORAGE_MODE=local pnpm dev:frontend
VITE_STORAGE_MODE=local pnpm --filter @nav/frontend build
```

默认服务器模式不会因网络超时自动开放匿名编辑。界面分别显示“已保存到本机”“等待同步”“已同步”“冲突”等状态，数据错误不会静默忽略。

## PC 布局

- 依据实际内容容器的 CSS 宽度选择布局，支持笔记本、分屏、竖屏、超宽和大屏。
- 默认居中、最大内容宽度 1600 px，可以切换铺满；列数可自动选择或设置上限。
- 基准布局与断点布局分开，窗口变化不会写回用户配置。
- 拖拽、缩放、键盘调整结束后提交一次原子布局；支持撤销、重做、自动整理和设为基准。
- 小卡片采用内容适配和内部滚动；竖屏不会仅因长宽比切成单列。

## 保存、同步与离线

独立模式使用 IndexedDB。服务器模式先以本地事务保存快照与待同步操作，再以版本条件和稳定操作 ID 同步到 SQLite。多设备冲突不会自动覆盖，双方草稿可导出并明确处理；跨标签页草稿变化也有版本保护。

生产应用壳成功加载并缓存后可离线打开。离线草稿刷新后仍保留；联网且授权有效时继续同步。插件安装、卸载需要联网；天气、远程插件代码及背景资源不保证离线可用。首次从未访问的页面不支持离线冷启动。

仪表盘读取仍公开，登录用于编辑；组件公开配置中不应存放访问密钥。

## 浏览器测试

```bash
pnpm exec playwright install chromium
pnpm test:browser
NAV_TEST_DIST=true pnpm test:browser
# 额外浏览器需先安装相应运行文件：
NAV_TEST_BROWSERS=chromium,firefox,webkit pnpm test:browser
```

测试自动启动隔离的测试数据库和本地服务；不要设置测试地址为生产地址。

## 部署

```bash
# 配置 .env 后
 docker compose up -d --build
# 或直接运行
pnpm prod:build
pnpm prod:start
pnpm prod:status
pnpm prod:stop
```

服务默认在 4000 端口同时提供页面和 API。Docker 使用 Node.js 22 与非 root 用户；旧卷升级前请按[升级与回滚说明](docs/upgrade-and-rollback.md)备份并调整数据目录权限。

| 环境变量             | 默认值                | 说明                                |
| -------------------- | --------------------- | ----------------------------------- |
| NAV_JWT_SECRET       | 必填                  | JWT 签名密钥                        |
| NAV_PASSWORD_HASH    | 无                    | bcrypt 密码哈希，优先使用           |
| NAV_PASSWORD         | 无                    | 未设置哈希时使用的密码              |
| NAV_DB_PATH          | 当前目录 nav.db       | SQLite 文件                         |
| NAV_UPLOAD_DIR       | ../uploads            | 上传目录，Docker 为 /data/uploads   |
| NAV_UPLOAD_MAX_FILES | 1000                  | 上传文件数量上限                    |
| NAV_CORS_ORIGIN      | http://localhost:3000 | 允许的 API 源                       |
| NAV_TRUSTED_PROXIES  | 空                    | 可信代理地址列表；默认不信任转发头  |
| NAV_PUBLIC_MONITOR   | false                 | 是否公开脱敏监控信息                |
| NAV_MONITOR_DISKS    | /                     | 管理员允许采样的磁盘路径，最多 8 项 |
| PORT                 | 4000                  | 服务监听端口                        |

上传限 5 MiB 栅格图片，转换为 WebP；动画只保留第一帧，SVG 不受支持。历史安全栅格图片保留地址，SVG 背景需要替换。

## 数据备份与兼容

```bash
pnpm build
NAV_DB_PATH=/absolute/path/nav.db pnpm db:preflight
NAV_DB_PATH=/absolute/path/nav.db pnpm db:backup /absolute/path/backup.db
```

数据库备份使用 SQLite 一致性备份接口；同时保留 uploads 和部署配置。旧布局自动生成迁移备份，不删除用户组件。旧盲写客户端会收到 426，需要刷新。

- [完整修复设计](docs/repair-plan-2026-10-17.md)
- [实际修复与验证记录](docs/repair-status.md)
- [升级、备份及回滚](docs/upgrade-and-rollback.md)
- [第三方组件协议 v2](docs/widget-protocol-v2.md)

第三方组件需预构建为自带依赖的 ESM bundle，并使用 manifestVersion 2；固定到不可变提交，在受限 iframe 内运行。旧 SFC 插件保留配置与位置，升级后才能执行。

## 技术栈

Vue 3、Pinia、Dexie、Vite；Hono、better-sqlite3、JWT；共享 TypeScript 模型与校验；Turborepo、pnpm workspace。布局算法为独立纯函数，不再使用旧网格库。
