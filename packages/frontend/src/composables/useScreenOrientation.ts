import { ref, onMounted, onUnmounted } from 'vue'
import { BREAKPOINTS } from '@nav/shared'

/**
 * 屏幕方向检测 composable
 *
 * 之前的实现仅用 matchMedia('(orientation: portrait)')，该 API 判断的是
 * 视口长宽比而非设备物理方向——桌面端把窗口拉窄（如分屏竖向）时也会被
 * 误判为竖屏，进而触发 DashboardGrid 的 stack 堆叠模式。
 *
 * 现在增加宽度兜底：只有当设备物理竖屏 **且** 窗口宽度小于 sm 断点
 * (768px) 时才认定为竖屏。这样桌面端窗口缩放不会误触发堆叠模式，
 * 而真正的移动端竖屏设备仍会进入堆叠模式。
 *
 * @returns isPortrait - 设备处于竖屏方向（且窗口足够窄）
 * @returns isLandscape - 设备处于横屏方向
 */
export function useScreenOrientation() {
  const mql = window.matchMedia('(orientation: portrait)')
  const isPortrait = ref(false)
  const isLandscape = ref(true)
  const windowWidth = ref(window.innerWidth)

  function recompute() {
    windowWidth.value = window.innerWidth
    // 设备物理竖屏 且 窗口宽度 < sm 断点，才认为是真正需要堆叠的竖屏场景
    const portrait = mql.matches && windowWidth.value < BREAKPOINTS.sm
    isPortrait.value = portrait
    isLandscape.value = !portrait
  }

  function onOrientationChange() {
    recompute()
  }

  function onResize() {
    recompute()
  }

  onMounted(() => {
    recompute()
    mql.addEventListener('change', onOrientationChange)
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    mql.removeEventListener('change', onOrientationChange)
    window.removeEventListener('resize', onResize)
  })

  return { isPortrait, isLandscape }
}
