import { Pressable, View } from 'react-native'
import { ChevronRight, FileLock2, ScrollText } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'

interface LegalRowProps {
  icon: typeof ScrollText
  title: string
  description: string
  onPress: () => void
}

function LegalRow({ icon, title, description, onPress }: LegalRowProps) {
  return (
    <Pressable
      className="flex-row items-center gap-3 px-4 py-4 active:bg-accent"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}，${description}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted">
        <Icon as={icon} size={18} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold">{title}</Text>
        <Text variant="small" numberOfLines={2}>{description}</Text>
      </View>
      <Icon as={ChevronRight} size={17} className="text-muted-foreground" />
    </Pressable>
  )
}

export default function LegalIndexScreen() {
  const router = useRouter()

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      <PageHeader title="法律与隐私" subtitle="使用规则与数据处理说明" onBack={() => router.back()} className="px-0" />
      <Card className="overflow-hidden py-0">
        <CardContent className="px-0 py-0">
          <LegalRow icon={ScrollText} title="服务条款" description="了解服务使用规则、责任范围和内容权利" onPress={() => router.push('/legal/terms')} />
          <Separator className="ml-16" />
          <LegalRow icon={FileLock2} title="隐私政策" description="了解客户端、自托管服务器与第三方服务如何处理数据" onPress={() => router.push('/legal/privacy')} />
        </CardContent>
      </Card>
      <Text variant="small" className="mt-3 px-1 leading-5">DiceFrame 支持连接自托管服务器。服务器运营者可能有独立的使用规则和隐私说明。</Text>
    </Screen>
  )
}
