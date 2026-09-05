import * as React from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import { ArrowDown, ScrollText } from 'lucide-react-native'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view'
import { Skeleton } from '@/components/ui/skeleton'
import { Text } from '@/components/ui/text'
import type { CheckResult, LogEntry, Player, PublicAction } from '@/api/types'
import { useT } from '@/i18n/t'
import { canDecideLuckOf, checkKeyOf, mergePendingLuck } from '@/lib/check-details'
import { useGameStore, selectPendingLuck } from '@/stores/game'

import { CheckCard } from './CheckCard'
import { GmNarration } from './GmNarration'
import { TimelineItem } from './TimelineItem'

/** detail 未就绪时的稳定空数组：内联 selector 返回字面量 [] 会让 zustand v5 快照每次都变 */
const NO_CHECKS: CheckResult[] = []

/** 视觉上翻离最新消息超过该偏移（倒置列表 contentOffset.y）才显示回底按钮 */
const SCROLL_AWAY_THRESHOLD = 160

/**
 * 运气决策卡（CoC 推骰）：数据与 CheckCard 内嵌按钮同源（同一份 check 数据），
 * 只是置顶醒目。非归属者（且非 GM）只展示等待文案，不给出决议按钮。
 */
function LuckCard({
  check,
  busy,
  canDecide,
  onDecide,
}: {
  check: CheckResult
  busy: boolean
  canDecide: boolean
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
        {canDecide ? (
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
        ) : (
          <Text variant="small" className="text-warning">
            {t('waitLuckDecision', { name: check.actor_name || check.actor_uid || '' })}
          </Text>
        )}
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
  ttsAvailable,
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
  ttsAvailable: boolean
  isGm?: boolean
  onLoadOlder: () => void
  onDecideLuck: (check: CheckResult, spend: boolean) => void
  onSpeak: (text: string) => void
  onSwipeTo?: (round: number, swipeIndex: number) => Promise<void>
  onReroll?: (round: number) => Promise<void>
}) {
  const t = useT()
  // 待运气决议统一来源：页面传入的 pending_luck_decisions + store 里 round_check_results
  // 的 pending 项做并集去重（服务端两处同源，但结算阶段外后者为空，仅取一处会漏）
  const storePendingLuck = useGameStore(selectPendingLuck)
  const pendingChecks = mergePendingLuck(pendingLuck, storePendingLuck)
  // 本轮揭示卡（对齐 Web revealChecks）：结算阶段的 round_check_results 里非运气决议项，
  // 带 720ms 骰子揭示动画；pending 运气项已由顶部 LuckCard 承接，不重复渲染
  const roundCheckResults = useGameStore(
    (state) => state.detail?.round_check_results ?? NO_CHECKS,
  )
  const pendingKeys = new Set(pendingChecks.map(checkKeyOf))
  const revealChecks = roundCheckResults.filter(
    (check) => check.luck_decision !== 'pending' && !pendingKeys.has(checkKeyOf(check)),
  )
  const hasOlder = logPage < logTotalPages
  const liveIdle = !gmThinking && submittedActions.length === 0 && pendingChecks.length === 0

  // 倒置列表 offset 0 = 最新消息处；向上翻旧记录时 y 单调增大。
  // setState 收到相同布尔值时 React 自动跳过重渲染，滚动高频回调无需手动节流
  const listRef = React.useRef<FlatList<LogEntry>>(null)
  const [awayFromBottom, setAwayFromBottom] = React.useState(false)
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setAwayFromBottom(event.nativeEvent.contentOffset.y > SCROLL_AWAY_THRESHOLD)
  }
  const scrollToLatest = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
  }

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

      {pendingChecks.map((check) => (
        <LuckCard
          key={check.check_id ?? check.label}
          check={check}
          busy={luckBusy}
          canDecide={canDecideLuckOf(check, currentUserId, isGm)}
          onDecide={onDecideLuck}
        />
      ))}

      {/* 本轮揭示卡：结算阶段刚掷出的检定，带揭示动画，运气决议入口内嵌卡内 */}
      {revealChecks.map((check) => (
        <CheckCard
          key={check.check_id ?? check.label}
          check={check}
          animate
          canDecideLuck={canDecideLuckOf(check, currentUserId, isGm)}
          busy={luckBusy}
          onDecideLuck={onDecideLuck}
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
          {/* 与 TimelineItem 的 GM 回合卡同款半透明底 */}
          <Card className="gap-0 bg-card/80 p-4">
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
    <View className="flex-1">
      <FlatList
        ref={listRef}
        inverted
        onScroll={handleScroll}
        scrollEventThrottle={16}
        data={[...log].reverse()}
        keyExtractor={(item, index) => String(item.round ?? index)}
        renderItem={({ item }) => (
          <NativeOnlyAnimatedView entering={FadeIn.duration(220)}>
            <TimelineItem
              entry={item}
              players={players}
              gameKey={gameKey}
              currentUserId={currentUserId}
              ttsAvailable={ttsAvailable}
              onSpeak={onSpeak}
              isGm={isGm}
              luckBusy={luckBusy}
              onDecideLuck={onDecideLuck}
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
      {/* 翻阅旧记录时的"回到底部"悬浮按钮：外层常驻 + box-none 让空白处透传触摸，
          动画收在内层（NativeOnlyAnimatedView 在 web 端不透传 className，定位不能放它身上） */}
      <View pointerEvents="box-none" className="absolute inset-x-0 bottom-3 items-end px-4">
        {awayFromBottom ? (
          <NativeOnlyAnimatedView
            entering={FadeInDown.duration(200)}
            exiting={FadeOut.duration(150)}
          >
            <Pressable
              onPress={scrollToLatest}
              /* 透明度用整体 opacity 实现：NativeWind 对 CSS 变量色值的 /NN 修饰符
                 在 Android 上不生效（背景会被丢弃），参见错误横幅 bg-destructive opacity-10 的先例 */
              className="flex-row items-center gap-1.5 rounded-full bg-foreground px-3 py-2 opacity-80 active:opacity-60"
            >
              <Icon as={ArrowDown} size={14} className="text-background" />
              <Text variant="small" className="text-background">
                {t('dfPlayScrollToBottom')}
              </Text>
            </Pressable>
          </NativeOnlyAnimatedView>
        ) : null}
      </View>
    </View>
  )
}
