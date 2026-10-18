# Nav 开发说明

以 README.md、docs/upgrade-and-rollback.md 和 docs/widget-protocol-v2.md、docs/infinite-canvas-v1.md 为当前实现约定；docs/superpowers 下文档为历史设计，不应覆盖当前协议。

Node.js 22+、pnpm 9.15.0。运行 pnpm check 检查类型、ESLint、单元/路由/仓储测试与构建；pnpm test:browser 和 NAV_TEST_DIST=true pnpm test:browser 检查真实浏览器与生产应用壳。

- shared 中维护布局纯函数、运行时校验和共享类型。build 必须生成 dist，不能提交 tsbuildinfo。
- 组件通过 Store 和统一存储接口写入。窗口尺寸变化不得触发持久化；拖拽一次交互一次原子提交。
- 服务器模式不因 health 失败降级为匿名可写。保存需要本地事务、版本条件与稳定 operationId。
- 不在主页面直接 import 远程插件，不开放 SVG 活动上传内容，不信任任意转发头。
- 数据迁移先备份，旧数据不可静默删除。回滚不得重新引入已修复的安全漏洞。
- 每项行为修复应有对应回归证据；类型检查与构建通过不能替代浏览器功能验收。
