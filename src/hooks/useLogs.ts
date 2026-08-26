import * as React from 'react'

import { fetchLog, fetchPrivateLog } from '@/api/games'
import { errorMessage } from '@/api/client'
import type { PrivateLogResponse } from '@/api/types'

export interface NarrativeLogItem {
  id: string
  kind: 'story' | 'private'
  round: number
  title: string
  content: string
  detail?: string
}

function actionText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(actionText).filter(Boolean).join('；')
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return String(record.text || record.action || record.content || record.character_name || '')
  }
  return String(value)
}

export function useLogs(gameKey: string) {
  const [logs, setLogs] = React.useState<NarrativeLogItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const refreshLogs = React.useCallback(async () => {
    if (!gameKey) { setLogs([]); return }
    setLoading(true)
    try {
      const [storyResult, privateResult] = await Promise.all([
        fetchLog(gameKey),
        fetchPrivateLog(gameKey).catch((): PrivateLogResponse => ({ messages: [] })),
      ])
      const story: NarrativeLogItem[] = (storyResult.log ?? []).map((entry, index) => ({
        id: `story:${entry.round ?? index}`,
        kind: 'story',
        round: Number(entry.round ?? index + 1),
        title: `第 ${entry.round ?? index + 1} 轮叙事`,
        content: String(entry.gm_response || '本轮没有叙事文本'),
        detail: actionText(entry.player_actions || entry.actions),
      }))
      const rawPrivate = privateResult.messages ?? privateResult.private_log ?? []
      const privateItems: NarrativeLogItem[] = rawPrivate.map((message, index) => ({
        id: `private:${message.round ?? 0}:${index}`,
        kind: 'private',
        round: Number(message.round ?? 0),
        title: message.character_name ? `${message.character_name} 的私密消息` : '私密消息',
        content: String(message.text || ''),
      }))
      setLogs([...story, ...privateItems].sort((a, b) => b.round - a.round))
      setError('')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [gameKey])

  React.useEffect(() => { queueMicrotask(() => void refreshLogs()) }, [refreshLogs])

  return { logs, loading, error, refreshLogs }
}
