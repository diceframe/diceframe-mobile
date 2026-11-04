import { TabIcons, useTabBarInset, type TabIcon } from 'react-native-liquid-tabs'
import { LiquidTabs } from 'react-native-liquid-tabs/expo-router'

import { playGameHaptic } from '@/features/play/useHaptics'
import { useT } from '@/i18n/t'
import { TabBarOverlapContext } from '@/lib/tab-bar-overlap'
import { useThemeToken } from '@/lib/theme'
import type { ResolvedTheme } from '@/stores/settings'

/** Android 用 react-native-liquid-tabs：Skia 着色器的水滴透镜 + Android 12+ 真模糊（更老的系统是染色玻璃） */
export const LIQUID_TABS_AVAILABLE = true

// 与经典标签栏同一套 Lucide 图标（24 网格的 path，Skia 才能画和折射）
const SCROLL_TEXT: TabIcon = {
  stroke: 'M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3',
}
const BOOK_OPEN: TabIcon = {
  stroke: 'M12 5v16M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
  solid: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
  cutout: 'M12 5v16',
}

/** 标签选择刻度震动：受「触觉反馈」开关控制，与对局震动同一通道 */
function selectionTick() {
  void playGameHaptic('select')
}

/**
 * 液态玻璃 + 悬浮胶囊在 Android 手机上的标签布局。标签页仍是 (tabs) 下的四个路由文件；
 * 底部留白取库给的高度，经 TabBarOverlapContext 交给各列表（内容滑到胶囊下面）。
 */
export function LiquidTabsLayout({ theme }: { theme: ResolvedTheme }) {
  const t = useT()
  const inset = useTabBarInset()
  const goldStrong = useThemeToken('goldStrong')
  const mutedForeground = useThemeToken('mutedForeground')
  const background = useThemeToken('background')
  return (
    <TabBarOverlapContext.Provider value={inset}>
      <LiquidTabs
        dark={theme === 'dark'}
        activeColor={goldStrong}
        inactiveColor={mutedForeground}
        backgroundColor={background}
        // 拖过 / 点到另一个标签时轻震一下（补丁加的回调，见 patches/react-native-liquid-tabs+0.1.1.patch）
        onSelectionTick={selectionTick}
        tabs={[
          { name: 'overview', href: '/overview', title: t('dfTabGames'), icon: SCROLL_TEXT },
          { name: 'characters', href: '/characters', title: t('navCharacters'), icon: TabIcons.users },
          { name: 'lorebook', href: '/lorebook', title: t('dfTabLore'), icon: BOOK_OPEN },
          { name: 'profile', href: '/profile', title: t('dfTabProfile'), icon: TabIcons.person },
        ]}
      />
    </TabBarOverlapContext.Provider>
  )
}
