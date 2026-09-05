import * as React from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'

import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { checkOwnerAccess } from '@/api/client'
import { listIdentities, resolveStartupRoute } from '@/lib/player-identity'
import { useSettingsStore } from '@/stores/settings'
import { useT } from '@/i18n/t'

/**
 * 启动分流：未配置服务器→登录；恰好一份玩家身份→直接进该局；
 * 多份身份→停留本页做轻量身份选择；零身份→Owner（大厅）路径。
 */
export default function Index() {
  const router = useRouter()
  const t = useT()
  const hydrated = useSettingsStore((s) => s.hydrated)
  const baseUrl = useSettingsStore((s) => s.baseUrl)
  const token = useSettingsStore((s) => s.token)
  const shares = useSettingsStore((s) => s.shares)
  const activateShare = useSettingsStore((s) => s.activateShare)

  const identities = listIdentities(shares)
  const route = resolveStartupRoute({ baseUrl, identities })

  function enterGame(gameKey: string) {
    // 先注入该局身份再入局：play 页的 enter 依赖 client 里的 share 判定玩家模式
    activateShare(gameKey)
    router.replace({ pathname: '/play/[gameKey]', params: { gameKey } })
  }

  async function enterLobby() {
    // 与 Owner 路径汇合：清掉身份注入，大厅类请求不携带任何 share query
    activateShare(null)
    if (token) {
      router.replace('/overview')
      return
    }
    // checkOwnerAccess 内部兜底，不会 reject
    const status = await checkOwnerAccess()
    router.replace(status === 'allowed' ? '/overview' : '/login')
  }

  React.useEffect(() => {
    if (!hydrated) return
    // 多份身份：停留本页渲染选择列表，不做自动跳转
    if (route === 'selector') return
    let active = true
    if (route === 'login') {
      router.replace('/login')
    } else if (route === 'play') {
      enterGame(identities[0].game)
    } else if (token) {
      router.replace('/overview')
    } else {
      // 开放服务器没有 Bearer token，重启后通过 /me 重新确认 Owner 访问态。
      // 受密码保护的服务器仍会回到登录页。（checkOwnerAccess 内部兜底，不会 reject）
      async function routeByOwnerAccess() {
        const status = await checkOwnerAccess()
        if (!active) return
        router.replace(status === 'allowed' ? '/overview' : '/login')
      }
      void routeByOwnerAccess()
    }
    return () => {
      active = false
    }
    // 依赖 shares 本身（引用稳定）；identities 是渲染期派生数组，进依赖会导致重复跳转
  }, [hydrated, baseUrl, token, shares, route, activateShare, router])

  if (!hydrated || route !== 'selector') {
    return (
      <Screen className="items-center justify-center">
        <View>
          <Text variant="h1">DiceFrame</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 600, alignSelf: 'center' }}>
      <View className="flex-1 justify-center gap-6">
        <View className="gap-1">
          <Text variant="h1">DiceFrame</Text>
          <Text variant="h4">{t('dfIdentityPickerTitle')}</Text>
          <Text variant="muted">{t('dfIdentityPickerSubtitle')}</Text>
        </View>
        <View className="gap-2">
          {identities.map((identity) => (
            <Button
              key={identity.game}
              variant="outline"
              className="h-auto min-h-16 justify-start px-4 py-3"
              onPress={() => enterGame(identity.game)}
            >
              <View className="min-w-0 flex-1 items-start gap-1">
                {/* 加入时未获取对局名则显示 gameKey */}
                <Text className="font-semibold" numberOfLines={1}>
                  {identity.worldName || identity.game}
                </Text>
                <Text variant="small" className="text-left" numberOfLines={1}>
                  {[identity.name || identity.user, identity.server].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Button>
          ))}
        </View>
        <Button variant="secondary" onPress={enterLobby}>
          <Text>{t('dfIdentityPickerLobby')}</Text>
        </Button>
      </View>
    </Screen>
  )
}
