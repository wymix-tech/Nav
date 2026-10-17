# main 合并兼容修复

基于合并提交 `6c55ca3`。保留统一修复分支的新网格、认证、离线队列、原子快照与插件隔离，恢复合并前 main 的功能。

## 数据升级

- 兼容 SQLite 的 `layout_mode`、`viewport`、`viewport_width`、`viewport_height` 和组件 `canvas` 字段；旧库只做加列升级。
- 第一次读取旧记录时保存 `legacy-main-v1:<id>` 备份，包含原始数据库行、画布尺寸、原始尺寸、视口和完整组件配置。旧 `layout-v1` 备份保持不变。
- 新快照保存同时保留画布字段和兼容列；修改标题、切换到网格不会删除画布坐标。画布与网格可在偏好设置中切换。
- 画布缩放基于容器和原始参考尺寸计算显示变换；浏览器大小变化和手机堆叠不写数据库。拖动/调整组件在 pointerup 后只提交一次，Escape、pointercancel、权限失效时取消。
- 备份通过管理员接口 `GET /api/dashboards/default/backup` 获取。部署前仍需使用 SQLite 一致性备份；应用内 JSON 备份不能代替完整数据库备份。
- 对已经写入 `state_json`、但缺少画布字段的部分升级记录，先备份原快照与数据库行，再恢复仍存在于兼容列中的视口、模式及坐标。
- 如果旧合并版本已经保存并清空了 `canvas`，本次修复无法凭空恢复历史坐标。应从部署前的 SQLite 备份恢复或提取；勿直接覆盖当前数据库中的新数据。

## AI 聊天

恢复 OpenAI/Anthropic 流式聊天、Markdown、预览和每实例会话历史。聊天接口需要登录，限制消息数/长度、模型、调用频率和并发，支持超时及取消；Markdown 和预览均经过净化。

服务端配置：

| 变量 | 含义 |
| --- | --- |
| `NAV_AI_BASE_URL` | 完整 API 基地址，如 `https://api.openai.com/v1`，代码只追加 `/chat/completions` 或 `/messages` |
| `NAV_AI_API_KEY` | 服务端密钥，推荐配置方式 |
| `NAV_AI_MODELS` | 可使用的模型，逗号分隔 |
| `NAV_AI_PROVIDER` | 可选 `openai` / `anthropic`；为空时按主机名识别，自建代理应显式指定 |
| `NAV_AI_ALLOWED_ORIGINS` | 可选的自定义 API 源允许列表，逗号分隔，完整 origin |
| `NAV_AI_SYSTEM_PROMPT` | 默认系统提示词 |

组件不再把 API Key 写入公开仪表盘。旧配置中的 Key 保存在受认证保护的迁移备份中，公开快照去除该字段。应将旧 Key 转移到服务端配置；组件内可输入本次会话临时 Key，刷新后不保留。自定义端点需属于允许列表并提供独立临时 Key，服务端 Key 只发给配置的完整基地址，禁止重定向。

## Docker 监控

恢复容器列表、CPU/内存和网络速率。后端改为异步 `execFile` 参数调用，并共享 5 秒采样缓存；接口始终需要登录。前端离开可见页面、退出登录或卸载组件时停止/取消采样。

容器内的应用以 UID 1000 运行，需要显式授予 Docker Socket 组权限：

```bash
# Linux 宿主机示例；确认 Socket 所在路径及 GID
export NAV_DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
docker compose -f docker-compose.yml -f docker-compose.docker.yml up -d --build
```

Docker Desktop 或不同 Socket 路径应根据实际环境调整映射和 GID。基础 Compose 不再默认挂载 Socket；需要 Docker 监控时启用上述覆盖文件。应用只查询容器状态，但 Socket 本身拥有管理 Docker 的权限。

## 版本信息

恢复关于窗口、当前版本与发布检查。构建继续支持 `APP_VERSION`，未指定时使用 `__APP_VERSION__`。发布查询默认读取 CNB，与当前自动发布流水线一致；`NAV_RELEASE_SOURCE=github` 可切换 GitHub 发布源。私有 CNB 发布需要 `NAV_CNB_TOKEN`，不在源码中嵌入 Token。查询失败显示错误，支持重试和缓存。

## 验证

当前共有 35 项单元/路由/仓储测试。新增旧 main 数据库升级/保存、非法画布写入、聊天鉴权/源限制、流取消、SSE 分片、Docker 缓存等回归测试；浏览器覆盖画布多尺寸与取消/单次提交、聊天 Markdown 净化/独立历史及 Docker 展示，保留原有网格、离线与插件测试。

执行 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm test:browser`、`NAV_TEST_DIST=true pnpm test:browser`；GitHub CI 继续验证 Chromium/Firefox/WebKit 及 Docker 镜像构建。真实 AI 服务、宿主机 Docker Socket、生产数据库备份恢复需在部署环境验证，不在测试中使用生产密钥或数据。
