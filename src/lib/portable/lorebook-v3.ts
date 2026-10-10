/**
 * Lorebook 的可移植格式 `lorebook_v3`（对齐服务端 src/lorebook/adapters/lorebook_v3.py
 * 与 exporter.py）：`{spec: "lorebook_v3", data: {lorebook: {name, description, ...settings,
 * entries: [...]}}}`。卡片的内嵌书（`data.character_book`）是同一个 book 对象，不带外层。
 *
 * 契约要点：
 * - 每个条目必须有稳定的 `id`：服务端按它镜像条目（推送 update = 全量镜像，
 *   本机没有的条目会在服务端被删除）。新条目在本机生成 `entry-<uuid>`，之后不再改变；
 *   从服务器拉下来的条目沿用它导出的 id（数字 uid 也原样保留，比较时按字符串）。
 * - 编辑只改界面开放的字段（名称、关键词、内容、启用），其余字段——激活设置、
 *   `extensions.diceframe`、未知字段——一律原样保留，否则镜像推送会清掉服务端的设置。
 */
import { LOREBOOK_ENTRY_NOT_FOUND, LOREBOOK_V3_INVALID, PortableFormatError } from './errors'
import { cloneJson, isJsonObject, type JsonObject } from './json'

export const LOREBOOK_V3_SPEC = 'lorebook_v3'
export const LOREBOOK_FORMAT = 'lorebook_v3'

export interface LorebookDocument extends JsonObject {
  spec: typeof LOREBOOK_V3_SPEC
  data: { lorebook: LorebookBook } & JsonObject
}

export interface LorebookBook extends JsonObject {
  name?: string
  description?: string
  entries: LorebookEntry[]
}

export interface LorebookEntry extends JsonObject {
  id?: string | number
  uid?: string | number
  name?: string
  keys?: string[]
  content?: string
  enabled?: boolean
}

/** 界面可编辑的条目字段；其余字段编辑时原样保留 */
export interface LorebookEntryEdit {
  name?: string
  keys?: string[]
  content?: string
  enabled?: boolean
}

/**
 * 条目的稳定 id，与服务端 `str(row.get("id", row.get("uid", "")) or "")` 同语义：
 * 有 `id` 键就只看它（null / 空串 / 0 都算没有 id，不再回退 uid）；没有 `id` 键
 * 才看旧 Tavern 数据的 `uid`。按字符串比较。
 */
export function entryIdOf(entry: LorebookEntry): string {
  const raw = 'id' in entry ? entry.id : entry.uid
  return raw ? String(raw) : ''
}

/**
 * 校验并取出 book 对象（返回深拷贝）。接受服务端也接受的两种外形：
 * `{spec, data: {lorebook}}` 与 `{lorebook}`。entries 与服务端一样宽容（见 normalizeBook）。
 */
export function readLorebookV3(document: unknown): LorebookBook {
  if (!isJsonObject(document)) throw new PortableFormatError(LOREBOOK_V3_INVALID, 'lorebook document must be an object')
  if (document.spec !== undefined && document.spec !== LOREBOOK_V3_SPEC) {
    throw new PortableFormatError(LOREBOOK_V3_INVALID, 'document is not a lorebook_v3 book')
  }
  const root = isJsonObject(document.data) ? document.data : document
  const book = root.lorebook
  if (!isJsonObject(book)) throw new PortableFormatError(LOREBOOK_V3_INVALID, 'lorebook_v3 document has no lorebook object')
  return normalizeBook(book)
}

/**
 * 卡片内嵌书 / 独立书共用的读取视图。与服务端 from_lorebook_v3 一样宽容：entries 缺失
 * 或不是数组按空书，非对象的行当作空条目（服务端 `row = raw if dict else {}`），
 * 条目位置与服务端一一对应——坏条目不该让整本书（或整张卡）读不出来。
 * 这是读取视图：本机存储与推送用的文档原文不经它改写。
 */
export function normalizeBook(book: unknown): LorebookBook {
  if (!isJsonObject(book)) throw new PortableFormatError(LOREBOOK_V3_INVALID, 'lorebook must be an object')
  const entries = Array.isArray(book.entries) ? book.entries.map((row) => (isJsonObject(row) ? row : {})) : []
  return { ...cloneJson(book), entries: cloneJson(entries) as LorebookEntry[] }
}

