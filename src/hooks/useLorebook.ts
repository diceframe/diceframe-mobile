import * as React from 'react'

import { errorMessage } from '@/api/client'
import { createLoreEntry, createWorld, deleteLoreEntry, fetchLoreEntries, fetchWorlds, updateLoreEntry, type WorldRecord } from '@/api/library'
import { getT } from '@/i18n/t'
import type { LorebookEntry } from '@/types'

// 条目 category 直接沿用服务端类型 key（npc/location/...），展示名由界面经 t() 翻译
export type LoreCategory = 'npc' | 'location' | 'item' | 'faction' | 'event' | 'other'

export const LORE_CATEGORIES: readonly LoreCategory[] = ['npc', 'location', 'item', 'faction', 'event', 'other']

function toCategory(type?: string | null): LoreCategory {
  const value = (type || 'other') as LoreCategory
  return LORE_CATEGORIES.includes(value) ? value : 'other'
}

export function useLorebook() {
  const [worlds, setWorlds] = React.useState<WorldRecord[]>([])
  const [worldId, setWorldId] = React.useState('')
  const [entries, setEntries] = React.useState<LorebookEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  async function loadWorlds() {
    try {
      const result = await fetchWorlds()
      const next = result.worlds ?? []
      setWorlds(next)
      setWorldId((current) => current || String(next[0]?.id || next[0]?.world_id || ''))
      setError('')
    } catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }

  async function loadEntries(targetWorldId: string) {
    if (!targetWorldId) { setEntries([]); return }
    setLoading(true)
    try {
      const result = await fetchLoreEntries(targetWorldId)
      setEntries((result.entries ?? []).map((entry) => ({
        id: String(entry.id || ''),
        title: entry.name,
        content: entry.content || '',
        category: toCategory(entry.type),
        isPublic: entry.tier !== 'archived',
        createdAt: '',
        updatedAt: '',
      })).filter((entry) => entry.id))
      setError('')
    } catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }

  React.useEffect(() => { queueMicrotask(() => void loadWorlds()) }, [])
  React.useEffect(() => { queueMicrotask(() => void loadEntries(worldId)) }, [worldId])

  async function addEntry(data: { title: string; content: string; category: string; isPublic: boolean }) {
    if (!worldId) throw new Error(getT()('dfLoreCreateWorldFirst'))
    const result = await createLoreEntry({ world_id: worldId, name: data.title, content: data.content, type: toCategory(data.category), tier: data.isPublic ? 'background' : 'archived' })
    if (result.ok === false) throw new Error(result.error || getT()('dfLoreSaveEntryFailed'))
    await loadEntries(worldId)
  }

  async function editEntry(id: string, data: { title: string; content: string; category: string; isPublic: boolean }) {
    const result = await updateLoreEntry(id, { name: data.title, content: data.content, type: toCategory(data.category), tier: data.isPublic ? 'background' : 'archived' })
    if (result.ok === false) throw new Error(result.error || getT()('dfLoreUpdateEntryFailed'))
    await loadEntries(worldId)
  }

  async function removeEntry(id: string) {
    const result = await deleteLoreEntry(id)
    if (result.ok === false) throw new Error(result.error || getT()('dfLoreDeleteEntryFailed'))
    await loadEntries(worldId)
  }

  async function addWorld(name: string) {
    const result = await createWorld(name)
    if (result.ok === false || !result.world_id) throw new Error(result.error || getT()('dfLoreCreateWorldFailed'))
    await loadWorlds()
    setWorldId(result.world_id)
  }

  return { worlds, worldId, setWorldId, entries, loading, error, refresh: () => loadEntries(worldId), addWorld, addEntry, updateEntry: editEntry, deleteEntry: removeEntry }
}
