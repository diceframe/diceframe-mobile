import * as React from 'react'

import { errorMessage } from '@/api/client'
import { createLoreEntry, createWorld, deleteLoreEntry, fetchLoreEntries, fetchWorlds, updateLoreEntry, type WorldRecord } from '@/api/library'
import type { LorebookEntry } from '@/types'

const TYPE_TO_CATEGORY: Record<string, string> = { npc: '人物', location: '地点', item: '物品', faction: '组织', event: '事件', other: '其他' }
const CATEGORY_TO_TYPE: Record<string, string> = { 人物: 'npc', 地点: 'location', 物品: 'item', 组织: 'faction', 事件: 'event', 其他: 'other' }

export function useLorebook() {
  const [worlds, setWorlds] = React.useState<WorldRecord[]>([])
  const [worldId, setWorldId] = React.useState('')
  const [entries, setEntries] = React.useState<LorebookEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const loadWorlds = React.useCallback(async () => {
    try {
      const result = await fetchWorlds()
      const next = result.worlds ?? []
      setWorlds(next)
      setWorldId((current) => current || String(next[0]?.id || next[0]?.world_id || ''))
      setError('')
    } catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }, [])

  const loadEntries = React.useCallback(async (targetWorldId: string) => {
    if (!targetWorldId) { setEntries([]); return }
    setLoading(true)
    try {
      const result = await fetchLoreEntries(targetWorldId)
      setEntries((result.entries ?? []).map((entry) => ({
        id: String(entry.id || ''),
        title: entry.name,
        content: entry.content || '',
        category: TYPE_TO_CATEGORY[entry.type || 'other'] || '其他',
        isPublic: entry.tier !== 'archived',
        createdAt: '',
        updatedAt: '',
      })).filter((entry) => entry.id))
      setError('')
    } catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { queueMicrotask(() => void loadWorlds()) }, [loadWorlds])
  React.useEffect(() => { queueMicrotask(() => void loadEntries(worldId)) }, [loadEntries, worldId])

  async function addEntry(data: { title: string; content: string; category: string; isPublic: boolean }) {
    if (!worldId) throw new Error('请先创建世界书')
    const result = await createLoreEntry({ world_id: worldId, name: data.title, content: data.content, type: CATEGORY_TO_TYPE[data.category] || 'other', tier: data.isPublic ? 'background' : 'archived' })
    if (result.ok === false) throw new Error(result.error || '保存设定失败')
    await loadEntries(worldId)
  }

  async function editEntry(id: string, data: { title: string; content: string; category: string; isPublic: boolean }) {
    const result = await updateLoreEntry(id, { name: data.title, content: data.content, type: CATEGORY_TO_TYPE[data.category] || 'other', tier: data.isPublic ? 'background' : 'archived' })
    if (result.ok === false) throw new Error(result.error || '更新设定失败')
    await loadEntries(worldId)
  }

  async function removeEntry(id: string) {
    const result = await deleteLoreEntry(id)
    if (result.ok === false) throw new Error(result.error || '删除设定失败')
    await loadEntries(worldId)
  }

  async function addWorld(name: string) {
    const result = await createWorld(name)
    if (result.ok === false || !result.world_id) throw new Error(result.error || '创建世界书失败')
    await loadWorlds()
    setWorldId(result.world_id)
  }

  return { worlds, worldId, setWorldId, entries, loading, error, refresh: () => loadEntries(worldId), addWorld, addEntry, updateEntry: editEntry, deleteEntry: removeEntry }
}
