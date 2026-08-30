/**
 * 服务器开启 TTS（game store 的 ttsEnabled）时，新 GM 叙事到达自动朗读。
 * 首次拿到日志只记基线：进入对局/中途开启开关都不回放历史叙事。
 */
import * as React from 'react'
import type { LogEntry } from '@/api/types'

import { pickAutoSpeak } from './autoSpeak'

export function useAutoSpeak(
  enabled: boolean,
  log: LogEntry[],
  speak: (text: string) => void,
) {
  const lastSignature = React.useRef('')
  React.useEffect(() => {
    if (!enabled) return
    const pick = pickAutoSpeak(log, lastSignature.current)
    if (!pick) return
    lastSignature.current = pick.signature
    if (!pick.baseline) speak(pick.text)
  }, [enabled, log, speak])
}
