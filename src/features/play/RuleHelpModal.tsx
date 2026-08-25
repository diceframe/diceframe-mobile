import * as React from 'react'
import { ScrollView, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import type { RuleMeta } from '@/api/types'
import { strings } from '@/lib/strings'

interface RuleHelpModalProps {
  open: boolean
  meta: RuleMeta | null
  onClose: () => void
}

/**
 * 规则帮助弹窗（对齐 Web RuleHelp：骰子系统 / 属性技能 / HP 说明）。
 */
export function RuleHelpModal({ open, meta, onClose }: RuleHelpModalProps) {
  const diceSystem = String(meta?.dice_system || 'd20').toUpperCase()

  return (
    <Sheet open={open} onClose={onClose} className="h-[70%]" scrollable={false}>
      <View className="flex-1 gap-4 pt-1">
        <Text variant="h3">{strings.play.ruleHelp}</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-5 pb-6">
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-md border border-border bg-muted p-3 gap-1">
              <Text variant="small" className="text-muted-foreground">
                骰子系统
              </Text>
              <Text className="text-lg font-semibold">{diceSystem}</Text>
            </View>
            <View className="flex-1 rounded-md border border-border bg-muted p-3 gap-1">
              <Text variant="small" className="text-muted-foreground">
                行动风格
              </Text>
              <Text className="text-lg font-semibold">自由叙述</Text>
            </View>
          </View>

          {meta?.mechanics === 'dnd5e_core' && (
            <View className="rounded-md border border-border bg-muted p-3 gap-2">
              <Text className="font-semibold">优势 / 劣势</Text>
              <Text variant="small" className="text-muted-foreground">
                在有利情境下掷两颗 d20 取较高值（优势），不利情境下取较低值（劣势）。
              </Text>
            </View>
          )}

          <View className="rounded-md border border-border bg-muted p-3 gap-2">
            <Text className="font-semibold">属性与技能</Text>
            <Text variant="small" className="text-muted-foreground">
              {meta?.skill_hint || meta?.skill_hint_en || '角色通过属性值与技能加值来判定行动成功与否。'}
            </Text>
          </View>

          <View className="rounded-md border border-border bg-muted p-3 gap-2">
            <Text className="font-semibold">生命值</Text>
            <Text variant="small" className="text-muted-foreground">
              {meta?.hp_formula ? `计算公式：${meta.hp_formula}` : 'HP 由规则自动计算或手动填写。'}
            </Text>
          </View>

          {meta?.rule_name && (
            <Text variant="small" className="text-center text-muted-foreground">
              当前规则：{meta.rule_name} {meta.rule_version ? `v${meta.rule_version}` : ''}
            </Text>
          )}
        </ScrollView>
      </View>
    </Sheet>
  )
}
