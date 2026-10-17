import * as React from 'react'
import { ActivityIndicator, View } from 'react-native'

import { errorMessage } from '@/api/client'
import { avatarSource } from '@/api/assets'
import { fetchStorySpeakers, mergeStorySpeakers, updateSpeakerPortrait } from '@/api/story-speakers'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { confirmDestructive } from '@/lib/confirm'
import { speakerFallback } from '@/lib/story'
import {
  filterStorySpeakers,
  isGuestSpeaker,
  mergeTargetsOf,
  speakerShortId,
  type StorySpeaker,
} from '@/lib/story-speakers'
import { useGameStore } from '@/stores/game'

import { CharacterPortraitSheet } from './CharacterPortraitSheet'

function SpeakerAvatar({ gameKey, speaker }: { gameKey: string; speaker: StorySpeaker }) {
  const source = avatarSource(gameKey, speaker.portrait)
  if (source) {
    return <RemoteAvatar key={source.uri} source={source} name={speaker.name} className="h-10 w-10 rounded-full" />
  }
  const fallback = speakerFallback(speaker.id, speaker.name)
  return (
    <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: fallback.color }}>
      {/* 与 StorySequenceView 同：固定深色色板配白字 */}
      <Text variant="small" className="font-semibold text-white">{fallback.initials}</Text>
    </View>
  )
}

/**
 * GM 的剧情立绘管理（对齐上游 StoryPortraits）：列出本局说话人，换头像、把重复的临时人物
 * 合并到同名记录。列表与换头像是两个底部面板，同一时刻只开一个（避免面板叠面板）。
 */
export function StoryPortraitsTool({
  open,
  onClose,
  gameKey,
  ruleId,
}: {
  open: boolean
  onClose: () => void
  gameKey: string
  ruleId: string
}) {
  const t = useT()
  const [speakers, setSpeakers] = React.useState<StorySpeaker[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState<StorySpeaker | null>(null)
  const [mergeOpen, setMergeOpen] = React.useState('')

  async function load() {
    setLoading(true)
    try {
      setSpeakers(await fetchStorySpeakers(gameKey))
      setError('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  function afterChange() {
    void load()
    if (useGameStore.getState().gameKey === gameKey) void useGameStore.getState().refresh()
  }

  async function savePortrait(speaker: StorySpeaker, portrait: StorySpeaker['portrait']) {
    try {
      await updateSpeakerPortrait(gameKey, speaker.id, portrait ?? null)
      afterChange()
    } catch (cause) {
      setError(errorMessage(cause))
      throw cause
    }
  }

  async function merge(source: StorySpeaker, target: StorySpeaker) {
    const accepted = await confirmDestructive({
      title: t('dfSpeakerMerge'),
      message: `${source.name} (${speakerShortId(source)}) → ${target.name} (${speakerShortId(target)})\n\n${t('dfSpeakerMergeHint')}`,
      confirmText: t('dfSpeakerMergeConfirm'),
      cancelText: t('cancel'),
    })
    if (!accepted) return
    setBusy(true)
    setError('')
    try {
      await mergeStorySpeakers(gameKey, source.id, target.id)
      setMergeOpen('')
      afterChange()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function identity(speaker: StorySpeaker): string {
    const kind = isGuestSpeaker(speaker) ? t('dfSpeakerGuest') : t('dfSpeakerKnown')
    const first = speaker.first_round === undefined ? '' : ` · ${t('dfSpeakerFirstRound', { round: speaker.first_round })}`
    return `${kind}${first} · ${speakerShortId(speaker)}`
  }

  const visible = filterStorySpeakers(speakers, query)

  return (
    <>
      <Sheet
        open={open && !editing}
        onClose={onClose}
        scrollable
      >
        <StoryPortraitsBody onMount={() => void load()} mounted={open && !editing}>
          <View className="gap-3 pb-2">
            <Text variant="h4">{t('storyPortraits')}</Text>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t('storyPortraitSearch')}
              accessibilityLabel={t('storyPortraitSearch')}
            />
            {error ? <Text variant="small" className="text-destructive" accessibilityRole="alert">{error}</Text> : null}
            {loading && !speakers.length ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" />
                <Text variant="muted">{t('storyPortraitsLoading')}</Text>
              </View>
            ) : null}
            {!loading && !visible.length ? <Text variant="muted">{t('storyPortraitsEmpty')}</Text> : null}
            {visible.map((speaker) => {
              const targets = mergeTargetsOf(speaker, speakers)
              return (
                <View key={speaker.id} className="gap-2 rounded-lg border border-border p-2.5">
                  <View className="flex-row items-center gap-2.5">
                    <SpeakerAvatar gameKey={gameKey} speaker={speaker} />
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="font-semibold" numberOfLines={1}>{speaker.name}</Text>
                      <Text variant="small" className="text-muted-foreground" numberOfLines={1}>{identity(speaker)}</Text>
                    </View>
                    <Button size="sm" variant="outline" disabled={busy} onPress={() => setEditing(speaker)}>
                      <Text>{t('storyPortraitChange')}</Text>
                    </Button>
                  </View>
                  {targets.length ? (
                    mergeOpen === speaker.id ? (
                      <View className="gap-1.5">
                        <Text variant="small" className="text-muted-foreground">{t('dfSpeakerMergeChoose')}</Text>
                        {targets.map((target) => (
                          <Button
                            key={target.id}
                            size="sm"
                            variant="outline"
                            className="h-auto items-start justify-start py-2"
                            disabled={busy}
                            onPress={() => void merge(speaker, target)}
                          >
                            <Text className="text-left">{t('dfSpeakerMergeInto', { name: `${target.name} · ${identity(target)}` })}</Text>
                          </Button>
                        ))}
                      </View>
                    ) : (
                      <Button size="sm" variant="ghost" className="self-start" disabled={busy} onPress={() => setMergeOpen(speaker.id)}>
                        <Text>{t('dfSpeakerMerge')}</Text>
                      </Button>
                    )
                  ) : null}
                </View>
              )
            })}
          </View>
        </StoryPortraitsBody>
      </Sheet>
      <CharacterPortraitSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        ruleId={ruleId}
        name={editing?.name ?? ''}
        value={editing?.portrait ?? null}
        busy={false}
        onSave={(portrait) => (editing ? savePortrait(editing, portrait) : Promise.resolve())}
      />
    </>
  )
}

/** 面板每次打开时重取名册：挂载即加载，effect 里不直接 setState（compiler 规则） */
function StoryPortraitsBody({ mounted, onMount, children }: { mounted: boolean; onMount: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    if (mounted) onMount()
  }, [mounted])
  return <>{children}</>
}
