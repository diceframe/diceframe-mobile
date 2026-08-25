import * as React from 'react'
import { ScrollView, View } from 'react-native'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { PlotDecision, PlotQuest, PlotRelation, PlotTracker as PlotTrackerData } from '@/api/types'

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          {title}
        </Text>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary">
            <Text>{count}</Text>
          </Badge>
        )}
      </View>
      {children}
    </View>
  )
}

function QuestCard({ quest }: { quest: PlotQuest }) {
  const isDone = quest.status === 'completed' || quest.status === 'failed'
  return (
    <View className="rounded-md border border-border bg-muted px-3 py-2">
      <Text className={`text-sm ${isDone ? 'text-muted-foreground line-through' : ''}`} numberOfLines={2}>
        {quest.title}
      </Text>
      {quest.progress ? (
        <Text variant="small" numberOfLines={1}>
          {quest.progress}
        </Text>
      ) : null}
    </View>
  )
}

function RelationItem({ relation }: { relation: PlotRelation }) {
  const tier = relation.tier ?? 'neutral'
  const tierLabel: Record<string, string> = {
    liked: '友好',
    friendly: '友善',
    neutral: '中立',
    unfriendly: '不友善',
    hostile: '敌对',
  }
  return (
    <View className="flex-row items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
      <Text className="flex-1 text-sm" numberOfLines={1}>
        {relation.npc_name}
      </Text>
      <Text variant="small">{tierLabel[tier] ?? tier}</Text>
    </View>
  )
}

function DecisionItem({ decision }: { decision: PlotDecision | string }) {
  const text = typeof decision === 'string'
    ? decision
    : decision.title || decision.summary || decision.description || ''
  const round = typeof decision === 'string' ? undefined : decision.round_number
  if (!text) return null
  return (
    <View className="rounded-md border border-border bg-muted px-3 py-2">
      <Text className="text-sm" numberOfLines={2}>
        {round ? `第 ${round} 回合 · ` : ''}{text}
      </Text>
    </View>
  )
}

/** 剧情追踪面板（对齐 Web GameSidebar 的 plot tracker 区块） */
export function PlotTracker({ data }: { data?: PlotTrackerData | null }) {
  const quests = Object.values(data?.quests ?? {})
  const relations = Object.values(data?.relations ?? {})
  const decisions = data?.decisions ?? []

  const activeQuests = quests.filter((q) => q.status === 'active')
  const doneQuests = quests.filter((q) => q.status === 'completed' || q.status === 'failed')
  const notableRelations = relations.filter((r) => r.tier && r.tier !== 'neutral')
  const recentDecisions = decisions.slice(-5).reverse()

  const hasContent = activeQuests.length > 0 || doneQuests.length > 0 || notableRelations.length > 0 || recentDecisions.length > 0

  if (!hasContent) {
    return (
      <Text variant="muted" className="text-center">
        暂无剧情记录
      </Text>
    )
  }

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-5 pb-8">
      {activeQuests.length > 0 && (
        <Section title="当前任务" count={activeQuests.length}>
          <View className="gap-2">
            {activeQuests.map((q, i) => (
              <QuestCard key={`aq-${i}`} quest={q} />
            ))}
          </View>
        </Section>
      )}

      {doneQuests.length > 0 && (
        <Section title="已完成" count={doneQuests.length}>
          <View className="gap-2">
            {doneQuests.map((q, i) => (
              <QuestCard key={`dq-${i}`} quest={q} />
            ))}
          </View>
        </Section>
      )}

      {notableRelations.length > 0 && (
        <Section title="NPC 关系" count={notableRelations.length}>
          <View className="gap-2">
            {notableRelations.map((r, i) => (
              <RelationItem key={`r-${i}`} relation={r} />
            ))}
          </View>
        </Section>
      )}

      {recentDecisions.length > 0 && (
        <Section title="关键决策" count={recentDecisions.length}>
          <View className="gap-2">
            {recentDecisions.map((d, i) => (
              <DecisionItem key={`d-${i}`} decision={d} />
            ))}
          </View>
        </Section>
      )}

      <Separator />
      <Text variant="small" className="text-center text-muted-foreground">
        剧情追踪由 GM 叙事自动更新
      </Text>
    </ScrollView>
  )
}
