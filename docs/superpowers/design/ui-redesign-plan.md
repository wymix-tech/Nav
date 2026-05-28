# 个人导航页 — UI 重设计方案

**设计日期：** 2026-05-24
**当前截图：** `current-desktop.png`, `current-edit-mode.png`, `current-mobile.png`

---

## 1. 设计方向：「Aura」— 氛围感仪表盘

### 设计理念

去掉传统仪表盘的"面板感"，转向一种**沉浸式氛围体验**。组件不再是被框住的卡片，而是漂浮在深邃背景上的发光体。整个页面像一个深空中的控制台——安静、精致、有呼吸感。

### 核心关键词
- **沉浸** — 无边框、无标题栏，内容即界面
- **氛围** — 渐变背景 + 微光辉光，营造深度
- **灵动** — 细腻的过渡动画，交互有反馈
- **克制** — 信息密度适中，留白呼吸

---

## 2. 当前设计问题分析

| 问题 | 描述 |
|------|------|
| **Header 占空间** | 顶部导航栏固定 53px，手机端更显拥挤 |
| **卡片边框生硬** | `border: 1px solid #334155` 制造了过多分割线 |
| **背景单调** | 纯色 `#0f172a` 缺乏层次和深度 |
| **字体平庸** | 系统字体无特色，时钟等核心元素缺乏视觉冲击 |
| **编辑模式粗糙** | 虚线边框 + 侧边栏遮挡，编辑体验割裂 |
| **交互无反馈** | 组件悬浮、点击缺少微动效 |

---

## 3. 设计系统

### 3.1 色彩体系

```
背景层（深空）:
  --bg-deep:     #06080f      最深层背景
  --bg-base:     #0c1021      主背景
  --bg-surface:  rgba(15, 23, 42, 0.6)  玻璃表面
  --bg-glow:     rgba(59, 130, 246, 0.08) 微光辉光

文字层:
  --text-primary:   #e2e8f0   主要文字
  --text-secondary: #64748b   次要文字
  --text-muted:     #334155   弱化文字

强调色:
  --accent:       #60a5fa     柔和蓝（主强调）
  --accent-glow:  rgba(96, 165, 250, 0.3) 蓝色辉光
  --accent-warm:  #f59e0b     温暖琥珀（时钟秒数等）
  --danger:       #f87171     错误/警告

玻璃效果:
  --glass-bg:     rgba(15, 23, 42, 0.4)
  --glass-border: rgba(255, 255, 255, 0.06)
  --glass-blur:   20px
```

### 3.2 字体方案

```css
/* 标题 / 大数字（时钟等） */
--font-display: 'Outfit', 'SF Pro Display', sans-serif;

/* 正文 / UI 元素 */
--font-body: 'DM Sans', 'SF Pro Text', sans-serif;

/* 等宽数字（时钟、日期） */
--font-mono: 'JetBrains Mono', 'SF Mono', monospace;
```

- **Outfit**: 几何感强的无衬线字体，适合大号显示数字
- **DM Sans**: 人文主义无衬线，清晰优雅
- **JetBrains Mono**: 编程字体，数字对齐完美

通过 Google Fonts 引入，回退到系统字体。

### 3.3 间距与圆角

```
--radius-sm:  8px     按钮、输入框
--radius-md:  16px    组件容器
--radius-lg:  24px    弹窗、面板
--radius-xl:  32px    手机端底部抽屉

--space-xs:   4px
--space-sm:   8px
--space-md:   16px
--space-lg:   24px
--space-xl:   40px
```

---

## 4. 布局改造

### 4.1 去掉 Header，全屏沉浸

**改前：**
```
┌─────────────────────────────┐
│ Nav            [登录]       │  ← 53px header
├─────────────────────────────┤
│                             │
│        组件内容区域          │
│                             │
└─────────────────────────────┘
```

**改后：**
```
┌─────────────────────────────┐
│                             │
│        组件内容区域          │  ← 全屏，无 header
│                             │
│                        [·]  │  ← 左下角悬浮按钮（hover 显示）
└─────────────────────────────┘
```

