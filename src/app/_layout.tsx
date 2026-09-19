import '@/global.css'

import * as React from 'react'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useColorScheme } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { cssInterop, useColorScheme as useNativeWindColorScheme } from 'nativewind'
import { PortalHost } from '@rn-primitives/portal'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { ErrorBoundary } from '@/components/error-boundary'
import { toastNotice } from '@/components/patterns/toast'
import { configureApiClient } from '@/api/client'
import { getT } from '@/i18n/t'
import { Toaster } from 'sonner-native'
import { useLocaleSync } from '@/hooks/useLocaleSync'
import { useServerCompatCheck } from '@/hooks/useServerCompatCheck'
import { useResolvedTheme, useThemeToken } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'

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

  // 语言偏好 → i18n 单例；切换语言时全树经 useTranslation 重渲染
  useLocaleSync()
  // 已连接服务器升级后与 App 版本脱钩时，进前台前弹一次兼容提醒
  useServerCompatCheck()

  React.useEffect(() => {
    setSystemTheme(systemColorScheme === 'light' ? 'light' : 'dark')
  }, [setSystemTheme, systemColorScheme])

  React.useEffect(() => {
    // system 必须原样传给 NativeWind；传解析后的 dark/light 会通过
    // Appearance.setColorScheme 反向固定应用主题，导致后续系统切换不再传播。
    if (hydrated) setColorScheme(themeMode)
  }, [hydrated, setColorScheme, themeMode])

  // Owner 模式下任何 API 401 都回到登录页（对齐 Web client.ts 的跳转行为）。
  // 每台服务器的原生会话由 settings rehydrate 时同步到 API client。
  React.useEffect(() => {
    configureApiClient({
      onUnauthorized: () => {
        // 服务端第一次设置访问密码会吊销免密期签发的设备令牌，扫码登录过的设备
        // 会突然 401。静默跳登录页看起来像 App 自己退出了，给一句解释。
        toastNotice(getT()('dfAuthSessionExpired'))
        router.replace('/login')
      },
    })
  }, [])

  if (!hydrated) return null

  return (
    <ErrorBoundary>
      {/* RNGH 手势（地图拖拽/捏合）必须挂在 RootView 内才能命中 */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: background },
            }}
          />
          <PortalHost />
          {/* 应用内 toast：错误与操作提示不再占输入区排版，顶部居中不挡底部输入。 */}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}
