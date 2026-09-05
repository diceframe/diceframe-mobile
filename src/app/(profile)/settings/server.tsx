import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { KeyRound, Server, X } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { SettingsSectionScreen } from '@/features/settings/section-screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import {
  configureApiClient,
  currentSessionToken,
  errorMessage,
  fetchAppConfig,
  generateSessionToken,
  validateAccessToken,
} from '@/api/client'
import { useT } from '@/i18n/t'
import { activeIdentityOf, useSettingsStore } from '@/stores/settings'

export default function ServerSettingsScreen() {
  const router = useRouter()
  const t = useT()
  const settings = useSettingsStore()

  // ===== 密码本一键切换 =====
  // 正在切换的服务器地址（null = 空闲）；switchError 展示在本卡内
  const [switchingUrl, setSwitchingUrl] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState('')
  const switchMountedRef = useRef(true)
  const switchClientRestoreRef = useRef<Parameters<typeof configureApiClient>[0] | null>(null)

  useEffect(() => {
    // 卸载时若还停在候选服务器上下文，必须恢复，避免内存态 API client 指向坏地址
    return () => {
      switchMountedRef.current = false
      if (switchClientRestoreRef.current) configureApiClient(switchClientRestoreRef.current)
    }
  }, [])

  /** 密码本一键切换：访问密码已存本机的服务器直接探测+校验，成功即回大厅 */
  async function quickSwitch(url: string) {
    const snapshot = useSettingsStore.getState()
    setSwitchingUrl(url)
    setSwitchError('')
    try {
      // 候选服务器使用一次性会话探测，绝不携带当前实例的 Owner token 或玩家身份
      switchClientRestoreRef.current = {
        baseUrl: snapshot.baseUrl,
        token: snapshot.token,
        share: activeIdentityOf(snapshot),
        sessionToken: currentSessionToken(),
      }
      configureApiClient({ baseUrl: url, token: null, share: null, sessionToken: generateSessionToken() })
      const config = await fetchAppConfig()
      const needsPassword = !!config.access_password?.configured
      const saved = snapshot.serverPasswords[url] ?? ''
      if (needsPassword && !saved) {
        // 密码本里没有这台的密码（服务器后来设了密码）：带地址回落登录页手动输入
        if (switchClientRestoreRef.current) configureApiClient(switchClientRestoreRef.current)
        switchClientRestoreRef.current = null
        if (switchMountedRef.current) router.push({ pathname: '/login', params: { address: url } })
        return
      }
      if (needsPassword) await validateAccessToken(saved)
      if (!switchMountedRef.current) return
      if (url !== snapshot.baseUrl) {
        // 换服务器：旧实例的 GM 登录态与玩家身份一律作废；GM 密码由密码本按台恢复
        settings.setToken(null)
        settings.clearShares()
      }
      settings.setBaseUrl(url)
      settings.setToken(needsPassword ? saved : null)
      // 服务器改为免密时清掉过期密码，保持密码本真实
      settings.rememberServerPassword(url, needsPassword ? saved : '')
      switchClientRestoreRef.current = null
      router.replace('/overview')
    } catch (e) {
      if (switchClientRestoreRef.current) configureApiClient(switchClientRestoreRef.current)
      switchClientRestoreRef.current = null
      if (switchMountedRef.current) {
        setSwitchError(errorMessage(e))
      }
    } finally {
      if (switchMountedRef.current) setSwitchingUrl(null)
    }
  }

  return (
    <SettingsSectionScreen section="server">
      <Card className="gap-3">
        <CardHeader><CardTitle>{t('dfSettingsCurrentServer')}</CardTitle></CardHeader>
        <CardContent className="gap-3">
          <View className="flex-row items-center gap-3 rounded-xl border border-border bg-muted/50 p-4">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15"><Icon as={Server} size={18} /></View>
            <View className="min-w-0 flex-1"><Text className="font-semibold">{settings.baseUrl ? t('dfSettingsConfigured') : t('dfSettingsNotConnected')}</Text><Text variant="small" numberOfLines={2}>{settings.baseUrl || t('dfSettingsBaseUrlEmptyHint')}</Text></View>
          </View>
          <Text variant="small">{t('dfSettingsSwitchServerWarning')}</Text>
          {/* 密码本不单独开区：其余已存服务器平铺在本卡内，点一下即切换 */}
          {settings.recentBaseUrls.filter((url) => url !== settings.baseUrl).map((url) => {
            const switching = switchingUrl === url
            return (
              <View
                key={url}
                className="flex-row items-center overflow-hidden rounded-xl border border-border bg-muted/50"
              >
                <Pressable
                  onPress={() => {
                    if (switchingUrl === null) void quickSwitch(url)
                  }}
                  disabled={switchingUrl !== null}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: switchingUrl !== null }}
                  className="min-w-0 flex-1 flex-row items-center gap-2 p-3 active:opacity-70"
                >
                  <Icon as={Server} size={16} />
                  <Text variant="small" numberOfLines={1} className="min-w-0 flex-1">
                    {url.replace(/^https?:\/\//, '')}
                  </Text>
                  {settings.serverPasswords[url] ? (
                    <Icon as={KeyRound} size={14} className="text-muted-foreground" />
                  ) : null}
                  {switching ? <ActivityIndicator size="small" className="text-primary" /> : null}
                </Pressable>
                <Pressable
                  onPress={() => settings.removeRecentServer(url)}
                  disabled={switchingUrl !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t('dfLoginForgetServer', { address: url })}
                  className="h-11 w-11 items-center justify-center border-l border-border active:bg-muted"
                >
                  <Icon as={X} size={14} />
                </Pressable>
              </View>
            )
          })}
          <Button onPress={() => router.push('/login')}><Text>{settings.baseUrl ? t('dfSettingsConnectNewServer') : t('connectServer')}</Text></Button>
          {switchError ? <Text className="text-destructive">{switchError}</Text> : null}
        </CardContent>
      </Card>
    </SettingsSectionScreen>
  )
}
