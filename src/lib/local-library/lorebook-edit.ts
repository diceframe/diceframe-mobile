/**
 * 本机 Lorebook 条目编辑器的表单 ↔ 补丁。
 *
 * 保存时只写回用户真的改过的字段（与打开编辑器那一刻的表单快照比较），条目其余字段——
 * extensions、未知字段，以及没碰过的可编辑字段——原样保留：推送是全量镜像，
 * 丢掉的字段会在服务端被一起清掉。条目按稳定 id 定位（entryIdOf），不按列表下标。
 */
import { entryIdOf, type LorebookBook, type LorebookEntry, type LorebookEntryEdit } from '@/lib/portable/lorebook-v3'

export interface EntryForm {
  name: string
  /** 关键词，逗号（中英文）或换行分隔 */
  keysText: string
  /** 次要关键词，同上 */
  secondaryKeysText: string
  content: string
  enabled: boolean
  constant: boolean
  /** 整数文本；空串 = 不设置 */
  insertionOrder: string
  priority: string
}

export const INVALID_INTEGER = 'INVALID_INTEGER'

function integerText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function keysTextOf(value: unknown): string {
  return Array.isArray(value) ? value.filter((key) => typeof key === 'string').join(', ') : ''
}

export function splitKeys(text: string): string[] {
  return text.split(/[,，、\n]/).map((key) => key.trim()).filter(Boolean)
}

/** 条目 → 表单；entry 为 null 是新条目（默认启用） */
export function entryFormOf(entry: LorebookEntry | null): EntryForm {
  return {
    name: typeof entry?.name === 'string' ? entry.name : '',
    keysText: keysTextOf(entry?.keys),
    // 没有 secondary_keys 时回退 Tavern 的别名 keysecondary（否则这类条目显示为空）
    secondaryKeysText: keysTextOf(entry && 'secondary_keys' in entry ? entry.secondary_keys : entry?.keysecondary),
    content: typeof entry?.content === 'string' ? entry.content : '',
    enabled: entry ? entry.enabled !== false : true,
    constant: entry?.constant === true,
    insertionOrder: integerText(entry?.insertion_order),
    priority: integerText(entry?.priority),
  }
}

/** 整数文本：空串 → null（不设置），非整数 → 抛 INVALID_INTEGER */
function parseInteger(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (!/^-?\d+$/.test(trimmed)) throw Object.assign(new Error('not an integer'), { code: INVALID_INTEGER })
  return Number(trimmed)
}

/**
 * 表单相对打开时快照的改动 → 条目补丁（只含改过的字段）。整数字段清空不会删掉原值
 * （upsertEntry 只合并给出的字段），保持「不改」。
 */
export function entryEditOf(snapshot: EntryForm, form: EntryForm): LorebookEntryEdit {
  const edit: LorebookEntryEdit = {}
  if (form.name !== snapshot.name) edit.name = form.name.trim()
  if (form.keysText !== snapshot.keysText) {
    const keys = splitKeys(form.keysText)
    if (keys.join('\u0000') !== splitKeys(snapshot.keysText).join('\u0000')) edit.keys = keys
  }
  if (form.secondaryKeysText !== snapshot.secondaryKeysText) {
    const keys = splitKeys(form.secondaryKeysText)
    if (keys.join('\u0000') !== splitKeys(snapshot.secondaryKeysText).join('\u0000')) edit.secondary_keys = keys
  }
  if (form.content !== snapshot.content) edit.content = form.content
  if (form.enabled !== snapshot.enabled) edit.enabled = form.enabled
  if (form.constant !== snapshot.constant) edit.constant = form.constant
  if (form.insertionOrder.trim() !== snapshot.insertionOrder.trim()) {
    const value = parseInteger(form.insertionOrder)
    if (value !== null) edit.insertion_order = value
  }
  if (form.priority.trim() !== snapshot.priority.trim()) {
    const value = parseInteger(form.priority)
    if (value !== null) edit.priority = value
  }
  return edit
}

/** 新条目：表单里有值的字段全写（默认值也写，条目从无到有） */
export function newEntryEditOf(form: EntryForm): LorebookEntryEdit {
  const edit: LorebookEntryEdit = {
    name: form.name.trim(),
    keys: splitKeys(form.keysText),
    content: form.content,
    enabled: form.enabled,
  }
  const secondary = splitKeys(form.secondaryKeysText)
  if (secondary.length) edit.secondary_keys = secondary
  if (form.constant) edit.constant = true
  const order = parseInteger(form.insertionOrder)
  if (order !== null) edit.insertion_order = order
  const priority = parseInteger(form.priority)
  if (priority !== null) edit.priority = priority
  return edit
}

export function hasEdits(edit: LorebookEntryEdit): boolean {
  return Object.keys(edit).length > 0
}

/** 列表展示：条目（按 id 作稳定行 key；没有 id 的旧数据不应出现在本机库，兜底用下标） */
export function entryRows(book: LorebookBook): { key: string; entryId: string; entry: LorebookEntry }[] {
  return book.entries.map((entry, index) => {
    const entryId = entryIdOf(entry)
    return { key: entryId || `#${index}`, entryId, entry }
  })
}
