import * as React from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Pause, Volume2 } from 'lucide-react-native'

import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { avatarSource } from '@/api/assets'
import type { StorySegment, StorySequence } from '@/api/types'
import { useT } from '@/i18n/t'
import { groupStorySegments, speakerFallback } from '@/lib/story'

import type { SpeechControl } from './useSpeaker'

/** 说话人头像：有立绘用立绘，否则用与 Web 同色的首字圆标 */
function SpeakerAvatar({ gameKey, segment }: { gameKey: string; segment: StorySegment }) {
  const name = segment.speaker_name || ''
  const source = avatarSource(gameKey, segment.portrait)
  if (source) {
    return (
      <RemoteAvatar
        key={`${segment.speaker_id}-${source.uri}`}
        source={source}
        name={name}
        className="h-9 w-9 rounded-full"
      />
    )
  }
  const fallback = speakerFallback(segment.speaker_id, name)
  return (
    <View
      className="h-9 w-9 items-center justify-center rounded-full"
      style={{ backgroundColor: fallback.color }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {/* 底色是上游固定色板的深色，白字是那套色板的配套前景，不随主题变 */}
      <Text variant="small" className="font-semibold text-white">{fallback.initials}</Text>
    </View>
  )
}

/**
 * 角色对话模式的回合叙事（对齐上游 StorySequence.vue）：旁白卡 + 按说话人分组的台词气泡，
 * 每个气泡单独朗读。历史回合与流式快照共用。
 */
export function StorySequenceView({
  story,
  gameKey,
  ttsAvailable,
  speech,
}: {
  story: StorySequence
  gameKey: string
  ttsAvailable: boolean
  speech?: SpeechControl
}) {
  const t = useT()
  const groups = groupStorySegments(story)

  function speakButton(text: string) {
    if (!ttsAvailable || !speech) return null
    const trimmed = text.trim()
    const mine = !!trimmed && speech.activeText === trimmed
    return (
      <Pressable
        onPress={() => speech.onToggle(trimmed)}
        disabled={mine && speech.busy}
        className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
        accessibilityLabel={t(mine && speech.playing ? 'dfPlayTtsStop' : 'ttsSpeakGm')}
      >
        {mine && speech.busy ? (
          <ActivityIndicator size="small" className="text-muted-foreground" />
        ) : (
          <Icon as={mine && speech.playing ? Pause : Volume2} size={15} className="text-primary" />
        )}
      </Pressable>
    )
  }

  return (
    <View className="gap-3">
      {groups.map((group) => {
        const head = group.segments[0]
        if (head.kind === 'narration') {
          return (
            <View key={group.key} className="gap-1 rounded-lg border border-border bg-muted/60 px-3 py-2.5">
              <Text variant="small" className="font-semibold uppercase tracking-wider text-muted-foreground">
                {t('storyNarrator')}
              </Text>
              {group.segments.map((segment) => (
                <Text key={segment.id} className="leading-6 text-muted-foreground">{segment.text}</Text>
              ))}
            </View>
          )
        }
        return (
          <View key={group.key} className="gap-1.5">
            <View className="flex-row items-center gap-2">
              <SpeakerAvatar gameKey={gameKey} segment={head} />
              <Text variant="small" className="font-semibold">
                {head.speaker_name || t('storyUnknownSpeaker')}
              </Text>
            </View>
            {group.segments.map((segment) => (
              <View
                key={segment.id}
                className="ml-11 flex-row items-start gap-2 rounded-lg rounded-tl-sm border border-border bg-primary/10 px-3 py-2"
              >
                <Text className="flex-1 leading-6">{segment.text}</Text>
                {speakButton(segment.text)}
              </View>
            ))}
          </View>
        )
      })}
    </View>
  )
}
