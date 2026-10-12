/**
 * 本机角色库（离线内容库里的角色卡）：列表、新建、编辑、复制、删除，以及加入对局用的本机卡。
 *
 * 每个操作只写一项、一个事务（仓储方法即一次 Drizzle 事务）。批量写入（M5 推送结果、
 * M6 拉取）要逐项写、项与项之间让出 JS 线程——expo-sqlite 走同步 API，大文档成批写会卡界面。
 */
import * as React from 'react'

import { currentBaseUrl, errorMessage } from '@/api/client'
import { fetchCharacterSchema, fetchRuleLibrary } from '@/api/library'
import type { CharacterCard, CharacterSchemaResponse, RulesResponse } from '@/api/types'
import { localCardEdit, newLocalCardBody, type EditorSnapshot } from '@/lib/local-library/card-edit'
import { createLatestGuard, createYielder } from '@/lib/local-library/yielder'
import type { LocalItemSummary } from '@/lib/local-library/repository'
import { withRuleCache } from '@/lib/local-library/rule-cache'
import { groupLinksByLocalId, localItemBadges, type LocalItemBadge } from '@/lib/local-library/sync-status'
import type { CharacterCardPatch } from '@/lib/character-card'
import {
  CARD_FORMAT,
  cardSummary,
  joinCardFromDocument,
  newCardDocument,
  patchCardDocument,
  readCardV3,
} from '@/lib/portable/card-v3'
import { localLibrary } from '@/stores/local-library'

export interface LocalCardView extends LocalItemSummary {
  /** 卡体（展示用：出身、职业、背景、头像） */
  body: CharacterCard
  /** 列表状态标记（未推送改动 / 服务器已删除 / 服务器锁定） */
  badges: LocalItemBadge[]
}

/**
 * 规则缓存的服务器分槽键：当前连接地址；Web 同源部署时地址为空串，用固定的同源槽位
 * （Web 端本来也没有本机库，这里只是让键有意义）。
 */
function ruleCacheKey(): string {
  return currentBaseUrl() || 'same-origin'
}

async function readLocalCards(): Promise<LocalCardView[] | null> {
  const library = await localLibrary()
  if (!library) return null
  // 逐项读文档，按时间预算让出 JS 线程（同步 SQLite 读大文档会占线程）
  const maybeYield = createYielder()
  const views: LocalCardView[] = []
  const links = groupLinksByLocalId(library.listAllLinks())
  for (const summary of library.listItems({ kind: 'character_template' })) {
    const item = library.getItem(summary.localId)
    if (!item) continue
    const badges = localItemBadges(summary, links)
    try {
      views.push({ ...summary, badges, body: readCardV3(item.document).body })
    } catch {
      // 文档坏了也列出来（只读展示），不让一项拖垮整个列表
      views.push({ ...summary, badges, readOnly: true, body: { character_name: summary.name } as CharacterCard })
    }
    await maybeYield()
  }
  return views
}

/** 加入对局可选的本机卡（规则托管卡不能用于移动端加入，文档坏了的也跳过） */
export async function loadLocalJoinCards(): Promise<CharacterCard[]> {
  const library = await localLibrary().catch(() => null)
  if (!library) return []
  const cards: CharacterCard[] = []
  for (const summary of library.listItems({ kind: 'character_template' })) {
    if (summary.readOnly) continue
    const item = library.getItem(summary.localId)
    if (!item) continue
    try {
      cards.push(joinCardFromDocument(item.document))
    } catch {
      // 跳过
    }
  }
  return cards
}

/** 规则库与角色模板：在线取最新并写入本机缓存，离线用缓存（按服务器地址分槽） */
export async function cachedRuleLibrary(): Promise<RulesResponse> {
  const library = await localLibrary().catch(() => null)
  const serverKey = ruleCacheKey()
  const { value } = await withRuleCache<RulesResponse>({
    fetch: fetchRuleLibrary,
    read: () => library?.getRuleCache<RulesResponse>(serverKey, '')?.payload ?? null,
    write: (rules) => library?.putRuleCache(serverKey, '', rules),
  })
  return value
}

export async function cachedCharacterSchema(ruleId: string): Promise<CharacterSchemaResponse> {
  const library = await localLibrary().catch(() => null)
  const serverKey = ruleCacheKey()
  const { value } = await withRuleCache<CharacterSchemaResponse>({
    fetch: () => fetchCharacterSchema(ruleId),
    read: () => library?.getRuleCache<CharacterSchemaResponse>(serverKey, ruleId)?.payload ?? null,
    write: (schema) => library?.putRuleCache(serverKey, ruleId, schema),
  })
  return value
}

export function useLocalCards() {
  /** null = 本机库不可用（Web 端） */
  const [cards, setCards] = React.useState<LocalCardView[] | null>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [guard] = React.useState(createLatestGuard)

  async function load() {
    const isLatest = guard.begin()
    setLoading(true)
    try {
      const next = await readLocalCards()
      if (!isLatest()) return
      setCards(next)
      setError('')
    } catch (cause) {
      if (isLatest()) setError(errorMessage(cause))
    } finally {
      if (isLatest()) setLoading(false)
    }
  }

  React.useEffect(() => { queueMicrotask(() => void load()) }, [])

  async function requireLibrary() {
    const library = await localLibrary()
    if (!library) throw new Error('local library is not available on this platform')
    return library
  }

  async function addCard(editor: CharacterCardPatch) {
    const library = await requireLibrary()
    const document = newCardDocument(newLocalCardBody(editor) as Parameters<typeof newCardDocument>[0])
    library.createItem({ kind: 'character_template', format: CARD_FORMAT, document, ...cardSummary(document) })
    await load()
  }

  async function updateCard(localId: string, editor: CharacterCardPatch, snapshot: EditorSnapshot) {
    const library = await requireLibrary()
    const item = library.getItem(localId)
    if (!item) throw new Error(`local card ${localId} not found`)
    const { patch, remove } = localCardEdit(readCardV3(item.document).body, editor, snapshot)
    const document = patchCardDocument(item.document, patch, { remove })
    const { name, ruleId } = cardSummary(document)
    library.updateDocument(localId, { document, name, ruleId })
    await load()
  }

  /** 复制为新的本机项（只读卡也能复制；副本没有拉取来源，推送时作为新卡） */
  async function duplicateCard(localId: string) {
    const library = await requireLibrary()
    const item = library.getItem(localId)
    if (!item) throw new Error(`local card ${localId} not found`)
    library.createItem({
      kind: 'character_template',
      format: item.format,
      document: item.document,
      name: item.name,
      ruleId: item.ruleId,
      readOnly: item.readOnly,
    })
    await load()
  }

  async function deleteCard(localId: string) {
    const library = await requireLibrary()
    library.deleteItem(localId)
    await load()
  }

  return { cards, loading, error, refresh: load, addCard, updateCard, duplicateCard, deleteCard }
}
