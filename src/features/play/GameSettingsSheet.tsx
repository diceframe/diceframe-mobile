import * as React from 'react'
import { View } from 'react-native'

import { errorMessage } from '@/api/client'
import { setLuckTimeout, setNarrativePerspective } from '@/api/game-settings'
import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import {
  currentNarrativePerspective,
  NARRATIVE_PERSPECTIVES,
  parseLuckTimeoutInput,
  type NarrativePerspective,
} from '@/lib/game-settings'

export type GameSettingsChange =
  | { narrativePerspective: NarrativePerspective }
  | { luckTimeoutSeconds: number }

export interface GameSettingsSheetProps {
  open: boolean
  onClose: () => void
  gameKey: string
  narrativePerspective?: string | null
  /** 同步接收已保存字段；宿主更新 store 前仍须核对 gameKey。 */
  onSaved: (gameKey: string, change: GameSettingsChange) => void
}

type Setting = 'perspective' | 'timeout'
type SaveResult = { ok: true; seconds?: number } | { ok: false; message: string }

const perspectiveLabels = {
  auto: 'narrativeAuto',
  immersive: 'narrativeImmersive',
  third_person: 'narrativeThirdPerson',
} as const

/** 每次打开、切局均创建独立表单，旧请求不会写入新表单的错误与草稿。 */
export function GameSettingsSheet(props: GameSettingsSheetProps) {
  if (!props.open) return null
  return <GameSettingsForm key={props.gameKey} {...props} />
}

