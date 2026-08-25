import { ScrollText, UserRound } from 'lucide-react-native'
import { useWindowDimensions } from 'react-native'
import { Tabs } from 'expo-router'

import { appLayoutForWidth } from '@/lib/layout'
import { useThemeToken } from '@/lib/theme'

/** 一级页面：对局列表 + 我的（鎏金选中态，色值与 Web 一致） */
export default function TabsLayout() {
  const { width } = useWindowDimensions()
  const { isTablet, navigationSidebarWidth } = appLayoutForWidth(width)
  const gold = useThemeToken('gold')
  const mutedForeground = useThemeToken('mutedForeground')
  const card = useThemeToken('card')
  const border = useThemeToken('border')

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: gold,
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
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          title: '对局',
          tabBarIcon: ({ color }) => <ScrollText size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color }) => <UserRound size={20} color={color} />,
        }}
      />
    </Tabs>
  )
}
