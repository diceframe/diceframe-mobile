export const TABLET_BREAKPOINT = 768
export const WIDE_TABLET_BREAKPOINT = 1024
export const LARGE_TABLET_BREAKPOINT = 1280

export type AppLayout = {
  isTablet: boolean
  isWideTablet: boolean
  isLargeTablet: boolean
  navigationSidebarWidth: number
  gameSidebarWidth: number
  gameListColumns: 1 | 2 | 3
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

/**
 * 只根据可用窗口宽度决定布局，因而能正确响应 iPad、Android Pad 的分屏和设备旋转。
 * 不使用平台或设备型号：平板窄分屏应退回手机布局，大屏手机横屏则可利用额外空间。
 * 侧栏按比例平滑增长，但保留上下限，避免小平板挤压正文或大屏上无限变宽。
 */
export function appLayoutForWidth(width: number): AppLayout {
  const isTablet = width >= TABLET_BREAKPOINT
  const isWideTablet = width >= WIDE_TABLET_BREAKPOINT
  const isLargeTablet = width >= LARGE_TABLET_BREAKPOINT

  return {
    isTablet,
    isWideTablet,
    isLargeTablet,
    navigationSidebarWidth: isTablet ? clamp(Math.round(width * 0.2), 176, 240) : 0,
    gameSidebarWidth: isWideTablet ? clamp(Math.round(width * 0.3), 320, 440) : 0,
    gameListColumns: isLargeTablet ? 3 : isTablet ? 2 : 1,
  }
}