function GameSettingsForm({ onClose, gameKey, narrativePerspective, onSaved }: GameSettingsSheetProps) {
  const t = useT()
  const [draftPerspective, setDraftPerspective] = React.useState<NarrativePerspective | null>(null)
  const [savedPerspective, setSavedPerspective] = React.useState<NarrativePerspective | null>(null)
  const [timeoutInput, setTimeoutInput] = React.useState('')
  const [pending, setPending] = React.useState<Setting | null>(null)
  const [results, setResults] = React.useState<Partial<Record<Setting, SaveResult>>>({})
  const request = React.useRef<AbortController | null>(null)
  const mounted = React.useRef(true)

  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // 取消等待并不撤销服务端写入；下次打开依旧以宿主最新详情为准。
      request.current?.abort()
    }
  }, [])

  const currentPerspective = savedPerspective ?? currentNarrativePerspective(narrativePerspective)
  const perspective = draftPerspective ?? currentPerspective
  const parsedTimeout = parseLuckTimeoutInput(timeoutInput)
  const busy = pending !== null
  const timeoutError = parsedTimeout.kind !== 'invalid'
    ? ''
    : parsedTimeout.reason === 'integer'
      ? t('validationFailed')
      : t(parsedTimeout.reason === 'minimum' ? 'validationAtLeast' : 'validationAtMost', {
        field: t('luckTimeoutSeconds'),
        value: parsedTimeout.reason === 'minimum' ? 0 : 3600,
      })

  function close() {
    if (!request.current) onClose()
  }

  async function save(setting: Setting) {
    // ref 锁同步生效，覆盖 React 尚未提交 disabled 状态时的连续点击。
    if (request.current || !gameKey.trim()) return
    if (setting === 'perspective' && (!perspective || perspective === currentPerspective)) return
    if (setting === 'timeout' && parsedTimeout.kind !== 'valid') return
    const controller = new AbortController()
    request.current = controller
    setPending(setting)
    setResults((previous) => ({ ...previous, [setting]: undefined }))
    let change: GameSettingsChange | undefined
    try {
      if (setting === 'perspective' && perspective) {
        const saved = await setNarrativePerspective(gameKey, perspective, controller.signal)
        if (!mounted.current || controller.signal.aborted) return
        setSavedPerspective(saved)
        setDraftPerspective(saved)
        setResults((previous) => ({ ...previous, perspective: { ok: true } }))
        change = { narrativePerspective: saved }
      } else if (setting === 'timeout' && parsedTimeout.kind === 'valid') {
        const saved = await setLuckTimeout(gameKey, parsedTimeout.seconds, controller.signal)
        if (!mounted.current || controller.signal.aborted) return
        setTimeoutInput('')
        setResults((previous) => ({ ...previous, timeout: { ok: true, seconds: saved } }))
        change = { luckTimeoutSeconds: saved }
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        setResults((previous) => ({ ...previous, [setting]: { ok: false, message: errorMessage(error) } }))
      }
    } finally {
      if (request.current === controller) request.current = null
      if (mounted.current && !controller.signal.aborted) setPending(null)
    }
    // 保存已完成；宿主的后续处理不能被误报为这次设置失败。
    if (change && mounted.current && !controller.signal.aborted) onSaved(gameKey, change)
  }

  function feedback(setting: Setting) {
    const result = results[setting]
    if (!result) return null
    return (
      <Text
        accessibilityLiveRegion="polite"
        className={result.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}
      >
        {result.ok
          ? setting === 'timeout' ? t('luckTimeoutSaved', { seconds: result.seconds ?? 0 }) : t('settingsSaved')
          : result.message}
      </Text>
    )
  }

  return (
    <Sheet open onClose={close}>
      <View className="gap-5 pb-2">
        <Text variant="h3">{t('settingsTitle')}</Text>
        <View className="gap-3">
          <View className="gap-1">
            <Text className="font-semibold">{t('narrativePerspective')}</Text>
            <Text variant="muted">{t('narrativeChangeHint')}</Text>
          </View>
          <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('narrativePerspective')}>
            {NARRATIVE_PERSPECTIVES.map((value) => (
              <Button
                key={value}
                variant={perspective === value ? 'secondary' : 'outline'}
                className="h-auto min-h-11 items-start px-3 py-3"
                accessibilityRole="radio"
                accessibilityState={{ checked: perspective === value, disabled: busy }}
                disabled={busy}
                onPress={() => {
                  setDraftPerspective(value)
                  setResults((previous) => ({ ...previous, perspective: undefined }))
                }}
              >
                <Text className="shrink text-left">{t(perspectiveLabels[value])}</Text>
              </Button>
            ))}
          </View>
          {perspective === 'immersive' ? <Text variant="muted">{t('narrativeImmersiveHint')}</Text> : null}
          {perspective === 'third_person' ? <Text variant="muted">{t('narrativeThirdPersonHint')}</Text> : null}
          {feedback('perspective')}
          <Button
            disabled={busy || !gameKey.trim() || !perspective || perspective === currentPerspective}
            accessibilityLabel={`${t('saveAction')} · ${t('narrativePerspective')}`}
            onPress={() => void save('perspective')}
          >
            <Text>{pending === 'perspective' ? t('saving') : t('saveAction')}</Text>
          </Button>
        </View>
        <View className="gap-3 border-t border-border pt-5">
          <Text className="font-semibold">{t('luckTimeoutSeconds')}</Text>
          <Text variant="muted">{t('luckTimeoutPlaceholder')}</Text>
          <Input
            value={timeoutInput}
            onChangeText={(value) => {
              setTimeoutInput(value)
              setResults((previous) => ({ ...previous, timeout: undefined }))
            }}
            accessibilityLabel={t('luckTimeoutSeconds')}
            placeholder="0–3600"
            keyboardType="number-pad"
            editable={!busy}
          />
          {timeoutError ? <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">{timeoutError}</Text> : null}
          {feedback('timeout')}
          <Button
            disabled={busy || !gameKey.trim() || parsedTimeout.kind !== 'valid'}
            accessibilityLabel={`${t('saveAction')} · ${t('luckTimeoutSeconds')}`}
            onPress={() => void save('timeout')}
          >
            <Text>{pending === 'timeout' ? t('saving') : t('saveAction')}</Text>
          </Button>
        </View>
        <Button variant="ghost" disabled={busy} onPress={close}>
          <Text>{t('close')}</Text>
        </Button>
      </View>
    </Sheet>
  )
}
