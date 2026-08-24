import * as React from 'react'
import { ScrollView, View } from 'react-native'
import Slider from '@react-native-community/slider'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button, ButtonText } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import { useThemeToken } from '@/lib/theme-colors'
import { strings } from '@/lib/strings'
import { useSettingsStore } from '@/stores/settings'

export default function ProfileScreen() {
  const router = useRouter()
  const settings = useSettingsStore()
  const gold = useThemeToken('gold')

  return (
    <Screen className="px-4">
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
              <ButtonText className="text-foreground">切换服务器</ButtonText>
            </Button>
            <Text variant="small" className="mt-2">
              切换会清除本机保存的 GM 密码与玩家身份
            </Text>
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
                  <ButtonText>{strings.common.logout}</ButtonText>
                </Button>
              ) : settings.baseUrl ? (
                <Button size="sm" variant="outline" onPress={() => router.push('/login')}>
                  <ButtonText className="text-foreground">去登录</ButtonText>
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
                  <ButtonText className="text-foreground">清除</ButtonText>
                </Button>
              ) : (
                <Button size="sm" variant="outline" onPress={() => router.push('/join')}>
                  <ButtonText className="text-foreground">加入</ButtonText>
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
