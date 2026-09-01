import * as React from 'react'
import { View } from 'react-native'

import { libraryAvatarSource } from '@/api/assets'
import { fetchCharacterSchema, fetchRuleLibrary } from '@/api/library'
import type { CharacterCard, CharacterPortrait, CharacterSkill, RuleMeta, RuleSummary, SkillSpec } from '@/api/types'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { buildCardPatch, normalizeSkillList, type CharacterCardPatch } from '@/lib/character-card'
import { useT } from '@/i18n/t'
import { PortraitPickerSection } from './PortraitPickerSection'
import { SkillRowsEditor } from './SkillRowsEditor'

interface RuleSchema {
  ruleId: string
  meta: RuleMeta | null
  pool: (string | SkillSpec)[]
}

/**
 * 角色卡编辑/创建表单（复刻 Web 端共享卡编辑弹窗的字段集：
 * 名称、头像、出身身份、职业定位、技能、背景、初始金钱；新建时附规则绑定）。
 * 由父组件在抽屉打开时挂载，因此 state 初值即卡面初值，无需重置 effect。
 */
export function CharacterCardEditor({
  card,
  onSubmit,
  onClose,
}: {
  card: CharacterCard | null
  onSubmit: (payload: CharacterCardPatch) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const isEditing = Boolean(card?.card_id || card?.id)

  const [name, setName] = React.useState(card?.character_name ?? '')
  const [race, setRace] = React.useState(card?.race ?? '')
  const [klass, setKlass] = React.useState(card?.class ?? '')
  const [background, setBackground] = React.useState(card?.background ?? '')
  const [gold, setGold] = React.useState(card?.gold === undefined ? '' : String(card.gold))
  const [skills, setSkills] = React.useState<CharacterSkill[]>(() => normalizeSkillList(card?.skills))
  const [portrait, setPortrait] = React.useState<CharacterPortrait | null>(card?.portrait ?? null)

  const [rules, setRules] = React.useState<RuleSummary[]>([])
  const [ruleId, setRuleId] = React.useState(String(card?.rule_id || ''))
  const [schema, setSchema] = React.useState<RuleSchema | null>(null)
  const [schemaError, setSchemaError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  // 新建时拉规则库供规则绑定选择（Web 新建卡需先选规则）；已有卡沿用其规则
  React.useEffect(() => {
    if (isEditing) return
    let cancelled = false
    async function loadRules() {
      try {
        const result = await fetchRuleLibrary()
        if (cancelled) return
        const list = result.rules ?? []
        setRules(list)
        setRuleId((current) => current || String(list[0]?.rule_id || ''))
      } catch {
        if (!cancelled) setRules([])
      }
    }
    void loadRules()
    return () => { cancelled = true }
  }, [isEditing])

  // 规则变化时拉角色模式（技能池/上限提示），同 Web watch([ruleId])；
  // schema 带规则标记，展示侧按当前规则过滤，避免在 effect 里同步重置 state
  React.useEffect(() => {
    if (!ruleId) return
    let cancelled = false
    async function loadSchema() {
      try {
        const result = await fetchCharacterSchema(ruleId)
        if (cancelled) return
        setSchemaError('')
        setSchema({
          ruleId,
          meta: result.rule_meta ?? null,
          pool: result.skill_pool ?? [],
        })
      } catch (cause) {
        if (cancelled) return
        setSchema(null)
        setSchemaError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    void loadSchema()
    return () => { cancelled = true }
  }, [ruleId])

  const activeSchema = schema?.ruleId === ruleId ? schema : null

  async function save() {
    setSaving(true)
    setError('')
    try {
      const patch = buildCardPatch({ character_name: name, race, class: klass, background, gold, skills, portrait })
      if (!isEditing) {
        const rule = rules.find((item) => item.rule_id === ruleId)
        Object.assign(patch, {
          rule_id: ruleId,
          rule_name: String(activeSchema?.meta?.rule_name || rule?.rule_name || ruleId),
          rule_version: String(activeSchema?.meta?.rule_version || ''),
          mechanics: String(activeSchema?.meta?.mechanics || ''),
          language: 'zh-CN',
        })
      }
      await onSubmit(patch)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <RemoteAvatar
          source={libraryAvatarSource(portrait)}
          name={name || '?'}
          className="h-11 w-11 rounded-full border border-border bg-muted"
        />
        <View className="flex-1">
          <Text variant="h3">{isEditing ? t('dfCharacterCardEditTitle') : t('dfCharacterCardCreateTitle')}</Text>
          {isEditing ? (
            <Text variant="small" className="text-muted-foreground">
              {String(activeSchema?.meta?.rule_name || card?.rule_name || card?.rule_id || '')}
            </Text>
          ) : (
            <Text variant="small" className="text-muted-foreground">{t('dfCharacterCardRuleHint')}</Text>
          )}
        </View>
      </View>

      {!isEditing && rules.length > 1 ? (
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold">{t('dfCharacterCardRule')}</Text>
          {/* 芯片排布在规则多时占满纵向空间，改用底部弹窗单选；ruleId 默认已指向第一条 */}
          <SheetSelect
            options={rules.map((rule) => ({
              value: rule.rule_id,
              label: String(rule.rule_name || rule.rule_id),
            }))}
            value={ruleId}
            onValueChange={setRuleId}
            placeholder={t('dfCharacterCardRule')}
          />
        </View>
      ) : null}

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">{t('dfCharacterCardName')}</Text>
        <Input value={name} onChangeText={setName} placeholder={t('dfCharacterCardName')} />
      </View>

      <PortraitPickerSection value={portrait} onChange={setPortrait} ruleId={ruleId} name={name} />

      <View className="flex-row gap-2">
        <View className="flex-1 gap-1.5">
          <Text variant="small" className="font-semibold">{t('dfCharacterCardRace')}</Text>
          <Input value={race} onChangeText={setRace} placeholder={t('dfCharacterCardRace')} />
        </View>
        <View className="flex-1 gap-1.5">
          <Text variant="small" className="font-semibold">{t('dfCharacterCardClass')}</Text>
          <Input value={klass} onChangeText={setKlass} placeholder={t('dfCharacterCardClass')} />
        </View>
      </View>

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">{t('dfCharacterCardSkills')}</Text>
        <SkillRowsEditor
          skills={skills}
          onChange={setSkills}
          pool={activeSchema?.pool ?? []}
          meta={activeSchema?.meta ?? null}
        />
        {schemaError ? <Text variant="small" className="text-muted-foreground">{schemaError}</Text> : null}
      </View>

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">{t('dfCharacterCardBackground')}</Text>
        <Textarea value={background} onChangeText={setBackground} placeholder={t('dfCharacterCardBackgroundPlaceholder')} className="min-h-24" />
      </View>

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">{t('dfCharacterCardGold')}</Text>
        <Input value={gold} onChangeText={setGold} inputMode="numeric" placeholder="30" />
      </View>

      {error ? <Text variant="small" className="text-destructive">{error}</Text> : null}

      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onClose}><Text>{t('dfCommonCancel')}</Text></Button>
        <Button className="flex-1" disabled={saving} onPress={() => void save()}>
          <Text>{saving ? t('dfCommonSaving') : t('dfCommonSave')}</Text>
        </Button>
      </View>
    </View>
  )
}