export function writeLorebookV3(book: LorebookBook): LorebookDocument {
  return { spec: LOREBOOK_V3_SPEC, data: { lorebook: normalizeBook(book) } }
}

export function newLorebookDocument(name: string, description = ''): LorebookDocument {
  return writeLorebookV3({ name, description, entries: [] })
}

/**
 * 给没有 id 的条目补上稳定 id（拉取的旧数据、外部导入的书）；已有 id 不变（只有数字 id
 * 或 uid 的写成同值的字符串 id）。
 * 同一本书里出现重复 id 时，后出现的那条换新 id——镜像按 id 对齐，重复会互相覆盖。
 *
 * **只在导入/拉取写入本机库时调用一次，并把结果存回本机文档**。绝不能在每次推送前
 * 对临时副本调用：新 id 每次都不同，服务端会把这些条目当成删了又建、每次推送都换 id。
 */
export function ensureEntryIds(book: LorebookBook, uuid: () => string): LorebookBook {
  const seen = new Set<string>()
  let changed = false
  const entries = book.entries.map((entry) => {
    const id = entryIdOf(entry)
    if (id && !seen.has(id)) {
      seen.add(id)
      // 只有 uid、或 id 是数字的旧数据：写成字符串 id（服务端按 str(id or uid) 认条目，
      // 身份不变），本机文档因此满足服务端 schema（条目 id 必须是非空字符串）
      if (entry.id === id) return entry
      changed = true
      return { ...entry, id }
    }
    changed = true
    const fresh = newEntryId(uuid, seen)
    seen.add(fresh)
    return { ...entry, id: fresh }
  })
  return changed ? { ...book, entries } : book
}

function newEntryId(uuid: () => string, taken: Set<string>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = `entry-${uuid().toLowerCase()}`
    if (!taken.has(id)) return id
  }
  throw new Error('could not generate a unique lorebook entry id')
}

/** 修改书的名称/描述，其余字段（设置、扩展、条目）原样保留 */
export function patchBook(book: LorebookBook, patch: { name?: string; description?: string }): LorebookBook {
  const next = cloneJson(book)
  if (patch.name !== undefined) next.name = patch.name
  if (patch.description !== undefined) next.description = patch.description
  return next
}

/**
 * 新建或编辑条目：entryId 为空 = 新建（生成稳定 id，默认启用）；否则只改 edit 里给出的字段。
 * 返回新 book 与该条目 id。
 */
export function upsertEntry(
  book: LorebookBook,
  entryId: string,
  edit: LorebookEntryEdit,
  uuid: () => string,
): { book: LorebookBook; entryId: string } {
  const next = cloneJson(book)
  const fields = editableFields(edit)
  if (!entryId) {
    const taken = new Set(next.entries.map(entryIdOf))
    const id = newEntryId(uuid, taken)
    next.entries.push({ id, name: '', keys: [], content: '', enabled: true, ...fields })
    return { book: next, entryId: id }
  }
  const index = next.entries.findIndex((entry) => entryIdOf(entry) === entryId)
  if (index < 0) throw new PortableFormatError(LOREBOOK_ENTRY_NOT_FOUND, `entry ${entryId} not found`)
  next.entries[index] = { ...next.entries[index], ...fields }
  return { book: next, entryId }
}

export function removeEntry(book: LorebookBook, entryId: string): LorebookBook {
  const entries = book.entries.filter((entry) => entryIdOf(entry) !== entryId)
  if (entries.length === book.entries.length) {
    throw new PortableFormatError(LOREBOOK_ENTRY_NOT_FOUND, `entry ${entryId} not found`)
  }
  return { ...cloneJson(book), entries: cloneJson(entries) }
}

function editableFields(edit: LorebookEntryEdit): LorebookEntryEdit {
  const fields: LorebookEntryEdit = {}
  if (edit.name !== undefined) fields.name = edit.name
  if (edit.content !== undefined) fields.content = edit.content
  if (edit.enabled !== undefined) fields.enabled = edit.enabled
  if (edit.keys !== undefined) fields.keys = edit.keys.map((key) => key.trim()).filter(Boolean)
  return fields
}

/** 列表冗余字段：书名 */
export function lorebookSummary(document: unknown): { name: string; ruleId: string; readOnly: boolean } {
  const book = readLorebookV3(document)
  return { name: String(book.name ?? ''), ruleId: '', readOnly: false }
}
