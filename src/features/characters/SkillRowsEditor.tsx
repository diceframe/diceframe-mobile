import * as React from 'react'
import { Pressable, View } from 'react-native'
import { MessageSquareText, Plus, X } from 'lucide-react-native'

import type { CharacterSkill, RuleMeta } from '@/api/types'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/t'
import { updateSkillRow } from '@/lib/local-library/card-edit'
import { SKILL_EFFECT_MAX_CHARS, skillPoolNames } from '@/lib/character-card'
import { creationSkillValue, skillBaseValue, skillBudget, usesAboveBase } from '@/lib/character-creation'
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
  attributes,
  disabled,
}: {
  skills: CharacterSkill[]
  onChange: (skills: CharacterSkill[]) => void
  pool?: (string | { name?: string; key?: string })[]
  meta?: RuleMeta | null
  attributes?: Record<string, number>
  disabled?: boolean
}) {
  const t = useT()
  const hint = meta?.skill_hint || ''
  const { maxSkills, total, maxValue, count, spent, tooMany, overspent, outOfRange } = skillBudget(skills, meta, attributes)
  const aboveBase = usesAboveBase(meta)
  const poolNames = [...new Set(skillPoolNames(pool))]
  const [openEffects, setOpenEffects] = React.useState<ReadonlySet<number>>(new Set())

  function toggleEffect(index: number) {
    setOpenEffects((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  // 行必须用对象展开更新（updateSkillRow）：本机编辑靠行上的 SKILL_SOURCE（Symbol 键）对回
  // 存着的技能，经 JSON 或 structuredClone 拷贝会丢掉它，那一行就会被当成新增、丢掉未知字段。
  // 删除行用 filter 保留原对象，同理不要复制。
  function update(index: number, patch: Partial<CharacterSkill>) {
    onChange(updateSkillRow(skills, index, patch))
  }

  function addSkill(name = '') {
    onChange([...skills, { name }])
  }

  return (
    <View className="gap-2">
      {hint ? <Text variant="small" className="text-muted-foreground">{hint}</Text> : null}
      {maxSkills || total || maxValue ? (
        <Text variant="small" className={tooMany || overspent || outOfRange ? 'font-medium text-destructive' : 'text-muted-foreground'}>
          {[
            maxSkills ? t('dfCharacterCardSkillCount', { filled: count, max: maxSkills }) : '',
            total ? t('dfCharacterCardSkillPoints', { spent, total }) : '',
            maxValue ? t('dfCharacterCardSkillMaxValue', { max: maxValue }) : '',
          ].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {skills.map((skill, index) => {
        const hasEffect = Boolean(skill.effect?.trim())
        const effectOpen = openEffects.has(index) || hasEffect
        const base = aboveBase && skill.name?.trim() ? skillBaseValue(skill.name, meta, attributes) : null
        return (
          <View key={index} className="gap-1.5">
            <View className="flex-row items-center gap-2">
              <Input
                value={skill.name}
                onChangeText={(name) => update(index, { name })}
                placeholder={t('dfCharacterCardSkillName')}
                editable={!disabled}
                className="flex-1"
              />
              <Input
                value={skill.value === undefined ? '' : String(skill.value)}
                placeholder={String(creationSkillValue({ name: skill.name }, meta, attributes))}
                accessibilityLabel={t('dfCharacterCreationSkillValue')}
                onChangeText={(text) => {
                  if (/^\d*$/.test(text) && Number.isSafeInteger(Number(text))) {
                    update(index, { value: text ? Number(text) : undefined })
                  }
                }}
                editable={!disabled}
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
                disabled={disabled}
                onPress={() => {
                  onChange(skills.filter((_, i) => i !== index))
                  setOpenEffects((current) => new Set([...current].filter((i) => i !== index).map((i) => i > index ? i - 1 : i)))
                }}
                className="rounded-md p-1.5"
                accessibilityLabel={t('dfCommonDelete')}
              >
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            </View>
            {base !== null ? (
              <Text variant="small" className="text-muted-foreground">{t('dfCharacterCreationSkillBase', { base })}</Text>
            ) : null}
            {effectOpen ? (
              <Textarea
                value={skill.effect ?? ''}
                onChangeText={(effect) => update(index, { effect })}
                editable={!disabled}
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
        disabled={disabled}
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
              disabled={disabled}
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
