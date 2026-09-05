import { ScrollView } from 'react-native'
import { useRouter } from 'expo-router'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { useT } from '@/i18n/t'
import { sectionMeta, type SettingsSection } from '@/features/settings/config'

/**
 * 设置子页的共享外壳（PageHeader + 居中限宽 + 滚动容器），
 * 各子路由只渲染自己的卡片区。
 */
export function SettingsSectionScreen({ section, children }: { section: SettingsSection; children: React.ReactNode }) {
  const t = useT()
  const router = useRouter()
  const meta = sectionMeta(section, t)

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      <PageHeader title={meta.title} subtitle={meta.subtitle} onBack={() => router.back()} className="px-0" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-8">
        {children}
      </ScrollView>
    </Screen>
  )
}
