/** 按住录音：松手发送、滑向「文」编辑后发送、滑向取消丢弃录音。 */
import * as React from 'react'
import { AppState } from 'react-native'
import { File } from 'expo-file-system'
import {
  AudioQuality,
  IOSOutputFormat,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import type { RecordingOptions } from 'expo-audio'

import { transcribeAudio, transcribeErrorText } from '@/api/speech'
import { errorMessage } from '@/api/client'
import { toastError, toastNotice } from '@/components/patterns/toast'
import { UserFacingError } from '@/lib/user-facing-error'
import { getT, contentLanguage } from '@/i18n/t'
import { asrLanguageFor } from '@/lib/speech-config'
import { createHoldRecording, type RecordingPhase, type RecordingTarget } from '@/lib/hold-recording'
import { useGameStore } from '@/stores/game'
import { getLocales } from 'expo-localization'

const MAX_RECORDING_MS = 60_000
const MIN_VALID_BYTES = 2000

/** 设备系统语言标签，与 useLocaleSync 同源同默认（'system' 偏好和未知语言的回落基准）。 */
function deviceLanguageTag(): string {
  return getLocales()[0]?.languageTag ?? 'zh-CN'
}

/** Whisper 侧统一按 16k 单声道重采样，立体声高清预设只放大上传体积，这里按语音识别的最优参数录。 */
const ASR_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH },
  web: { mimeType: 'audio/webm', bitsPerSecond: 48000 },
}

export function useVoiceInput(gameKey: string, onSend: (text: string) => Promise<void>) {
  const asrEnabled = useGameStore((s) => s.asrEnabled)
  const [phase, setPhase] = React.useState<RecordingPhase>('idle')
  // error 只承载发送失败的持久上下文（编辑浮层内展示）；录音/识别类瞬时失败直接走 toast。
  const [error, setError] = React.useState('')
  const [reviewText, setReviewText] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const [target, setTarget] = React.useState<RecordingTarget>('send')
  const targetRef = React.useRef<RecordingTarget>('send')
  const sendingRef = React.useRef(false)
  const mountedRef = React.useRef(true)
  const [session] = React.useState(createHoldRecording)
  const recorder = useAudioRecorder({ ...ASR_RECORDING_OPTIONS, isMeteringEnabled: true })
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
        setError(errorMessage(e, 'dfPlayVoiceSendFailed'))
      }
    } finally {
      sendingRef.current = false
      if (mountedRef.current) setSending(false)
    }
  }

  function press() {
    if (sendingRef.current || reviewText !== null) return
    setError('')
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
          if (permission.granted) toastNotice(getT()('dfPlayMicReady'))
          else toastError(getT()('dfErrorsMicDenied'))
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
        if (!uri) throw new UserFacingError('dfErrorsRecordFailed')
        const bytes = await new File(uri).bytes()
        // 过小的静音/误触录音本地拦下，不值得为它等一次几十秒的识别请求；空文本由服务端负责报错。
        if (bytes.length < MIN_VALID_BYTES) throw new UserFacingError('dfErrorsEmptyRecording')
        return transcribeAudio(
          gameKey,
          bytes,
          'audio/mp4',
          asrLanguageFor(contentLanguage(), deviceLanguageTag()),
        )
      },
      async onText(text, destination) {
        if (!mountedRef.current) return
        if (destination === 'edit') setReviewText(text)
        else await sendText(text)
      },
      onPhase: (next) => { if (mountedRef.current) setPhase(next) },
      onError: (e) => {
        if (mountedRef.current) toastError(transcribeErrorText(e, 'dfErrorsRecordFailed'))
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
