import type { CanvasScene } from '../canvas/scene.js'
import type { CanvasSettings } from '../canvas/types.js'
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
  originalW?: number
  originalH?: number
}
export type LayoutMode = 'grid' | 'canvas'
export interface DashboardViewport {
  panX: number
  panY: number
  zoom: number
  homeX: number
  homeY: number
}

export interface WidgetInstance {
  id: string
  widgetId: string
  source: 'builtin' | 'installed'
  config: Record<string, any>
  canvas?: CanvasLayout
  layouts: {
    lg: WidgetLayout
    md: WidgetLayout
    sm: WidgetLayout
    xs: WidgetLayout
  }
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
  documentVersion?: 2 | 3
  canvasScene?: CanvasScene
  canvasSettings?: CanvasSettings
  id: string
  name: string
  title: string
  widgets: WidgetInstance[]
  columns: number
  rowHeight: number
  background: DashboardBackground
  layoutMode?: LayoutMode
  viewport?: DashboardViewport
  viewportWidth?: number
  viewportHeight?: number
  baseColumns?: number
  instanceId?: string
  revision?: number
  layoutVersion?: 2
  layoutSettings?: LayoutSettings
  layoutProfiles?: Record<string, Record<string, WidgetLayout>>
}

export interface LayoutSettings {
  columnMode: 'auto' | 'custom'
  contentWidthMode: 'centered' | 'fluid'
  maxContentWidth: number
}
