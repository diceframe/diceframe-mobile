import * as React from 'react'

import { errorMessage } from '@/api/client'
import { createLoreEntry, createWorld, deleteLoreEntry, fetchLoreEntries, fetchWorlds, updateLoreEntry, type LoreRecord, type WorldRecord } from '@/api/library'
import { toLoreEntryView, visibilityForMode, type LoreType, type LoreTier, type LoreVisibilityMode, type LorebookEntryView } from '@/lib/lorebook'
import { getT } from '@/i18n/t'

/** 编辑表单提交的数据：type/tier 为真实服务端值，可见性为三档档位 + 点名候选 */
export interface LoreEntryForm {
  title: string
  content: string
  type: LoreType
  tier: LoreTier
  visibility: LoreVisibilityMode
  /** characters 档的点名候选（uid 或角色名），保存前经 visibilityForMode 清洗 */
  visibleTo: string[]
}

export function useLorebook() {
  const [worlds, setWorlds] = React.useState<WorldRecord[]>([])
  const [worldId, setWorldId] = React.useState('')
  const [entries, setEntries] = React.useState<LorebookEntryView[]>([])
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
      setEntries((result.entries ?? [])
        // 视图模型无损保留 type/tier/visible_to：可见性徽章与编辑表单都从真实字段派生，
        // 不再用 tier 冒充可见性（tier 只表示重要度）
        .map((entry) => toLoreEntryView(entry))
        .filter((entry): entry is LorebookEntryView => entry !== null))
      setError('')
    } catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }

  React.useEffect(() => { queueMicrotask(() => void loadWorlds()) }, [])
  React.useEffect(() => { queueMicrotask(() => void loadEntries(worldId)) }, [worldId])

  async function addEntry(data: LoreEntryForm) {
    if (!worldId) throw new Error(getT()('dfLoreCreateWorldFirst'))
    const payload = {
      world_id: worldId,
      name: data.title,
      content: data.content,
      type: data.type,
      tier: data.tier,
      visible_to: visibilityForMode(data.visibility, data.visibleTo),
    }
    // LoreRecord 契约未声明 visible_to（api/library.ts 不在本次改动清单内），
    // 服务端 POST /lorebook 接受该字段（对齐上游 LoreEdit），边界处收窄类型
    const result = await createLoreEntry(payload as LoreRecord)
    if (result.ok === false) throw new Error(result.error || getT()('dfLoreSaveEntryFailed'))
    await loadEntries(worldId)
  }

  async function editEntry(id: string, data: LoreEntryForm) {
    const patch = {
      name: data.title,
      content: data.content,
      // type 原样写回（openEdit 保留条目原始 type），不再折叠成 other 造成数据污染
      type: data.type,
      tier: data.tier,
      // 可见性唯一事实来源：按档位写 visible_to，tier 不再被可见性绑架
      visible_to: visibilityForMode(data.visibility, data.visibleTo),
    }
    // 同上：LoreRecord 未声明 visible_to，PUT /lorebook/{id} 实际接受，边界处收窄
    const result = await updateLoreEntry(id, patch as Partial<LoreRecord>)
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
