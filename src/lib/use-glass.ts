import * as React from 'react'
import { AccessibilityInfo, Platform } from 'react-native'

import { isGlassActive } from '@/lib/glass'
import { useResolvedTheme } from '@/lib/theme'
import type { ResolvedTheme } from '@/stores/settings'
import { useSettingsStore } from '@/stores/settings'

/**
 * 当前是否启用液态玻璃风格。iOS「降低透明度」打开时回到经典风格（Android 与 Web 没有这个信号；
 * 标签栏的原生玻璃另由库按 Android 高对比度文字设置处理）。
 */
export function useGlass(): { active: boolean; theme: ResolvedTheme } {
  const uiStyle = useSettingsStore((state) => state.uiStyle)
  const theme = useResolvedTheme()
  const [reduceTransparency, setReduceTransparency] = React.useState(false)

  React.useEffect(() => {
    // 只有 iOS 有「降低透明度」；react-native-web 根本没有这组 API，调用会直接抛错
    if (Platform.OS !== 'ios') return
    let cancelled = false
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => { if (!cancelled) setReduceTransparency(enabled) })
      .catch(() => {})
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency)
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [])

  return { active: isGlassActive(uiStyle, reduceTransparency), theme }
}
