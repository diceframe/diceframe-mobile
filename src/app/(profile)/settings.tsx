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
import { strings } from '@/lib/strings'
import { useThemeToken } from '@/lib/theme'
import type { HapticEvent } from '@/lib/haptics'
import { type ThemeMode, useSettingsStore } from '@/stores/settings'

const SECTIONS = ['server', 'identity', 'appearance', 'speech', 'haptics', 'updates'] as const

/** 「我的」页菜单等处复用此类型，避免手写联合类型与 SECTIONS 漂移 */
export type SettingsSection = (typeof SECTIONS)[number]

const SECTION_META: Record<SettingsSection, { title: string; subtitle: string }> = {
  server: { title: '服务器', subtitle: '管理 DiceFrame 服务端连接' },
  identity: { title: '身份与登录', subtitle: '管理 GM 和玩家身份' },
  appearance: { title: '外观', subtitle: '选择移动端显示主题' },
  speech: { title: '朗读', subtitle: '调整叙事语音的播放速度' },
  haptics: { title: '触觉反馈', subtitle: '对局事件的震动开关与手感' },
  updates: { title: strings.updates.title, subtitle: strings.updates.subtitle },
}

/** 各事件的手感预览（与叙事推导共用同一触发通道） */
const HAPTIC_PREVIEWS: { event: HapticEvent; label: string; icon: typeof Dices }[] = [
  { event: 'dice', label: '骰子', icon: Dices },
  { event: 'damage', label: '受伤', icon: HeartCrack },
  { event: 'combat', label: '攻击', icon: Swords },
  { event: 'reward', label: '拾获', icon: Coins },
  { event: 'check-pass', label: '检定成功', icon: CircleCheck },
  { event: 'check-fail', label: '检定失败', icon: CircleX },
  { event: 'critical', label: '大成功', icon: Sparkles },
  { event: 'fumble', label: '大失败', icon: Skull },
]

/** 拆分包文件名 → 用户可读的架构标签；识别不了的（如 universal）展示原文件名 */
function apkOptionLabel(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('arm64-v8a')) return 'armv8 安装包（2016 年后主流机型）'
  if (lower.includes('armeabi-v7a')) return 'armv7 安装包（较旧机型）'
  return `${name}（通用兼容）`
}

const THEME_OPTIONS: { value: ThemeMode; label: string; description: string; icon: typeof Sun }[] = [
  { value: 'system', label: '跟随系统', description: '随设备的浅色或深色模式切换', icon: Monitor },
  { value: 'light', label: '浅色', description: '始终使用明亮界面', icon: Sun },
  { value: 'dark', label: '深色', description: '始终使用暗色奇幻界面', icon: Moon },
]

function isSection(value: string | undefined): value is SettingsSection {
  return !!value && SECTIONS.includes(value as SettingsSection)
}

