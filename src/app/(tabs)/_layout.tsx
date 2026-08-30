import { ScrollText, UserRound, Users, BookOpen } from 'lucide-react-native'
import { useWindowDimensions } from 'react-native'
import { Tabs } from 'expo-router'


import { useT } from '@/i18n/t'
import { appLayoutForWidth } from '@/lib/layout'
import { useThemeToken } from '@/lib/theme'

/**
 * 一级页面：对局列表 + 我的（选中态用 goldStrong 强化对比，与 Web 同一色族）。
 * 契约约束：tabBarIcon 必须保持裸 lucide 组件——它渲染在 react-navigation 内部
 * 31×28 的绝对定位图标容器里，包任何带 padding 的 View 都会布局失准
 * （实测整体左偏约 33dp），选中态不要用药丸底，靠色差表达。
 */
export default function TabsLayout() {
  const t = useT()
  const { width } = useWindowDimensions()
  const { isTablet, navigationSidebarWidth } = appLayoutForWidth(width)
  const goldStrong = useThemeToken('goldStrong')
  const mutedForeground = useThemeToken('mutedForeground')
  const card = useThemeToken('card')
  const border = useThemeToken('border')

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: goldStrong,
        tabBarInactiveTintColor: mutedForeground,
        tabBarPosition: isTablet ? 'left' : 'bottom',
        tabBarVariant: isTablet ? 'material' : 'uikit',
        tabBarLabelPosition: isTablet ? 'beside-icon' : 'below-icon',
        tabBarStyle: isTablet
          ? { width: navigationSidebarWidth, backgroundColor: card, borderRightColor: border }
          : { backgroundColor: card, borderTopColor: border },
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
  )
}
