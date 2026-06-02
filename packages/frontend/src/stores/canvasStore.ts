import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3

export const useCanvasStore = defineStore('canvas', () => {
  const panX = ref(0)
  const panY = ref(0)
  const zoom = ref(1)
  const homeX = ref(0)
  const homeY = ref(0)

  const canvasEl = ref<HTMLElement | null>(null)

  const clampedZoom = computed(() => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value)))

  function screenToCanvas(sx: number, sy: number) {
    return {
      x: (sx - panX.value) / clampedZoom.value,
      y: (sy - panY.value) / clampedZoom.value,
    }
  }

  function canvasToScreen(cx: number, cy: number) {
    return {
      x: cx * clampedZoom.value + panX.value,
      y: cy * clampedZoom.value + panY.value,
    }
  }

  function pan(dx: number, dy: number) {
    panX.value += dx
    panY.value += dy
  }

  function zoomAt(cx: number, cy: number, delta: number) {
    const oldZoom = clampedZoom.value
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + delta))
    panX.value = cx - (cx - panX.value) * (newZoom / oldZoom)
    panY.value = cy - (cy - panY.value) * (newZoom / oldZoom)
    zoom.value = newZoom
  }

  function zoomCenter(delta: number) {
    if (!canvasEl.value) return
    const rect = canvasEl.value.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, delta)
  }

  function resetView() {
    panX.value = homeX.value
    panY.value = homeY.value
    zoom.value = 1
  }

  function setHomeAsCurrent() {
    homeX.value = panX.value
    homeY.value = panY.value
  }

  function fitAll(widgets: { x: number; y: number; w: number; h: number }[]) {
    if (!canvasEl.value || widgets.length === 0) return
    const rect = canvasEl.value.getBoundingClientRect()
    const padding = 80

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const w of widgets) {
      minX = Math.min(minX, w.x)
      minY = Math.min(minY, w.y)
      maxX = Math.max(maxX, w.x + w.w)
      maxY = Math.max(maxY, w.y + w.h)
    }

    const contentW = maxX - minX
    const contentH = maxY - minY
    const availW = rect.width - padding * 2
    const availH = rect.height - padding * 2

    const newZoom = Math.min(1, Math.min(availW / contentW, availH / contentH))
    zoom.value = Math.max(MIN_ZOOM, newZoom)

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    panX.value = rect.width / 2 - centerX * zoom.value
    panY.value = rect.height / 2 - centerY * zoom.value
  }

  function restoreFromViewport(vp: { panX: number; panY: number; zoom: number; homeX: number; homeY: number }) {
    panX.value = vp.panX
    panY.value = vp.panY
    zoom.value = vp.zoom
    homeX.value = vp.homeX
    homeY.value = vp.homeY
  }

  function getViewport() {
    return {
      panX: panX.value,
      panY: panY.value,
      zoom: clampedZoom.value,
      homeX: homeX.value,
      homeY: homeY.value,
    }
  }

  return {
    panX, panY, zoom, homeX, homeY,
    clampedZoom, canvasEl,
    screenToCanvas, canvasToScreen,
    pan, zoomAt, zoomCenter,
    resetView, setHomeAsCurrent, fitAll,
    restoreFromViewport, getViewport,
  }
})
