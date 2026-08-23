/**
 * 语音输入（本项目的核心诉求）：
 * 原生录音（m4a/AAC）→ 读文件字节 → POST /games/{key}/transcription 转写。
 * 原生录音不受浏览器安全上下文限制，局域网 HTTP 下可用（Web 端 getUserMedia 的痛点）。
 */
import * as React from 'react'
import { File } from 'expo-file-system'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'

import { transcribeAudio } from '@/api/speech'
import { useGameStore } from '@/stores/game'
import { strings } from '@/lib/strings'

const MAX_RECORDING_MS = 60_000
/** 低于该大小的录音视为无效（对应 expo-audio 在部分 Android 机型上的零字节文件问题） */
const MIN_VALID_BYTES = 2000

/** base64 → Uint8Array（Hermes 环境无 atob 依赖） */
function base64ToBytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Uint8Array(256)
  for (let i = 0; i < 64; i++) lookup[alphabet.charCodeAt(i)] = i
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const padding = clean.length % 4 === 0 ? 0 : 4 - (clean.length % 4)
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4) - padding)
  let pointer = 0
  for (let i = 0; i + 3 < clean.length + 1; i += 4) {
    const a = lookup[clean.charCodeAt(i)] ?? 0
    const b = lookup[clean.charCodeAt(i + 1)] ?? 0
    const c = lookup[clean.charCodeAt(i + 2)] ?? 0
    const d = lookup[clean.charCodeAt(i + 3)] ?? 0
    if (pointer < bytes.length) bytes[pointer++] = (a << 2) | (b >> 4)
    if (pointer < bytes.length) bytes[pointer++] = ((b & 15) << 4) | (c >> 2)
    if (pointer < bytes.length) bytes[pointer++] = ((c & 3) << 6) | d
  }
  return bytes
}

export function useVoiceInput(gameKey: string, onText: (text: string) => void) {
  const asrEnabled = useGameStore((s) => s.asrEnabled)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const stoppingRef = React.useRef(false)

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder)
  const recording = recorderState.isRecording

  // 60s 硬上限：到时自动停止并转写（对齐 Web MAX_RECORDING_SECONDS）。
  // stopAndTranscribe 由 React Compiler 自动记忆化，依赖身份稳定。
  React.useEffect(() => {
    if (recording && recorderState.durationMillis >= MAX_RECORDING_MS && !stoppingRef.current) {
      void stopAndTranscribe()
    }
  }, [recording, recorderState.durationMillis, stopAndTranscribe])

  async function stopAndTranscribe() {
    if (stoppingRef.current) return
    stoppingRef.current = true
    setBusy(true)
    setError('')
    try {
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) {
        setError(strings.errors.recordFailed)
        return
      }
      const bytes = base64ToBytes(await new File(uri).base64())
      if (bytes.length < MIN_VALID_BYTES) {
        setError(strings.errors.emptyRecording)
        return
      }
      const text = await transcribeAudio(gameKey, bytes, 'audio/mp4')
      if (text.trim()) onText(text.trim())
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : strings.errors.asrFailed)
    } finally {
      stoppingRef.current = false
      setBusy(false)
    }
  }

  async function start() {
    setError('')
    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) {
      setError(strings.errors.micDenied)
      return
    }
    try {
      recorder.record()
    } catch {
      setError(strings.errors.recordFailed)
    }
  }

  function toggle() {
    if (busy) return
    if (recording) {
      void stopAndTranscribe()
    } else {
      void start()
    }
  }

  return {
    recording,
    busy,
    available: asrEnabled,
    error,
    onToggle: toggle,
  }
}
