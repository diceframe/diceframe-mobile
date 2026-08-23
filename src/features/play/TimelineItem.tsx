import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Image } from 'expo-image'
import { Volume2 } from 'lucide-react-native'

import { Avatar } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import type { CharacterSheet, LogEntry, Player } from '@/api/types'
import { avatarSource, sceneImageSource } from '@/api/assets'

import { CheckCard } from './CheckCard'
import { GmNarration } from './GmNarration'
import { playerColor, playerColorSoft } from './playerColor'

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

export function TimelineItem({
  entry,
  players,
  gameKey,
  currentUserId,
  ttsEnabled,
  onSpeak,
}: {
  entry: LogEntry
  players: Player[]
  gameKey: string
  currentUserId: string
  ttsEnabled: boolean
  onSpeak: (text: string) => void
}) {
  const actions = actionsOf(entry)
  const checks = Array.isArray(entry.check_results) ? entry.check_results : []
  const scene = sceneImageSource(gameKey, entry.scene_image?.reference)
  const sceneReady = entry.scene_image?.status === 'ready'

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
            className={mine ? 'flex-row-reverse items-start gap-2.5' : 'flex-row items-start gap-2.5'}
          >
            {avatar ? (
              <Image
                source={avatar}
                className="h-9 w-9 rounded-full"
                contentFit="cover"
                accessibilityLabel={nameOf(players, action.uid)}
              />
            ) : (
              <Avatar name={nameOf(players, action.uid)} className="h-9 w-9" />
            )}
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
        <CheckCard key={check.check_id ?? index} check={check} />
      ))}

      {scene && sceneReady ? (
        <Image source={scene} className="h-44 w-full rounded-lg" contentFit="cover" />
      ) : null}

      {entry.gm_response ? (
        <Card className="gap-0 p-4">
          <View className="mb-1.5 flex-row items-center gap-2">
            <Text variant="small" className="flex-1 text-muted-foreground">
              GM · 第 {entry.round ?? '?'} 回合
            </Text>
            {ttsEnabled ? (
              <Pressable
                onPress={() => onSpeak(String(entry.gm_response ?? ''))}
                className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
                accessibilityLabel="朗读本回合"
              >
                <Volume2 size={15} className="text-muted-foreground" />
              </Pressable>
            ) : null}
          </View>
          <GmNarration text={entry.gm_response} />
        </Card>
      ) : null}

      {(entry.story_recaps ?? []).map((recap, index) => (
        <Card key={index} className="border-dashed p-3">
          <Text variant="small" className="text-muted-foreground">
            剧情回顾（{recap.from_round}-{recap.to_round}）
          </Text>
          <GmNarration text={recap.text} className="mt-1" />
        </Card>
      ))}
    </View>
  )
}
