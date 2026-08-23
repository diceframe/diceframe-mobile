import '@/global.css'

import * as React from 'react'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'react-native'

import { configureApiClient } from '@/api/client'
import { bootstrapSession } from '@/stores/settings'

export default function RootLayout() {
  const colorScheme = useColorScheme()

  // Owner 模式下任何 API 401 都回到登录页（对齐 Web client.ts 的跳转行为）；
  // 同时恢复自管理会话 token（身份稳定是 claim-gm 的前提）
  React.useEffect(() => {
    void bootstrapSession()
    configureApiClient({
      onUnauthorized: () => router.replace('/login'),
    })
  }, [])

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </ThemeProvider>
  )
}
