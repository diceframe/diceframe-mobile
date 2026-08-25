import { ScrollText, UserRound } from 'lucide-react-native'
import { Tabs } from 'expo-router'

import { useThemeToken } from '@/lib/theme'

/** 一级页面：对局列表 + 我的（鎏金选中态，色值与 Web 一致） */
export default function TabsLayout() {
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
        tabBarStyle: { backgroundColor: card, borderTopColor: border },
        tabBarLabelStyle: { fontSize: 11 },
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
