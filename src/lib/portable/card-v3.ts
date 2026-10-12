/**
 * 角色卡的可移植格式：Tavern `chara_card_v3` 信封（对齐服务端
 * src/content_modules/adapters/character_card_v3.py）。
 *
 * - DiceFrame 卡体（schema 2）是权威，放在 `data.extensions.diceframe`；
 * - 内嵌 Lorebook 放标准字段 `data.character_book`（book 对象，见 lorebook-v3.ts）；
 * - 其余 v3 标准字段（name、description、tags…）让别的 Character Card 工具也能打开，
 *   本机编辑时原样保留，只同步 name / description 两个与卡体对应的字段。
 *
 * 只有 `builtin` 头像可移植；`upload` / `generated` 指向某台服务器上的资源，推送时
 * 丢弃（服务端会给 PORTRAIT_NOT_PORTABLE 警告）。规则托管（D&D）卡 v1 不能推送，
 * 拉到本机后只读。
 */
import type { CharacterCard, CharacterPortrait } from '@/api/types'

import { CARD_READ_ONLY, CARD_V3_INVALID, PortableFormatError } from './errors'
import { cloneJson, isJsonObject, pyStr, type JsonObject } from './json'
import { normalizeBook, type LorebookBook } from './lorebook-v3'

export const CARD_V3_SPEC = 'chara_card_v3'
export const CARD_V3_SPEC_VERSION = '3.0'
export const CARD_FORMAT = 'chara_card_v3'
export const DICEFRAME_EXTENSION = 'diceframe'
/** DiceFrame 卡体的 schema 版本（服务端 character_cards.py 写入 2） */
export const CARD_BODY_SCHEMA_VERSION = 2

/** 服务端从不接受推送来的这些字段（_SERVER_ONLY_FIELDS），推送前在本机先剥掉 */
export const SERVER_ONLY_CARD_FIELDS = [
  'id', 'card_id', 'provenance', 'source_plugin', 'plugin_content_id',
  'raw_sillytavern', 'ruleset_revision', 'ruleset_operation_log', 'ruleset_runtime',
] as const

/** 卡体带这些对象之一即为规则托管卡（服务端 _RULESET_FIELDS） */
const RULESET_FIELDS = ['ruleset_character', 'rule_binding'] as const

export const PORTRAIT_NOT_PORTABLE = 'PORTRAIT_NOT_PORTABLE'

/**
 * 打补丁时按字段递归合并（而不是整体替换）的卡体字段：它们是开放的键值袋，
 * 编辑器只认识其中一部分，整体替换会丢掉不认识的键，推送 update 时服务端也会随之删掉。
 * 其余字段（头像、技能列表、属性表…）是「整体值」，补丁里给出就整体替换。
 */
export const DEEP_MERGE_CARD_FIELDS = ['character_sheet', 'identity'] as const

/** 递归合并：双方都是对象才往下合并，数组与标量整体替换，undefined 表示不改 */
function mergeObjects(base: JsonObject, patch: JsonObject): JsonObject {
  const merged: JsonObject = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = base[key]
    merged[key] = isJsonObject(value) && isJsonObject(current) ? mergeObjects(current, value) : cloneJson(value)
  }
  return merged
}

export type CardBody = CharacterCard & JsonObject

export interface CardV3Document extends JsonObject {
  spec: typeof CARD_V3_SPEC
  spec_version?: string
  data: JsonObject & { extensions: JsonObject & { diceframe: CardBody }; character_book?: LorebookBook }
}

export interface ParsedCard {
  body: CardBody
  characterBook: LorebookBook | null
}

export interface PortableWarning {
  code: string
  message: string
}

/** 取出卡体与内嵌书（深拷贝）；外形不对一律拒绝（CARD_V3_INVALID），与服务端同语义 */
export function readCardV3(document: unknown): ParsedCard {
  if (!isJsonObject(document) || document.spec !== CARD_V3_SPEC) {
    throw new PortableFormatError(CARD_V3_INVALID, 'document must be a chara_card_v3 card')
  }
  const data = document.data
  if (!isJsonObject(data)) throw new PortableFormatError(CARD_V3_INVALID, 'chara_card_v3 card has no data object')
  const extensions = data.extensions
  const body = isJsonObject(extensions) ? extensions[DICEFRAME_EXTENSION] : undefined
  if (!isJsonObject(body)) throw new PortableFormatError(CARD_V3_INVALID, 'card has no data.extensions.diceframe body')
  const copy = cloneJson(body) as CardBody
  // 与服务端 `str(x or "")` 同语义：0 / false / 空串 / 空对象都算没有名字
  if (!pyStr(copy.character_name).trim()) copy.character_name = pyStr(data.name).trim()
  // 内嵌书与服务端一样宽容：entries 不是数组或含非对象行时忽略坏条目，不拒绝整张卡
  const characterBook = isJsonObject(data.character_book) ? normalizeBook(data.character_book) : null
  return { body: copy, characterBook }
}

