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
import { localCardEdit, newLocalCardBody } from '@/lib/local-library/card-edit'
import type { LocalItemSummary } from '@/lib/local-library/repository'
import { withRuleCache } from '@/lib/local-library/rule-cache'
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
}

/** 让出 JS 线程（逐项读写之间），避免大批量操作长时间占用界面线程 */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function readLocalCards(): Promise<LocalCardView[] | null> {
  const library = await localLibrary()
  if (!library) return null
  const views: LocalCardView[] = []
  for (const summary of library.listItems({ kind: 'character_template' })) {
    const item = library.getItem(summary.localId)
    if (!item) continue
    try {
      views.push({ ...summary, body: readCardV3(item.document).body })
    } catch {
      // 文档坏了也列出来（只读展示），不让一项拖垮整个列表
      views.push({ ...summary, readOnly: true, body: { character_name: summary.name } as CharacterCard })
    }
    await yieldToUi()
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
  const serverKey = currentBaseUrl() || 'web'
  const { value } = await withRuleCache<RulesResponse>({
    fetch: fetchRuleLibrary,
    read: () => library?.getRuleCache<RulesResponse>(serverKey, '')?.payload ?? null,
    write: (rules) => library?.putRuleCache(serverKey, '', rules),
  })
  return value
}

export async function cachedCharacterSchema(ruleId: string): Promise<CharacterSchemaResponse> {
  const library = await localLibrary().catch(() => null)
  const serverKey = currentBaseUrl() || 'web'
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

  async function load() {
    setLoading(true)
    try {
      setCards(await readLocalCards())
      setError('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
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

  async function updateCard(localId: string, editor: CharacterCardPatch) {
    const library = await requireLibrary()
    const item = library.getItem(localId)
    if (!item) throw new Error(`local card ${localId} not found`)
    const { patch, remove } = localCardEdit(readCardV3(item.document).body, editor)
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
