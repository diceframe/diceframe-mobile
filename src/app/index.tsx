import * as React from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { Screen } from '@/components/screen'
import { Text } from '@/components/ui/text'
import { useSettingsStore } from '@/stores/settings'

/** 启动分流：未配置服务器→登录；玩家身份→直接进对局；Owner→对局列表 */
export default function Index() {
  const router = useRouter()
  const hydrated = useSettingsStore((s) => s.hydrated)
  const baseUrl = useSettingsStore((s) => s.baseUrl)
  const token = useSettingsStore((s) => s.token)
  const share = useSettingsStore((s) => s.share)

  React.useEffect(() => {
    if (!hydrated) return
    if (!baseUrl) {
      router.replace('/login')
    } else if (share) {
      router.replace({ pathname: '/play/[gameKey]', params: { gameKey: share.game } })
    } else if (token) {
      router.replace('/overview')
    } else {
      router.replace('/login')
    }
  }, [hydrated, baseUrl, token, share, router])

  return (
    <Screen className="items-center justify-center">
      <View>
        <Text variant="h1">DiceFrame</Text>
      </View>
    </Screen>
  )
}
