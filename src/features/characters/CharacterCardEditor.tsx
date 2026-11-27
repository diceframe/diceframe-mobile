import * as React from 'react'
import { View } from 'react-native'

import { libraryAvatarSource } from '@/api/assets'
import { fetchCharacterSchema, fetchRuleLibrary } from '@/api/library'
import type {
  CharacterCard,
  CharacterPortrait,
  CharacterSchemaResponse,
  RulesResponse,
  RuleSummary,
} from '@/api/types'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { buildCardPatch, type CharacterCardPatch } from '@/lib/character-card'
import { characterCreationIssue, suggestedCreationAttributes, usesCreationAttributes } from '@/lib/character-creation'
import { editorSkillRows, type EditorSkillRow, type EditorSnapshot } from '@/lib/local-library/card-edit'
import {
  currencyAmountToInputText,
  currencyEditableUnitLabel,
  parseCurrencyInput,
} from '@/lib/currency'
import { contentLanguage, useT } from '@/i18n/t'
import { errorMessage } from '@/api/client'
import { CreationAttributesEditor } from './CreationAttributesEditor'
import { PortraitPickerSection } from './PortraitPickerSection'
import { SkillRowsEditor } from './SkillRowsEditor'

/**
 * 角色卡编辑/创建表单（复刻 Web 端共享卡编辑弹窗的字段集：
 * 名称、头像、出身身份、职业定位、技能、背景、初始金钱；新建时附规则绑定）。
 * 由父组件在抽屉打开时挂载，因此 state 初值即卡面初值，无需重置 effect。
 */
