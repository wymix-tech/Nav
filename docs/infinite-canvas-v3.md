# 无限画布 V3：资源生命周期、操作与验证

V3 从 `899b4561b6faec0f4d8b0c5a2871a800ae1b29d2`（V2 PR #3）建立 `feat/infinite-canvas-v3`，继续依赖 V2。main 仍为 `27e915f`，不能绕过 V1/V2 直接部署。本轮不合并、不部署、不修改生产数据。设计输入保存在 [V3 方案](infinite-canvas-v3-plan.md)。

当前是可审查的首轮实现，尚未完整发布验收。产品实现为 `7eed296`，`9402d82` 增强聊天删除/撤销回归。逐浏览器最终运行合计 91 通过、5 跳过，另有增强用例的重复验证；它们来自同一产品源码的独立运行。一次早期 WebKit 撤销后详情待挂载超时仍为开放问题 `V3-WK-UNDO-01`，后续通过不等于根因解决。完整运行记录、生产构建结果及 partial/manual-pending 以验证 JSON 为准。

正式性能采样已完成四种模式各三个场景、共 10800 个正式帧；采样成功不代表性能目标通过。密集 safe 的长任务仍偏多，记录为 `V3-PERF-DENSE-01`，需要进一步 profile。生产场景覆盖来自原全套 31 项通过和修正后的离线壳定向 1 项通过；后者用虚拟时钟跨过既有 20 秒租约/30 秒心跳恢复窗口，没有修改生产同步协议。

## 操作

画布底部的“资源模式”只影响当前标签页：

- **自动（safe）**：稳定保留完整组件宿主；明确可恢复的内容按实际视口、160/320 CSS px 预取/保留区、1.5 秒退出迟滞挂载。详情、摘要、轮廓按照投影大小分级，阈值有 10%/120ms 迟滞。
- **仅观测（observe）／完整显示（full）**：保持所有详情和前台需求，继续复用同一个 Runtime 和共享服务，不重新创建聊天请求。二者目前具有相同渲染策略，分别标识观测与回退用途。
- 点击摘要“进入组件”会调整本机视角并等待内容挂载；搜索完整文档中的离屏目标也能恢复详情。列表沿用原固定高度占位和 CSS order，不重排文档数组；网格首版保持全量详情。

焦点、输入法组合、配置表单、指针与生成中的聊天优先保活。低倍率摘要不展示聊天文本或未保存输入。全部旧插件仍按原行为启动，始终保留原 iframe、父级、srcdoc 与通道；隐藏绘制不表示插件 JS 已暂停。若整盘均为旧插件，资源开销仍可能接近 V2。

相机、裁剪、摘要、运行状态、模式切换均不写 Dashboard、历史或同步队列。宿主仍是 O(全部组件数)，不是所有 DOM 都随可见数缩减。

## 状态和释放

Runtime 在 App 布局之上按既有 `viewSpaceKey + widget.id` 创建唯一 owner。类型身份另含 source、widgetId、插件不可变 commit/CDN/entry；目录刷新不再误重启同一插件；网络权限/CSP 发生变化会替换安全身份，立即结束旧 runner。

内容卸载只释放 View 订阅。真实接受的删除、类型替换、空间切换和权限撤销才结束相关任务；被锁拒绝的命令不提前清理。加载中临时 null 不清空已接受的 owner。异步空间绑定、导航和流分别校验 serial/generation/requestId，授权服务另有 epoch；晚到结果不进入新空间或新登录缓存。

聊天保存输入、原始消息、错误/中断状态和阅读位置到 `nav_chat_v1:<编码空间>:<编码实例>` 的 sessionStorage，约 250ms 合并写入，并在流结束、停止和页面隐藏时 checkpoint。临时 API Key 只留内存。存储失败明确提示，保留当前内存；坏记录和未来格式原样保留。刷新恢复已收片段并标记中断，不续发请求。撤销删除恢复文档及可用私有记录，不复活网络任务。

旧 `nav_chat_<id>` 不自动迁移：在组件中展开“旧会话记录”预览，显式绑定当前空间。旧记录保留；先预留唯一绑定，再写私有记录，配额失败也不会在另一空间留下半份导入。有活动流或已有消息时禁止直接覆盖，须先新建空白会话。服务端流是否停止和供应商计费不由客户端 AbortController 保证。

Search 和 Bookmark 的草稿在 Runtime。删除撤销用的内存记录最多保留 20 个、5 分钟，在下一次协调时清理并按类型核对恢复。明确切换空间时，未保存的搜索/书签草稿另行保留到本次 App 会话结束，不受删除 tombstone 的 20 个配额挤出；不保留无输入的干净状态。它们不是跨刷新持久化承诺。聊天独立使用有明确空间身份的私有记录。当前没有跨空间后台保活网络任务。

32MiB 是可恢复内置文本/草稿的序列化估算软预算，包含非活动空间的脏草稿，超出时拒绝启动新的聊天任务，已有流和草稿保留；它不是浏览器总堆硬限制。40 个 full 和 20 个干净 warm 详情是软目标，焦点/表单/插件等必要保活项可超出并显示提示。本文不把模型对象、iframe 或浏览器内部内存计为精确堆字节。

