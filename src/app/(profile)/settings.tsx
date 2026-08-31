import { useEffect } from 'react'
import { ActivityIndicator, Linking, ScrollView, View } from 'react-native'
import Slider from '@react-native-community/slider'
import {
  CircleCheck,
  CircleX,
  Coins,
  Dices,
  Download,
  HeartCrack,
  LogIn,
  Monitor,
  Moon,
  RefreshCw,
  Server,
  Skull,
  Sparkles,
  Sun,
  Swords,
} from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useT, type T } from '@/i18n/t'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import { playGameHaptic } from '@/features/play/useHaptics'
import { useAppUpdates } from '@/hooks/useAppUpdates'
import { useThemeToken } from '@/lib/theme'
import type { LocalePreference } from '@/lib/locale'
import { useSettingsStore } from '@/stores/settings'

const SECTIONS = ['server', 'identity', 'appearance', 'language', 'speech', 'haptics', 'updates'] as const

/** 「我的」页菜单等处复用此类型，避免手写联合类型与 SECTIONS 漂移 */
export type SettingsSection = (typeof SECTIONS)[number]

function sectionMeta(section: SettingsSection, t: T): { title: string; subtitle: string } {
  switch (section) {
    case 'server':
      return { title: t('dfSettingsServer'), subtitle: t('dfSettingsServerHint') }
    case 'identity':
      return { title: t('dfSettingsIdentity'), subtitle: t('dfSettingsIdentityHint') }
    case 'appearance':
      return { title: t('dfSettingsAppearance'), subtitle: t('dfSettingsAppearanceHint') }
    case 'language':
      return { title: t('dfSettingsLanguage'), subtitle: t('dfSettingsLanguageHint') }
    case 'speech':
      return { title: t('dfSettingsSpeech'), subtitle: t('dfSettingsSpeechHint') }
    case 'haptics':
      return { title: t('dfSettingsHaptics'), subtitle: t('dfSettingsHapticsHint') }
    case 'updates':
      return { title: t('dfUpdatesTitle'), subtitle: t('dfUpdatesSubtitle') }
  }
}

/** 各事件的手感预览（与叙事推导共用同一触发通道）；as const 保持 key 字面量类型供 t() 校验 */
const HAPTIC_PREVIEWS = [
  { event: 'dice', labelKey: 'dfHapticDice', icon: Dices },
  { event: 'damage', labelKey: 'dfHapticDamage', icon: HeartCrack },
  { event: 'combat', labelKey: 'dfHapticCombat', icon: Swords },
  { event: 'reward', labelKey: 'dfHapticReward', icon: Coins },
  { event: 'check-pass', labelKey: 'dfHapticCheckPass', icon: CircleCheck },
  { event: 'check-fail', labelKey: 'dfHapticCheckFail', icon: CircleX },
  { event: 'critical', labelKey: 'dfHapticCritical', icon: Sparkles },
  { event: 'fumble', labelKey: 'dfHapticFumble', icon: Skull },
] as const

/** 拆分包文件名 → 用户可读的架构标签；识别不了的（如 universal）展示原文件名 */
function apkOptionLabel(name: string, t: T): string {
  const lower = name.toLowerCase()
  if (lower.includes('arm64-v8a')) return t('dfUpdatesApkArm64')
  if (lower.includes('armeabi-v7a')) return t('dfUpdatesApkArmv7')
  return t('dfUpdatesApkUniversal', { name })
}

/** as const 保持 labelKey/descKey 字面量类型供 t() 校验 */
const THEME_OPTIONS = [
  { value: 'system', labelKey: 'dfSettingsThemeSystem', descKey: 'dfSettingsThemeSystemDesc', icon: Monitor },
  { value: 'light', labelKey: 'dfSettingsThemeLight', descKey: 'dfSettingsThemeLightDesc', icon: Sun },
  { value: 'dark', labelKey: 'dfSettingsThemeDark', descKey: 'dfSettingsThemeDarkDesc', icon: Moon },
] as const

