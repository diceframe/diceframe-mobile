import * as React from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { Dices, Eye, EyeOff, ScanLine } from 'lucide-react-native'
import * as Device from 'expo-device'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useT } from '@/i18n/t'
import { UserFacingError } from '@/lib/user-facing-error'

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
import { claimPairingCode } from '@/api/pairing'
import { QrScannerSheet } from '@/features/scan/QrScannerSheet'
import { parsePairLink } from '@/lib/pair-link'
import { activeIdentityOf, useSettingsStore } from '@/stores/settings'
import { ServerCompatBlocked, checkServerCompatibility, serverCompatErrorText } from '@/lib/server-compat'
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
  const [busy, setBusy] = React.useState<'login' | 'pair' | null>(null)
  const [scanning, setScanning] = React.useState(false)
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
      share: activeIdentityOf(settings),
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
      const config = await fetchAppConfig()
      // 双向版本兼容：App 过旧或服务器过旧都在门口拦下（拿不到版本号按服务器过旧处理）
      const compat = checkServerCompatibility(config)
      // 非 ok 一律拦下：判定结论以后再加一种也默认是阻断，不会悄悄放行
      if (compat !== 'ok') throw new ServerCompatBlocked(compat, config)
      const needsPassword = !!config.access_password?.configured
      if (needsPassword) {
        if (!password) throw new UserFacingError('dfLoginPasswordRequired')
        await validateAccessToken(password)
      }
      if (!mountedRef.current) return
      if (normalized !== settings.baseUrl) {
        // 新服务器：本机的 GM 密码与玩家身份一律作废
        settings.setToken(null)
        settings.clearShares()
      }
      settings.setBaseUrl(normalized)
      if (needsPassword) settings.setToken(password)
      // 密码本按台存访问密码；免密服务器清掉可能过期的旧记录
      settings.rememberServerPassword(normalized, needsPassword ? password : '')
      settings.clearShares()
      pendingClientRestoreRef.current = null
      router.replace('/overview')
    } catch (e) {
      // 候选服务器请求失败后恢复当前已连接实例，不能让 API 内存态停在坏地址上。
      restoreCurrentClient()
      if (mountedRef.current) {
        setError(e instanceof ServerCompatBlocked ? serverCompatErrorText(e.status, e.config) : errorMessage(e))
      }
    } finally {
      if (mountedRef.current) setBusy(null)
    }
  }

  /**
   * 扫码登录：把二维码里的一次性配对码兑换成本机的设备令牌。
   *
   * 走的是与 login() 同一套候选服务器探测——跨服务器请求绝不携带当前实例的
   * Owner token 或玩家身份，失败时把 API 内存态恢复回已连接的实例。
   */
  async function pair(payload: string) {
    setScanning(false)
    const parsed = parsePairLink(payload)
    if (!parsed) {
      setError(t('dfScanInvalidPairCode'))
      return
    }
    setBusy('pair')
    setError('')
    try {
      prepareCandidateClient()
      configureApiClient({
        baseUrl: parsed.baseUrl,
        token: null,
        share: null,
        sessionToken: generateSessionToken(),
      })
      // 双向版本兼容与手填登录同一道门槛：不兼容就别把凭据兑出来
      const config = await fetchAppConfig()
      const compat = checkServerCompatibility(config)
      // 非 ok 一律拦下：判定结论以后再加一种也默认是阻断，不会悄悄放行
      if (compat !== 'ok') throw new ServerCompatBlocked(compat, config)
      // 设备名只用于 Web 设置页的设备清单展示，方便 GM 认出该吊销哪一台
      const deviceToken = await claimPairingCode(
        parsed.code,
        Device.deviceName || Device.modelName || '',
      )
      if (!mountedRef.current) return
      if (parsed.baseUrl !== settings.baseUrl) {
        settings.setToken(null)
        settings.clearShares()
      }
      settings.setBaseUrl(parsed.baseUrl)
      settings.setToken(deviceToken)
      // 设备令牌与访问密码在客户端同属 Bearer 凭据，密码本按台存同一份
      settings.rememberServerPassword(parsed.baseUrl, deviceToken)
      settings.clearShares()
      pendingClientRestoreRef.current = null
      router.replace('/overview')
    } catch (e) {
      restoreCurrentClient()
      if (mountedRef.current) {
        setError(e instanceof ServerCompatBlocked ? serverCompatErrorText(e.status, e.config) : errorMessage(e))
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
          {/* 扫码入口：地址与凭据都由二维码带来，省掉手输 IP 与密码 */}
          <Button variant="outline" onPress={() => setScanning(true)} disabled={busy !== null}>
            {busy === 'pair' ? (
              <ActivityIndicator />
            ) : (
              <>
                <ScanLine size={18} color={mutedForeground} />
                <Text>{t('dfScanLoginAction')}</Text>
              </>
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

      <QrScannerSheet
        visible={scanning}
        title={t('dfScanLoginTitle')}
        hint={t('dfScanLoginHint')}
        onScanned={(value) => void pair(value)}
        onClose={() => setScanning(false)}
      />
    </Screen>
  )
}
