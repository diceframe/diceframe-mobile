import * as React from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { ChevronLeft, ChevronRight, RotateCcw, Volume2 } from 'lucide-react-native'

import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Icon } from '@/components/ui/icon'
import type { CharacterSheet, CheckResult, LogEntry, Player } from '@/api/types'
import type { AssetSource } from '@/api/assets'
import { avatarSource } from '@/api/assets'
import { canDecideLuckOf } from '@/lib/check-details'
import { useT } from '@/i18n/t'
import { errorMessage } from '@/api/client'
import { useAssetUri } from './useAssetUri'

import { CheckCard } from './CheckCard'
import { GmNarration } from './GmNarration'
import { playerColor, playerColorSoft } from './playerColor'
import { roundSceneImageSource } from './sceneImage'

/** 玩家专属气泡色（uid 稳定散列取色，与 Web playerColor 同算法） */

interface RoundAction {
  uid: string
  text: string
}

/** 对齐 Web GameTimeline.actions()：数组/映射两种 player_actions 形态都兼容 */
export function actionsOf(entry: LogEntry): RoundAction[] {
  const raw = entry.player_actions ?? entry.actions
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        const text = String(source.text || source.action || item || '')
        return { uid: String(source.user_id || ''), text }
      })
      .filter((action) => action.uid !== 'system' && action.text)
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([uid, text]) => ({ uid, text: String(text) }))
      .filter((action) => action.uid !== 'system' && action.text)
  }
  return []
}

function sheetOf(players: Player[], uid: string): CharacterSheet | null {
  return players.find((player) => player.user_id === uid)?.character_sheet ?? null
}

function nameOf(players: Player[], uid: string): string {
  return players.find((player) => player.user_id === uid)?.character_name || uid
}

/**
 * 回合场景图（16:9）：生成图是鉴权 /api 资源，必须经 apiBlob 转 data URI 渲染，
 * 直链交给原生图片加载器带不上会话 Cookie，会静默加载失败。
 */
function SceneImageFigure({ source, prompt }: { source: AssetSource; prompt?: string }) {
  const t = useT()
  const uri = useAssetUri(source)
  if (!uri) {
    return (
      <View className="aspect-video w-full items-center justify-center rounded-xl border border-border bg-muted">
        <ActivityIndicator />
      </View>
    )
  }
  return (
    <ExpoImage
      source={{ uri }}
      className="aspect-video w-full rounded-xl border border-border"
      contentFit="cover"
      accessibilityLabel={prompt || t('dfPlaySceneImageA11y')}
    />
  )
}

/**
 * GM 叙事分支条：switch_swipe 由服务端把选中分支写回 gm_response，故操作后必须刷新日志。
 * 服务端上限 5 条（swipe_generator）；Web 端分支条只在 count > 1 时渲染，首次重roll无入口，
 * 移动端只要有叙事就显示整条，补上这个冷启动死角。
 */
const SWIPE_MAX = 5

