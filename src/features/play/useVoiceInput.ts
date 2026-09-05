/** 按住录音：松手发送、滑向「文」编辑后发送、滑向取消丢弃录音。 */
import * as React from 'react'
import { AppState } from 'react-native'
import { File } from 'expo-file-system'
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'

import { transcribeAudio } from '@/api/speech'
import { getT } from '@/i18n/t'
import { createHoldRecording, type RecordingPhase, type RecordingTarget } from '@/lib/hold-recording'
import { useGameStore } from '@/stores/game'

const MAX_RECORDING_MS = 60_000
const MIN_VALID_BYTES = 2000

export function useVoiceInput(gameKey: string, onSend: (text: string) => Promise<void>) {
  const asrEnabled = useGameStore((s) => s.asrEnabled)
  const [phase, setPhase] = React.useState<RecordingPhase>('idle')
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [reviewText, setReviewText] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const [target, setTarget] = React.useState<RecordingTarget>('send')
  const targetRef = React.useRef<RecordingTarget>('send')
  const sendingRef = React.useRef(false)
  const mountedRef = React.useRef(true)
  const [session] = React.useState(createHoldRecording)
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true })
  const recorderState = useAudioRecorderState(recorder, 100)

  React.useEffect(() => {
    if (phase === 'recording' && recorderState.durationMillis >= MAX_RECORDING_MS) {
      // 到上限时仍尊重手指当前选择，取消区不能误发。
      release(targetRef.current)
    }
  }, [phase, recorderState.durationMillis, release])

  React.useEffect(() => {
    mountedRef.current = true
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') void session.cancel()
    })
    return () => {
      mountedRef.current = false
      subscription.remove()
      void session.cancel()
    }
  }, [session, gameKey])

  async function sendText(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError('')
    try {
      await onSend(trimmed)
      if (mountedRef.current) setReviewText(null)
    } catch (e) {
      // 发送失败留在文字浮层，保留全文供修改或重试。
      if (mountedRef.current) {
        setReviewText(text)
        setError(e instanceof Error && e.message ? e.message : getT()('dfPlayVoiceSendFailed'))
      }
    } finally {
      sendingRef.current = false
      if (mountedRef.current) setSending(false)
    }
  }

  function press() {
    if (sendingRef.current || reviewText !== null) return
    setError('')
    setNotice('')
    setTarget('send')
    targetRef.current = 'send'
    void session.press({
      async authorize() {
        let permission = await getRecordingPermissionsAsync()
        if (!permission.granted) {
          // 系统弹窗会打断手势，授权后重新按住，不能在松手后自动开录。
          void session.cancel()
          permission = await requestRecordingPermissionsAsync()
          if (!mountedRef.current) return
          if (permission.granted) setNotice(getT()('dfPlayMicReady'))
          else setError(getT()('dfErrorsMicDenied'))
        }
      },
      async prepare() {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
        await recorder.prepareToRecordAsync()
      },
      record: () => recorder.record(),
      stop: () => recorder.stop(),
      resetAudioMode: () => setAudioModeAsync({ allowsRecording: false }),
      async transcribe() {
        const uri = recorder.uri
        if (!uri) throw new Error(getT()('dfErrorsRecordFailed'))
        const bytes = await new File(uri).bytes()
        if (bytes.length < MIN_VALID_BYTES) throw new Error(getT()('dfErrorsEmptyRecording'))
        const text = await transcribeAudio(gameKey, bytes, 'audio/mp4')
        if (!text.trim()) throw new Error(getT()('dfPlayVoiceNoText'))
        return text
      },
      async onText(text, destination) {
        if (!mountedRef.current) return
        if (destination === 'edit') setReviewText(text)
        else await sendText(text)
      },
      onPhase: (next) => { if (mountedRef.current) setPhase(next) },
      onError: (e) => {
        if (mountedRef.current) setError(e instanceof Error && e.message ? e.message : getT()('dfErrorsRecordFailed'))
      },
    })
  }

  function selectTarget(next: RecordingTarget) {
    targetRef.current = next
    setTarget(next)
  }

  function release(destination: RecordingTarget = targetRef.current) {
    if (destination === 'cancel') void session.cancel()
    else void session.release(destination)
  }

  function dismiss() {
    if (sendingRef.current) return
    void session.cancel()
    setReviewText(null)
    setError('')
  }

  return {
    recording: phase === 'recording',
    busy: phase === 'transcribing' || sending,
    preparing: phase === 'preparing',
    available: asrEnabled,
    error,
    notice,
    target,
    durationMillis: phase === 'preparing' ? 0 : recorderState.durationMillis,
    metering: phase === 'recording' ? recorderState.metering : undefined,
    reviewText,
    sending,
    onPressIn: press,
    onPressOut: release,
    onTargetChange: selectTarget,
    onCancel: () => { void session.cancel() },
    onReviewChange: setReviewText,
    onReviewSend: () => { if (reviewText !== null) void sendText(reviewText) },
    onDismiss: dismiss,
  }
}

export type VoiceInputState = ReturnType<typeof useVoiceInput>
