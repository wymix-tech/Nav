import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 屏幕方向检测 composable
 *
 * 使用 matchMedia('(orientation: portrait)') 基于设备物理方向判断，
 * 而非 window.innerWidth <= innerHeight（后者在桌面端窗口缩放时会误报）。
 *
 * @returns isPortrait - 设备处于竖屏方向
 * @returns isLandscape - 设备处于横屏方向
 */
export function useScreenOrientation() {
  const mql = window.matchMedia('(orientation: portrait)')
  const isPortrait = ref(mql.matches)
  const isLandscape = ref(!mql.matches)

  function onChange(e: MediaQueryListEvent) {
    isPortrait.value = e.matches
    isLandscape.value = !e.matches
  }

  onMounted(() => {
    mql.addEventListener('change', onChange)
  })

  onUnmounted(() => {
    mql.removeEventListener('change', onChange)
  })

  return { isPortrait, isLandscape }
}
