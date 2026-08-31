import * as React from 'react'
import { View } from 'react-native'

import { SceneCover } from '@/components/patterns/scene-cover'
import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import type { RuleSummary, SceneImageRef, WorldTemplateSummary } from '@/api/types'
import { worldCoverSource } from '@/api/assets'
import { activeRuleIdOf, type CreateFormState } from '@/features/create/payload'
import { useT } from '@/i18n/t'

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <Text variant="small" className="text-muted-foreground">{label}</Text>
      <Text variant="small" className="flex-1 text-right font-semibold" numberOfLines={2}>{value}</Text>
    </View>
  )
}

/** 第 4 步：确认摘要（对齐 Web create-confirm 区块） */
export function StepConfirm({
  state,
  worlds,
  rules,
  showAdventurePackages,
  supportsAdvancementPolicy,
  adventures,
  defaultSceneImage,
  fallbackRuleId,
}: {
  state: CreateFormState
  worlds: WorldTemplateSummary[]
  rules: RuleSummary[]
  showAdventurePackages: boolean
  supportsAdvancementPolicy: boolean
  adventures: { adventure_id: string; name: string }[]
  defaultSceneImage?: SceneImageRef | null
  fallbackRuleId?: string
}) {
  const t = useT()
  const seedActive = !!state.seed.trim()
  const activeRuleId = activeRuleIdOf(state)
  const activeRule = rules.find((r) => r.rule_id === activeRuleId)

  const currentWorld = worlds.find((w) => String(w.world_id || w.id || '') === state.worldId)
  const worldName = String(currentWorld?.world_name || currentWorld?.name || state.worldId)

  const confirmationName = seedActive
    ? t('restoreBySeed')
    : state.mode === 'template'
      ? state.name.trim() || worldName || t('modeTemplate')
      : state.mode === 'custom'
        ? state.customName.trim() || t('modeCustom')
        : state.aiWorldName || t('modeAi')

  const confirmationWorld = seedActive
    ? t('restoreBySeed')
    : state.mode === 'template'
      ? worldName
      : state.mode === 'custom'
        ? state.customName.trim() || t('modeCustom')
        : state.aiWorldName || t('dfCreateAiWorldFallback')

  const selectedAdventure = adventures.find((item) => item.adventure_id === state.adventureId)
  const difficultyLabel = state.difficulty === '轻松' ? t('easy') : state.difficulty === '硬核' ? t('hardcore') : t('normal')

  return (
    <View className="gap-4">
      {/* 封面预览：默认场景图回退所选规则内置场景 */}
      <View className="h-40 justify-end overflow-hidden rounded-xl border border-border p-4">
        <SceneCover
          source={worldCoverSource(state.sceneImage ?? defaultSceneImage, fallbackRuleId)}
          className="absolute inset-0"
          accessibilityLabel={confirmationName}
        />
        <Text className="text-lg font-semibold text-white">{confirmationName}</Text>
      </View>

      <View className="rounded-lg border border-border bg-card px-3">
        <SummaryRow label={t('world')} value={confirmationWorld} />
        {!seedActive && (
          <SummaryRow label={t('rule')} value={activeRule?.rule_name || activeRuleId} />
        )}
        {showAdventurePackages && (
          <SummaryRow label={t('dfCreateAdventureMode')} value={selectedAdventure?.name || t('dfCreateStandardFreePlay')} />
        )}
        <SummaryRow
          label={t('narrativePerspective')}
          value={state.narrativePerspective === 'immersive' ? t('narrativeImmersive') : t('narrativeThirdPerson')}
        />
        {!seedActive && supportsAdvancementPolicy && (
          <SummaryRow
            label={t('advancementMode')}
            value={`${state.advancementMode === 'milestone' ? t('advancementMilestone') : t('advancementXp')} · ${state.advancementAuthority === 'ai_gm' ? t('advancementAiGm') : t('advancementHumanGm')}`}
          />
        )}
        {!seedActive && <SummaryRow label={t('difficulty')} value={difficultyLabel} />}
        <SummaryRow label={t('gameMode')} value={state.solo ? t('solo') : t('multiplayer')} />
        <SummaryRow label={t('charactersCount')} value={String(state.players.length)} />
      </View>

      <View className="flex-row flex-wrap gap-1.5">
        {state.players.map((player, index) => (
          <Badge key={`${player.character_name}-${index}`} variant="outline" className="max-w-full px-2 py-1">
            <Text className="shrink text-xs" numberOfLines={1}>{player.character_name}</Text>
          </Badge>
        ))}
      </View>
    </View>
  )
}
