import * as React from 'react'
import { ScrollView, View } from 'react-native'

import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import type { RuleMeta } from '@/api/types'
import { useT } from '@/i18n/t'

interface RuleHelpModalProps {
  open: boolean
  meta: RuleMeta | null
  onClose: () => void
}

/**
 * 规则帮助弹窗（对齐 Web RuleHelp：骰子系统 / 属性技能 / HP 说明）。
 */
export function RuleHelpModal({ open, meta, onClose }: RuleHelpModalProps) {
  const t = useT()
  const diceSystem = String(meta?.dice_system || 'd20').toUpperCase()

  return (
    <Sheet open={open} onClose={onClose} className="h-[70%]" scrollable={false}>
      <View className="flex-1 gap-4 pt-1">
        <Text variant="h3">{t('ruleHelp')}</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-6">
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-md border border-border bg-muted p-3 gap-1">
              <Text variant="small" className="text-muted-foreground">
                {t('dfPlayDiceSystem')}
              </Text>
              <Text className="text-lg font-semibold">{diceSystem}</Text>
            </View>
            <View className="flex-1 rounded-md border border-border bg-muted p-3 gap-1">
              <Text variant="small" className="text-muted-foreground">
                {t('dfPlayActionStyle')}
              </Text>
              <Text className="text-lg font-semibold">{t('dfPlayFreeNarration')}</Text>
            </View>
          </View>

          {meta?.mechanics === 'dnd5e_core' && (
            <View className="rounded-md border border-border bg-muted p-3 gap-2">
              <Text className="font-semibold">{t('dfPlayAdvantage')}</Text>
              <Text variant="small" className="text-muted-foreground">
                {t('dfPlayAdvantageHint')}
              </Text>
            </View>
          )}

          <View className="rounded-md border border-border bg-muted p-3 gap-2">
            <Text className="font-semibold">{t('dfPlayAttributesSkills')}</Text>
            <Text variant="small" className="text-muted-foreground">
              {meta?.skill_hint || meta?.skill_hint_en || t('dfPlaySkillHintFallback')}
            </Text>
          </View>

          <View className="rounded-md border border-border bg-muted p-3 gap-2">
            <Text className="font-semibold">{t('dfPlayHitPoints')}</Text>
            <Text variant="small" className="text-muted-foreground">
              {meta?.hp_formula
                ? t('dfPlayHpFormula', { formula: meta.hp_formula })
                : t('dfPlayHpFallback')}
            </Text>
          </View>

          {meta?.rule_name && (
            <Text variant="small" className="text-center text-muted-foreground">
              {t('dfPlayRuleCurrent', {
                detail: `${meta.rule_name}${meta.rule_version ? ` v${meta.rule_version}` : ''}`,
              })}
            </Text>
          )}
        </ScrollView>
      </View>
    </Sheet>
  )
}