export function CharacterCardEditor({
  card,
  onSubmit,
  onClose,
  editing,
  gameRuleId,
  gameLanguage,
  ruleLibrarySource = fetchRuleLibrary,
  schemaSource = fetchCharacterSchema,
}: {
  card: CharacterCard | null
  /** snapshot = 原始表单状态（技能行带来源下标），本机编辑据此只写用户改过的字段 */
  onSubmit: (payload: CharacterCardPatch, snapshot: EditorSnapshot) => Promise<void>
  onClose: () => void
  /** 是否编辑已有卡；缺省按服务器卡的 id 判断（本机卡没有服务器 id，由调用方显式给出） */
  editing?: boolean
  /** 开局快速建卡用本局规则及内容语言，不可改绑；种子恢复时规则由种子决定。 */
  gameRuleId?: string
  gameLanguage?: ReturnType<typeof contentLanguage>
  /** 规则库 / 角色模板来源；本机库传带离线缓存的版本 */
  ruleLibrarySource?: () => Promise<RulesResponse>
  schemaSource?: (ruleId: string, language?: ReturnType<typeof contentLanguage>) => Promise<CharacterSchemaResponse>
}) {
  const t = useT()
  const isEditing = editing ?? Boolean(card?.card_id || card?.id)

  const [name, setName] = React.useState(card?.character_name ?? '')
  const [race, setRace] = React.useState(card?.race ?? '')
  const [klass, setKlass] = React.useState(card?.class ?? '')
  const [background, setBackground] = React.useState(card?.background ?? '')
  // 金额按可编辑单位输入（$0.25 输 "0.25"），canonical 整数与文本的换算统一走 lib/currency。
  // null = 用户还没动过输入框：规则 schema 是异步到的，此时初值跟着 currency_system 重算。
  const [goldInput, setGoldInput] = React.useState<string | null>(null)
  const [skills, setSkills] = React.useState<EditorSkillRow[]>(() => editorSkillRows(card?.skills))
  const [attributeDraft, setAttributeDraft] = React.useState<{ ruleId: string; values: Record<string, number> } | null>(null)
  const [portrait, setPortrait] = React.useState<CharacterPortrait | null>(card?.portrait ?? null)

  const [rules, setRules] = React.useState<RuleSummary[]>([])
  const [selectedRuleId, setRuleId] = React.useState(String(card?.rule_id || ''))
  const ruleId = gameRuleId ?? selectedRuleId
  const language = gameLanguage ?? contentLanguage()
  const [schema, setSchema] = React.useState<{ ruleId: string; language: string; data?: CharacterSchemaResponse; error?: string } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  // 新建时拉规则库供规则绑定选择（Web 新建卡需先选规则）；已有卡沿用其规则
  React.useEffect(() => {
    if (isEditing || gameRuleId) return
    let cancelled = false
    async function loadRules() {
      try {
        const result = await ruleLibrarySource()
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
  }, [isEditing, gameRuleId])

  // 规则变化时拉角色模式（技能池/上限提示），同 Web watch([ruleId])；
  // schema 带规则标记，展示侧按当前规则过滤，避免在 effect 里同步重置 state
  React.useEffect(() => {
    if (!ruleId) return
    let cancelled = false
    async function loadSchema() {
      try {
        const data = await schemaSource(ruleId, language)
        if (!cancelled) setSchema({ ruleId, language, data })
      } catch (cause) {
        if (!cancelled) setSchema({ ruleId, language, error: errorMessage(cause) })
      }
    }
    void loadSchema()
    return () => { cancelled = true }
  }, [ruleId, language])

  const currentSchema = schema?.ruleId === ruleId && schema.language === language ? schema : null
  const activeSchema = currentSchema?.data
  const meta = activeSchema?.rule_meta
  const supportsAttributes = usesCreationAttributes(activeSchema)
  const attributesChanged = supportsAttributes && attributeDraft?.ruleId === ruleId
  const attributes = attributesChanged ? attributeDraft.values
    : card ? card.attributes : supportsAttributes ? suggestedCreationAttributes(activeSchema) : undefined
  const writeAttributes = supportsAttributes && (!card || attributesChanged)
  // 已成长的库卡允许继续编辑，不用建卡限额覆盖成长；开局编辑与新建卡才校验技能预算。
  const issue = !isEditing || gameRuleId
    ? characterCreationIssue(activeSchema, { attributes, skills }, writeAttributes)
    : attributesChanged ? characterCreationIssue(activeSchema, { attributes }, true) : null
  const currencySystem = meta?.currency_system ?? null
  const goldText = goldInput
    ?? (card?.gold === undefined ? '' : currencyAmountToInputText(Number(card.gold), currencySystem))
  // 输入框的解析单位可能不是规则的顶层货币名（rate=3 会回退基础单位），标签必须跟着走。
  const goldUnit = currencyEditableUnitLabel(currencySystem)

  async function save() {
    if (issue) return
    // 空输入沿用旧行为记 0；其余交给 parser，换不出整数基础单位就报错，不静默改额。
    const gold = goldText.trim() ? parseCurrencyInput(goldText, currencySystem, { allowZero: true }) : 0
    if (gold === null) {
      setError(t('invalidAmount'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const patch = buildCardPatch({ character_name: name, race, class: klass, background, gold, skills, portrait,
        ...(writeAttributes ? { attributes } : {}),
      }, meta, attributes)
      if (!isEditing && !gameRuleId) {
        const rule = rules.find((item) => item.rule_id === ruleId)
        Object.assign(patch, {
          rule_id: ruleId,
          rule_name: String(meta?.rule_name || rule?.rule_name || ruleId),
          rule_version: String(meta?.rule_version || ''),
          mechanics: String(meta?.mechanics || ''),
          language,
        })
      }
      await onSubmit(patch, {
        character_name: name,
        race,
        class: klass,
        background,
        ...(goldInput !== null ? { gold } : {}),
        skills,
        portrait,
      })
      onClose()
    } catch (cause) {
      setError(errorMessage(cause))
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
          {isEditing || gameRuleId ? (
            <Text variant="small" className="text-muted-foreground">
              {String(meta?.rule_name || gameRuleId || card?.rule_name || card?.rule_id || '')}
            </Text>
          ) : (
            <Text variant="small" className="text-muted-foreground">{t('dfCharacterCardRuleHint')}</Text>
          )}
        </View>
      </View>

      {!isEditing && !gameRuleId && rules.length > 1 ? (
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

      {supportsAttributes ? (
        <CreationAttributesEditor schema={activeSchema} attributes={attributes ?? {}} disabled={saving}
          onChange={(values) => setAttributeDraft({ ruleId, values })} />
      ) : null}

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">{t('dfCharacterCardSkills')}</Text>
        <SkillRowsEditor
          skills={skills}
          onChange={setSkills}
          pool={activeSchema?.skill_pool}
          meta={meta}
          attributes={attributes}
          disabled={saving}
        />
        {currentSchema?.error ? <Text variant="small" className="text-muted-foreground">{currentSchema.error}</Text> : null}
      </View>

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">{t('dfCharacterCardBackground')}</Text>
        <Textarea value={background} onChangeText={setBackground} placeholder={t('dfCharacterCardBackgroundPlaceholder')} className="min-h-24" />
      </View>

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">
          {goldUnit ? `${t('dfCharacterCardGold')}（${goldUnit}）` : t('dfCharacterCardGold')}
        </Text>
        <Input
          value={goldText}
          onChangeText={setGoldInput}
          inputMode="decimal"
          placeholder={currencyAmountToInputText(30, currencySystem)}
        />
      </View>

      {issue || error ? <Text variant="small" className="text-destructive">{issue ? t(issue) : error}</Text> : null}

      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onClose}><Text>{t('dfCommonCancel')}</Text></Button>
        <Button className="flex-1" disabled={saving || !!issue || (!!ruleId && !currentSchema)} onPress={() => void save()}>
          <Text>{saving ? t('dfCommonSaving') : t('dfCommonSave')}</Text>
        </Button>
      </View>
    </View>
  )
}