- 删除 `TopBar.vue` 组件的 DOM 渲染（保留逻辑）
- 登录/编辑/退出按钮移到左下角浮动面板
- 平时只显示一个小圆点图标，鼠标悬浮后展开
- 手机端长按或点击空白区域触发

### 4.2 组件无边框设计

**改前：**
```css
.widget-wrapper {
  background-color: var(--bg-card);        /* #1e293b */
  border: 1px solid var(--border);         /* #334155 */
  border-radius: 8px;
}
```

**改后：**
```css
.widget-wrapper {
  background: var(--glass-bg);             /* 半透明 */
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);   /* 极淡白边 */
  border-radius: var(--radius-md);         /* 16px */
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03),
    0 4px 24px rgba(0,0,0,0.2),
    inset 0 1px 0 rgba(255,255,255,0.04);
  transition: box-shadow 0.3s, transform 0.3s;
}

.widget-wrapper:hover {
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 8px 40px rgba(0,0,0,0.3),
    0 0 60px -20px var(--accent-glow);
  transform: translateY(-1px);
}
```

- 编辑模式下虚线边框改为半透明蓝色辉光
- 删除组件标题（WidgetWrapper 中移除标题区域）
- 组件内容直接融入背景

### 4.3 背景氛围

```css
body {
  background:
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(59, 130, 246, 0.06) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 80% 70%, rgba(139, 92, 246, 0.04) 0%, transparent 60%),
    linear-gradient(180deg, #06080f 0%, #0c1021 50%, #0f172a 100%);
  min-height: 100vh;
}
```

- 左上角微弱蓝色辉光，右下角微弱紫色辉光
- 整体从深黑渐变到深蓝
- 营造深空氛围，不抢夺内容注意力

---

## 5. 组件样式改造

### 5.1 搜索框

```css
.search-widget .search-form {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 6px;
  transition: border-color 0.3s, box-shadow 0.3s;
}

.search-widget .search-form:focus-within {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
}

.search-widget input {
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 15px;
  padding: 12px 16px;
}

.search-widget .search-btn {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  border-radius: 12px;
  padding: 10px 24px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  transition: transform 0.15s, box-shadow 0.15s;
}

.search-widget .search-btn:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
}

.search-widget .search-btn:active {
  transform: scale(0.98);
}
```

### 5.2 时钟组件

```css
.clock-widget .time-main {
  font-family: var(--font-display);
  font-size: 72px;
  font-weight: 700;
  letter-spacing: -2px;
  background: linear-gradient(135deg, #e2e8f0, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
}

.clock-widget .time-seconds {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 500;
  color: var(--accent-warm);
  margin-left: 4px;
  vertical-align: top;
}

.clock-widget .date-display {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
```

### 5.3 天气组件

- 无边框，纯内容展示
- 温度数字用渐变色
- 天气图标添加微动画（如云朵缓慢飘动）

### 5.4 书签组件

```css
.bookmark-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px 16px;
  transition: all 0.2s ease;
}

.bookmark-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
```

---

## 6. 编辑模式改造

### 6.1 浮动控制面板（替代 Header）

```
┌─────────────────────────────┐
│                             │
│        组件内容区域          │
│                             │
│  ┌───┐                      │
│  │ ✦ │ ← 小圆点（左下角）    │
│  └───┘                      │
│  ┌──────────────┐           │
│  │ 编辑  退出登录│ ← hover 展开│
│  └──────────────┘           │
└─────────────────────────────┘
```

- 小圆点使用 accent 色，带脉冲动画
- Hover 展开为操作面板，带 glass 效果
- 手机端：长按或点击展开

### 6.2 组件库面板

```css
.widget-library {
  position: fixed;
  left: 24px;
  bottom: 80px;
  width: 280px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4);
  transform: translateY(20px);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.widget-library.visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: all;
}

/* 拖拽时自动隐藏 */
.widget-library.hidden-during-drag {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  pointer-events: none;
}
```

