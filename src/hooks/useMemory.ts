import * as React from 'react'

import { errorMessage } from '@/api/client'
import { deleteMemory as deleteMemoryApi, fetchMemories } from '@/api/library'
import { getT } from '@/i18n/t'
import { UserFacingError } from '@/lib/user-facing-error'
import type { MemoryItem } from '@/types'

function toMemoryItem(entry: Record<string, unknown>): MemoryItem {
  return {
    id: String(entry.id || ''),
    content: [entry.entity, entry.relation, entry.value].filter(Boolean).map(String).join(' · '),
    weight: Number(entry.confidence ?? 1),
    createdAt: String(entry.created_at || ''),
  }
}

/** 真实记忆存储是按对局隔离的，并且只允许系统提取、人工编辑/遗忘。 */
export function useMemory(gameKey: string) {
  const [memories, setMemories] = React.useState<MemoryItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const searchMemories = React.useCallback(async (query = '') => {
    if (!gameKey) { setMemories([]); return }
    setLoading(true)
    try {
      const result = await fetchMemories(gameKey, query)
      setMemories((result.memories ?? result.entries ?? []).map(toMemoryItem))
      setError('')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [gameKey])

  React.useEffect(() => { queueMicrotask(() => void searchMemories()) }, [searchMemories])

  async function deleteMemory(id: string) {
    const result = await deleteMemoryApi(gameKey, Number(id))
    if (result.ok === false) throw new Error(result.error || getT()('dfMemoryDeleteFailed'))
    await searchMemories()
  }

  async function addMemory(): Promise<never> {
    throw new UserFacingError('dfMemoryAddUnsupported')
  }

  return { memories, loading, error, addMemory, deleteMemory, searchMemories, refreshMemories: searchMemories }
}