## 组件策略

| 类型                | 恢复策略             | 资源所有者与回收边界                                                                                 |
| ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| Clock               | reconstructible      | 共享时钟调度；详情秒级、摘要分钟级；无消费者/hidden 停止调度；格式化日期按日缓存                     |
| Search              | stateful-recoverable | Runtime 保留 query/引擎菜单；焦点/输入法/菜单开启时保护 View                                         |
| Bookmark            | stateful-recoverable | Runtime 保留配置草稿；未提交表单保护，展示由公开配置重建                                             |
| Chat                | stateful-recoverable | Runtime 独占请求/控制器/原始消息；活动流保留 View，离屏/hidden 合并或停止 Markdown 通知              |
| Weather             | reconstructible      | 原始天气缓存＋同城市 in-flight 去重；消费者取消不取消他人请求；全服务一个到期检查调度器              |
| Monitor             | reconstructible      | 扩展原共享服务，同磁盘集合复用；无详情需求停止订阅；授权 epoch 清理和拦截迟到回包                    |
| Docker              | reconstructible      | 同端点/授权会话共享采样，最快有效需求决定周期；每 View 重建速率基线，暂停/重启/回退后首个速度显示“—” |
| installed／未知类型 | opaque-retain        | 沿用原启动和隔离协议；禁止视口/LOD 回收 iframe；真实安装身份变化才重启                               |

普通登录复核中的 checking 状态不取消既有用户流；新发送仍要求已验证的 editable 权限。真正退出/401/凭据变更会清除临时 Key 与授权采样缓存。天气单位和 Monitor 磁盘请求使用已接受配置，配置草稿不提前改变数据源；Monitor 的草稿数组不再直接引用文档数组。

## 索引与调度

共享层新增不可变 RectIndex 的线性参考和最长轴 AABB/BVH 实现。完整派生结构包含渲染矩形、自由组件/组联合范围、区域；geometryEpoch 按几何和成员投影变化递增，不随相机、名称、配置、ack 或层序变化重建。生产默认线性后端，研究数据不足以证明在当前 100 规模下切树有稳定整体收益。

框选/吸附使用索引候选后再应用原正面积相交、组归一化、锁、6/10px 吸附和稳定顺序。活动对象从已提交候选中排除，草稿层按完整成员计算，不按挂载 DOM 过滤命令目标。巨型区域只保留一条索引项，绘制限制到视口交集，文档几何不变。

挂载启动每 RAF 至多两个轻 View 或一个 Chat，发布阶段软预算 4ms。Vue 的异步组件加载和实际 mount 无法被抢占，不将该发布预算描述为每帧硬保证。相机变动使旧队列失效；等待详情时保留可访问摘要。

## 版本和回退

保持 document/schema **3**、canvasScene/settings **1**、layoutVersion **2**、Dexie **4**、NamedView **1**、manifest **2**，100 个组件上限不变。V3 无新增数据库迁移。已有部署升级到 V2 的备份、迁移与未来版本停写约束继续执行。

首先切到 full 回退，保持 Runtime 与活动任务。不要清理 IndexedDB/sessionStorage 解决资源问题。回退 V2 二进制不会读取新的 namespaced 聊天记录；记录仍保留，不复制回缺少空间身份的旧 key。SW 更新沿用用户主动更新，不自动刷新活动流。

300/1000 只在 Rect[] 研究基准中构造，未改变正式 Dashboard 校验。增量命令传输和空间分块仍为独立扩展设计，见方案第 16 节；没有生产能力协商、离线/恢复矩阵和旧写入端保护前，不启用。

## 验证和复现

实际结果见 [验证清单](infinite-canvas-v3-validation.json)、[性能对照与规模研究](infinite-canvas-v3-performance.md) 和 `docs/performance/` 原始数据；未执行项不算通过。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install --with-deps chromium firefox webkit
NAV_TEST_BROWSERS=chromium,firefox,webkit pnpm test:browser
NAV_TEST_DIST=true pnpm test:browser
node --import tsx scripts/benchmark-spatial.ts
NAV_TEST_DIST=true NAV_PERF_MODE=safe pnpm exec playwright test -c playwright.performance.config.ts
```

性能脚本使用合法 100 时钟（密集/稀疏）、100 混合组件（30/20/10/10/10/10/5/5）和固定网络桩，分别在冻结 V2、V3 observe/safe/full 生产构建运行。每轮 30 帧预热另存、300 帧正式样本、三轮，不删除长任务帧。混合样本安装无网络权限的隔离测试插件，不向真实 AI/监控/天气服务请求。

诊断默认仅开发构建开启；测试生产构建可用 `VITE_RUNTIME_DIAGNOSTICS=true` 显式编译开启。页面接收 `nav-runtime-diagnostics` 后用 `nav-runtime-snapshot` 返回 owner、View、保护和服务计数，不包含输入、消息、Key、认证头和插件快照。它不写共享文档。

继承的 V2 真 Safari/触控板/触屏、系统缩放、参考 PC p95≤33ms、生产部署副本升级/回滚门槛仍需独立闭环。Linux WebKit 结果不等于真实 Safari。任何共享 Linux/SwiftShader 结果只用于同环境对照。
