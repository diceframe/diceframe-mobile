import { View } from 'react-native'
import { LogIn } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { SettingsSectionScreen } from '@/features/settings/section-screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { listIdentities } from '@/lib/player-identity'
import { useSettingsStore } from '@/stores/settings'

export default function IdentitySettingsScreen() {
  const router = useRouter()
  const t = useT()
  const settings = useSettingsStore()
  // 身份槽位列表（插入序 = 加入顺序）；进入某局时的注入由启动分流/play 页负责
  const identities = listIdentities(settings.shares)

  return (
    <SettingsSectionScreen section="identity">
      <Card className="gap-3">
        <CardHeader><CardTitle>{t('dfSettingsLocalIdentity')}</CardTitle></CardHeader>
        <CardContent className="gap-4">
          <View className="flex-row items-center justify-between gap-3"><View className="min-w-0 flex-1 gap-1"><Text className="font-semibold">{t('dfSettingsGmRole')}</Text><Text variant="small">{settings.token ? t('dfSettingsGmSaved') : t('dfSettingsNotLoggedIn')}</Text></View>{settings.token ? <Button size="sm" variant="destructive" onPress={() => settings.setToken(null)}><Text>{t('dfSettingsLogoutButton')}</Text></Button> : <Button size="sm" variant="outline" onPress={() => router.push('/login')}><Icon as={LogIn} size={15} /><Text>{t('dfSettingsLogin')}</Text></Button>}</View>
          <Separator />
          {/* 玩家身份按局分槽保存：一局一行，只移除所选局，不影响其他局的保存身份 */}
          <View className="gap-3">
            <Text className="font-semibold">{t('dfSettingsPlayerIdentity')}</Text>
            {identities.length === 0 ? (
              <View className="flex-row items-center justify-between gap-3">
                <Text variant="small" className="flex-1">{t('dfSettingsNoShare')}</Text>
                <Button size="sm" variant="outline" onPress={() => router.push('/join')}><Text>{t('dfSettingsJoinGame')}</Text></Button>
              </View>
            ) : (
              <>
                {identities.map((identity) => (
                  <View key={identity.game} className="flex-row items-center justify-between gap-3">
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="font-semibold" numberOfLines={1}>{identity.worldName || identity.game}</Text>
                      <Text variant="small" numberOfLines={2}>{[identity.name || identity.user, identity.server].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Button size="sm" variant="outline" onPress={() => settings.removeShare(identity.game)}><Text>{t('dfCommonDelete')}</Text></Button>
                  </View>
                ))}
                <View className="flex-row">
                  <Button size="sm" variant="outline" onPress={() => router.push('/join')}><Text>{t('dfSettingsJoinGame')}</Text></Button>
                </View>
              </>
            )}
          </View>
          <Text variant="small">{t('dfSettingsIdentityIndependence')}</Text>
        </CardContent>
      </Card>
    </SettingsSectionScreen>
  )
}
