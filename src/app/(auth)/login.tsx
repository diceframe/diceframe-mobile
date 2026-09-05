import * as React from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { Dices, Eye, EyeOff } from 'lucide-react-native'
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
  currentSessionToken,
  errorMessage,
  fetchAppConfig,
  generateSessionToken,
  normalizeBaseUrl,
  validateAccessToken,
} from '@/api/client'
import { useSettingsStore } from '@/stores/settings'
import { useThemeToken } from '@/lib/theme'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'

/** 服务器连接 + Owner 登录；已连接时进入即“换服务器”流程 */
export default function LoginScreen() {
  const router = useRouter()
  // 服务器页一键切换遇「该服务器需要密码而密码本没有」时带地址跳转过来，预填表单
  const { address } = useLocalSearchParams<{ address?: string }>()
  const t = useT()
  const settings = useSettingsStore()

  const [serverUrl, setServerUrl] = React.useState(
    () => normalizeBaseUrl(typeof address === 'string' ? address : '') || settings.baseUrl
  )
  const keyboardHeight = useKeyboardHeight()
  const primary = useThemeToken('primary')
  const gold = useThemeToken('gold')
  const mutedForeground = useThemeToken('mutedForeground')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [busy, setBusy] = React.useState<'login' | null>(null)
  const [error, setError] = React.useState('')
  const mountedRef = React.useRef(true)
  const scrollRef = React.useRef<ScrollView>(null)
  const passwordInputRef = React.useRef<TextInput>(null)
  const pendingClientRestoreRef = React.useRef<Parameters<typeof configureApiClient>[0] | null>(null)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pendingClientRestoreRef.current) configureApiClient(pendingClientRestoreRef.current)
    }
  }, [])

  // Web 端服务器地址可留空 = 使用当前站点（同源相对路径，dev 下由 Metro
  // 的反向代理转发到后端）；原生端必须显式填写局域网地址。
  const isWeb = Platform.OS === 'web'
  // 进入页面时的模式快照：已有服务器 = “换服务器”流程。
  // 用快照而不是响应式读取，避免首次连接成功保存 baseUrl 后页面中途翻转。
  const [switching] = React.useState(() => settings.baseUrl !== '')

  // 表单在品牌区下方：键盘弹出后内容超出可视区，Android 不会自动把聚焦框
  // 滚入视口，聚焦任意输入框都滚到底部——表单区（地址/密码/登录）正好完整
  // 露出在键盘上方（等键盘动画结束再滚，300ms 覆盖两端时长）
  function scrollToForm() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)
  }

  function selectServerUrl(url: string) {
    setServerUrl(url)
    setError('')
  }

  function prepareCandidateClient() {
    pendingClientRestoreRef.current = {
      baseUrl: normalizeBaseUrl(settings.baseUrl),
      sessionToken: currentSessionToken(),
      token: settings.token,
      share: settings.share,
    }
  }

  function restoreCurrentClient() {
    if (pendingClientRestoreRef.current) configureApiClient(pendingClientRestoreRef.current)
    pendingClientRestoreRef.current = null
  }

  async function login() {
    // 输入框地址与内存态可能脱同步，validateAccessToken 读的是内存态，所以
    // 校验前先对齐；settings 只在校验通过后落盘，失败时不改动已保存的连接
    const normalized = normalizeBaseUrl(serverUrl)
    setServerUrl(normalized)
    if (!normalized && !isWeb) {
      setError(t('dfCommonNetworkError'))
      return
    }
    setBusy('login')
    setError('')
    try {
      // 跨服务器请求绝不能携带当前实例的 Owner token 或玩家分享身份；
      // 会话 token 同样换一次性新值（对齐 join 的候选探测）
      prepareCandidateClient()
      configureApiClient({ baseUrl: normalized, token: null, share: null, sessionToken: generateSessionToken() })
      // 一次提交完成“探测 + 校验”：先拿服务器配置判断是否设了访问密码，
      // 设了才校验密码；没设密码的服务器填不填都能直接进
      let config
      try {
        config = await fetchAppConfig()
      } catch (e) {
        // 探测失败按“连不上服务器”提示，不落入“密码不正确”的语义
        const detail = errorMessage(e)
        const target = normalized || t('dfLoginCurrentAddress')
        throw new Error(
          detail ? `${t('dfCommonNetworkError')}（${target}：${detail}）` : t('dfCommonNetworkError')
        )
      }
      const needsPassword = !!config.access_password?.configured
      if (needsPassword) {
        if (!password) throw new Error(t('dfLoginPasswordRequired'))
        await validateAccessToken(password)
      }
      if (!mountedRef.current) return
      if (normalized !== settings.baseUrl) {
        // 新服务器：本机的 GM 密码与玩家身份一律作废
        settings.setToken(null)
        settings.setShare(null)
      }
      settings.setBaseUrl(normalized)
      if (needsPassword) settings.setToken(password)
      // 密码本按台存访问密码；免密服务器清掉可能过期的旧记录
      settings.rememberServerPassword(normalized, needsPassword ? password : '')
      settings.setShare(null)
      pendingClientRestoreRef.current = null
      router.replace('/overview')
    } catch (e) {
      // 候选服务器请求失败后恢复当前已连接实例，不能让 API 内存态停在坏地址上。
      restoreCurrentClient()
      if (mountedRef.current) {
        setError(e instanceof Error && e.message ? e.message : t('dfLoginWrongPassword'))
      }
    } finally {
      if (mountedRef.current) setBusy(null)
    }
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
          ref={scrollRef}
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
            onChangeText={selectServerUrl}
            placeholder={isWeb ? t('dfLoginServerPlaceholderWeb') : t('dfLoginServerPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={busy === null}
            onFocus={scrollToForm}
          />
        </View>

        <View className="gap-3">
          <Text variant="small">{t('dfLoginPasswordLabel')}</Text>
          {/* 密码可见切换：眼睛绝对定位叠在输入框右缘（inline）。关键：
              Input 带 shadow-sm 会映射 Android elevation，导致后绘制的兄弟
              被盖在不透明输入框之下，必须给眼睛更高的 elevation 才可见 */}
          <View className="relative">
            <Input
              ref={passwordInputRef}
              value={password}
              onChangeText={setPassword}
              placeholder={t('dfLoginPasswordPlaceholder')}
              secureTextEntry={!showPassword}
              editable={busy === null}
              autoCapitalize="none"
              autoCorrect={false}
              className="pr-12"
              onFocus={scrollToForm}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              disabled={busy === 'login'}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('dfLoginHidePassword') : t('dfLoginShowPassword')}
              className="absolute right-1 top-1 h-8 w-10 items-center justify-center active:opacity-70"
              style={{ elevation: 3 }}
            >
              {showPassword ? (
                <EyeOff size={18} color={mutedForeground} />
              ) : (
                <Eye size={18} color={mutedForeground} />
              )}
            </Pressable>
          </View>
          <Button onPress={() => void login()} disabled={busy !== null}>
            {busy === 'login' ? (
              <ActivityIndicator className="text-primary-foreground" />
            ) : (
              <Text>{t('dfLoginSubmit')}</Text>
            )}
          </Button>
        </View>

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
