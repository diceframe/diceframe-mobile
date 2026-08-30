import * as React from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { Volume2 } from 'lucide-react-native'

import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Icon } from '@/components/ui/icon'
import type { CharacterSheet, LogEntry, Player } from '@/api/types'
import type { AssetSource } from '@/api/assets'
import { avatarSource } from '@/api/assets'
import { useT } from '@/i18n/t'
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
      <View className="aspect-video w-full items-center justify-center rounded-lg border border-border bg-muted">
        <ActivityIndicator />
      </View>
    )
  }
  return (
    <ExpoImage
      source={{ uri }}
      className="aspect-video w-full rounded-lg border border-border"
      contentFit="cover"
      accessibilityLabel={prompt || t('dfPlaySceneImageA11y')}
    />
  )
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
  const t = useT()
  const actions = actionsOf(entry)
  const checks = Array.isArray(entry.check_results) ? entry.check_results : []
  const scene = roundSceneImageSource(gameKey, entry.scene_image)

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
        <CheckCard key={check.check_id ?? index} check={check} />
      ))}

      {entry.gm_response ? (
        <Card className="gap-0 p-4">
          <View className="mb-1.5 flex-row items-center gap-2">
            <Text variant="small" className="flex-1 text-muted-foreground">
              {t('dfPlayGmRoundLabel', { round: entry.round ?? '?' })}
            </Text>
            {ttsEnabled ? (
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
        </Card>
      ) : null}

      {(entry.story_recaps ?? []).map((recap, index) => (
        <Card key={index} className="border-dashed p-3">
          <Text variant="small" className="text-muted-foreground">
            {t('dfPlayRecapRange', { from: recap.from_round, to: recap.to_round })}
          </Text>
          <GmNarration text={recap.text} className="mt-1" />
        </Card>
      ))}
    </View>
  )
}
