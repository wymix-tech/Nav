export interface WidgetLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface CanvasLayout {
  x: number
  y: number
  w: number
  h: number
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
}
