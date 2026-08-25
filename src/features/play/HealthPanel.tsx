import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { Check, X } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { GameDetail, HealthEvent, HealthResponse } from '@/api/types'
import { strings } from '@/lib/strings'

function stateLabel(state?: string): string {
  const labels: Record<string, string> = {
    active_action: '行动阶段',
    active_judgment: 'GM 思考中',
    paused: '已暂停',
    waiting: '等待行动',
    created: '创建中',
    ended: '已结束',
  }
  return (state && labels[state]) || state || '未知'
}

function HealthEventCard({
  event,
  onResolve,
}: {
  event: HealthEvent
  onResolve: (id: string, action: 'resolve' | 'ignore') => void
}) {
  return (
    <View className="rounded-md border border-border bg-muted p-3 gap-2">
      <Text className="text-sm font-medium">{event.title || event.message || event.code}</Text>
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={() => onResolve(event.id, 'resolve')}>
          <Icon as={Check} size={12} />
          <Text variant="small">{strings.play.resolved}</Text>
        </Button>
        <Button size="sm" variant="ghost" onPress={() => onResolve(event.id, 'ignore')}>
          <Icon as={X} size={12} />
          <Text variant="small">{strings.play.ignore}</Text>
        </Button>
      </View>
    </View>
  )
}

/**
 * 系统健康面板（对齐 Web HealthPanel：状态标签 + 待处理事件 + GM 修复记录）。
 */
export function HealthPanel({
  health,
  detail,
  isGm,
  onResolve,
}: {
  health?: HealthResponse | null
  detail?: GameDetail | null
  isGm: boolean
  onResolve: (id: string, action: 'resolve' | 'ignore') => void
}) {
  const events = health?.events ?? []
  const active = events.filter((e) => !e.resolved && !e.ignored)
  const history = events.filter((e) => e.resolved || e.ignored).slice(-5).reverse()

  // 非 GM 且非单人模式时不显示
  if (!isGm && !detail?.solo_mode) {
    return null
  }

  const visible = isGm || detail?.solo_mode

  if (!visible) return null

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-6">
      {/* 状态标签 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          状态
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <View className="rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{strings.play.round}</Text>
            <Text className="font-mono font-semibold">{detail?.round_number ?? 0}</Text>
          </View>
          <View className="rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{strings.play.phase}</Text>
            <Text className="font-semibold">{stateLabel(detail?.state)}</Text>
          </View>
          <View className="rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{strings.play.players}</Text>
            <Text className="font-mono font-semibold">
              {detail?.multiplayer?.player_count ?? 0}/{detail?.multiplayer?.max_players ?? 0}
            </Text>
          </View>
          {detail?.total_tokens != null && (
            <View className="rounded-md border border-border bg-muted px-3 py-2">
              <Text variant="small">Token</Text>
              <Text className="font-mono font-semibold">{detail.total_tokens}</Text>
            </View>
          )}
        </View>
      </View>

      <Separator />

      {/* 待处理事件 */}
      {active.length > 0 && (
        <View className="gap-2">
          <Text variant="small" className="font-semibold text-muted-foreground">
            {strings.play.unhandledIssues}
          </Text>
          {active.map((event) => (
            <HealthEventCard key={event.id} event={event} onResolve={onResolve} />
          ))}
        </View>
      )}

      {/* 历史记录 */}
      {history.length > 0 && (
        <View className="gap-2">
          <Text variant="small" className="font-semibold text-muted-foreground">
            最近记录
          </Text>
          {history.map((event) => (
            <View key={event.id} className="rounded-md border border-border bg-muted px-3 py-2">
              <Text variant="small" className="text-muted-foreground">
                {event.title || event.code || event.component}
              </Text>
            </View>
          ))}
        </View>
      )}

      {events.length === 0 && (
        <Text variant="muted" className="text-center">
          {strings.play.noHealthEvents}
        </Text>
      )}
    </ScrollView>
  )
}
