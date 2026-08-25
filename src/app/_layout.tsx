import '@/global.css'

import * as React from 'react'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { cssInterop, useColorScheme as useNativeWindColorScheme } from 'nativewind'
import { PortalHost } from '@rn-primitives/portal'

import { ErrorBoundary } from '@/components/error-boundary'
import { configureApiClient } from '@/api/client'
import { useResolvedTheme, useThemeToken } from '@/lib/theme'
import { bootstrapSession, useSettingsStore } from '@/stores/settings'

// NativeWind 只对 RN 核心组件自动生效；不注册的话 expo-image 的 className
// 不映射到 style，RemoteAvatar 会渲染成无尺寸的隐形图
cssInterop(Image, { className: 'style' })
cssInterop(LinearGradient, { className: 'style' })

export default function RootLayout() {
  const hydrated = useSettingsStore((state) => state.hydrated)
  const themeMode = useSettingsStore((state) => state.themeMode)
  const setSystemTheme = useSettingsStore((state) => state.setSystemTheme)
  const systemColorScheme = useColorScheme()
  const theme = useResolvedTheme()
  const background = useThemeToken('background')
  const { setColorScheme } = useNativeWindColorScheme()

  React.useEffect(() => {
    setSystemTheme(systemColorScheme === 'light' ? 'light' : 'dark')
  }, [setSystemTheme, systemColorScheme])

  React.useEffect(() => {
    // system 必须原样传给 NativeWind；传解析后的 dark/light 会通过
    // Appearance.setColorScheme 反向固定应用主题，导致后续系统切换不再传播。
    if (hydrated) setColorScheme(themeMode)
  }, [hydrated, setColorScheme, themeMode])

  // Owner 模式下任何 API 401 都回到登录页（对齐 Web client.ts 的跳转行为）；
  // 同时恢复自管理会话 token（身份稳定是 claim-gm 的前提）
  React.useEffect(() => {
    void bootstrapSession()
    configureApiClient({
      onUnauthorized: () => router.replace('/login'),
    })
  }, [])

  if (!hydrated) return null

  return (
    <ErrorBoundary>
      <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: background },
          }}
        />
        <PortalHost />
      </ThemeProvider>
    </ErrorBoundary>
  )
}
