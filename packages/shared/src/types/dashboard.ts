export interface WidgetLayout {
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
}

export interface Dashboard {
  id: string
  name: string
  widgets: WidgetInstance[]
  columns: number
  rowHeight: number
}
