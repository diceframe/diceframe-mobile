import { ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'

export type LegalSection = { title: string; content: string }

export function LegalDocument({ title, subtitle, sections, updated }: { title: string; subtitle: string; sections: LegalSection[]; updated: string }) {
  const router = useRouter()
  const t = useT()
  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <PageHeader title={title} subtitle={subtitle} onBack={() => router.back()} className="px-0" />
      <ScrollView className="flex-1" contentContainerClassName="gap-3 pb-8" showsVerticalScrollIndicator={false}>
        {sections.map((section) => (
          <Card key={section.title} className="gap-3 py-4">
            <CardContent className="gap-2 px-4">
              <Text className="font-semibold">{section.title}</Text>
              <Text className="leading-7 text-muted-foreground">{section.content}</Text>
            </CardContent>
          </Card>
        ))}
        <View className="items-center py-3"><Text variant="small">{t('dfUiLastUpdated', { date: updated })}</Text></View>
      </ScrollView>
    </Screen>
  )
}
