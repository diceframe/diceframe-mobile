import { View } from 'react-native'
import { RadioTower, ServerOff } from 'lucide-react-native'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { resetTo, useBackNavigation } from '@/hooks/use-back-navigation'

export default function PeerScreen() {
  const goBack = useBackNavigation('/profile')
  const t = useT()

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      <PageHeader title={t('dfPeerTitle')} subtitle={t('dfPeerSubtitle')} onBack={goBack} className="px-0" />
      <Card className="mt-4 py-8">
        <CardContent className="items-center gap-4 px-6">
          <View className="h-16 w-16 items-center justify-center rounded-full border border-border bg-muted">
            <Icon as={ServerOff} size={28} className="text-muted-foreground" />
          </View>
          <View className="items-center gap-2">
            <Text variant="h3" className="text-center">{t('dfPeerUnsupported')}</Text>
            <Text className="text-center leading-6 text-muted-foreground">
              {t('dfPeerHint')}
            </Text>
          </View>
          <Button onPress={() => resetTo('/overview')}>
            <Icon as={RadioTower} size={16} />
            <Text>{t('dfPeerBackToLobby')}</Text>
          </Button>
        </CardContent>
      </Card>
    </Screen>
  )
}
