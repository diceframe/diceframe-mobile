import { ScrollText, UserRound, Users, BookOpen } from 'lucide-react-native'
import { useWindowDimensions, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Tabs } from 'expo-router'

import { GlassBackdrop, GlassBarBackground, GlassCapsuleBackground } from '@/components/patterns/glass-backdrop'
import { LIQUID_TABS_AVAILABLE, LiquidTabsLayout } from '@/features/navigation/liquid-tabs'
import { useT } from '@/i18n/t'
import { capsuleShadow, FLOATING_SIDEBAR, floatingTabBarGeometry } from '@/lib/glass'
import { appLayoutForWidth } from '@/lib/layout'
import { TabBarOverlapContext } from '@/lib/tab-bar-overlap'
import { useThemeToken } from '@/lib/theme'
import { useGlass } from '@/lib/use-glass'
import { useSettingsStore } from '@/stores/settings'

/**
 * 一级页面：对局列表 + 我的（选中态用 goldStrong 强化对比，与 Web 同一色族）。
 * 契约约束：tabBarIcon 必须保持裸 lucide 组件——它渲染在 react-navigation 内部
 * 31×28 的绝对定位图标容器里，包任何带 padding 的 View 都会布局失准
 * （实测整体左偏约 33dp），选中态不要用药丸底，靠色差表达。
 *
 * 液态玻璃有两种标签栏布局（设置 → 外观）：
 * - 悬浮胶囊：手机上是浮在内容上方的药丸，标签页内容滑到它下面（底部留白经
 *   TabBarOverlapContext 告诉各列表）；平板上是四周留边距的圆角侧栏。
 * - 贴底：原来的位置，背景拼环境光画布 + 玻璃染色。
 * Android 手机上的悬浮胶囊换成 react-native-liquid-tabs（Skia 水滴透镜 + Android 12+ 真模糊，
 * 见 features/navigation/liquid-tabs）；平板侧栏、Web 仍用这里的实现。
 */
export default function TabsLayout() {
  const t = useT()
  const { width } = useWindowDimensions()
  const { isTablet, navigationSidebarWidth } = appLayoutForWidth(width)
  const insets = useSafeAreaInsets()
  const goldStrong = useThemeToken('goldStrong')
  const mutedForeground = useThemeToken('mutedForeground')
  const card = useThemeToken('card')
  const border = useThemeToken('border')
  const glass = useGlass()
  const glassTabBar = useSettingsStore((state) => state.glassTabBar)
  const floating = glass.active && glassTabBar === 'floating'
  const capsule = floatingTabBarGeometry(insets.bottom)
  // 液态玻璃贴底：栏本身透明，背景交给玻璃染色 + 环境光画布（平板侧栏贴上沿，手机底栏贴下沿）
  const barColor = glass.active ? 'transparent' : card
  // 悬浮时不要导航库默认的 elevation：透明背景画不出 Android 阴影，改用 boxShadow
  const floatingBase: ViewStyle = { backgroundColor: 'transparent', elevation: 0, boxShadow: capsuleShadow(glass.theme) }

  let tabBarStyle: ViewStyle
  if (isTablet) {
    tabBarStyle = floating
      ? { ...floatingBase, width: navigationSidebarWidth, margin: FLOATING_SIDEBAR.margin, borderRadius: FLOATING_SIDEBAR.radius, borderRightWidth: 0 }
      : { width: navigationSidebarWidth, backgroundColor: barColor, borderRightColor: border, ...(glass.active ? { borderRightWidth: 0 } : null) }
  } else {
    tabBarStyle = floating
      ? {
          ...floatingBase,
          position: 'absolute',
          // 导航库基础样式用的是 start / end（逻辑方向），在 Android 上压过 left / right，
          // 只设 left / right 胶囊会左右顶边（SHV41 实测）
          start: capsule.side,
          end: capsule.side,
          bottom: capsule.bottom,
          height: capsule.height,
          // 覆盖导航库按安全区算的内边距：底部安全区已经算进 bottom 边距里了
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: 8,
          borderRadius: capsule.radius,
          borderTopWidth: 0,
        }
      : { backgroundColor: barColor, borderTopColor: border, ...(glass.active ? { borderTopWidth: 0 } : null) }
  }

  let tabBarBackground: (() => React.ReactNode) | undefined
  if (floating) {
    const radius = isTablet ? FLOATING_SIDEBAR.radius : capsule.radius
    // 平板侧栏不叠在内容上，背后只有环境光画布，用淡染色就好
    tabBarBackground = () => <GlassCapsuleBackground theme={glass.theme} radius={radius} overContent={!isTablet} />
  } else if (glass.active) {
    tabBarBackground = () => <GlassBarBackground theme={glass.theme} anchor={isTablet ? 'top' : 'bottom'} />
  }

  if (LIQUID_TABS_AVAILABLE && floating && !isTablet) return <LiquidTabsLayout theme={glass.theme} />

  return (
    <TabBarOverlapContext.Provider value={floating && !isTablet ? capsule.overlap : 0}>
      <View style={{ flex: 1 }}>
        {/* 悬浮侧栏四周的边距里露出的是导航容器本身，同样铺上环境光画布，与页面接成一张 */}
        {floating && isTablet ? <GlassBackdrop theme={glass.theme} /> : null}
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: goldStrong,
            tabBarInactiveTintColor: mutedForeground,
            tabBarPosition: isTablet ? 'left' : 'bottom',
            tabBarVariant: isTablet ? 'material' : 'uikit',
            tabBarLabelPosition: isTablet ? 'beside-icon' : 'below-icon',
            tabBarStyle,
            tabBarBackground,
            tabBarItemStyle: isTablet ? { minHeight: 52 } : undefined,
            tabBarLabelStyle: { fontSize: isTablet ? 14 : 11 },
            sceneStyle: { backgroundColor: card },
            // 契约约束：不要自定义 tabBarButton。自定义按钮会丢掉导航库默认
            // PlatformPressable 的内部居中样式，图标整体左偏（5fe6872 引入过，实测左偏 33dp）；
            // 按压反馈交给默认按钮自带的 android_ripple，不要再包一层。
          }}
        >
          <Tabs.Screen
            name="overview"
            options={{
              title: t('dfTabGames'),
              tabBarIcon: ({ color }) => <ScrollText size={20} color={color} />,
            }}
          />
          <Tabs.Screen
            name="characters"
            options={{
              title: t('navCharacters'),
              tabBarIcon: ({ color }) => <Users size={20} color={color} />,
            }}
          />
          <Tabs.Screen
            name="lorebook"
            options={{
              title: t('dfTabLore'),
              tabBarIcon: ({ color }) => <BookOpen size={20} color={color} />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: t('dfTabProfile'),
              tabBarIcon: ({ color }) => <UserRound size={20} color={color} />,
            }}
          />
        </Tabs>
      </View>
    </TabBarOverlapContext.Provider>
  )
}
