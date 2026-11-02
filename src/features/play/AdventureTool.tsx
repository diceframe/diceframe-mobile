import * as React from 'react'
import { Pressable, View } from 'react-native'

import { fetchGameAdventure, submitAdventureIntent } from '@/api/adventure'
import { errorMessage } from '@/api/client'
import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import {
  adventureAttention,
  adventureNodeActions,
  adventureNodeIntent,
  adventureNodeLabel,
  adventureSections,
  type AdventureGraph,
  type AdventureIntent,
  type AdventureNode,
  type AdventureView,
} from '@/lib/adventure'
import { useGameStore } from '@/stores/game'

const NODE_KIND_KEYS: Record<string, TKey> = {
  scene: 'adventureNode_scene',
  objective: 'adventureNode_objective',
  encounter: 'adventureNode_encounter',
  decision: 'adventureNode_decision',
  milestone: 'adventureNode_milestone',
  reference: 'adventureNode_reference',
  // 上游 Web 的节点类型表漏了 ending（直接显示英文原值），移动端补一个本地化标签
  ending: 'dfAdventureNodeEnding',
}

const UNAVAILABLE_KEYS: Record<string, TKey> = {
  binding_changed: 'adventurePanelReason_binding_changed',
  package_invalid: 'adventurePanelReason_package_invalid',
}

/**
 * 冒险面板（对齐上游 AdventurePanel）：只在对局绑定了冒险包时出现在行动区。
 * GM 确认节点完成、为多选一节点确认队伍路线、忽略 AI 完成建议；玩家为多选一节点提出路线。
 * 入口上 GM 看待处理数，玩家看自己的提议是否还在等 GM。
 */
