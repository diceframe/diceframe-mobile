import * as React from 'react'
import { Pressable, View } from 'react-native'
import { MessageSquareText, Plus, X } from 'lucide-react-native'

import type { CharacterSkill, RuleMeta } from '@/api/types'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/t'
import { SKILL_EFFECT_MAX_CHARS, skillPoolNames } from '@/lib/character-card'
import { cn } from '@/lib/utils'

/**
 * 技能行编辑器（对齐 Web SkillEditor）：名称+数值行、增删、规则技能池快捷添加，
 * 以及技能上限/技能点/单技能上限提示（超限标红）。
 *
 * 「效果说明」（effect）默认折叠：技能多时不该铺开一排多行输入框。它是玩家自填的
 * 说明，只做展示与 AI 上下文，不参与任何判定。
 */
export function SkillRowsEditor({
  skills,
  onChange,
  pool,
  meta,
}: {
  skills: CharacterSkill[]
  onChange: (skills: CharacterSkill[]) => void
  pool?: (string | { name?: string; key?: string })[]
  meta?: RuleMeta | null
}) {
  const t = useT()
  const hint = meta?.skill_hint || ''
  const maxSkills = Number(meta?.max_skills || 0)
  const pointTotal = Number(meta?.skill_point_total || 0)
  const maxValue = Number(meta?.max_skill_value || 0)
  const filled = skills.filter((skill) => skill.name?.trim())
  const spent = filled.reduce((sum, skill) => sum + (Number(skill.value) || 0), 0)
  const overLimit = Boolean(
    (maxSkills && filled.length > maxSkills)
    || (pointTotal && spent > pointTotal)
    || (maxValue && skills.some((skill) => (Number(skill.value) || 0) > maxValue)),
  )
  const poolNames = skillPoolNames(pool)
  const [openEffects, setOpenEffects] = React.useState<ReadonlySet<number>>(new Set())

  function toggleEffect(index: number) {
    setOpenEffects((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function update(index: number, patch: Partial<CharacterSkill>) {
    onChange(skills.map((skill, i) => (i === index ? { ...skill, ...patch } : skill)))
  }

  function addSkill(name = '') {
    onChange([...skills, { name, value: 20 }])
  }

  return (
    <View className="gap-2">
      {hint ? <Text variant="small" className="text-muted-foreground">{hint}</Text> : null}
      {maxSkills || pointTotal || maxValue ? (
        <Text variant="small" className={overLimit ? 'font-medium text-destructive' : 'text-muted-foreground'}>
          {[
            maxSkills ? t('dfCharacterCardSkillCount', { filled: filled.length, max: maxSkills }) : '',
            pointTotal ? t('dfCharacterCardSkillPoints', { spent, total: pointTotal }) : '',
            maxValue ? t('dfCharacterCardSkillMaxValue', { max: maxValue }) : '',
          ].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {skills.map((skill, index) => {
        const hasEffect = Boolean(skill.effect?.trim())
        const effectOpen = openEffects.has(index) || hasEffect
        return (
          <View key={index} className="gap-1.5">
            <View className="flex-row items-center gap-2">
              <Input
                value={skill.name}
                onChangeText={(name) => update(index, { name })}
                placeholder={t('dfCharacterCardSkillName')}
                className="flex-1"
              />
              <Input
                value={String(skill.value ?? 0)}
                onChangeText={(text) => update(index, { value: Number(text) || 0 })}
                inputMode="numeric"
                className="w-16 text-center"
              />
              <Pressable
                onPress={() => toggleEffect(index)}
                className="rounded-md p-1.5"
                accessibilityLabel={t('skillEffect')}
                accessibilityState={{ expanded: effectOpen }}
              >
                <Icon
                  as={MessageSquareText}
                  size={16}
                  className={cn(hasEffect ? 'text-primary' : 'text-muted-foreground')}
                />
              </Pressable>
              <Pressable
                onPress={() => onChange(skills.filter((_, i) => i !== index))}
                className="rounded-md p-1.5"
                accessibilityLabel={t('dfCommonDelete')}
              >
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            </View>
            {effectOpen ? (
              <Textarea
                value={skill.effect ?? ''}
                onChangeText={(effect) => update(index, { effect })}
                placeholder={t('skillEffectPlaceholder')}
                maxLength={SKILL_EFFECT_MAX_CHARS}
                accessibilityLabel={t('skillEffect')}
                className="min-h-16"
              />
            ) : null}
          </View>
        )
      })}
      <Pressable
        onPress={() => addSkill()}
        className="self-start rounded-full border border-dashed border-border px-3 py-1.5"
      >
        <View className="flex-row items-center gap-1">
          <Icon as={Plus} size={14} />
          <Text variant="small">{t('dfCharacterCardAddSkill')}</Text>
        </View>
      </Pressable>
      {poolNames.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {poolNames.map((name) => (
            <Pressable
              key={name}
              onPress={() => addSkill(name)}
              className="rounded-full border border-border px-2.5 py-1"
            >
              <Text variant="small" className="text-muted-foreground">{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}