/** 把卡体包成完整的 v3 信封（与服务端 write_card_v3 逐字段一致） */
export function writeCardV3(body: CardBody, characterBook?: LorebookBook | null): CardV3Document {
  const data: CardV3Document['data'] = {
    name: pyStr(body.character_name),
    description: pyStr(body.background),
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    group_only_greetings: [],
    tags: [],
    creator: '',
    character_version: '',
    extensions: { [DICEFRAME_EXTENSION]: cloneJson(body) } as CardV3Document['data']['extensions'],
  }
  // 与服务端一样原样拷贝内嵌书，不补字段、不过滤
  if (characterBook) data.character_book = cloneJson(characterBook)
  return { spec: CARD_V3_SPEC, spec_version: CARD_V3_SPEC_VERSION, data }
}

/** 本机新建卡：最小 schema 2 卡体（服务端导入时会按规则补齐其余字段） */
export function newCardDocument(body: Partial<CardBody> & { character_name: string }): CardV3Document {
  return writeCardV3({ schema_version: CARD_BODY_SCHEMA_VERSION, ...cloneJson(body) } as CardBody)
}

/** 卡体内的字段路径：对象键或数组下标（字符串形式），如 ['attributes', 'custom_luck']、['skills', '2'] */
export type CardFieldPath = readonly string[]

export interface CardPatchOptions {
  /**
   * 显式删除的字段路径（合并之后执行）。合并语义下「补丁里不写」只表示「不改」，
   * 编辑器要删掉自定义属性、技能或嵌套键时必须在这里列出。路径不存在时忽略。
   */
  remove?: readonly CardFieldPath[]
}

/**
 * 本机编辑卡体：只合并 patch 给出的字段（值为 undefined 的键忽略），信封与卡体里
 * 其余字段原样保留；name / description 跟随 character_name / background 同步。
 * 规则托管卡只读，拒绝编辑。
 *
 * 数组字段（skills、equipment、inventory…）在补丁里是整体替换，所以编辑器**必须从
 * 存着的数组出发**改出新数组（保留每一项里不认识的字段），绝不能从表单重建——否则每项的
 * 未知字段会丢，推送 update 时服务端也随之删掉。删除整项用 options.remove 或从数组里移除。
 */
export function patchCardDocument(document: unknown, patch: Partial<CardBody>, options: CardPatchOptions = {}): CardV3Document {
  const { body } = readCardV3(document)
  if (isRulesAwareCard(body)) throw new PortableFormatError(CARD_READ_ONLY, 'rules-aware cards are read-only on this device')
  const next = cloneJson(document) as CardV3Document
  const merged: CardBody = { ...body }
  const deep = new Set<string>(DEEP_MERGE_CARD_FIELDS)
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = body[key]
    merged[key] = deep.has(key) && isJsonObject(value) && isJsonObject(current)
      ? mergeObjects(current, value)
      : cloneJson(value)
  }
  for (const path of sortRemovals(options.remove ?? [])) removePath(merged, path)
  next.data.extensions[DICEFRAME_EXTENSION] = merged
  if (patch.character_name !== undefined) next.data.name = pyStr(merged.character_name)
  if (patch.background !== undefined) next.data.description = pyStr(merged.background)
  return next
}

/**
 * 删除顺序：同一数组里的多个下标按从大到小删，前面的删除不会让后面的下标错位；
 * 调用方给出的顺序因此无关紧要。数字段按数值降序，其余段按字典序。
 */
function sortRemovals(paths: readonly CardFieldPath[]): CardFieldPath[] {
  const numeric = (segment: string) => /^\d+$/.test(segment)
  return [...paths].sort((left, right) => {
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      const a = left[index]
      const b = right[index]
      if (a === b) continue
      if (numeric(a) && numeric(b)) return Number(b) - Number(a)
      return a < b ? -1 : 1
    }
    return right.length - left.length
  })
}

