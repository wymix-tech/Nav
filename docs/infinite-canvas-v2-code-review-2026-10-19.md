# V2 代码审查（2026-10-19）

审查对象：`feat/infinite-canvas-v2`，提交 `75bdd9c2ce45bdf2acfa9f5c5ca92de520e9a027`；相对 `origin/feat/infinite-canvas-v1` 的 55 个改动文件。覆盖共享协议、运行时校验、原子命令、迁移、锁、同步与恢复、选择交互、面板和测试。此次只做审查，未修改产品实现或发布远端改动。

## 结论与验证

建议先修复 R1、R2 再进入合并验收。现有静态检查和测试通过，但未覆盖下面复现的状态交叉问题。

- `pnpm check`：类型检查、ESLint、80 项测试和生产构建全部通过。
- V2 改动的代码/配置文件 Prettier 检查通过；`git diff --check` 通过。
- 使用实际 Vue 调度、Pinia Store、Dexie/fake-indexeddb、原生 BroadcastChannel 以及受控存储延迟完成小范围复现；未依赖重新实现业务算法。
- 本轮没有重新运行真实浏览器、Docker 或参考设备性能测试。下面的复现结果属于模块/状态层证据，不冒充真机验收。

## 功能与可靠性发现

### R1 · P1：空闲标签页通知会清空正在编辑页面的撤销历史

位置：`packages/frontend/src/stores/dashboardStore.ts:246`；关联 `packages/frontend/src/services/syncAdapter.ts:55`、`:58`、`:72`、`:369`。

Store 收到任何 `external: true` 事件便立即清空 history/future。SyncAdapter 广播只带空间 key，接收方一律把消息当成外部文档更新；而 refresh 和没有待发送操作的 flush 也会广播。另一个可见但未编辑的标签页每 30 秒的心跳因此足以清空编辑页历史，即便 revision、文档和队列都没变化。

复现：编辑页 history 有 1 条，另一 Adapter 读取相同 revision 后执行空 flush；最终远端 revision 仍为 0、pending 为 0，编辑页 history 从 1 变成 0。

建议：区分状态通知和文档变更通知，在广播中携带 generation/revision/来源，并确认当前文档相对编辑基线发生变化后才清理历史；不要用消息到达本身判断文档被替换。补充两个标签页、无变更心跳保留 undo、真实外部更新使旧历史失效的回归。

### R2 · P1：异步撤销与新命令交错，会重新生成已经作废的重做分支

位置：`packages/frontend/src/stores/dashboardStore.ts:192`、`:202`。

undo/redo 先通过 commit 同步替换 dashboard，再等待持久化，最后才移动历史栈。期间普通命令仍可执行并清空 future；迟到的 undo 随后又把旧快照放回 future。`dashboard !== before` 只能判断对象引用变化，无法确认当前状态仍是本次历史操作产生的状态。App 的按钮没有等待中禁用或互斥控制。

复现：当前 C，history=[A,B]；暂停 undo 的 saveDashboard，此时当前已是 B；执行新命令 D，再释放保存。最终 current=D、history=[A,B]，但 future=[C]，预期 future=[]。用户随后点击“重做”会用已经作废的 C 覆盖 D。

建议：把文档变换和历史栈变换作为同一个同步状态事务，持久化排队另行处理；或对全部命令及 undo/redo 做同一串行控制，并用操作序号防止迟到任务改变栈。失败后的未保存语义需要保留。补充延迟写入期间 undo→新命令、redo→新命令、外部替换的交错测试。

### R3 · P2：恢复预览漏报区域背景的层序变化

位置：`packages/shared/src/canvas/recovery.ts:10`、`:17`。

比较 groups/regions 时按 ID 找对象，未比较 regions 的 ID 顺序。区域的显示层序直接由 regions 数组顺序决定；layers 仅描述 widget/group，不能覆盖这项差异。仅调整区域前后位置的草稿会显示为空差异，整盘恢复时却会改变背景遮挡关系。

复现：区域顺序 [r1,r2] → [r2,r1]，两份文档合法且命令产生了真实变更；`canvasSceneDifferences` 返回 []。

建议：单独比较 regions.map(r=>r.id)，输出区域背景层序变化；保留现有按 ID 的字段比较，避免因对象键顺序误报。补同数量、同字段、仅层序变化的恢复测试。

### R4 · P2：列表搜索的“返回定位前视角”无法恢复原浏览位置

位置：`packages/frontend/src/canvas/useCanvasWorkspace.ts:103`、`:109`、`:130`。

locate 只记录 previousCamera。列表中的组件/组定位改变根容器滚动位置，back 不恢复滚动；区域定位还把 presentation 改为 spatial，back 也不恢复原 presentation。因此这个按钮在列表模式不能兑现其返回语义。

复现：列表滚动位置 10，定位组件后为 1000，执行 back 仍为 1000；从列表定位区域后执行 back，presentation 仍为 spatial，原来为 list。

建议：记录本机导航快照，包含 camera、presentation 及根容器滚动位置；返回时先恢复 presentation，等待 DOM 更新后恢复滚动。仍不写共享文档或文档历史。

### R5 · P2：名称复用丢失 source，已安装插件会覆盖内置组件名称

位置：`packages/frontend/src/canvas/useCanvasLabels.ts:15`；关联 `packages/shared/src/canvas/search.ts:23`、`:33`。

统一名称表只按 widgetId 建键，先写内置名称再写已安装 manifest.displayName。协议允许 source=builtin 和 source=installed 使用相同 widgetId，渲染器也明确按 source 区分；这里合并成单一命名空间后，同名插件会覆盖内置名称。图层名称、无自定义标题时的显示名称和类型搜索都会受影响。

