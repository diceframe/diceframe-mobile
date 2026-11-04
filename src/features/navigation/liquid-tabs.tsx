import type { ResolvedTheme } from '@/stores/settings'

/**
 * react-native-liquid-tabs 只接在 Android（liquid-tabs.android.tsx）：库不支持 Web，
 * iOS 目前不出包。其他平台走 (tabs)/_layout 自己的悬浮胶囊，这里不引入 Skia。
 */
export const LIQUID_TABS_AVAILABLE = false

export function LiquidTabsLayout(_props: { theme: ResolvedTheme }): null {
  return null
}
