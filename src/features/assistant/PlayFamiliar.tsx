import * as React from 'react'
import { Pressable, View } from 'react-native'
import { FadeIn, FadeOut } from 'react-native-reanimated'
import { useRouter } from 'expo-router'

import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import {
  REACTIONS,
  playReactionsBetween,
  reactionLabel,
  type AvatarMood,
  type PlaySnapshot,
} from '@/lib/assistant-reactions'
import { cn } from '@/lib/utils'
import { useAssistantStore } from '@/stores/assistant'
import { useReactionStore } from '@/stores/assistant-reactions'
import { useGameStore } from '@/stores/game'

import { DiceFamiliar } from './DiceFamiliar'

function snapshotOf(gameKey: string, userId: string): PlaySnapshot | null {
  const state = useGameStore.getState()
  const detail = state.detail
  if (!detail || state.loading) return null
  const sheet = state.players.find((player) => player.user_id === userId)?.character_sheet
  const scene = detail.scene as unknown
  const items = [...(sheet?.inventory ?? []), ...(sheet?.key_items ?? [])]
    .map((item) => String((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).id ?? '').trim())
    .filter(Boolean)
  return {
    game: gameKey,
    round: Number(detail.round_number ?? 0),
    scene: typeof scene === 'string' ? scene : String((scene as Record<string, unknown> | undefined)?.name ?? ''),
    sceneImage: detail.scene_image ? JSON.stringify(detail.scene_image) : '',
    state: String(detail.state ?? ''),
    level: Number(sheet?.level ?? 0),
    xp: Number(sheet?.xp ?? 0),
    hp: typeof sheet?.hp === 'number' ? sheet.hp : null,
    maxHp: Number(sheet?.max_hp ?? 0),
    items,
    players: Object.fromEntries(state.players.map((player) => [player.user_id, String(player.character_name || player.character_sheet?.name || '')])),
    pushes: detail.pending_push_decisions?.length ?? 0,
  }
}

/**
 * 对局状态变化 → 骰灵反应（对齐上游 usePlayReactions）。每局以首个快照为基线，
 * 进局或切局不会把历史重放成反应；检定揭示由检定卡自己上报。
 */
export function usePlayReactions(gameKey: string, userId: string) {
  React.useEffect(() => {
    let previous: PlaySnapshot | null = null
    const evaluate = () => {
      const next = snapshotOf(gameKey, userId)
      if (!next) return
      const events = playReactionsBetween(previous, next)
      previous = next
      for (const event of events) useReactionStore.getState().report(event.kind, event.detail)
    }
    evaluate()
    const unsubscribe = useGameStore.subscribe((state, prior) => {
      if (state.detail !== prior.detail || state.players !== prior.players || state.loading !== prior.loading) evaluate()
    })
    return () => {
      unsubscribe()
      useReactionStore.getState().clear()
    }
  }, [gameKey, userId])
}

const TONE_CLASS = { good: 'border-success', bad: 'border-destructive', great: 'border-gold-strong' } as const

/**
 * 对局页的骰灵（房主可见）：平时待机，跑团事件发生时换表情并弹出气泡；Agent 在处理时托腮思考、
 * 有待确认操作时举手。点按打开 DF Agent，并带上当前对局。放在时间线左下角，避开「回到底部」。
 */
export function PlayFamiliar({ gameKey }: { gameKey: string }) {
  const t = useT()
  const router = useRouter()
  const reaction = useReactionStore((s) => s.current)
  const busy = useAssistantStore((s) => s.streaming || s.actionBusy)
  const attention = useAssistantStore((s) => !!s.pendingApproval || !!s.actionError)
  const spec = reaction ? REACTIONS[reaction.kind] : null
  const mood: AvatarMood = spec ? spec.mood : busy ? 'thinking' : attention ? 'attention' : 'idle'
  const label = reaction ? reactionLabel(reaction.kind, reaction.detail) : null

  return (
    <View className="absolute bottom-2 left-3 flex-row items-end gap-1.5" pointerEvents="box-none">
      <Pressable
        onPress={() => {
          useAssistantStore.getState().setContext({ route: 'play', game_key: gameKey })
          router.push('/assistant')
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('dfFamiliarFamiliar')}
      >
        <DiceFamiliar mood={mood} size={52} />
      </Pressable>
      {label && reaction ? (
        <NativeOnlyAnimatedView key={reaction.id} entering={FadeIn.duration(160)} exiting={FadeOut.duration(200)}>
          <View
            className={cn(
              'mb-6 rounded-lg rounded-bl-sm border bg-card px-2.5 py-1.5',
              spec?.tone ? TONE_CLASS[spec.tone] : 'border-border',
            )}
            accessibilityLiveRegion="polite"
          >
            <Text variant="small" className="font-semibold">{t(label.key, label.params)}</Text>
          </View>
        </NativeOnlyAnimatedView>
      ) : null}
    </View>
  )
}
