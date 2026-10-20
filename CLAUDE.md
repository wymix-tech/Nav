# Nav 开发说明

以 README.md、docs/upgrade-and-rollback.md 和 docs/widget-protocol-v2.md、docs/infinite-canvas-v1.md 为当前实现约定；docs/superpowers 下文档为历史设计，不应覆盖当前协议。

Node.js 22+、pnpm 9.15.0。运行 pnpm check 检查类型、ESLint、单元/路由/仓储测试与构建；pnpm test:browser 和 NAV_TEST_DIST=true pnpm test:browser 检查真实浏览器与生产应用壳。

- shared 中维护布局纯函数、运行时校验和共享类型。build 必须生成 dist，不能提交 tsbuildinfo。
- 组件通过 Store 和统一存储接口写入。窗口尺寸变化不得触发持久化；拖拽一次交互一次原子提交。
- 服务器模式不因 health 失败降级为匿名可写。保存需要本地事务、版本条件与稳定 operationId。
- 不在主页面直接 import 远程插件，不开放 SVG 活动上传内容，不信任任意转发头。
- 数据迁移先备份，旧数据不可静默删除。回滚不得重新引入已修复的安全漏洞。
- 每项行为修复应有对应回归证据；类型检查与构建通过不能替代浏览器功能验收。

- V2 当前写入严格使用 schema/document 3；legacy 校验仅服务读取/显式迁移。所有文档成功迁移前服务端停写。
- canvasScene 维护单层组、独立区域、元数据和层序；平坦稳定宿主不重挂。选择、搜索、导航不写共享文档；命名视角独立存储，不进入文档导出。
- 布局锁保护整批几何与结构；同请求解锁并移动仍拒绝。内容配置和显式层序不借锁绕过原认证。

- V3 Runtime、LOD、可见性与派生索引不写文档/历史；schema3、Dexie4、manifest2 和 100 组件上限保持。
- 普通 View detach 不 abort 聊天；真实删除、空间/类型替换、权限失效才清理 owner。旧插件不得因视口/LOD 重建或搬动 iframe。
- 扩展可回收类型必须有状态/表单/异步结果回归；性能与真机/生产副本门槛不能用类型检查替代。当前实现与验证见 docs/infinite-canvas-v3.md。
