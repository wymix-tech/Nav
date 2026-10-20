export interface Point {
  x: number
  y: number
}
export interface Size {
  width: number
  height: number
}
export interface Rect extends Point {
  w: number
  h: number
}
export interface CanvasCamera {
  centerX: number
  centerY: number
  zoom: number
}
export interface CanvasSettings {
  version: 1
  defaultCamera: CanvasCamera
}
export interface CanvasViewPreference {
  key: string
  version: 1
  camera: CanvasCamera
  presentation: 'spatial' | 'list'
  updatedAt: string
}