复现：安装 widgetId=clock、displayName=Plugin Clock 的插件后，source=builtin 的时钟也被解析为 Plugin Clock，而不是“时钟”。

建议：公共名称解析保留 source+widgetId 身份，或把内置和已安装名称表分开，并统一由解析函数按实例 source 取值；补充同 ID 不同 source 的名称与搜索测试。

### R6 · P3：区域的非几何修改会取消活动拖动

位置：`packages/frontend/src/canvas/useCanvasInteraction.ts:59`；关联 `packages/shared/src/canvas/scene.ts` 的 selectionRect。

geometryFingerprint 把 selectionRect 的返回值整体序列化。对于区域，该函数返回完整 CanvasRegion，包含 title、color 等字段；因此区域改名或改色也被误判为几何失效，与组件标题的行为不一致。

复现：拖动区域产生 draft 后，用相同几何的新文档更新区域名称；Vue watcher 会取消草稿并释放 capture，pointerup 没有命令提交。只比较指纹也能确认名称变化导致指纹变化，几何实际未变。

建议：指纹中显式投影 x/y/w/h，分别保留锁、成员和相关组件几何；非几何变化应保留并基于最新文档提交几何 patch。补区域改名/改色保留拖动，锁/几何变化取消拖动的对照测试。

## 代码规范、复用和死代码

以下是清理建议，不与上面的行为问题混为合并阻塞项。

1. `packages/frontend/src/canvas/useCanvasInteraction.ts` 的 Active.pointer 和 Active.refsAtStart 只有声明/赋值，没有读取；refsAtStart 还在每次启动时做了一次无用 JSON clone。返回对象的 hasActive 在产品及测试中均没有调用方。可删除，或在确有消费者时再引入。ESLint 的 no-unused-vars 不会发现对象里这些未使用字段。
2. `useCanvasSelection.choose` 与 `useCanvasInteraction.start` 重复实现选择归一化、Shift 切换及已选集合判断。应提取同一个纯选择转换函数或复用选择控制器，避免图层/列表和画布点击逐渐产生不同语义。
3. `namedViewService.viewNameKey` 与 shared 的 normalizeQuery 具有相同的 NFKC/trim/空格压缩/小写逻辑；`structuredCloneSafe` 与 localDatabase.clone 也是相同 JSON 深拷贝实现。可以提取语义稳定的基础文本函数及通用 clone 工具。命名视角的 nameKey 属于持久化唯一键约定，复用时不能随搜索需求改变它的语义；交互模块也不应为复用 clone 而额外依赖存储层。
4. 目前模型、校验、命令、锁转换和几何计算已集中在 shared，网格/列表复用了图层、搜索和编辑工具；这部分分层值得保留。CanvasGrid 仍承担较多渲染和入口协调，但不能仅为降低文件行数拆出重复状态或第二套命令系统。

## 建议修复顺序

先处理跨标签页通知和历史事务（R1/R2），再补齐恢复/导航/名称身份（R3/R4/R5），最后缩小指纹和清理冗余（R6、清理建议）。对应回归应验证用户可见行为及状态不变量，不只断言内部函数被调用。

## 修复跟踪（2026-10-19）

本节记录审查后的修复，前文保留发现时的代码位置和复现事实。

| 项目 | 修复                                                                                           | 回归证据                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| R1   | 区分文档/状态广播，核对实际内容，保留旧标签页 key-only 通知兼容；通知不改变编辑基线 generation | dashboard-history：空 flush 保留历史、真实更新使历史失效、旧编辑者仍拒写、ack/旧广播不误清理 |
| R2   | 文档与历史栈同一次同步状态变更，持久化异步排队                                                 | dashboard-history：延迟 undo/redo 后新命令、外部更新期间的迟到保存、校验失败和写入失败       |
| R3   | 逐 ID 比较之外增加 regions.order                                                               | canvas-scene：同字段仅换层序，恢复差异非空                                                   |
| R4   | 返回快照包含 presentation 和滚动；空间身份同步失效及导航序号保护                               | canvas-workspace：组件/组/区域返回，迟到返回不滚动新空间                                     |
| R5   | 按 source 分离内置和安装类型名称；组件 memo 依赖名称表                                         | canvas-scene/canvas-workspace：同 ID 插件与内置名称、类型搜索独立                            |
| R6   | 指纹显式投影区域 x/y/w/h                                                                       | canvas-session：改名/改色保留拖动并保留最新元数据；锁和坐标变化仍取消                        |
| 清理 | 复用选择转换、稳定文本归一化、通用 JSON clone；删除 Active.pointer、refsAtStart、hasActive     | 现有选择/命名视角及新回归                                                                    |

修复前，新增的 R1/R2 回归在原实现上实际失败；修复后本地 `pnpm check` 的 92 项测试全通过，类型检查、ESLint、生产构建及改动文件格式检查通过。修复提交 `32027e9` 的 [CI run 39183401596](https://github.com/wymix-tech/Nav/actions/runs/39183401596) 全部适用步骤成功：92 项测试、三浏览器开发回归 70 通过/5 跳过、Chromium 生产回归 25 通过、Docker 构建成功。5 个跳过仍为 3 个仅生产离线壳场景和 2 个非 Chromium CDP 触屏场景，不计为通过。

首轮修复 CI（39182871004）为 67 通过/5 跳过/3 失败，双标签页撤销在三个浏览器均通过。新增列表测试仅等待结果数量，旧查询和新查询都是单条结果，导致防抖完成前点击旧结果；已增加目标区域名称等待，保留所有滚动、展示方式、宿主与零写入断言后完整重跑通过。
