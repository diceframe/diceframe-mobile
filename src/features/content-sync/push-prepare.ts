/**
 * 推送前的本地准备（纯逻辑）：把本机项变成 /api/content/import 的请求项，在本地就能判定
 * 推不了的先排除（规则托管卡、只读项、坏文档、超限的书），并按服务端限额分批。
 *
 * - client_ref 即本机 id；卡片内嵌书的 client_ref 由服务端约定为 `<卡片 id>.book`。
 * - 文档是**推送那一刻的快照**：预览与提交必须发同一份文档（plan_digest 覆盖草稿摘要），
 *   映射记的也是这份快照的 revision 与摘要——推送途中用户再编辑，不会被错标为已同步。
 * - 拉取来的项（origin 指向这台服务器、但还没有映射）带 canonical_hint，让推送对准服务器上
 *   原来那一份；「保留两份」得到的本机副本没有 origin，作为新项推送（不带 hint）。
 */
import type { ContentKind, ContentPushItem, ContentSyncSource, ContentWarning } from '@/api/types'
import { CARD_FORMAT, isRulesAwareCard, pushableCardDocument, readCardV3 } from '@/lib/portable/card-v3'
import { BODY_TOO_LARGE, CARD_V3_INVALID, LOREBOOK_V3_INVALID } from '@/lib/portable/errors'
import { utf8ByteLength } from '@/lib/portable/json'
import { MAX_BODY_BYTES, MAX_ITEMS, bookLimitViolations } from '@/lib/portable/limits'
import { LOREBOOK_FORMAT, readLorebookV3 } from '@/lib/portable/lorebook-v3'

export const LOCAL_ITEM_READ_ONLY = 'LOCAL_ITEM_READ_ONLY'
export const RULESET_CARD_UNSUPPORTED = 'RULESET_CARD_UNSUPPORTED'

/** 推送候选：一个本机项在点下「推送」那一刻的快照 */
export interface PushCandidate {
  localId: string
  kind: ContentKind
  name: string
  revision: number
  readOnly: boolean
  document: unknown
  /** 拉取来源的服务器 canonical id（仅当来源就是这台服务器且尚无映射时给出） */
  canonicalHint?: string
}

export interface PreparedPush {
  candidate: PushCandidate
  item: ContentPushItem
  /** 本地就知道的警告（不可移植的头像） */
  warnings: ContentWarning[]
  /** 序列化后的字节数（分批用） */
  bytes: number
}

export interface ExcludedPush {
  candidate: PushCandidate
  code: string
  /** 超限条目的 id（ENTRY_TOO_LARGE） */
  entryId?: string
}

/** 每批请求体之外的余量：source、plan_digest、decisions 与 JSON 外壳 */
const BATCH_OVERHEAD_BYTES = 64 * 1024

export function preparePush(candidates: readonly PushCandidate[]): { prepared: PreparedPush[]; excluded: ExcludedPush[] } {
  const prepared: PreparedPush[] = []
  const excluded: ExcludedPush[] = []
  for (const candidate of candidates) {
    const result = prepareOne(candidate)
    if ('code' in result) excluded.push(result)
    else prepared.push(result)
  }
  return { prepared, excluded }
}

function prepareOne(candidate: PushCandidate): PreparedPush | ExcludedPush {
  let item: ContentPushItem
  let warnings: ContentWarning[] = []
  if (candidate.kind === 'character_template') {
    let parsed: ReturnType<typeof readCardV3>
    try {
      parsed = readCardV3(candidate.document)
    } catch {
      return { candidate, code: CARD_V3_INVALID }
    }
    if (isRulesAwareCard(parsed.body)) return { candidate, code: RULESET_CARD_UNSUPPORTED }
    if (candidate.readOnly) return { candidate, code: LOCAL_ITEM_READ_ONLY }
    if (parsed.characterBook) {
      const [violation] = bookLimitViolations(parsed.characterBook, candidate.localId)
      if (violation) return { candidate, code: violation.code, entryId: violation.entryId }
    }
    const pushable = pushableCardDocument(candidate.document)
    warnings = pushable.warnings
    item = { client_ref: candidate.localId, kind: 'character_template', format: CARD_FORMAT, document: pushable.document }
  } else {
    if (candidate.readOnly) return { candidate, code: LOCAL_ITEM_READ_ONLY }
    let book: ReturnType<typeof readLorebookV3>
    try {
      book = readLorebookV3(candidate.document)
    } catch {
      return { candidate, code: LOREBOOK_V3_INVALID }
    }
    const [violation] = bookLimitViolations(book, candidate.localId)
    if (violation) return { candidate, code: violation.code, entryId: violation.entryId }
    item = { client_ref: candidate.localId, kind: 'lorebook', format: LOREBOOK_FORMAT, document: candidate.document }
  }
  if (candidate.canonicalHint) item.canonical_hint = candidate.canonicalHint
  const bytes = utf8ByteLength(JSON.stringify(item))
  if (bytes + BATCH_OVERHEAD_BYTES > MAX_BODY_BYTES) return { candidate, code: BODY_TOO_LARGE }
  return { candidate, item, warnings, bytes }
}

/** 按服务端限额分批：每批 ≤50 项，请求体（含余量）≤8MB；保持原顺序 */
export function batchPush(prepared: readonly PreparedPush[], source: ContentSyncSource): PreparedPush[][] {
  const sourceBytes = utf8ByteLength(JSON.stringify(source))
  const budget = MAX_BODY_BYTES - BATCH_OVERHEAD_BYTES - sourceBytes
  const batches: PreparedPush[][] = []
  let current: PreparedPush[] = []
  let used = 0
  for (const entry of prepared) {
    if (current.length && (current.length >= MAX_ITEMS || used + entry.bytes > budget)) {
      batches.push(current)
      current = []
      used = 0
    }
    current.push(entry)
    used += entry.bytes
  }
  if (current.length) batches.push(current)
  return batches
}
