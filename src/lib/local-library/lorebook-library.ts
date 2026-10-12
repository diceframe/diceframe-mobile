/**
 * 本机 Lorebook（独立书）的库操作：每个操作只写一项、一个事务（仓储方法）。
 * 文档始终是完整的 lorebook_v3：书级设置、条目里不认识的字段原样保留。
 */
import { cloneJson, isJsonObject } from '@/lib/portable/json'
import {
  LOREBOOK_FORMAT,
  ensureEntryIds,
  lorebookSummary,
  newLorebookDocument,
  patchBook,
  readLorebookV3,
  removeEntry,
  upsertEntry,
  writeLorebookV3,
  type LorebookBook,
  type LorebookEntryEdit,
} from '@/lib/portable/lorebook-v3'

import { LOCAL_ITEM_NOT_FOUND, LocalLibraryError, type LocalItem, type LocalLibraryRepository } from './repository'

/** 写回书：保留 `{spec, data: {lorebook}}` 外形里的其他字段 */
export function lorebookDocumentWith(document: unknown, book: LorebookBook): unknown {
  if (isJsonObject(document) && isJsonObject(document.data) && isJsonObject(document.data.lorebook)) {
    return { ...cloneJson(document), data: { ...cloneJson(document.data), lorebook: cloneJson(book) } }
  }
  return writeLorebookV3(book)
}

function requireBook(library: LocalLibraryRepository, localId: string): LocalItem {
  const item = library.getItem(localId)
  if (!item || item.kind !== 'lorebook') throw new LocalLibraryError(LOCAL_ITEM_NOT_FOUND, `local lorebook ${localId} not found`)
  return item
}

export function createLocalLorebook(library: LocalLibraryRepository, name: string, description = ''): LocalItem {
  const document = newLorebookDocument(name.trim(), description)
  return library.createItem({ kind: 'lorebook', format: LOREBOOK_FORMAT, document, ...lorebookSummary(document) })
}

/**
 * 打开一本书：缺稳定 id 的条目补上并**存回**（只在这里与导入/拉取时做一次，见 ensureEntryIds），
 * 之后编辑与推送都按这些 id 对齐。只读的书不写，只返回补齐后的视图。
 */
export function openLocalLorebook(library: LocalLibraryRepository, localId: string, uuid: () => string): { item: LocalItem; book: LorebookBook } {
  const item = requireBook(library, localId)
  const book = readLorebookV3(item.document)
  const ensured = ensureEntryIds(book, uuid)
  if (ensured === book || item.readOnly) return { item, book: ensured }
  const updated = library.updateDocument(localId, { document: lorebookDocumentWith(item.document, ensured), name: item.name })
  return { item: updated, book: ensured }
}

/** 改名 / 改描述：书级设置与条目原样保留 */
export function renameLocalLorebook(library: LocalLibraryRepository, localId: string, patch: { name?: string; description?: string }): LocalItem {
  const item = requireBook(library, localId)
  const book = patchBook(readLorebookV3(item.document), {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
  })
  const document = lorebookDocumentWith(item.document, book)
  return library.updateDocument(localId, { document, name: lorebookSummary(document).name })
}

/** 复制为新的本机书（副本没有拉取来源，推送时作为新书） */
export function duplicateLocalLorebook(library: LocalLibraryRepository, localId: string, name: string): LocalItem {
  const item = requireBook(library, localId)
  const document = lorebookDocumentWith(item.document, patchBook(readLorebookV3(item.document), { name }))
  return library.createItem({ kind: 'lorebook', format: item.format, document, ...lorebookSummary(document) })
}

/** 新建（entryId 为空）或只改给出字段地编辑一条条目；返回条目 id */
export function saveLocalLorebookEntry(
  library: LocalLibraryRepository,
  localId: string,
  entryId: string,
  edit: LorebookEntryEdit,
  uuid: () => string,
): string {
  const item = requireBook(library, localId)
  const result = upsertEntry(readLorebookV3(item.document), entryId, edit, uuid)
  library.updateDocument(localId, { document: lorebookDocumentWith(item.document, result.book), name: item.name })
  return result.entryId
}

export function deleteLocalLorebookEntry(library: LocalLibraryRepository, localId: string, entryId: string): void {
  const item = requireBook(library, localId)
  const book = removeEntry(readLorebookV3(item.document), entryId)
  library.updateDocument(localId, { document: lorebookDocumentWith(item.document, book), name: item.name })
}
