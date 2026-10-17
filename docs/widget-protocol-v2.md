# 隔离组件协议 v2

插件必须将代码构建成自带依赖的浏览器 ESM bundle。入口不可为原始 Vue SFC，不访问主页面 Vue 实例或 token。

仓库根目录的 manifest 示例：

```json
{
  "manifestVersion": 2,
  "name": "hello-widget",
  "displayName": "Hello",
  "version": "1.0.0",
  "description": "最小隔离组件",
  "author": "example",
  "icon": "★",
  "repository": "https://github.com/example/hello-widget",
  "entry": "dist/index.js",
  "schema": { "properties": { "text": { "type": "string", "title": "文字" } } },
  "size": { "w": 4, "h": 3 },
  "minSize": { "w": 2, "h": 2 },
  "networkOrigins": []
}
```

`size` 和 `minSize` 为网格单位；内部组件需要自行适应容器。实际最小尺寸还受当前容器和视口限制。宿主不接受插件任意调整页面布局的请求。

入口导出：

```js
export function mount(root, config, api) {
  const button = document.createElement('button')
  button.textContent = config.text || 'Hello'
  button.onclick = () => api.updateConfig({ ...config, text: 'Clicked' })
  root.append(button)
  return () => button.remove()
}
```

可选导出 `updateConfig(config)` 处理外部配置变化。`mount` 可以异步返回清理函数。构建时将 Vue 等依赖打包进同一个入口，避免运行时从额外 CDN 导入。安装器固定到不可变提交，而不是可变分支或版本字符串；清单与入口取自同一提交。

代码运行于不授予同源权限的 sandbox iframe。runner 的 CSP 限制入口、网络和图片来源；网络需求使用 `networkOrigins` 的 HTTPS origin 白名单，安装时需确认。不要把任意 `permissions` 文本当成已实现的能力控制。

宿主只通过专用消息通道提供本插件配置。配置消息限制频率和大小，访客不能通过插件写配置；关闭组件会关闭通道。插件错误或超时显示占位，其他组件继续工作。

旧插件不会继续在主页面上下文执行；升级前请备份配置。卸载前需先删除所有引用该插件的组件，防止产生悬空引用。