- 面板默认隐藏，点击浮动按钮展开
- 拖拽组件时自动隐藏（监听 dragstart/dragend）
- 手机端改为底部抽屉，圆角更大

### 6.3 编辑模式下的组件样式

```css
.widget-wrapper.editing {
  border: 1px solid rgba(96, 165, 250, 0.15);
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.05);
}

.widget-wrapper.editing:hover {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow:
    0 0 0 1px rgba(96, 165, 250, 0.1),
    0 0 30px rgba(96, 165, 250, 0.05);
}
```

- 编辑模式下组件有微弱蓝色辉光边框
- 悬浮时辉光增强
- 删除按钮改为半透明圆形，悬浮时显现

---

## 7. 动效设计

### 7.1 页面加载

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.widget-wrapper {
  animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
}

/* 交错延迟 */
.widget-wrapper:nth-child(1) { animation-delay: 0.05s; }
.widget-wrapper:nth-child(2) { animation-delay: 0.1s; }
.widget-wrapper:nth-child(3) { animation-delay: 0.15s; }
.widget-wrapper:nth-child(4) { animation-delay: 0.2s; }
```

### 7.2 组件悬浮

```css
.widget-wrapper {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.widget-wrapper:hover {
  transform: translateY(-2px);
}
```

### 7.3 搜索按钮

```css
.search-btn {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.search-btn:hover { transform: scale(1.03); }
.search-btn:active { transform: scale(0.97); }
```

---

## 8. 响应式适配

### 8.1 手机端（< 768px）

- 组件库面板改为底部抽屉（圆角 24px 24px 0 0）
- 浮动按钮移到右下角
- 时钟字号缩小：48px → 56px
- 搜索框改为全宽堆叠
- 组件间距缩小

### 8.2 平板端（768px - 1200px）

- 2 列布局为主
- 组件库面板固定在左侧

### 8.3 桌面端（> 1200px）

- 最多 3 列布局
- 组件库面板悬浮在左侧

---

## 9. 实施任务清单

| # | 任务 | 涉及文件 | 优先级 |
|---|------|---------|--------|
| 1 | 更新 CSS 变量和字体 | `main.css` | P0 |
| 2 | 重写背景样式 | `main.css` | P0 |
| 3 | 重构 TopBar → 浮动控制面板 | `TopBar.vue`, `App.vue` | P0 |
| 4 | WidgetWrapper 无边框 + glass 效果 | `WidgetWrapper.vue` | P0 |
| 5 | 搜索组件样式重写 | `SearchWidget.vue` | P1 |
| 6 | 时钟组件样式重写 | `ClockWidget.vue` | P1 |
| 7 | 天气组件样式重写 | `WeatherWidget.vue` | P1 |
| 8 | 书签组件样式重写 | `BookmarkWidget.vue` | P1 |
| 9 | 组件库面板 glass 效果 + 折叠 | `WidgetLibrary.vue` | P1 |
| 10 | 编辑模式辉光边框 | `WidgetWrapper.vue` | P1 |
| 11 | 页面加载动画 | `main.css`, 各组件 | P2 |
| 12 | 手机端适配 | 各组件 CSS | P2 |
| 13 | 拖拽时隐藏组件库 | `WidgetLibrary.vue`, `DashboardGrid.vue` | P1 |
| 14 | Dashboard 类型扩展（background + title） | `@nav/shared` 类型定义 | P0 |
| 15 | 自定义网页标题功能 | `App.vue`, `TopBar.vue` | P1 |
| 16 | 自定义背景 — 纯色模式 | `main.css`, `App.vue` | P1 |
| 17 | 自定义背景 — 图片上传 + URL | `TopBar.vue`, 后端 API | P1 |
| 18 | 自定义背景 — 多图轮播 | `App.vue` | P2 |
| 19 | 偏好设置面板 UI | `TopBar.vue` 或新组件 | P1 |
| 20 | 后端背景图片存储 API | `packages/server` | P1 |

---

## 10. 用户自定义功能

### 10.1 自定义背景

**功能描述：**
- 用户可上传本地图片作为页面背景
- 支持输入图片 URL 链接（网图）
- 支持配置多张背景图片，轮换展示（可设置间隔时间）
- 背景设置存储到 dashboard 配置中，跨设备同步

**数据结构：**
```typescript
// Dashboard 新增字段
interface Dashboard {
  // ...现有字段
  background: {
    mode: 'color' | 'image' | 'slideshow'  // 纯色 / 单图 / 轮播
    color: string                            // 纯色模式的背景色
    images: BackgroundImage[]                // 图片列表
    interval: number                         // 轮播间隔（秒），默认 30
    index: number                            // 当前显示的图片索引
  }
}

interface BackgroundImage {
  type: 'upload' | 'url'
  src: string       // 本地 blob URL 或远程 URL
  name?: string     // 文件名（上传时）
}
```

**UI 设计：**
```
背景设置面板（在浮动控制面板中）:
┌─────────────────────────┐
│ 背景设置                │
│                         │
│ ○ 纯色  ○ 图片  ○ 轮播  │
│                         │
│ [纯色模式]              │
│ 颜色选择器: #0c1021     │
│                         │
│ [图片/轮播模式]         │
│ + 上传图片              │
│ + 添加链接              │
│ ┌───┐ ┌───┐ ┌───┐     │
│ │ 1 │ │ 2 │ │ 3 │ ... │  ← 缩略图列表
│ └───┘ └───┘ └───┘     │
│                         │
│ 轮播间隔: [30] 秒       │
│                         │
│ [预览]  [保存]          │
└─────────────────────────┘
```

**技术实现：**
- 上传图片：使用 `<input type="file">` + FileReader 转为 blob URL，存储到 IndexedDB
- URL 链接：直接存储远程 URL，CSS `background-image` 加载
- 轮播：`setInterval` 定时切换 `background-image`，带淡入淡出过渡
- 背景 CSS：
```css
body.custom-bg {
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  transition: background-image 1s ease-in-out;
}
```

**后端存储：**
- 图片文件存储到后端 `uploads/backgrounds/` 目录
- 配置存储到 `dashboards` 表的 `background` 字段（JSON）
- API：`POST /api/dashboards/:id/background`（上传）、`PUT /api/dashboards/:id/background`（更新配置）

### 10.2 自定义网页标题

**功能描述：**
- 用户可自定义浏览器标签页显示的标题
- 默认值："Nav - 个人导航页"
- 存储到 dashboard 配置中

**数据结构：**
```typescript
interface Dashboard {
  // ...现有字段
  title: string  // 自定义标题，默认 "Nav - 个人导航页"
}
```

**技术实现：**
```typescript
// App.vue 中监听 title 变化
watch(() => dashboardStore.dashboard?.title, (newTitle) => {
  document.title = newTitle || 'Nav - 个人导航页'
}, { immediate: true })
```

**UI 设计：**
- 在浮动控制面板中添加"页面标题"输入框
- 实时预览：输入时同步更新 `document.title`
- 空值时回退到默认标题

### 10.3 个人偏好面板

将背景设置和标题设置整合到一个统一的「偏好设置」面板中：

```
浮动按钮 → 展开控制面板 → ⚙ 偏好设置
┌─────────────────────────┐
│ 偏好设置                │
│                         │
│ 📝 页面标题             │
│ [Nav - 个人导航页    ]  │
│                         │
│ 🖼️ 页面背景             │
│ ○ 纯色  ○ 图片  ○ 轮播  │
│ [背景配置区域]          │
│                         │
│ [保存]                  │
└─────────────────────────┘
```

---

## 11. 参考风格

- **Arc Browser** — 沉浸式、无边框、毛玻璃
- **Linear** — 极简、精致动效、深色主题
- **Raycast** — 搜索框设计、键盘交互感
- **Apple Weather** — 大数字排版、氛围背景
