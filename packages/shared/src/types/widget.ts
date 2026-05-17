export interface WidgetManifest {
  name: string
  displayName: string
  version: string
  description: string
  author: string
  icon: string
  repository: string
  entry: string
  schema: Record<string, any>
  size: { w: number; h: number }
  minSize: { w: number; h: number }
  responsive?: {
    behavior: 'adaptive' | 'collapse' | 'hide'
    breakpoints: Record<string, { minWidth: number; layout: string }>
  }
  permissions?: string[]
}

export interface InstalledWidget {
  widgetId: string
  manifest: WidgetManifest
  cdnUrl: string
  installedAt: string
}

export interface WidgetProps {
  config: Record<string, any>
  editing: boolean
  editable: boolean
}

export interface WidgetEmits {
  'update:config': [value: Record<string, any>]
  'resize': [size: { w: number; h: number }]
}