function SwipeBar({
  round,
  swipeCount,
  swipeCur,
  busy,
  onSwipeTo,
  onReroll,
}: {
  round: number
  swipeCount: number
  swipeCur: number
  busy: boolean
  onSwipeTo: (round: number, swipeIndex: number) => Promise<void>
  onReroll: (round: number) => Promise<void>
}) {
  const t = useT()
  return (
    <View className="mt-2 flex-row items-center gap-1.5 border-t border-border pt-2">
      {swipeCount > 1 ? (
        <>
          <Pressable
            onPress={() => void onSwipeTo(round, swipeCur - 1)}
            disabled={busy || swipeCur <= 0}
            className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
            accessibilityLabel={t('dfPlaySwipePrev')}
          >
            <Icon as={ChevronLeft} size={15} className="text-muted-foreground" />
          </Pressable>
          <Text variant="small" className="min-w-9 text-center text-muted-foreground">
            {swipeCur + 1}/{swipeCount}
          </Text>
          <Pressable
            onPress={() => void onSwipeTo(round, swipeCur + 1)}
            disabled={busy || swipeCur >= swipeCount - 1}
            className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
            accessibilityLabel={t('dfPlaySwipeNext')}
          >
            <Icon as={ChevronRight} size={15} className="text-muted-foreground" />
          </Pressable>
        </>
      ) : null}
      {swipeCount < SWIPE_MAX ? (
        <Pressable
          onPress={() => void onReroll(round)}
          disabled={busy}
          className="ml-auto h-7 flex-row items-center gap-1 rounded-md px-2 active:bg-accent"
          accessibilityLabel={t('regenerate')}
        >
          {busy ? (
            <ActivityIndicator size="small" className="text-muted-foreground" />
          ) : (
            <Icon as={RotateCcw} size={13} className="text-muted-foreground" />
          )}
          <Text variant="small" className="text-muted-foreground">
            {t('regenerate')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function TimelineItem({
  entry,
  players,
  gameKey,
  currentUserId,
  ttsAvailable,
  onSpeak,
  isGm,
  luckBusy,
  onDecideLuck,
  onSwipeTo,
  onReroll,
}: {
  entry: LogEntry
  players: Player[]
  gameKey: string
  currentUserId: string
  ttsAvailable: boolean
  onSpeak: (text: string) => void
  isGm?: boolean
  /** 运气决议请求进行中：内嵌按钮统一禁用（与顶部 LuckCard 共用同一 busy 语义） */
  luckBusy?: boolean
  onDecideLuck?: (check: CheckResult, spend: boolean) => void
  onSwipeTo?: (round: number, swipeIndex: number) => Promise<void>
  onReroll?: (round: number) => Promise<void>
}) {
  const t = useT()
  const actions = actionsOf(entry)
  const checks = Array.isArray(entry.check_results) ? entry.check_results : []
  const scene = roundSceneImageSource(gameKey, entry.scene_image)
  const swipes = Array.isArray(entry.swipes) ? entry.swipes : []
  const swipeCount = swipes.length
  const swipeCur = Math.min(Math.max(Number(entry.current_swipe) || 0, 0), Math.max(swipeCount - 1, 0))
  const [swipeBusy, setSwipeBusy] = React.useState(false)
  const [swipeError, setSwipeError] = React.useState('')

  async function runSwipe(op: () => Promise<void>) {
    if (swipeBusy) return
    setSwipeBusy(true)
    setSwipeError('')
    try {
      await op()
    } catch (cause) {
      setSwipeError(
        errorMessage(cause, 'branchOperationFailed'),
      )
    } finally {
      setSwipeBusy(false)
    }
  }

  return (
    <View className="gap-3 px-4 py-3">
      {actions.map((action) => {
        const sheet = sheetOf(players, action.uid)
        const avatar = avatarSource(gameKey, sheet?.portrait)
        // 自己的行动靠右（头像在外侧），他人的靠左——对齐常见聊天布局
        const mine = !!currentUserId && action.uid === currentUserId
        return (
          <View
            key={action.uid + action.text}
            className={mine ? 'flex-row-reverse items-start gap-2' : 'flex-row items-start gap-2'}
          >
            <RemoteAvatar
              key={`${action.uid}-${avatar?.uri ?? 'fallback'}`}
              source={avatar}
              name={nameOf(players, action.uid)}
              className="h-9 w-9 rounded-full"
            />
            <View
              className="max-w-[85%] rounded-md border border-border px-3 py-2"
              style={{
                borderRightColor: playerColor(action.uid),
                borderRightWidth: mine ? 3 : undefined,
                borderLeftColor: playerColor(action.uid),
                borderLeftWidth: mine ? undefined : 3,
                backgroundColor: playerColorSoft(action.uid),
              }}
            >
              <Text variant="small" className="mb-0.5 font-semibold" style={{ color: playerColor(action.uid) }}>
                {nameOf(players, action.uid)}
              </Text>
              <Text className="leading-6">{action.text}</Text>
            </View>
          </View>
        )
      })}

      {checks.map((check, index) => (
        <CheckCard
          key={check.check_id ?? index}
          check={check}
          canDecideLuck={canDecideLuckOf(check, currentUserId, isGm)}
          busy={!!luckBusy}
          onDecideLuck={onDecideLuck}
        />
      ))}

      {entry.gm_response ? (
        // 半透明底（对齐 Web 电影感对局页）：叙事卡是时间线主内容，透明度给到
        // 80%，既透出场景氛围又保证长段落可读；再低会和玩家气泡（12%）难以区分。
        <Card className="gap-0 bg-card/80 p-4">
          <View className="mb-1.5 flex-row items-center gap-2">
            <Text variant="small" className="flex-1 text-muted-foreground">
              {t('dfPlayGmRoundLabel', { round: entry.round ?? '?' })}
            </Text>
            {ttsAvailable ? (
              <Pressable
                onPress={() => onSpeak(String(entry.gm_response ?? ''))}
                className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
                accessibilityLabel={t('dfPlayReadAloud')}
              >
                <Icon as={Volume2} size={15} className="text-muted-foreground" />
              </Pressable>
            ) : null}
          </View>
          {/* 场景图嵌在叙事段与状态卡之间（对齐 Web SceneImageBlock 的位置） */}
          <GmNarration
            text={entry.gm_response}
            image={
              scene ? (
                <SceneImageFigure source={scene} prompt={entry.scene_image?.prompt} />
              ) : undefined
            }
          />
          {isGm && onSwipeTo && onReroll ? (
            <>
              <SwipeBar
                round={entry.round ?? 0}
                swipeCount={swipeCount}
                swipeCur={swipeCur}
                busy={swipeBusy}
                onSwipeTo={(round, swipeIndex) => runSwipe(() => onSwipeTo(round, swipeIndex))}
                onReroll={(round) => runSwipe(() => onReroll(round))}
              />
              {swipeError ? (
                <Text variant="small" className="text-destructive" numberOfLines={2}>
                  {swipeError}
                </Text>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      {(entry.story_recaps ?? []).map((recap, index) => (
        <Card key={index} className="border-dashed bg-card/60 p-3">
          <Text variant="small" className="text-muted-foreground">
            {t('dfPlayRecapRange', { from: recap.from_round, to: recap.to_round })}
          </Text>
          <GmNarration text={recap.text} className="mt-1" />
        </Card>
      ))}
    </View>
  )
}
