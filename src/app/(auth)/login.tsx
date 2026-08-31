import * as React from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native'
import { Dices } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useT } from '@/i18n/t'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import {
  configureApiClient,
  errorMessage,
  fetchAppConfig,
  normalizeBaseUrl,
  validateAccessToken,
} from '@/api/client'
import { useSettingsStore } from '@/stores/settings'
import { useThemeToken } from '@/lib/theme'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'

/** 服务器连接 + Owner 登录；已连接时进入即“换服务器”流程 */
export default function LoginScreen() {
  const router = useRouter()
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const t = useT()
  const settings = useSettingsStore()

  const [serverUrl, setServerUrl] = React.useState(settings.baseUrl)
  const keyboardHeight = useKeyboardHeight()
  const primary = useThemeToken('primary')
  const gold = useThemeToken('gold')
  const [passwordNeeded, setPasswordNeeded] = React.useState<boolean | null>(null)
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState<'server' | 'login' | null>(null)
  const [error, setError] = React.useState('')

  // Web 端服务器地址可留空 = 使用当前站点（同源相对路径，dev 下由 Metro
  // 的反向代理转发到后端）；原生端必须显式填写局域网地址。
  const isWeb = Platform.OS === 'web'

  // 进入页面时的模式快照：已有服务器 = “换服务器”流程。
  // 用快照而不是响应式读取，避免首次连接成功保存 baseUrl 后页面中途翻转。
  const [switching] = React.useState(() => settings.baseUrl !== '')
  const switchingServer = mode === 'switch'

  // 已连接过服务器时进入本页自动探测：直接显示密码框（或开放服务器直入按钮），
  // 不需要用户先按一次“连接”。
  React.useEffect(() => {
    if ((!settings.baseUrl && !isWeb) || switchingServer) return
    let active = true
    async function probe() {
      setBusy('server')
      try {
        const config = await fetchAppConfig()
        if (active) setPasswordNeeded(!!config.access_password?.configured)
      } catch {
        // 探测失败（服务器离线等）：留在手动流程，由用户重按连接
      } finally {
        if (active) setBusy(null)
      }
    }
    probe()
    return () => {
      active = false
    }
  }, [settings.baseUrl, switchingServer, isWeb])

  async function connectServer() {
    const normalized = normalizeBaseUrl(serverUrl)
    if (!normalized && !isWeb) {
      setError(t('dfCommonNetworkError'))
      return
    }
    setBusy('server')
    setError('')
    try {
      configureApiClient({ baseUrl: normalized })
      const config = await fetchAppConfig()
      if (normalized !== settings.baseUrl) {
        // 新服务器：本机的 GM 密码与玩家身份一律作废
        settings.setToken(null)
        settings.setShare(null)
      }
      settings.setBaseUrl(normalized)
      setPasswordNeeded(!!config.access_password?.configured)
    } catch (e) {
      const detail = errorMessage(e)
      const target = normalized || t('dfLoginCurrentAddress')
      setError(detail ? `${t('dfCommonNetworkError')}（${target}：${detail}）` : t('dfCommonNetworkError'))
    } finally {
      setBusy(null)
    }
  }

  async function login() {
    // 输入框地址可能与 client 内存 baseUrl 脱同步（改了地址但没按“连接”就直接登录），
    // validateAccessToken 读的是内存态，所以校验前先对齐；settings 只在校验通过后落盘，
    // 失败时不改动已保存的服务器连接
    const normalized = normalizeBaseUrl(serverUrl)
    setBusy('login')
    setError('')
    try {
      configureApiClient({ baseUrl: normalized })
      await validateAccessToken(password)
      settings.setBaseUrl(normalized)
      settings.setToken(password)
      settings.setShare(null)
      router.replace('/overview')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('dfLoginWrongPassword'))
    } finally {
      setBusy(null)
    }
  }

  function enterOpen() {
    settings.setShare(null)
    router.replace('/overview')
  }

  return (
    <Screen style={{ width: '100%', maxWidth: 600, alignSelf: 'center' }}>
      {switching ? (
        <PageHeader title={t('dfServerSwitch')} onBack={() => router.back()} />
      ) : (
        <View className="h-3" />
      )}

      {/* 键盘避让：底部垫高键盘实际高度，表单区可滚动（见 use-keyboard-height 注释） */}
      <View className="flex-1" style={{ paddingBottom: keyboardHeight }}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center gap-6 px-6"
          keyboardShouldPersistTaps="handled"
        >
        {/* 品牌区：顶部主题色渐变 + 金色骰子徽标 + 衬线字标，给首启第一屏一点仪式感 */}
        <LinearGradient
          colors={[`${primary}26`, 'transparent']}
          style={{ position: 'absolute', top: -40, left: 0, right: 0, height: 300 }}
          pointerEvents="none"
        />
        <View className="items-center gap-3">
          <View
            className="h-20 w-20 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${primary}1A`, borderWidth: 1, borderColor: `${gold}66` }}
          >
            <Dices size={38} color={gold} />
          </View>
          <View className="items-center gap-1">
            <Text variant="h1" className="font-display">
              DiceFrame
            </Text>
            <Text variant="muted">{t('dfLoginTitle')}</Text>
          </View>
        </View>

        <View className="gap-3">
          <Text variant="small">{t('serverAddress')}</Text>
          <Input
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder={isWeb ? t('dfLoginServerPlaceholderWeb') : t('dfLoginServerPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={busy === null}
          />
          <Button onPress={connectServer} disabled={busy !== null}>
            {busy === 'server' ? (
              <ActivityIndicator className="text-primary-foreground" />
            ) : (
              <Text>{switching ? t('dfServerSwitch') : t('connectServer')}</Text>
            )}
          </Button>
        </View>

        {passwordNeeded !== null && (
          <View className="gap-3">
            {passwordNeeded ? (
              <>
                <Text variant="small">{t('dfLoginPasswordLabel')}</Text>
                <Input
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t('dfLoginPasswordPlaceholder')}
                  secureTextEntry
                  editable={busy === null}
                />
                <Button onPress={login} disabled={busy !== null || !password}>
                  {busy === 'login' ? (
                    <ActivityIndicator className="text-primary-foreground" />
                  ) : (
                    <Text>{t('dfLoginSubmit')}</Text>
                  )}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onPress={enterOpen} disabled={busy !== null}>
                <Text>{t('dfLoginEnterOpen')}</Text>
              </Button>
            )}
          </View>
        )}

        {error ? <Text className="text-destructive">{error}</Text> : null}

        <Pressable
          className="items-center py-2"
          onPress={() => router.push('/join')}
          accessibilityRole="link"
        >
          <Text className="text-primary">{t('dfLoginJoinInstead')}</Text>
        </Pressable>
        </ScrollView>
      </View>
    </Screen>
  )
}