// 语言名用各自母语展示（切换语言前也要能认出来），不进文案字典；
// 「我的」页语言行的值也复用这份列表
export const LANGUAGE_OPTIONS: { value: LocalePreference; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

function isSection(value: string | undefined): value is SettingsSection {
  return !!value && SECTIONS.includes(value as SettingsSection)
}

export default function SettingsScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ section?: string }>()
  const t = useT()
  const settings = useSettingsStore()
  const updates = useAppUpdates()
  const gold = useThemeToken('gold')
  const border = useThemeToken('border')
  const section = isSection(params.section) ? params.section : null
  const meta = section ? sectionMeta(section, t) : { title: t('dfCommonSettings'), subtitle: t('dfSettingsSubtitle') }

  // 设置菜单已收敛到「我的」页的设置组；不带 section 进入（深链等）时回个人页
  useEffect(() => {
    if (!section) router.replace('/profile')
  }, [section, router])

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      <PageHeader title={meta.title} subtitle={meta.subtitle} onBack={() => router.back()} className="px-0" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-8">
        {section === 'server' ? (
          <>
            <Card className="gap-3">
              <CardHeader><CardTitle>{t('dfSettingsCurrentServer')}</CardTitle></CardHeader>
              <CardContent className="gap-3">
                <View className="flex-row items-center gap-3 rounded-xl border border-border bg-muted/50 p-4">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15"><Icon as={Server} size={18} /></View>
                  <View className="min-w-0 flex-1"><Text className="font-semibold">{settings.baseUrl ? t('dfSettingsConfigured') : t('dfSettingsNotConnected')}</Text><Text variant="small" numberOfLines={2}>{settings.baseUrl || t('dfSettingsBaseUrlEmptyHint')}</Text></View>
                </View>
                <Text variant="small">{t('dfSettingsSwitchServerWarning')}</Text>
                <Button onPress={() => router.push({ pathname: '/login', params: { mode: 'switch' } })}><Text>{settings.baseUrl ? t('dfServerSwitch') : t('connectServer')}</Text></Button>
              </CardContent>
            </Card>
          </>
        ) : null}

        {section === 'identity' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>{t('dfSettingsLocalIdentity')}</CardTitle></CardHeader>
            <CardContent className="gap-4">
              <View className="flex-row items-center justify-between gap-3"><View className="min-w-0 flex-1 gap-1"><Text className="font-semibold">{t('dfSettingsGmRole')}</Text><Text variant="small">{settings.token ? t('dfSettingsGmSaved') : t('dfSettingsNotLoggedIn')}</Text></View>{settings.token ? <Button size="sm" variant="destructive" onPress={() => settings.setToken(null)}><Text>{t('dfSettingsLogoutButton')}</Text></Button> : <Button size="sm" variant="outline" onPress={() => router.push('/login')}><Icon as={LogIn} size={15} /><Text>{t('dfSettingsLogin')}</Text></Button>}</View>
              <Separator />
              <View className="flex-row items-center justify-between gap-3"><View className="min-w-0 flex-1 gap-1"><Text className="font-semibold">{t('dfSettingsPlayerIdentity')}</Text><Text variant="small" numberOfLines={2}>{settings.share ? `${settings.share.name || settings.share.user} · ${settings.share.game}` : t('dfSettingsNoShare')}</Text></View>{settings.share ? <Button size="sm" variant="outline" onPress={() => settings.setShare(null)}><Text>{t('dfSettingsClear')}</Text></Button> : <Button size="sm" variant="outline" onPress={() => router.push('/join')}><Text>{t('dfSettingsJoinGame')}</Text></Button>}</View>
              <Text variant="small">{t('dfSettingsIdentityIndependence')}</Text>
            </CardContent>
          </Card>
        ) : null}

        {section === 'appearance' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>{t('dfSettingsTheme')}</CardTitle></CardHeader>
            <CardContent className="gap-2">
              {THEME_OPTIONS.map((option) => {
                const active = settings.themeMode === option.value
                return <Button key={option.value} variant={active ? 'secondary' : 'outline'} className="h-auto min-h-16 justify-start px-4 py-3" onPress={() => settings.setThemeMode(option.value)} accessibilityState={{ selected: active }}><View className="h-9 w-9 items-center justify-center rounded-full bg-background"><Icon as={option.icon} size={17} /></View><View className="min-w-0 flex-1 items-start gap-1"><Text className="font-semibold">{t(option.labelKey)}</Text><Text variant="small" className="text-left">{t(option.descKey)}</Text></View>{active ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}</Button>
              })}
            </CardContent>
          </Card>
        ) : null}

        {section === 'language' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>{t('dfSettingsLanguage')}</CardTitle></CardHeader>
            <CardContent className="gap-2">
              <Button
                variant={settings.language === 'system' ? 'secondary' : 'outline'}
                className="min-h-12 justify-start px-4 py-3"
                onPress={() => settings.setLanguage('system')}
                accessibilityState={{ selected: settings.language === 'system' }}
              >
                <Text className="font-semibold">{t('dfSettingsFollowSystem')}</Text>
                {settings.language === 'system' ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </Button>
              {LANGUAGE_OPTIONS.map((option) => {
                const active = settings.language === option.value
                return (
                  <Button
                    key={option.value}
                    variant={active ? 'secondary' : 'outline'}
                    className="min-h-12 justify-start px-4 py-3"
                    onPress={() => settings.setLanguage(option.value)}
                    accessibilityState={{ selected: active }}
                  >
                    <Text className="font-semibold">{option.label}</Text>
                    {active ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                  </Button>
                )
              })}
            </CardContent>
          </Card>
        ) : null}

        {section === 'haptics' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>{t('dfSettingsGameHaptics')}</CardTitle></CardHeader>
            <CardContent className="gap-4">
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-semibold">{t('dfSettingsHapticsToggle')}</Text>
                  <Text variant="small">{t('dfSettingsHapticsToggleDesc')}</Text>
                </View>
                <Switch
                  checked={settings.hapticsEnabled}
                  onCheckedChange={(checked) => {
                    settings.setHapticsEnabled(checked)
                    // 打开的瞬间给一次试震，立即确认手感与开关生效
                    if (checked) void playGameHaptic('check-pass')
                  }}
                />
              </View>
              <Separator />
              <View className="gap-2">
                <Text variant="small" className="font-semibold">{t('dfSettingsHapticsTry')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {HAPTIC_PREVIEWS.map((preview) => (
                    <Button key={preview.event} size="sm" variant="outline" onPress={() => void playGameHaptic(preview.event)}>
                      <Icon as={preview.icon} size={15} />
                      <Text>{t(preview.labelKey)}</Text>
                    </Button>
                  ))}
                </View>
                <Text variant="small">{t('dfSettingsHapticsPlatformHint')}</Text>
              </View>
            </CardContent>
          </Card>
        ) : null}

        {section === 'speech' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>{t('dfSettingsTtsSpeed')}</CardTitle></CardHeader>
            <CardContent className="gap-4">
              <View className="items-center gap-1 rounded-xl border border-border bg-muted/50 py-5"><Text className="font-mono text-3xl font-semibold tracking-tight">{settings.ttsRate.toFixed(2)}x</Text><Text variant="small">{t('dfSettingsTtsRateLabel')}</Text></View>
              <Slider minimumValue={0.5} maximumValue={2} step={0.25} value={settings.ttsRate} onValueChange={(value) => settings.setTtsRate(Number(value))} minimumTrackTintColor={gold} maximumTrackTintColor={border} />
              <View className="flex-row justify-between"><Text variant="small">{t('dfSettingsTtsSlow')}</Text><Text variant="small">{t('dfSettingsTtsStandard')}</Text><Text variant="small">{t('dfSettingsTtsFast')}</Text></View>
              <Text variant="small">{t('dfSettingsTtsApplyHint')}</Text>
            </CardContent>
          </Card>
        ) : null}

        {section === 'updates' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>{t('dfUpdatesAppVersion')}</CardTitle></CardHeader>
            <CardContent className="gap-4">
              <View className="gap-1 rounded-xl border border-border bg-muted/50 p-4">
                <Text className="font-semibold">{t('dfUpdatesCurrentVersion', { version: updates.current.version })}</Text>
                <Text variant="small">{t('dfUpdatesBuildNumber', { build: updates.current.buildVersion || '-' })}</Text>
              </View>
              <Button onPress={() => void updates.check()} disabled={updates.checking}>
                {updates.checking ? <ActivityIndicator className="text-primary-foreground" /> : <Icon as={RefreshCw} size={15} />}
                <Text>{updates.checking ? t('dfUpdatesChecking') : t('dfUpdatesCheckNow')}</Text>
              </Button>
              {updates.error ? <Text variant="small" className="text-destructive">{updates.error}</Text> : null}
              {updates.result ? (
                <View className="gap-3 rounded-xl border border-border bg-card p-4">
                  <View className="gap-1">
                    <Text className="font-semibold">{updates.result.isNewer ? t('dfUpdatesNewVersionFound', { version: updates.result.latestVersion }) : t('dfUpdatesUpToDate')}</Text>
                    <Text variant="small">{t('dfUpdatesReleaseLabel', { name: updates.result.releaseName })}</Text>
                  </View>
                  {updates.result.releaseNotes ? <Text variant="small" numberOfLines={8}>{updates.result.releaseNotes}</Text> : null}
                  {updates.result.isNewer ? (
                    <View className="gap-2">
                      <Button onPress={() => void Linking.openURL(updates.result!.apkUrl)}>
                        <Icon as={Download} size={15} />
                        <Text>{t('dfUpdatesDownloadApk')}</Text>
                      </Button>
                      <Text variant="small" className="text-muted-foreground">{t('dfUpdatesApkHint')}</Text>
                      {updates.result.apks.length > 1 ? (
                        <View className="gap-1 rounded-xl border border-border p-2">
                          <Text variant="small" className="px-1 font-semibold text-foreground">{t('dfUpdatesManualPick')}</Text>
                          {updates.result.apks.map((apk) => (
                            <Button key={apk.url} size="sm" variant="ghost" onPress={() => void Linking.openURL(apk.url)}>
                              <Text numberOfLines={1}>{apkOptionLabel(apk.name, t)}</Text>
                            </Button>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Text variant="small">{t('dfUpdatesFooter')}</Text>
            </CardContent>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
