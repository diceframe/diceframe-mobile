/**
 * 本机 Lorebook（离线内容库里的独立书）：书列表与单本书的条目编辑。
 * 每个操作只写一项、一个事务；列表逐项读文档并按时间预算让出 JS 线程。
 */
import * as React from 'react'
import { randomUUID } from 'expo-crypto'

import { errorMessage } from '@/api/client'
import {
  createLocalLorebook,
  deleteLocalLorebookEntry,
  duplicateLocalLorebook,
  openLocalLorebook,
  renameLocalLorebook,
  saveLocalLorebookEntry,
} from '@/lib/local-library/lorebook-library'
import type { LocalItemSummary } from '@/lib/local-library/repository'
import { localItemBadges, type LocalItemBadge } from '@/lib/local-library/sync-status'
import { createLatestGuard, createYielder } from '@/lib/local-library/yielder'
import { readLorebookV3, type LorebookBook, type LorebookEntryEdit } from '@/lib/portable/lorebook-v3'
import { localLibrary } from '@/stores/local-library'

export interface LocalLorebookView extends LocalItemSummary {
  description: string
  entryCount: number
  /** 列表状态标记（未推送改动 / 服务器已删除 / 服务器锁定） */
  badges: LocalItemBadge[]
}

async function requireLibrary() {
  const library = await localLibrary()
  if (!library) throw new Error('local library is not available on this platform')
  return library
}

async function readLocalLorebooks(): Promise<LocalLorebookView[] | null> {
  const library = await localLibrary()
  if (!library) return null
  const maybeYield = createYielder()
  const views: LocalLorebookView[] = []
  const links = library.listAllLinks()
  for (const summary of library.listItems({ kind: 'lorebook' })) {
    const item = library.getItem(summary.localId)
    if (!item) continue
    const badges = localItemBadges(summary, links)
    try {
      const book = readLorebookV3(item.document)
      views.push({ ...summary, badges, description: String(book.description ?? ''), entryCount: book.entries.length })
    } catch {
      // 文档坏了也列出来（只读），不让一项拖垮整个列表
      views.push({ ...summary, badges, readOnly: true, description: '', entryCount: 0 })
    }
    await maybeYield()
  }
  return views
}

export function useLocalLorebooks() {
  /** null = 本机库不可用（Web 端） */
  const [books, setBooks] = React.useState<LocalLorebookView[] | null>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [guard] = React.useState(createLatestGuard)

  async function load() {
    const isLatest = guard.begin()
    setLoading(true)
    try {
      const next = await readLocalLorebooks()
      if (!isLatest()) return
      setBooks(next)
      setError('')
    } catch (cause) {
      if (isLatest()) setError(errorMessage(cause))
    } finally {
      if (isLatest()) setLoading(false)
    }
  }

  React.useEffect(() => { queueMicrotask(() => void load()) }, [])

  async function createBook(name: string, description = '') {
    createLocalLorebook(await requireLibrary(), name, description)
    await load()
  }

  async function renameBook(localId: string, patch: { name?: string; description?: string }) {
    renameLocalLorebook(await requireLibrary(), localId, patch)
    await load()
  }

  async function duplicateBook(localId: string, name: string) {
    duplicateLocalLorebook(await requireLibrary(), localId, name)
    await load()
  }

  async function deleteBook(localId: string) {
    ;(await requireLibrary()).deleteItem(localId)
    await load()
  }

  return { books, loading, error, refresh: load, createBook, renameBook, duplicateBook, deleteBook }
}

/** 单本书的条目编辑；打开时补齐并存回稳定条目 id */
export function useLocalLorebook(localId: string) {
  const [book, setBook] = React.useState<LorebookBook | null>(null)
  const [readOnly, setReadOnly] = React.useState(false)
  const [error, setError] = React.useState('')
  const [guard] = React.useState(createLatestGuard)

  async function load() {
    const isLatest = guard.begin()
    try {
      const opened = openLocalLorebook(await requireLibrary(), localId, randomUUID)
      if (!isLatest()) return
      setBook(opened.book)
      setReadOnly(opened.item.readOnly)
      setError('')
    } catch (cause) {
      if (isLatest()) setError(errorMessage(cause))
    }
  }

  React.useEffect(() => { queueMicrotask(() => void load()) }, [localId])

  async function saveEntry(entryId: string, edit: LorebookEntryEdit) {
    saveLocalLorebookEntry(await requireLibrary(), localId, entryId, edit, randomUUID)
    await load()
  }

  async function deleteEntry(entryId: string) {
    deleteLocalLorebookEntry(await requireLibrary(), localId, entryId)
    await load()
  }

  return { book, readOnly, error, refresh: load, saveEntry, deleteEntry }
}
