import { View } from 'react-native'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import { DiceFamiliar } from '@/features/assistant/DiceFamiliar'
import { SettingsSectionScreen } from '@/features/settings/section-screen'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import { REACTION_CATEGORIES, type ReactionCategory } from '@/lib/assistant-reactions'
import { useSettingsStore } from '@/stores/settings'

const CATEGORY_COPY: Record<ReactionCategory, { label: TKey; hint: TKey }> = {
  check: { label: 'dfFamiliarCategoryCheck', hint: 'dfFamiliarCategoryCheckHint' },
  combat: { label: 'dfFamiliarCategoryCombat', hint: 'dfFamiliarCategoryCombatHint' },
  story: { label: 'dfFamiliarCategoryStory', hint: 'dfFamiliarCategoryStoryHint' },
  growth: { label: 'dfFamiliarCategoryGrowth', hint: 'dfFamiliarCategoryGrowthHint' },
  table: { label: 'dfFamiliarCategoryTable', hint: 'dfFamiliarCategoryTableHint' },
}

/** 骰灵跑团反应设置（同上游设置里的反应开关与按类别关闭） */
export default function FamiliarSettingsScreen() {
  const t = useT()
  const enabled = useSettingsStore((s) => s.assistantReactions)
  const disabled = useSettingsStore((s) => s.disabledReactionCategories)

  return (
    <SettingsSectionScreen section="familiar">
      <Card className="gap-3">
        <CardHeader><CardTitle>{t('dfFamiliarSettingsReactions')}</CardTitle></CardHeader>
        <CardContent className="gap-4">
          <View className="flex-row items-center gap-3">
            <DiceFamiliar mood={enabled ? 'happy' : 'sad'} size={64} />
            <Text variant="small" className="min-w-0 flex-1">{t('dfFamiliarSettingsHint')}</Text>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => useSettingsStore.getState().setAssistantReactions(checked)}
              accessibilityLabel={t('dfFamiliarSettingsReactions')}
            />
          </View>
          <Separator />
          <Text variant="small" className="font-semibold">{t('dfFamiliarSettingsCategories')}</Text>
          {REACTION_CATEGORIES.map((category) => (
            <View key={category} className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text>{t(CATEGORY_COPY[category].label)}</Text>
                <Text variant="small" className="text-muted-foreground">{t(CATEGORY_COPY[category].hint)}</Text>
              </View>
              <Switch
                checked={enabled && !disabled.includes(category)}
                disabled={!enabled}
                onCheckedChange={(checked) => useSettingsStore.getState().setReactionCategory(category, checked)}
                accessibilityLabel={t(CATEGORY_COPY[category].label)}
              />
            </View>
          ))}
        </CardContent>
      </Card>
    </SettingsSectionScreen>
  )
}
