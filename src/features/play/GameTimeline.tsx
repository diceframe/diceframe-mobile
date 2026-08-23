import * as React from 'react'
import { FlatList, Pressable, View } from 'react-native'

import { Avatar } from '@/components/ui/avatar'
import { Button, ButtonText } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Text } from '@/components/ui/text'
import type { CheckResult, LogEntry, Player, PublicAction } from '@/api/types'
import { strings } from '@/lib/strings'

import { GmNarration } from './GmNarration'
import { TimelineItem } from './TimelineItem'

/** 运气决策卡（CoC 推骰） */
function LuckCard({
  check,
  busy,
  onDecide,
}: {
  check: CheckResult
  busy: boolean
  onDecide: (check: CheckResult, spend: boolean) => void
}) {
  return (
    <Card className="gap-2 border-warning p-4">
      <Text className="font-semibold">
        运气检定 · {check.label || check.skill || ''}
      </Text>
      <Text variant="muted">
        初始结果 {check.roll ?? '?'}（{check.original_verdict || check.verdict || ''}）。花费{' '}
        {check.luck_cost ?? '?'} 点运气重骰，或接受当前结果？
      </Text>
      <View className="flex-row gap-2">
        <Button
          size="sm"
          disabled={busy}
          onPress={() => onDecide(check, true)}
        >
          <ButtonText>{strings.play.luckSpend}</ButtonText>
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onPress={() => onDecide(check, false)}
        >
          <ButtonText className="text-foreground">{strings.play.luckDecline}</ButtonText>
        </Button>
      </View>
    </Card>
  )
}

export function GameTimeline({
  gameKey,
  log,
  players,
  currentUserId,
  loading,
  logPage,
  logTotalPages,
  pendingLuck,
  luckBusy,
  liveNarration,
  gmThinking,
  submittedActions,
  ttsEnabled,
  onLoadOlder,
  onDecideLuck,
  onSpeak,
}: {
  gameKey: string
  log: LogEntry[]
  players: Player[]
  currentUserId: string
  loading: boolean
  logPage: number
  logTotalPages: number
  pendingLuck: CheckResult[]
  luckBusy: boolean
  liveNarration: string
  gmThinking: boolean
  submittedActions: PublicAction[]
  ttsEnabled: boolean
  onLoadOlder: () => void
  onDecideLuck: (check: CheckResult, spend: boolean) => void
  onSpeak: (text: string) => void
}) {
  const hasOlder = logPage < logTotalPages

  // inverted 列表：视觉上的头部（列表 Footer）放"加载更早"，尾部（列表 Header）放实时区
  const footer = hasOlder ? (
    <Pressable onPress={onLoadOlder} className="items-center py-3">
      <Text className="text-muted-foreground">{strings.play.loadMore}</Text>
    </Pressable>
  ) : null

  const header = (
    <View className="gap-3 px-4 pb-3">
      {pendingLuck.map((check) => (
        <LuckCard
          key={check.check_id ?? check.label}
          check={check}
          busy={luckBusy}
          onDecide={onDecideLuck}
        />
      ))}

      {submittedActions.map((action) => {
        const mine = !!currentUserId && action.user_id === currentUserId
        return (
          <View
            key={action.user_id + action.text}
            className={mine ? 'flex-row-reverse items-center gap-2.5 opacity-70' : 'flex-row items-center gap-2.5 opacity-70'}
          >
            <Avatar name={action.character_name || action.user_id} className="h-8 w-8" />
            <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
              <Text variant="small">
                {action.character_name || action.user_id} · {strings.play.submitting}
              </Text>
              <Text numberOfLines={2}>{action.text}</Text>
            </View>
          </View>
        )
      })}

      {gmThinking ? (
        <Card className="gap-0 p-4">
          <Text variant="small" className="mb-1.5 text-muted-foreground">
            {strings.play.gmThinking}
          </Text>
          {liveNarration ? (
            <GmNarration text={liveNarration} />
          ) : (
            <View className="gap-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </View>
          )}
        </Card>
      ) : null}
    </View>
  )

  if (loading && log.length === 0) {
    return (
      <View className="flex-1 gap-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
      </View>
    )
  }

  // inverted FlatList 的 data[0] 渲染在屏幕底部（聊天模式：最新回合贴输入框）。
  // 服务端 log 是升序（旧→新），这里反转为降序（新→旧）再交给列表。
  // FlashList v2 移除了 inverted 支持，聊天场景先用核心 FlatList。
  return (
    <FlatList
      inverted
      data={[...log].reverse()}
      keyExtractor={(item, index) => String(item.round ?? index)}
      renderItem={({ item }) => (
        <TimelineItem
          entry={item}
          players={players}
          gameKey={gameKey}
          currentUserId={currentUserId}
          ttsEnabled={ttsEnabled}
          onSpeak={onSpeak}
        />
      )}
      ListFooterComponent={footer}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: 12 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  )
}
