import * as React from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { FadeIn, FadeInDown } from 'react-native-reanimated'
import { ScrollText } from 'lucide-react-native'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view'
import { Skeleton } from '@/components/ui/skeleton'
import { Text } from '@/components/ui/text'
import type { CheckResult, LogEntry, Player, PublicAction } from '@/api/types'
import { useT } from '@/i18n/t'

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
  const t = useT()
  return (
    <NativeOnlyAnimatedView entering={FadeInDown.duration(250)}>
      <Card className="gap-2 border-warning p-4">
        <Text className="font-semibold">
          {t('dfPlayLuckCheckTitle', { label: check.label || check.skill || '' })}
        </Text>
        <Text variant="muted">
          {t('dfPlayLuckDecisionBody', {
            roll: check.roll ?? '?',
            verdict: check.original_verdict || check.verdict || '',
            cost: check.luck_cost ?? '?',
          })}
        </Text>
        <View className="flex-row gap-2">
          <Button
            size="sm"
            disabled={busy}
            onPress={() => onDecide(check, true)}
          >
            <Text>{t('dfPlayLuckSpend')}</Text>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onPress={() => onDecide(check, false)}
          >
            <Text>{t('dfPlayLuckDecline')}</Text>
          </Button>
        </View>
      </Card>
    </NativeOnlyAnimatedView>
  )
}

export function GameTimeline({
  gameKey,
  log,
  players,
  currentUserId,
  loading,
  loadingOlder,
  logPage,
  logTotalPages,
  pendingLuck,
  luckBusy,
  liveNarration,
  gmThinking,
  submittedActions,
  ttsEnabled,
  isGm,
  onLoadOlder,
  onDecideLuck,
  onSpeak,
  onSwipeTo,
  onReroll,
}: {
  gameKey: string
  log: LogEntry[]
  players: Player[]
  currentUserId: string
  loading: boolean
  loadingOlder: boolean
  logPage: number
  logTotalPages: number
  pendingLuck: CheckResult[]
  luckBusy: boolean
  liveNarration: string
  gmThinking: boolean
  submittedActions: PublicAction[]
  ttsEnabled: boolean
  isGm?: boolean
  onLoadOlder: () => void
  onDecideLuck: (check: CheckResult, spend: boolean) => void
  onSpeak: (text: string) => void
  onSwipeTo?: (round: number, swipeIndex: number) => Promise<void>
  onReroll?: (round: number) => Promise<void>
}) {
  const t = useT()
  const hasOlder = logPage < logTotalPages
  const liveIdle = !gmThinking && submittedActions.length === 0 && pendingLuck.length === 0

  // inverted 列表：视觉上的头部（列表 Footer）放"加载更早"，尾部（列表 Header）放实时区
  const footer = hasOlder ? (
    <Pressable
      onPress={onLoadOlder}
      disabled={loadingOlder}
      className="items-center py-3 active:opacity-70"
    >
      {loadingOlder ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" className="text-muted-foreground" />
          <Text className="text-muted-foreground">{t('dfPlayLoadMore')}</Text>
        </View>
      ) : (
        <Text className="text-muted-foreground">{t('dfPlayLoadMore')}</Text>
      )}
    </Pressable>
  ) : null

  const header = (
    <View className="gap-3 px-4 pb-3">
      {/* 空时间线：冒险尚未开幕时的引导卡 */}
      {!loading && log.length === 0 && liveIdle ? (
        <View className="items-center gap-3 py-10">
          <View className="h-16 w-16 items-center justify-center rounded-full border border-dashed border-border bg-muted/50">
            <Icon as={ScrollText} size={26} className="text-muted-foreground" />
          </View>
          <View className="items-center gap-1">
            <Text className="font-semibold">{t('adventureNotStarted')}</Text>
            <Text variant="muted" className="text-center">
              {t('firstActionHint')}
            </Text>
          </View>
        </View>
      ) : null}

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
          <NativeOnlyAnimatedView
            key={action.user_id + action.text}
            entering={FadeIn.duration(200)}
            className={mine ? 'flex-row-reverse items-center gap-2 opacity-70' : 'flex-row items-center gap-2 opacity-70'}
          >
            <Avatar alt={action.character_name || action.user_id} className="h-8 w-8">
              <AvatarFallback>
                <Text>{(action.character_name || action.user_id || '?').trim().charAt(0).toUpperCase()}</Text>
              </AvatarFallback>
            </Avatar>
            <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
              <Text variant="small">
                {action.character_name || action.user_id} · {t('dfPlaySubmitting')}
              </Text>
              <Text numberOfLines={2}>{action.text}</Text>
            </View>
          </NativeOnlyAnimatedView>
        )
      })}

      {gmThinking ? (
        <NativeOnlyAnimatedView entering={FadeIn.duration(200)}>
          <Card className="gap-0 p-4">
            <Text variant="small" className="mb-1.5 text-muted-foreground">
              {t('dfPlayGmThinking')}
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
        </NativeOnlyAnimatedView>
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
        <NativeOnlyAnimatedView entering={FadeIn.duration(220)}>
          <TimelineItem
            entry={item}
            players={players}
            gameKey={gameKey}
            currentUserId={currentUserId}
            ttsEnabled={ttsEnabled}
            onSpeak={onSpeak}
            isGm={isGm}
            onSwipeTo={onSwipeTo}
            onReroll={onReroll}
          />
        </NativeOnlyAnimatedView>
      )}
      ListFooterComponent={footer}
      ListHeaderComponent={header}
      contentContainerClassName="pb-3"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  )
}