/** 按路径删除（就地修改 merged，它已是本次补丁的新副本）；数组项用下标删除，其余项前移 */
function removePath(root: JsonObject, path: CardFieldPath): void {
  if (!path.length) throw new Error('remove path must not be empty')
  let parent: unknown = root
  for (const key of path.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[Number(key)]
    else if (isJsonObject(parent)) parent = parent[key]
    else return
  }
  const last = path[path.length - 1]
  if (Array.isArray(parent)) {
    const index = Number(last)
    if (Number.isInteger(index) && index >= 0 && index < parent.length) parent.splice(index, 1)
  } else if (isJsonObject(parent)) {
    delete parent[last]
  }
}

/** 替换（或移除）卡片内嵌书，其余内容不动 */
export function withCharacterBook(document: unknown, book: LorebookBook | null): CardV3Document {
  readCardV3(document)
  const next = cloneJson(document) as CardV3Document
  if (book) next.data.character_book = cloneJson(book)
  else delete next.data.character_book
  return next
}

/** 规则托管（D&D 等）卡：v1 不能推送，本机只读 */
export function isRulesAwareCard(body: JsonObject): boolean {
  return RULESET_FIELDS.some((key) => isJsonObject(body[key]))
}

/** 头像能否随卡跨服务器：只有带 id 的 builtin（id ≤ 100 字符，同服务端） */
export function isPortablePortrait(portrait: unknown): portrait is CharacterPortrait & { kind: 'builtin'; id: string } {
  if (!isJsonObject(portrait) || portrait.kind !== 'builtin') return false
  const id = pyStr(portrait.id)
  return !!id && id.length <= 100
}

function hasPortrait(portrait: unknown): boolean {
  return portrait !== undefined && portrait !== null && !(isJsonObject(portrait) && Object.keys(portrait).length === 0)
}

/**
 * 推送前的卡片文档：剥掉服务端从不接受的字段（含 character_sheet 里的同名键），
 * 不可移植的头像换成空对象并给出警告（与服务端 _portable_card 同语义），
 * 本机文档本身不改。规则托管卡调用方应先按 isRulesAwareCard 拦下。
 */
export function pushableCardDocument(document: unknown): { document: CardV3Document; warnings: PortableWarning[] } {
  const { body } = readCardV3(document)
  const warnings: PortableWarning[] = []
  const cleaned: CardBody = { ...body }
  for (const key of SERVER_ONLY_CARD_FIELDS) delete cleaned[key]
  if (isJsonObject(cleaned.character_sheet)) {
    const sheet = { ...cleaned.character_sheet }
    for (const key of SERVER_ONLY_CARD_FIELDS) delete sheet[key]
    cleaned.character_sheet = sheet
  }
  if (hasPortrait(cleaned.portrait)) {
    if (isPortablePortrait(cleaned.portrait)) {
      cleaned.portrait = { kind: 'builtin', id: String(cleaned.portrait.id) }
    } else {
      cleaned.portrait = {}
      warnings.push({ code: PORTRAIT_NOT_PORTABLE, message: 'portrait refers to a server-local image and is dropped' })
    }
  }
  const next = cloneJson(document) as CardV3Document
  next.data.extensions[DICEFRAME_EXTENSION] = cleaned
  return { document: next, warnings }
}

/** 列表冗余字段：名称、规则、是否只读 */
export function cardSummary(document: unknown): { name: string; ruleId: string; readOnly: boolean } {
  const { body } = readCardV3(document)
  return {
    name: pyStr(body.character_name),
    ruleId: pyStr(body.rule_id),
    readOnly: isRulesAwareCard(body),
  }
}

/**
 * 玩家用本机卡加入对局：交给现有 join payload（lib/join-form.buildJoinNewPayload）的卡体。
 * 不可移植的头像不带（它指向别的服务器上的资源）。规则托管卡不能用于移动端加入。
 */
export function joinCardFromDocument(document: unknown): CharacterCard {
  const { body } = readCardV3(document)
  if (isRulesAwareCard(body)) throw new PortableFormatError(CARD_READ_ONLY, 'rules-aware cards cannot join from this device')
  const card = cloneJson(body)
  for (const key of SERVER_ONLY_CARD_FIELDS) delete card[key]
  if (hasPortrait(card.portrait) && !isPortablePortrait(card.portrait)) delete card.portrait
  return card
}
