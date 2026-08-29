import { ScrollText, UserRound, Users, BookOpen } from 'lucide-react-native'
import { useWindowDimensions, View, type ColorValue } from 'react-native'
import { Tabs } from 'expo-router'

import { appLayoutForWidth } from '@/lib/layout'
import { useThemeToken } from '@/lib/theme'

/**
 * 底栏图标：选中时加同色药丸底。
 * 仅靠 gold 与 mutedForeground 的颜色差区分选中态在浅色主题下对比不足，
 * 药丸底让「停在哪个 tab」一眼可辨（色值均取主题令牌，alpha 拼接仅支持 6 位 hex）。
 */
function TabBarIcon({
  icon: Icon,
  color,
  focused,
  pillColor,
}: {
  icon: typeof ScrollText
  color: ColorValue
  focused: boolean
  pillColor: string
}) {
  return (
    <View
      className="items-center justify-center rounded-full px-5 py-0.5"
      style={focused ? { backgroundColor: pillColor } : undefined}
    >
      <Icon size={20} color={color} />
    </View>
  )
}

/** 一级页面：对局列表 + 我的（选中态用 goldStrong 强化对比，与 Web 同一色族） */
export default function TabsLayout() {
  const { width } = useWindowDimensions()
  const { isTablet, navigationSidebarWidth } = appLayoutForWidth(width)
  const gold = useThemeToken('gold')
  const goldStrong = useThemeToken('goldStrong')
  const mutedForeground = useThemeToken('mutedForeground')
  const card = useThemeToken('card')
  const border = useThemeToken('border')
  const pillColor = `${gold}24`

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
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          title: '对局',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon icon={ScrollText} color={color} focused={focused} pillColor={pillColor} />
          ),
        }}
      />
      <Tabs.Screen
        name="characters"
        options={{
          title: '角色',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon icon={Users} color={color} focused={focused} pillColor={pillColor} />
          ),
        }}
      />
      <Tabs.Screen
        name="lorebook"
        options={{
          title: '设定',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon icon={BookOpen} color={color} focused={focused} pillColor={pillColor} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon icon={UserRound} color={color} focused={focused} pillColor={pillColor} />
          ),
        }}
      />
    </Tabs>
  )
}
