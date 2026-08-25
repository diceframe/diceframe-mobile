import * as React from 'react'
import { ScrollView, View } from 'react-native'
import Slider from '@react-native-community/slider'
import { Moon, Sun, Monitor } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import { useThemeToken } from '@/lib/theme'
import { strings } from '@/lib/strings'
import { type ThemeMode, useSettingsStore } from '@/stores/settings'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

export default function ProfileScreen() {
  const router = useRouter()
  const settings = useSettingsStore()
  const gold = useThemeToken('gold')

  return (
    <Screen
      className="px-4"
      style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}
    >
      <PageHeader title="我的" className="px-0" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-8">
        {/* 服务器 */}
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>服务器</CardTitle>
            <Text variant="small">{settings.baseUrl || '未连接'}</Text>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onPress={() => router.push({ pathname: '/login', params: { mode: 'switch' } })}
            >
              <Text>切换服务器</Text>
            </Button>
            <Text variant="small" className="mt-2">
              切换会清除本机保存的 GM 密码与玩家身份
            </Text>
          </CardContent>
        </Card>

        {/* 外观 */}
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>外观</CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <View className="flex-row gap-2">
              {THEME_OPTIONS.map((option) => {
                const active = settings.themeMode === option.value
                return (
                  <Button
                    key={option.value}
                    variant={active ? 'default' : 'outline'}
                    className="flex-1 flex-row items-center justify-center gap-1.5"
                    onPress={() => settings.setThemeMode(option.value)}
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: active }}
                  >
                    <Icon as={option.icon} size={16} />
                    <Text variant="small">{option.label}</Text>
                  </Button>
                )
              })}
            </View>
          </CardContent>
        </Card>

        {/* 身份 */}
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>身份</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1 gap-0.5">
                <Text>GM（房主）</Text>
                {settings.token ? (
                  <Text variant="small">已登录</Text>
                ) : (
                  <Text variant="small">未登录 · 开放服务器或未验证密码</Text>
                )}
              </View>
              {settings.token ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onPress={() => {
                    settings.setToken(null)
                    // 退出后直接回登录页（页面会自动探测并显示密码框，便于重新登录）
                    router.replace('/login')
                  }}
                >
                  <Text>{strings.common.logout}</Text>
                </Button>
              ) : settings.baseUrl ? (
                <Button size="sm" variant="outline" onPress={() => router.push('/login')}>
                  <Text>去登录</Text>
                </Button>
              ) : null}
            </View>
            <Separator />
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1 gap-0.5">
                <Text>玩家身份</Text>
                {settings.share ? (
                  <Text variant="small" numberOfLines={1}>
                    {settings.share.name || settings.share.user} · {settings.share.game}
                  </Text>
                ) : (
                  <Text variant="small">无（通过分享链接加入后显示）</Text>
                )}
              </View>
              {settings.share ? (
                <Button size="sm" variant="outline" onPress={() => settings.setShare(null)}>
                  <Text>清除</Text>
                </Button>
              ) : (
                <Button size="sm" variant="outline" onPress={() => router.push('/join')}>
                  <Text>加入</Text>
                </Button>
              )}
            </View>
          </CardContent>
        </Card>

        {/* 偏好 */}
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>偏好</CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text>朗读语速</Text>
              <Text variant="small" className="font-mono">
                {settings.ttsRate.toFixed(2)}x
              </Text>
            </View>
            <Slider
              minimumValue={0.5}
              maximumValue={2}
              step={0.25}
              value={settings.ttsRate}
              onValueChange={(value) => settings.setTtsRate(Number(value))}
              minimumTrackTintColor={gold}
            />
          </CardContent>
        </Card>

        {/* 关于 */}
        <Card className="gap-1">
          <CardHeader>
            <CardTitle>关于</CardTitle>
          </CardHeader>
          <CardContent>
            <Text variant="small">DiceFrame 移动端 v{Constants.expoConfig?.version ?? '-'}</Text>
            <Text variant="small">跑团创建与设置请使用 Web 端</Text>
          </CardContent>
        </Card>
      </ScrollView>
    </Screen>
  )
}
