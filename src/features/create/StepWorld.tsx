import * as React from 'react'
import { Pressable, View } from 'react-native'

import { Input } from '@/components/ui/input'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import type { AdventureSummary, RuleSummary, WorldSummary, WorldTemplateSummary } from '@/api/types'
import { Field } from '@/features/create/field'
import { activeRuleIdOf, type CreateFormState, type LoreChoice } from '@/features/create/payload'
import { useT } from '@/i18n/t'
import { cn } from '@/lib/utils'

const BUILTIN_LOREBOOK = '__builtin__'
const BLANK_LOREBOOK = '__blank__'
const COPY_PREFIX = 'copy:'

/** 模板/世界显示名的语言标签（对齐 Web worldLanguageLabel） */
function worldLanguageLabel(world: WorldTemplateSummary | WorldSummary, t: ReturnType<typeof useT>): string {
  const language = String(world.active_locale || world.language || '').toLowerCase()
  if (language.startsWith('ja')) return '日本語'
  if (language.startsWith('en')) return t('english')
  return t('chinese')
}

/** 世界书复制源按游戏语言过滤（对齐 Web filterByContentLanguage） */
function filterByLanguage(worlds: WorldSummary[], language: string): WorldSummary[] {
  return worlds.filter((world) => {
    const locale = String(world.active_locale || world.language || '').toLowerCase()
    if (!locale) return true
    return locale.startsWith(language.split('-')[0])
  })
}

/** 推荐规则摘要：按模板 recommended_rules 顺序映射，缺失项忽略（对齐上游同名工具） */
export function recommendedRuleSummaries(
  template: WorldTemplateSummary | undefined,
  rules: RuleSummary[],
): RuleSummary[] {
  const ids = template?.recommended_rules
  if (!Array.isArray(ids)) return []
  const seen = new Set<string>()
  const result: RuleSummary[] = []
  for (const id of ids) {
    const ruleId = String(id || '').trim()
    if (!ruleId || seen.has(ruleId)) continue
    const found = rules.find((item) => item.rule_id === ruleId)
    if (found) {
      seen.add(ruleId)
      result.push(found)
    }
  }
  return result
}

