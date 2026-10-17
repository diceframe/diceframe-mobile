import * as React from 'react'
import { View } from 'react-native'

import { errorMessage } from '@/api/client'
import { fetchSessionPreferences, patchSessionPreferences } from '@/api/game-settings'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import type { SessionPreferencesPatch, SessionPreferencesState } from '@/lib/game-settings'
import { useGameStore } from '@/stores/game'

const REVEAL_OPTIONS: { value: 'auto' | 'click'; label: TKey }[] = [
  { value: 'auto', label: 'diceRevealModeAuto' },
  { value: 'click', label: 'diceRevealModeClick' },
]

const STORY_OPTIONS: { value: 'prose' | 'dialogue'; label: TKey; hint: TKey }[] = [
  { value: 'prose', label: 'storyModeProse', hint: 'storyModeProseHint' },
  { value: 'dialogue', label: 'storyModeDialogue', hint: 'storyModeDialogueHint' },
]

/**
 * GM 设置面板里的「本局偏好」（对齐上游 GameSessionPreferences）：改动即存，
 * 失败回滚到改动前；保存后刷新对局，让 story_mode / quick_actions_enabled 立刻生效。
 * 宿主按 gameKey 键控挂载，切局时状态整体丢弃，旧请求写不进新局。
 */
export function GamePreferencesSection({ gameKey }: { gameKey: string }) {
  const t = useT()
  const [state, setState] = React.useState<SessionPreferencesState | null>(null)
  const [busy, setBusy] = React.useState(true)
  const [error, setError] = React.useState('')
  const [message, setMessage] = React.useState('')

  async function load() {
    setBusy(true)
    setError('')
    try {
      setState(await fetchSessionPreferences(gameKey))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  React.useEffect(() => {
    // 首读不经 load()：effect 内不能同步 setState（busy 初值已是 true）；gameKey 变化由宿主重新挂载
    let cancelled = false
    fetchSessionPreferences(gameKey).then(
      (loaded) => { if (!cancelled) setState(loaded) },
      (cause: unknown) => { if (!cancelled) setError(errorMessage(cause)) },
    ).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [gameKey])

  async function change(patch: SessionPreferencesPatch) {
    if (busy || !state) return
    const previous = state
    setState({ ...previous, preferences: { ...previous.preferences, ...patch } })
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const saved = await patchSessionPreferences(gameKey, patch)
      setState(saved)
      setMessage(t('dfPrefSaved'))
      if (saved.resumeFailed) setError(t('dfPrefResumeFailed'))
      if (useGameStore.getState().gameKey === gameKey) void useGameStore.getState().refresh()
    } catch (cause) {
      setState(previous)
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const prefs = state?.preferences

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="font-semibold">{t('dfPrefTitle')}</Text>
        <Text variant="muted">{t('dfPrefHint')}</Text>
      </View>

      {prefs ? (
        <>
          {state.pushSupported ? (
            <View className="flex-row items-center gap-3">
              <View className="flex-1 gap-0.5">
                <Text>{t('dfPrefPush')}</Text>
                <Text variant="muted">{t('dfPrefPushHint')}</Text>
              </View>
              <Switch
                checked={prefs.push_enabled}
                disabled={busy}
                onCheckedChange={(value) => void change({ push_enabled: value })}
                accessibilityLabel={t('dfPrefPush')}
              />
            </View>
          ) : null}

          <View className="flex-row items-center gap-3">
            <View className="flex-1 gap-0.5">
              <Text>{t('dfPrefQuickActions')}</Text>
              <Text variant="muted">
                {prefs.quick_actions_enabled === null ? t('dfPrefQuickActionsUnavailable') : t('dfPrefQuickActionsHint')}
              </Text>
            </View>
            <Switch
              checked={prefs.quick_actions_enabled ?? true}
              disabled={busy || prefs.quick_actions_enabled === null}
              onCheckedChange={(value) => void change({ quick_actions_enabled: value })}
              accessibilityLabel={t('dfPrefQuickActions')}
            />
          </View>

          <View className="gap-2">
            <Text>{t('dfPrefDiceReveal')}</Text>
            <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('dfPrefDiceReveal')}>
              {REVEAL_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={prefs.dice_reveal_mode === option.value ? 'secondary' : 'outline'}
                  className="h-auto min-h-9 flex-1 px-2 py-2"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: prefs.dice_reveal_mode === option.value, disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    if (prefs.dice_reveal_mode !== option.value) void change({ dice_reveal_mode: option.value })
                  }}
                >
                  <Text className="shrink text-center">{t(option.label)}</Text>
                </Button>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text>{t('storyMode')}</Text>
            <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('storyMode')}>
              {STORY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={prefs.story_mode === option.value ? 'secondary' : 'outline'}
                  className="h-auto min-h-11 items-start px-3 py-2.5"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: prefs.story_mode === option.value, disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    if (prefs.story_mode !== option.value) void change({ story_mode: option.value })
                  }}
                >
                  <View className="shrink gap-0.5">
                    <Text className="text-left">{t(option.label)}</Text>
                    <Text variant="muted" className="text-left">{t(option.hint)}</Text>
                  </View>
                </Button>
              ))}
            </View>
            <Text variant="muted">{t('storyModeHint')}</Text>
          </View>
        </>
      ) : busy ? (
        <Text variant="muted">{t('dfPrefLoading')}</Text>
      ) : null}

      {message ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-primary">{message}</Text>
      ) : null}
      {error ? (
        <View className="gap-2">
          {!prefs ? <Text className="text-sm text-destructive">{t('dfPrefFailed')}</Text> : null}
          <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">{error}</Text>
          {!prefs ? (
            <Button size="sm" variant="outline" className="self-start" disabled={busy} onPress={() => void load()}>
              <Text>{t('retry')}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
