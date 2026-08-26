import { ScrollView, View } from 'react-native'
import Slider from '@react-native-community/slider'
import { CircleUserRound, LogIn, Monitor, Moon, Server, Sun, Volume2 } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import { useThemeToken } from '@/lib/theme'
import { type ThemeMode, useSettingsStore } from '@/stores/settings'

const SECTIONS = ['server', 'identity', 'appearance', 'speech'] as const
type SettingsSection = (typeof SECTIONS)[number]

const SECTION_META: Record<SettingsSection, { title: string; subtitle: string }> = {
  server: { title: '服务器', subtitle: '管理 DiceFrame 服务端连接' },
  identity: { title: '身份与登录', subtitle: '管理 GM 和玩家身份' },
  appearance: { title: '外观', subtitle: '选择移动端显示主题' },
  speech: { title: '朗读', subtitle: '调整叙事语音的播放速度' },
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
  const gold = useThemeToken('gold')
  const border = useThemeToken('border')
  const section = isSection(params.section) ? params.section : null
  const meta = section ? SECTION_META[section] : { title: '设置', subtitle: '服务器、身份与使用偏好' }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      <PageHeader title={meta.title} subtitle={meta.subtitle} onBack={() => router.back()} className="px-0" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-8">
        {!section ? (
          <>
            <Button variant="outline" size="lg" className="h-14 justify-start" onPress={() => router.setParams({ section: 'server' })}><Icon as={Server} size={18} /><Text>服务器</Text></Button>
            <Button variant="outline" size="lg" className="h-14 justify-start" onPress={() => router.setParams({ section: 'identity' })}><Icon as={CircleUserRound} size={18} /><Text>身份与登录</Text></Button>
            <Button variant="outline" size="lg" className="h-14 justify-start" onPress={() => router.setParams({ section: 'appearance' })}><Icon as={Moon} size={18} /><Text>外观</Text></Button>
            <Button variant="outline" size="lg" className="h-14 justify-start" onPress={() => router.setParams({ section: 'speech' })}><Icon as={Volume2} size={18} /><Text>朗读</Text></Button>
          </>
        ) : null}

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
      </ScrollView>
    </Screen>
  )
}