export function AdventureTool({ gameKey, isGm }: { gameKey: string; isGm: boolean }) {
  const t = useT()
  // 对局每次刷新都换 detail 引用（含 SSE 广播的冒险指令），借此重取；与 CheckModesTool 同一模式
  const detail = useGameStore((s) => s.detail)
  const players = useGameStore((s) => s.players)
  const bound = !!detail?.adventure_binding?.adventure_id
  const [view, setView] = React.useState<AdventureView | null>(null)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  /** 正在提交的节点 / 建议 id；同一时间只允许一个指令 */
  const [pending, setPending] = React.useState('')
  const [open, setOpen] = React.useState(false)
  // 切局/卸载后丢弃迟到的响应
  const generation = React.useRef(0)

  function load() {
    const current = generation.current
    setLoading(true)
    return fetchGameAdventure(gameKey).then(
      (next) => {
        if (current !== generation.current) return
        setView(next)
        setError('')
      },
      (cause: unknown) => {
        if (current === generation.current) setError(errorMessage(cause))
      },
    ).finally(() => {
      if (current === generation.current) setLoading(false)
    })
  }

  React.useEffect(() => {
    if (!bound) return
    // 回调里才写 state（effect 内不能同步 setState）
    const current = generation.current
    fetchGameAdventure(gameKey).then(
      (next) => {
        if (current !== generation.current) return
        setView(next)
        setError('')
      },
      (cause: unknown) => {
        if (current === generation.current) setError(errorMessage(cause))
      },
    )
  }, [bound, gameKey, detail])

  React.useEffect(() => () => {
    generation.current += 1
  }, [])

  if (!bound) return null

  const attention = view ? adventureAttention(view, isGm) : { count: 0, ownPending: false, ended: false }

  async function submit(key: string, intent: AdventureIntent | null) {
    if (!intent || pending) return
    const current = generation.current
    setPending(key)
    setError('')
    try {
      await submitAdventureIntent(gameKey, intent)
      if (current !== generation.current) return
      await load()
      void useGameStore.getState().refresh()
    } catch (cause) {
      if (current === generation.current) setError(errorMessage(cause))
    } finally {
      if (current === generation.current) setPending('')
    }
  }

  function playerName(uid: string): string {
    return players.find((player) => player.user_id === uid)?.character_name || uid
  }

  function linkedNames(graph: AdventureGraph, ids: string[]): string {
    return ids.length ? ids.map((id) => adventureNodeLabel(graph, id)).join(' · ') : t('adventureNoLinkedNodes')
  }

  function renderNode(graph: AdventureGraph, node: AdventureNode) {
    const actions = adventureNodeActions(graph, node, isGm)
    const kindKey = NODE_KIND_KEYS[node.type]
    const busy = !!pending || loading
    return (
      <View
        key={node.id}
        className={`gap-1.5 rounded-lg border p-3 ${actions.active ? 'border-primary bg-primary/5' : 'border-border'}`}
      >
        <View className="flex-row items-start gap-2">
          <Text className="min-w-0 flex-1 font-semibold">{node.name || node.id}</Text>
          {actions.active ? <Text variant="small" className="text-primary">{t('dfAdventureNodeActive')}</Text> : null}
          {node.type ? (
            <Text variant="small" className="text-muted-foreground">{kindKey ? t(kindKey) : node.type}</Text>
          ) : null}
        </View>
        {node.description ? <Text variant="small" className="leading-5">{node.description}</Text> : null}
        {node.scene_ref ? <Text variant="small" className="text-muted-foreground">{t('adventureSceneRef', { ref: node.scene_ref })}</Text> : null}
        {node.encounter_ref ? (
          <Text variant="small" className="text-muted-foreground">{t('adventureEncounterRef', { ref: node.encounter_ref })}</Text>
        ) : null}
        {node.transitions.length ? (
          <Text variant="small" className="text-muted-foreground">
            {t('adventureNextNodes', { nodes: linkedNames(graph, node.transitions.map((item) => item.to)) })}
          </Text>
        ) : null}
        {actions.selectedLabel ? (
          <Text variant="small" className="font-semibold">{t('dfAdventureChoiceSelected', { label: actions.selectedLabel })}</Text>
        ) : null}
        {actions.choices.map((choice) => (
          <Button
            key={choice.choiceId}
            size="sm"
            className="self-start"
            disabled={busy}
            onPress={() => void submit(node.id, adventureNodeIntent(node.id, isGm, choice.choiceId))}
          >
            <Text>{t(isGm ? 'dfAdventureChoiceConfirm' : 'dfAdventureChoiceRequest', { label: choice.label })}</Text>
          </Button>
        ))}
        {actions.requests.length ? (
          isGm ? (
            <View className="gap-0.5">
              <Text variant="small" className="text-muted-foreground">{t('dfAdventureChoiceRequests')}</Text>
              {actions.requests.map((request) => (
                <Text key={request.actorUid} variant="small">{playerName(request.actorUid)}: {request.label}</Text>
              ))}
            </View>
          ) : (
            <Text variant="small" className="text-warning">{t('dfAdventureChoicePending')}</Text>
          )
        ) : null}
        {actions.canComplete ? (
          <Button
            size="sm"
            className="self-start"
            disabled={busy}
            onPress={() => void submit(node.id, adventureNodeIntent(node.id, true))}
          >
            <Text>{t('adventureCompleteNode')}</Text>
          </Button>
        ) : null}
      </View>
    )
  }

  function renderGraph(graph: AdventureGraph) {
    const suggestions = isGm ? graph.progress.completion_suggestions : []
    const ending = graph.progress.ending_node_id
    return (
      <>
        {graph.progress.ended ? (
          <View className="rounded-lg border border-border bg-muted/40 p-3">
            <Text className="font-semibold">
              {ending ? t('dfAdventureEndedAt', { node: adventureNodeLabel(graph, ending) }) : t('dfAdventureEnded')}
            </Text>
          </View>
        ) : null}
        {suggestions.length ? (
          <View className="gap-2">
            <Text className="font-semibold">{t('adventureSuggestionsTitle', { count: suggestions.length })}</Text>
            {suggestions.map((suggestion) => (
              <View key={suggestion.proposal_id} className="gap-1 rounded-lg border border-warning bg-warning/10 p-3">
                <View className="flex-row items-start gap-2">
                  <Text className="min-w-0 flex-1 font-semibold">{adventureNodeLabel(graph, suggestion.node_id)}</Text>
                  <Text variant="small" className="text-warning">{t('adventureSuggestionNeedsReview')}</Text>
                </View>
                <Text variant="small" className="leading-5">{suggestion.reason}</Text>
                {suggestion.evidence_rounds.length ? (
                  <Text variant="small" className="text-muted-foreground">
                    {t('adventureSuggestionEvidence', {
                      rounds: suggestion.evidence_rounds.map((round) => t('roundLabel', { round })).join(' · '),
                    })}
                  </Text>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  disabled={!!pending || loading}
                  onPress={() => void submit(suggestion.proposal_id, {
                    type: 'adventure.completion_suggestion.dismiss',
                    proposal_id: suggestion.proposal_id,
                  })}
                >
                  <Text>{pending === suggestion.proposal_id ? t('adventureSuggestionIgnoring') : t('adventureSuggestionIgnore')}</Text>
                </Button>
              </View>
            ))}
          </View>
        ) : null}
        {adventureSections(graph).map((section) => (
          <View key={section.id ?? '__ungrouped'} className="gap-2">
            <Text className="font-semibold">{section.id === null ? t('adventureUnsortedNodes') : section.name || section.id}</Text>
            {section.nodes.map((node) => renderNode(graph, node))}
          </View>
        ))}
        {graph.objectives.length || graph.milestones.length ? (
          <View className="gap-1">
            <Text className="font-semibold">{t('adventureGoals')}</Text>
            {[...graph.objectives, ...graph.milestones].map((goal) => (
              <Text key={goal.id} variant="small">
                <Text variant="small" className="font-semibold">{goal.name || goal.id}</Text>
                {` — ${linkedNames(graph, goal.node_ids)}`}
              </Text>
            ))}
          </View>
        ) : null}
      </>
    )
  }

  function renderBody() {
    if (!view) return <Text variant="muted">{error || t('adventurePanelLoading')}</Text>
    if (view.kind === 'none') {
      return (
        <>
          <Text variant="muted">{t('adventurePanelNone')}</Text>
          <Text variant="muted">{t('adventurePanelFreeformHint')}</Text>
        </>
      )
    }
    if (view.kind === 'unavailable') {
      return (
        <>
          <Text className="text-destructive">{t('adventurePanelUnavailable')}</Text>
          <Text variant="muted">{t(UNAVAILABLE_KEYS[view.reason] ?? 'adventurePanelReason_package_unavailable')}</Text>
          <Text variant="small" className="text-muted-foreground">
            {t('adventureRecoveryRequired', { adventure: view.binding.adventure_id || '', version: view.binding.version || '' })}
          </Text>
          <Text variant="small" className="text-muted-foreground">{t('dfAdventureRecoveryHint')}</Text>
        </>
      )
    }
    if (view.kind === 'legacy') return <Text variant="muted">{t('adventurePanelLegacy')}</Text>
    return renderGraph(view.graph)
  }

  return (
    <>
      <Pressable
        onPress={() => {
          setOpen(true)
          void load()
        }}
        className="flex-row items-center gap-1 self-start rounded-full border border-border px-2.5 py-1 active:bg-accent"
        accessibilityRole="button"
        accessibilityLabel={attention.count
          ? t('adventureSuggestionBadgeLabel', { count: attention.count })
          : t('adventurePanelTitle')}
      >
        <Text variant="small" className="text-muted-foreground">{t('adventurePanelTitle')}</Text>
        {attention.count ? (
          <View className="min-w-5 items-center rounded-full bg-primary px-1.5">
            <Text variant="small" className="font-semibold text-primary-foreground">{attention.count}</Text>
          </View>
        ) : attention.ownPending ? (
          <Text variant="small" className="text-warning">{t('dfModePending')}</Text>
        ) : attention.ended ? (
          <Text variant="small" className="text-muted-foreground">{t('dfAdventureEndedBadge')}</Text>
        ) : null}
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} scrollable>
        <View className="gap-3 pb-2">
          <View className="flex-row items-center gap-2">
            <View className="min-w-0 flex-1">
              <Text variant="small" className="text-muted-foreground">
                {isGm ? t('adventureGmEyebrow') : t('adventurePlayerEyebrow')}
              </Text>
              <Text variant="h4">{t('adventurePanelTitle')}</Text>
            </View>
            <Button size="sm" variant="outline" disabled={loading || !!pending} onPress={() => void load()}>
              <Text>{t('refresh')}</Text>
            </Button>
          </View>
          {view?.kind === 'graph' && view.binding.adventure_id ? (
            <Text variant="small" className="text-muted-foreground">
              {view.binding.adventure_id}{view.binding.version ? ` · ${view.binding.version}` : ''}
            </Text>
          ) : null}
          {error && view ? <Text variant="small" className="text-destructive" accessibilityRole="alert">{error}</Text> : null}
          {renderBody()}
        </View>
      </Sheet>
    </>
  )
}
