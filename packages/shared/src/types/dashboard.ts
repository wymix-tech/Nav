export interface WidgetLayout {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 统一断点阈值（min-width，单位 px）。
 * 所有响应式逻辑（列数自适应、竖屏检测、CSS 媒体查询）都应引用此处常量，
 * 避免多处硬编码阈值不一致。
 */
export const BREAKPOINTS = {
  lg: 1200,
  md: 992,
  sm: 768,
  xs: 480,
} as const

export type BreakpointKey = 'lg' | 'md' | 'sm' | 'xs'

/** 根据窗口宽度返回当前断点 key */
export function getBreakpoint(width: number): BreakpointKey {
  if (width >= BREAKPOINTS.lg) return 'lg'
  if (width >= BREAKPOINTS.md) return 'md'
  if (width >= BREAKPOINTS.sm) return 'sm'
  return 'xs'
}

/** 各断点对应的默认网格列数 */
export function getDefaultCols(breakpoint: BreakpointKey): number {
  switch (breakpoint) {
    case 'lg':
      return 12
    case 'md':
      return 10
    case 'sm':
      return 8
    case 'xs':
      return 6
  }
}

/** 根据窗口宽度返回自动适配的列数 */
export function getAutoColumns(width: number): number {
  return getDefaultCols(getBreakpoint(width))
}

export interface CanvasLayout {
  x: number
  y: number
  w: number
  h: number
  /** 原始尺寸（首次创建时记录），用于内部内容自适应缩放 */
  originalW?: number
  originalH?: number
}

export interface WidgetInstance {
  id: string
  widgetId: string
  source: 'builtin' | 'installed'
  config: Record<string, any>
  layouts: {
    lg: WidgetLayout
    md: WidgetLayout
    sm: WidgetLayout
    xs: WidgetLayout
  }
  canvas?: CanvasLayout
}

export type LayoutMode = 'grid' | 'canvas'

export interface DashboardViewport {
  panX: number
  panY: number
  zoom: number
  homeX: number
  homeY: number
}

export interface BackgroundImage {
  type: 'upload' | 'url'
  src: string
  name?: string
}

export interface DashboardBackground {
  mode: 'color' | 'image' | 'slideshow'
  color: string
  images: BackgroundImage[]
  interval: number
  index: number
}

export interface Dashboard {
  id: string
  name: string
  title: string
  widgets: WidgetInstance[]
  columns: number
  rowHeight: number
  background: DashboardBackground
  layoutMode: LayoutMode
  viewport: DashboardViewport
  viewportWidth: number
  viewportHeight: number
}