/** 第 1 步：世界与规则（内容来源三选、模板/自定义/AI、世界书来源、冒险包、背景补充） */
export function StepWorld({
  state,
  patch,
  worlds,
  rules,
  loreWorlds,
  adventures,
  showAdventurePackages,
}: {
  state: CreateFormState
  patch: (partial: Partial<CreateFormState>) => void
  worlds: WorldTemplateSummary[]
  rules: RuleSummary[]
  loreWorlds: WorldSummary[]
  adventures: AdventureSummary[]
  showAdventurePackages: boolean
}) {
  const t = useT()
  const worldIdOf = (w: WorldTemplateSummary | WorldSummary) => String(w.world_id || w.id || '')
  const nameOf = (w: WorldTemplateSummary | WorldSummary) => String(w.world_name || w.name || w.id || '')
  const currentWorld = worlds.find((w) => worldIdOf(w) === state.worldId)
  const activeRuleId = activeRuleIdOf(state)
  const seedActive = !!state.seed.trim()

  const worldOptions = worlds.map((w) => ({
    value: worldIdOf(w),
    label: `${nameOf(w)} · ${worldLanguageLabel(w, t)}`,
  }))
  const ruleOptions = rules.map((r) => ({ value: r.rule_id, label: r.rule_name || r.rule_id }))
  const recommended = recommendedRuleSummaries(currentWorld, rules)

  const loreWorldOptions = [
    { value: BUILTIN_LOREBOOK, label: t('builtinLorebook') },
    { value: BLANK_LOREBOOK, label: t('blankLorebook') },
    ...filterByLanguage(loreWorlds, state.gameLanguage).map((w) => ({
      value: `${COPY_PREFIX}${worldIdOf(w)}`,
      label: `${t('copyFrom')}${nameOf(w)} · ${worldLanguageLabel(w, t)}`,
    })),
  ]

  const selectedAdventure = adventures.find((item) => item.adventure_id === state.adventureId)
  const adventureOptions = [
    { value: '', label: t('dfCreateStandardFreePlay') },
    ...adventures.map((item) => ({
      value: item.adventure_id,
      label: `${item.name} · ${item.estimated_minutes} ${t('dfCreateMinutes')}${item.compatibility !== 'compatible' ? t('dfCreateAdventureRequiresWorld') : ''}`,
      disabled: item.compatibility !== 'compatible',
    })),
  ]

  const modeCards: { key: CreateFormState['mode']; labelKey: 'modeTemplate' | 'modeCustom' | 'modeAi' }[] = [
    { key: 'template', labelKey: 'modeTemplate' },
    { key: 'custom', labelKey: 'modeCustom' },
    { key: 'ai', labelKey: 'modeAi' },
  ]

  return (
    <View className="gap-4">
      <Field label={t('gameLanguage')} hint={t('gameLanguageHint')}>
        <SheetSelect
          options={[
            { value: 'zh-CN', label: t('chinese') },
            { value: 'en', label: t('english') },
          ]}
          value={state.gameLanguage}
          onValueChange={(value) => patch({ gameLanguage: value as CreateFormState['gameLanguage'] })}
        />
      </Field>

      <Field label={t('seedCode')} hint={t('restoreBySeed')}>
        <Input
          value={state.seed}
          onChangeText={(seed) => patch({ seed })}
          placeholder={t('seedPlaceholder')}
          autoCapitalize="none"
        />
      </Field>

      {!seedActive && (
        <>
          {/* 内容来源三选卡 */}
          <View className="flex-row gap-2">
            {modeCards.map((card) => {
              const active = state.mode === card.key
              return (
                <Pressable
                  key={card.key}
                  onPress={() => patch({ mode: card.key })}
                  className={cn(
                    'flex-1 items-center rounded-lg border py-3',
                    active ? 'border-primary bg-primary/10' : 'border-border bg-card',
                  )}
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    variant="small"
                    className={active ? 'font-semibold text-primary' : 'text-muted-foreground'}
                  >
                    {t(card.labelKey)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {state.mode === 'template' && (
            <>
              <Field label={t('worldTemplate')}>
                <SheetSelect
                  options={worldOptions}
                  value={state.worldId}
                  onValueChange={(worldId) => {
                    const next = worlds.find((w) => worldIdOf(w) === worldId)
                    patch({
                      worldId,
                      worldName: next ? nameOf(next) : '',
                      // 世界切换跟随默认规则（若在可用列表中）
                      ...(next?.default_rule && rules.some((r) => r.rule_id === next.default_rule)
                        ? { ruleId: next.default_rule }
                        : {}),
                    })
                  }}
                  placeholder={t('worldTemplate')}
                />
              </Field>

              <Field label={t('adventureName')}>
                <Input
                  value={state.name}
                  onChangeText={(name) => patch({ name })}
                  placeholder={t('useWorldName')}
                  autoCapitalize="none"
                />
              </Field>

              {recommended.length > 0 && (
                <Field label={t('recommendedRules')} hint={t('recommendedHint')}>
                  <View className="flex-row flex-wrap gap-2">
                    {recommended.map((rule) => {
                      const active = activeRuleId === rule.rule_id
                      const professional = rule.ruleset_runtime?.capabilities.character_builder === 'professional'
                      const dndAdvanced = rule.rule_id === 'dnd2024_srd' || rule.ruleset_runtime?.id === 'core:dnd2024'
                      return (
                        <Pressable
                          key={rule.rule_id}
                          onPress={() => patch({ ruleId: rule.rule_id })}
                          className={cn(
                            'min-w-[45%] flex-1 rounded-lg border p-2.5',
                            active ? 'border-primary bg-primary/10' : 'border-border bg-card',
                          )}
                          accessibilityState={{ selected: active }}
                        >
                          <Text variant="small" className="font-semibold">{rule.rule_name || rule.rule_id}</Text>
                          <View className="mt-1 flex-row flex-wrap gap-1">
                            <Text variant="small" className={cn('text-[10px]', professional ? 'text-primary' : 'text-muted-foreground')}>
                              {professional ? t('professional') : t('recommended')}
                            </Text>
                            {dndAdvanced ? (
                              <Text variant="small" className="text-[10px] text-muted-foreground">{t('dfCreateBeta')}</Text>
                            ) : null}
                          </View>
                          {rule.description ? (
                            <Text variant="small" className="mt-1 text-muted-foreground" numberOfLines={2}>
                              {rule.description}
                            </Text>
                          ) : null}
                        </Pressable>
                      )
                    })}
                  </View>
                </Field>
              )}
            </>
          )}

          {state.mode === 'custom' && (
            <>
              <Field label={t('customWorldName')}>
                <Input
                  value={state.customName}
                  onChangeText={(customName) => patch({ customName })}
                  placeholder={t('customWorldPlaceholder')}
                  autoCapitalize="none"
                />
              </Field>
              <Field label={t('worldDescription')}>
                <Textarea
                  value={state.customDesc}
                  onChangeText={(customDesc) => patch({ customDesc })}
                  placeholder={t('worldDescriptionPlaceholder')}
                  numberOfLines={4}
                />
              </Field>
            </>
          )}

          {state.mode === 'ai' && (
            <>
              <Field label={t('aiWorldDescription')}>
                <Textarea
                  value={state.aiPrompt}
                  onChangeText={(aiPrompt) => patch({ aiPrompt })}
                  placeholder={t('aiWorldPlaceholder')}
                  numberOfLines={5}
                />
              </Field>
              <Field label={t('baseRule')}>
                <SheetSelect
                  options={ruleOptions}
                  value={state.aiRuleId}
                  onValueChange={(aiRuleId) => patch({ aiRuleId })}
                  placeholder={t('baseRule')}
                />
              </Field>
              <View className="flex-row items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
                <Text variant="small" className="flex-1 pr-2">{t('aiRuleDraft')}</Text>
                <Switch checked={state.aiAutoRule} onCheckedChange={(aiAutoRule) => patch({ aiAutoRule })} />
              </View>
              {state.aiGeneratedRuleId ? (
                <Text variant="small" className="text-muted-foreground">
                  {t('generatedRule')}{state.aiGeneratedRuleId}{t('generatedRuleHint')}
                </Text>
              ) : null}
            </>
          )}

          {/* 自定义/AI 模式同样要选规则；AI 模式已在上方选母版规则，避免重复 */}
          {state.mode !== 'ai' && (
            <Field label={t('rule')}>
              <SheetSelect
                options={ruleOptions}
                value={activeRuleId}
                onValueChange={(ruleId) => patch({ ruleId })}
                placeholder={t('rule')}
              />
            </Field>
          )}

          <Field label={t('lorebookSource')}>
            <SheetSelect
              options={loreWorldOptions}
              value={state.loreChoice}
              onValueChange={(value) => patch({ loreChoice: value as LoreChoice })}
              placeholder={t('lorebookSource')}
            />
          </Field>

          {showAdventurePackages && (
            <Field
              label={t('dfCreateAdventureOptional')}
              hint={selectedAdventure?.summary || t('dfCreateAdventureHint')}
            >
              <SheetSelect
                options={adventureOptions}
                value={state.adventureId}
                onValueChange={(adventureId) => patch({ adventureId })}
                placeholder={t('dfCreateAdventureOptional')}
              />
              {selectedAdventure?.recommended_world_id ? (
                <Text variant="small" className="text-muted-foreground">
                  {t('dfCreateAdventureRecommendHint', { world: selectedAdventure.recommended_world_id })}
                </Text>
              ) : null}
            </Field>
          )}

          <Field label={t('extraBackground')}>
            <Textarea
              value={state.description}
              onChangeText={(description) => patch({ description })}
              placeholder={t('extraBackgroundPlaceholder')}
              numberOfLines={3}
            />
          </Field>
        </>
      )}
    </View>
  )
}