export default function SettingsScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ section?: string }>()
  const settings = useSettingsStore()
  const updates = useAppUpdates()
  const gold = useThemeToken('gold')
  const border = useThemeToken('border')
  const section = isSection(params.section) ? params.section : null
  const meta = section ? SECTION_META[section] : { title: '设置', subtitle: '服务器、身份与使用偏好' }

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
              <CardHeader><CardTitle>当前服务器</CardTitle></CardHeader>
              <CardContent className="gap-3">
                <View className="flex-row items-center gap-3 rounded-xl border border-border bg-muted/50 p-4">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15"><Icon as={Server} size={18} /></View>
                  <View className="min-w-0 flex-1"><Text className="font-semibold">{settings.baseUrl ? '已配置' : '尚未连接'}</Text><Text variant="small" numberOfLines={2}>{settings.baseUrl || '原生端需要填写 DiceFrame 服务器地址'}</Text></View>
                </View>
                <Text variant="small">切换服务器会清除本机保存的 GM 密码和玩家身份，避免把旧服务器身份发送到新地址。</Text>
                <Button onPress={() => router.push({ pathname: '/login', params: { mode: 'switch' } })}><Text>{settings.baseUrl ? '切换服务器' : '连接服务器'}</Text></Button>
              </CardContent>
            </Card>
          </>
        ) : null}

        {section === 'identity' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>本机身份</CardTitle></CardHeader>
            <CardContent className="gap-4">
              <View className="flex-row items-center justify-between gap-3"><View className="min-w-0 flex-1 gap-1"><Text className="font-semibold">GM（房主）</Text><Text variant="small">{settings.token ? '已保存服务器访问凭据' : '未登录'}</Text></View>{settings.token ? <Button size="sm" variant="destructive" onPress={() => settings.setToken(null)}><Text>退出</Text></Button> : <Button size="sm" variant="outline" onPress={() => router.push('/login')}><Icon as={LogIn} size={15} /><Text>登录</Text></Button>}</View>
              <Separator />
              <View className="flex-row items-center justify-between gap-3"><View className="min-w-0 flex-1 gap-1"><Text className="font-semibold">玩家身份</Text><Text variant="small" numberOfLines={2}>{settings.share ? `${settings.share.name || settings.share.user} · ${settings.share.game}` : '尚未通过分享链接加入对局'}</Text></View>{settings.share ? <Button size="sm" variant="outline" onPress={() => settings.setShare(null)}><Text>清除</Text></Button> : <Button size="sm" variant="outline" onPress={() => router.push('/join')}><Text>加入对局</Text></Button>}</View>
              <Text variant="small">GM 身份和玩家身份互相独立；加入分享对局时会使用该对局专属的玩家身份。</Text>
            </CardContent>
          </Card>
        ) : null}

        {section === 'appearance' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>主题</CardTitle></CardHeader>
            <CardContent className="gap-2">
              {THEME_OPTIONS.map((option) => {
                const active = settings.themeMode === option.value
                return <Button key={option.value} variant={active ? 'secondary' : 'outline'} className="h-auto min-h-16 justify-start px-4 py-3" onPress={() => settings.setThemeMode(option.value)} accessibilityState={{ selected: active }}><View className="h-9 w-9 items-center justify-center rounded-full bg-background"><Icon as={option.icon} size={17} /></View><View className="min-w-0 flex-1 items-start gap-1"><Text className="font-semibold">{option.label}</Text><Text variant="small" className="text-left">{option.description}</Text></View>{active ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}</Button>
              })}
            </CardContent>
          </Card>
        ) : null}

        {section === 'haptics' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>对局震动</CardTitle></CardHeader>
            <CardContent className="gap-4">
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-semibold">触觉反馈</Text>
                  <Text variant="small">叙事中的受伤、骰子、拾获等事件产生不同节奏的震动</Text>
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
                <Text variant="small" className="font-semibold">试试各事件的震动手感</Text>
                <View className="flex-row flex-wrap gap-2">
                  {HAPTIC_PREVIEWS.map((preview) => (
                    <Button key={preview.event} size="sm" variant="outline" onPress={() => void playGameHaptic(preview.event)}>
                      <Icon as={preview.icon} size={15} />
                      <Text>{preview.label}</Text>
                    </Button>
                  ))}
                </View>
                <Text variant="small">节奏差异在 Android 上最完整；iOS 使用系统触感预设近似。</Text>
              </View>
            </CardContent>
          </Card>
        ) : null}

        {section === 'speech' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>朗读语速</CardTitle></CardHeader>
            <CardContent className="gap-5">
              <View className="items-center gap-1 rounded-xl border border-border bg-muted/50 py-5"><Text variant="h2" className="border-b-0 pb-0 font-mono">{settings.ttsRate.toFixed(2)}x</Text><Text variant="small">叙事文本播放速度</Text></View>
              <Slider minimumValue={0.5} maximumValue={2} step={0.25} value={settings.ttsRate} onValueChange={(value) => settings.setTtsRate(Number(value))} minimumTrackTintColor={gold} maximumTrackTintColor={border} />
              <View className="flex-row justify-between"><Text variant="small">0.50x 慢速</Text><Text variant="small">1.00x 标准</Text><Text variant="small">2.00x 快速</Text></View>
              <Text variant="small">语速会立即用于之后播放的叙事，不影响已经开始的朗读。</Text>
            </CardContent>
          </Card>
        ) : null}

        {section === 'updates' ? (
          <Card className="gap-3">
            <CardHeader><CardTitle>{strings.updates.appVersion}</CardTitle></CardHeader>
            <CardContent className="gap-4">
              <View className="gap-1 rounded-xl border border-border bg-muted/50 p-4">
                <Text className="font-semibold">{strings.updates.currentVersion.replace('{version}', updates.current.version)}</Text>
                <Text variant="small">{strings.updates.buildNumber.replace('{build}', updates.current.buildVersion || '-')}</Text>
              </View>
              <Button onPress={() => void updates.check()} disabled={updates.checking}>
                {updates.checking ? <ActivityIndicator className="text-primary-foreground" /> : <Icon as={RefreshCw} size={15} />}
                <Text>{updates.checking ? strings.updates.checking : strings.updates.checkNow}</Text>
              </Button>
              {updates.error ? <Text variant="small" className="text-destructive">{updates.error}</Text> : null}
              {updates.result ? (
                <View className="gap-3 rounded-xl border border-border bg-card p-4">
                  <View className="gap-1">
                    <Text className="font-semibold">{updates.result.isNewer ? strings.updates.newVersionFound.replace('{version}', updates.result.latestVersion) : strings.updates.upToDate}</Text>
                    <Text variant="small">{strings.updates.releaseLabel.replace('{name}', updates.result.releaseName)}</Text>
                  </View>
                  {updates.result.releaseNotes ? <Text variant="small" numberOfLines={8}>{updates.result.releaseNotes}</Text> : null}
                  {updates.result.isNewer ? (
                    <View className="gap-2">
                      <Button onPress={() => void Linking.openURL(updates.result!.apkUrl)}>
                        <Icon as={Download} size={15} />
                        <Text>{strings.updates.downloadApk}</Text>
                      </Button>
                      <Text variant="small" className="text-muted-foreground">{strings.updates.apkHint}</Text>
                      {updates.result.apks.length > 1 ? (
                        <View className="gap-1 rounded-xl border border-border p-2">
                          <Text variant="small" className="px-1 pt-1 font-semibold">{strings.updates.manualPick}</Text>
                          {updates.result.apks.map((apk) => (
                            <Button key={apk.url} size="sm" variant="ghost" onPress={() => void Linking.openURL(apk.url)}>
                              <Text numberOfLines={1}>{apkOptionLabel(apk.name)}</Text>
                            </Button>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Text variant="small">{strings.updates.footer}</Text>
            </CardContent>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
