import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { Check, X } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { GameDetail, HealthEvent, HealthResponse } from '@/api/types'
import { useT } from '@/i18n/t'
import type { TKey } from '@/i18n/keyset'

/**
 * 对局状态 → 文案 key：对局顶栏（play/[gameKey]）与本面板共用，
 * 映射与 lib/game-state 的中文硬编码版本一致。
 */
export const GAME_STATE_LABEL_KEYS: Record<string, TKey> = {
  setup: 'dfStateSetup',
  waiting: 'dfStateWaiting',
  action: 'dfStateAction',
  active_action: 'dfStateAction',
  resolving: 'dfStateResolving',
  active_judgment: 'dfStateJudging',
  paused: 'dfStatePaused',
  created: 'dfStateCreated',
  ended: 'dfStateEnded',
}

function HealthEventCard({
  event,
  onResolve,
}: {
  event: HealthEvent
  onResolve: (id: string, action: 'resolve' | 'ignore') => void
}) {
  const t = useT()
  return (
    <View className="rounded-md border border-border bg-muted p-3 gap-2">
      <Text className="text-sm font-medium">{event.title || event.message || event.code}</Text>
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={() => onResolve(event.id, 'resolve')}>
          <Icon as={Check} size={12} />
          <Text variant="small">{t('dfHealthResolved')}</Text>
        </Button>
        <Button size="sm" variant="ghost" onPress={() => onResolve(event.id, 'ignore')}>
          <Icon as={X} size={12} />
          <Text variant="small">{t('ignore')}</Text>
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
  const t = useT()

  // 状态标签原文回退：未知状态直接展示服务端原值（与旧版 stateLabel 行为一致）
  const stateLabelText = detail?.state
    ? GAME_STATE_LABEL_KEYS[detail.state]
      ? t(GAME_STATE_LABEL_KEYS[detail.state])
      : detail.state
    : t('dfPlayUnknown')

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
          {t('dfPlayStatus')}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <View className="rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{t('dfPlayRoundShort')}</Text>
            <Text className="font-mono font-semibold">{detail?.round_number ?? 0}</Text>
          </View>
          <View className="rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{t('phase')}</Text>
            <Text className="font-semibold">{stateLabelText}</Text>
          </View>
          <View className="rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{t('players')}</Text>
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
            {t('dfHealthIssues')}
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
            {t('dfHealthRecent')}
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
          {t('dfHealthNoEvents')}
        </Text>
      )}
    </ScrollView>
  )
}
