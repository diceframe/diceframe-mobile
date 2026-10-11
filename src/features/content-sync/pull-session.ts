/**
 * 拉取会话（M6）：按服务器项导出 → 逐项写入本机库，纯状态机，不含界面；网络与本机库都经
 * PullDeps 注入，测试用假服务端驱动。
 *
 * 「列出服务器上有哪些内容」放在 ServerItemSource 接口后面（真实来源是 POST /api/content/list，
 * 见 list-source.ts）；会话本身只接收要拉的 ref。
 *
 * 契约要点（diceframe/diceframe docs/content-sync/CONTRACT.md）：
 * - 导出每批 ≤50 项；批里有不存在的 id 整批 404 NOT_FOUND，二分找出缺失项；413 同样二分，
 *   单项仍 413 就记为被拒；429 按 retry_after 等待后重试（有上限）。
 * - 来源记 server_instance_id + canonical id + 导出时的 state_token，之后推送带 canonical_hint。
 * - 规则托管（D&D 等）卡本机不支持：显示为不支持，不导入。服务器本地图片头像随卡丢弃并警告。
 * - 卡片内嵌书在服务器上是独立的一本书（origin.provenance.book_id）：经 /status 取它的
 *   state_token，记成 `<卡片 id>.book` 映射，推送状态才能把书的改动折叠到卡上。
 * - 本机已有、自上次同步没改过 → 原地更新；本机改过且服务器也变了 → 保留两份（服务器版本
 *   存为新本机项，改过的那份解除映射）；服务器没变 → 不写（本机改动留待推送）。
 * - 服务器上已删除 → 只标记映射（remote_deleted_at），绝不删本机项。
 * - 书一律全量镜像（条目整体替换），写入前补齐稳定条目 id 并存回（ensureEntryIds），
 *   超出条目数 / 单条大小限额的不导入。
 * - 一项一个事务；每次写入前确认连接仍是锁定的那台服务器，不是就立刻停下。按时间预算让出
 *   线程；取消在两项之间生效，已写入的项保持写入。
 * - 锁定项：导出 origin.locked_reason（#508）非空就把拉下来的项标为本机只读（插件卡 / 插件书）；
 *   RULESET_CARD_UNSUPPORTED / RULESET_CARD 的卡与规则托管卡一样不导入。随推送者而定的锁定
 *   （TRACKED_BY_OTHER_SOURCE 等）不在 locked_reason 里，交给推送预览。
 */
import type { ContentExportItem, ContentKind, ContentStatusItem, ContentWarning } from '@/api/types'
import { EMBEDDED_BOOK_SUFFIX, isCanonicalId } from '@/lib/local-library/ids'
import { lorebookDocumentWith } from '@/lib/local-library/lorebook-library'
import type { LocalItem, LocalItemOrigin, PullImport, PullImportResult, ServerLink } from '@/lib/local-library/repository'
import {
  CARD_FORMAT,
  cardSummary,
  isRulesAwareCard,
  pushableCardDocument,
  readCardV3,
  withCharacterBook,
} from '@/lib/portable/card-v3'
import { isJsonObject, localDigest } from '@/lib/portable/json'
import { bookLimitViolations } from '@/lib/portable/limits'
import {
  LOREBOOK_FORMAT,
  ensureEntryIds,
  lorebookSummary,
  readLorebookV3,
} from '@/lib/portable/lorebook-v3'

/** 每批导出项数（服务端上限） */
export const PULL_EXPORT_BATCH = 50
/** 429 后最多重试次数与单次最长等待（秒）；与推送一致 */
const RATE_LIMIT_RETRIES = 2
const MAX_RATE_LIMIT_WAIT_SECONDS = 60

export const CANCELLED = 'CANCELLED'
export const RULESET_CARD_UNSUPPORTED = 'RULESET_CARD_UNSUPPORTED'
/** 这本书在本机已作为某张卡的内嵌书跟随，不另存一份独立书 */
export const EMBEDDED_BOOK_LINKED = 'EMBEDDED_BOOK_LINKED'
/** 警告：卡的内嵌书在本机已由另一项跟随，卡照常导入，只是不记内嵌书映射 */
export const EMBEDDED_BOOK_HELD_STANDALONE = 'EMBEDDED_BOOK_HELD_STANDALONE'

export interface ServerItemRef {
  kind: ContentKind
  canonicalId: string
  /** 列表展示用 */
  name?: string
  /** 列举时服务器副本的 state_token（与 /status 同值）；有它才能在选择列表里显示同步状态 */
  stateToken?: string
  /** 服务端声明的锁定原因（如插件卡）；拉下来会是只读 */
  lockedReason?: string
}

/**
 * 列举结果附带的提示（不是错误）：
 * - KIND_NOT_SUPPORTED：服务器不支持这一类（例如没启用 Lorebook），列表为空；
 * - TRACKED_ONLY：旧服务端没有列举接口，只列出本机已跟随的项（只能刷新）。
 */
export type ServerListingNotice = 'KIND_NOT_SUPPORTED' | 'TRACKED_ONLY'

export interface ServerListing {
  items: ServerItemRef[]
  notice?: ServerListingNotice
}

/** 列出服务器上某一类可拉取的内容（分页由实现内部处理） */
export interface ServerItemSource {
  list(kind: ContentKind): Promise<ServerListing>
}

/**
 * 不能导入本机的锁定原因：规则托管卡（导出本身规则托管，或服务器上那张是规则托管）。
 * 其余锁定原因（PLUGIN_CARD / PLUGIN_BOOK）照常导入，本机只读。
 */
export const UNSUPPORTED_LOCKS: ReadonlySet<string> = new Set(['RULESET_CARD_UNSUPPORTED', 'RULESET_CARD'])

interface ExportRef {
  kind: ContentKind
  canonical_id: string
}

/** 会话用到的本机库能力（LocalLibraryRepository 的子集） */
export interface PullLibrary {
  getItem(localId: string): LocalItem | null
  getLink(serverInstanceId: string, localId: string): ServerLink | null
  findByCanonical(serverInstanceId: string, canonicalId: string): ServerLink | null
  importFromServer(serverInstanceId: string, input: PullImport): PullImportResult
  setPulledLock(localId: string, lockedReason: string | undefined): void
  markRemoteDeleted(serverInstanceId: string, localIds: readonly string[]): number
}

export interface PullDeps {
  serverInstanceId: string
  /** 记录在映射上的连接地址（只用于展示） */
  baseUrlHint: string
  exportItems(refs: ExportRef[]): Promise<ContentExportItem[]>
  status(refs: ExportRef[]): Promise<ContentStatusItem[]>
  /** 连接仍是锁定的那台服务器，否则抛 SERVER_MISMATCH */
  assertServer(): void
  library: PullLibrary
  uuid(): string
  sleep(ms: number): Promise<void>
  /** 按时间预算让出 JS 线程 */
  maybeYield(): Promise<void>
}

export type PullItemStatus =
  | 'pending'
  | 'created'
  | 'updated'
  /** 本机改过、服务器也变了：服务器版本另存一份 */
  | 'kept-both'
  | 'unchanged'
  | 'unsupported'
  | 'rejected'
  | 'skipped'
  /** 服务器上已删除，本机项已标记（不删） */
  | 'server-deleted'
  /** 服务器上没有，本机也没有对应项 */
  | 'not-found'
  | 'cancelled'
  | 'not_attempted'

export interface PullOutcome {
  kind: ContentKind
  canonicalId: string
  name: string
  status: PullItemStatus
  code?: string
  entryId?: string
  /** 写入或对应的本机项 */
  localId?: string
  warnings: ContentWarning[]
}

export type PullPhase = 'idle' | 'pulling' | 'done' | 'stopped'

export interface PullState {
  phase: PullPhase
  outcomes: PullOutcome[]
  stopCode?: string
}

/** 导出 origin 里的锁定原因（#508）；有值 → 拉下来的项本机只读 */
export function lockedReasonOf(origin: ContentExportItem['origin'] | null | undefined): string | undefined {
  const value = isJsonObject(origin) ? origin.locked_reason : undefined
  return typeof value === 'string' && value ? value : undefined
}

/** 卡片导出的内嵌书在服务器上的独立 id */
export function embeddedBookIdOf(item: Pick<ContentExportItem, 'kind' | 'origin'>): string | undefined {
  const bookId = item.kind === 'character_template' ? item.origin?.provenance?.book_id : undefined
  return isCanonicalId(bookId) ? bookId : undefined
}

type Prepared =
  | { ok: true; input: Omit<PullImport, 'mode' | 'targetLocalId' | 'detachLocalId'>; warnings: ContentWarning[] }
  | { ok: false; status: 'unsupported' | 'rejected'; code: string; entryId?: string; warnings: ContentWarning[] }

function keyOf(kind: ContentKind, canonicalId: string): string {
  return `${kind}:${canonicalId}`
}

function codeOf(error: unknown, fallback = 'IMPORT_FAILED'): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && code ? code : fallback
}

function statusOf(error: unknown): number {
  return Number((error as { status?: unknown } | null)?.status) || 0
}

function mergeWarnings(...lists: (readonly ContentWarning[] | undefined)[]): ContentWarning[] {
  const seen = new Set<string>()
  const merged: ContentWarning[] = []
  for (const warning of lists.flatMap((list) => list ?? [])) {
    if (seen.has(warning.code)) continue
    seen.add(warning.code)
    merged.push(warning)
  }
  return merged
}

export class PullSession {
  private state: PullState
  private readonly listeners = new Set<(state: PullState) => void>()
  private cancelRequested = false
  private readonly refs: ServerItemRef[]

  constructor(private readonly deps: PullDeps, refs: readonly ServerItemRef[]) {
    const seen = new Set<string>()
    this.refs = refs.filter((ref) => {
      const key = keyOf(ref.kind, ref.canonicalId)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    this.state = {
      phase: 'idle',
      outcomes: this.refs.map((ref) => ({
        kind: ref.kind, canonicalId: ref.canonicalId, name: ref.name ?? '', status: 'pending', warnings: [],
      })),
    }
  }

  getState(): PullState {
    return this.state
  }

  subscribe(listener: (state: PullState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 请求取消：在下一项（或下一次网络请求）之前停止，已写入的项保持写入 */
  cancel(): void {
    this.cancelRequested = true
    if (this.state.phase === 'idle') this.stop(CANCELLED)
  }

  async start(): Promise<void> {
    if (this.state.phase !== 'idle') return
    this.update({ phase: 'pulling' })
    try {
      for (let index = 0; index < this.refs.length; index += PULL_EXPORT_BATCH) {
        this.throwIfCancelled()
        await this.pullBatch(this.refs.slice(index, index + PULL_EXPORT_BATCH))
      }
    } catch (error) {
      this.stop(codeOf(error))
      return
    }
    this.update({ phase: 'done' })
  }

  private async pullBatch(batch: ServerItemRef[]): Promise<void> {
    const { items, missing, rejected } = await this.exportWithBisect(batch.map((ref) => ({ kind: ref.kind, canonical_id: ref.canonicalId })))
    for (const entry of rejected) {
      this.setOutcome(keyOf(entry.ref.kind, entry.ref.canonical_id), { status: 'rejected', code: entry.code })
    }
    const byKey = new Map(items.map((item) => [keyOf(item.kind, item.origin.canonical_id), item]))
    // 服务端对已知 id 一定返回；万一漏了按缺失处理
    for (const ref of batch) {
      const key = keyOf(ref.kind, ref.canonicalId)
      if (!byKey.has(key) && !rejected.some((entry) => keyOf(entry.ref.kind, entry.ref.canonical_id) === key)
        && !missing.some((miss) => keyOf(miss.kind, miss.canonical_id) === key)) {
        missing.push({ kind: ref.kind, canonical_id: ref.canonicalId })
      }
    }
    const bookStatuses = await this.embeddedBookStatuses(items)
    for (const ref of batch) {
      const item = byKey.get(keyOf(ref.kind, ref.canonicalId))
      if (!item) continue
      this.throwIfCancelled()
      this.applyItem(item, bookStatuses)
      await this.deps.maybeYield()
    }
    for (const ref of missing) {
      this.throwIfCancelled()
      this.markMissing(ref)
      await this.deps.maybeYield()
    }
  }

  /** 导出一批；404 NOT_FOUND / 413 二分到单项，分别记为缺失与被拒 */
  private async exportWithBisect(refs: ExportRef[]): Promise<{
    items: ContentExportItem[]
    missing: ExportRef[]
    rejected: { ref: ExportRef; code: string }[]
  }> {
    this.throwIfCancelled()
    try {
      return { items: await this.withRateLimit(() => this.deps.exportItems(refs)), missing: [], rejected: [] }
    } catch (error) {
      const status = statusOf(error)
      const notFound = status === 404 && codeOf(error, '') === 'NOT_FOUND'
      if (!notFound && status !== 413) throw error
      if (refs.length === 1) {
        return notFound
          ? { items: [], missing: [refs[0]], rejected: [] }
          : { items: [], missing: [], rejected: [{ ref: refs[0], code: codeOf(error, 'BODY_TOO_LARGE') }] }
      }
      const middle = Math.ceil(refs.length / 2)
      const left = await this.exportWithBisect(refs.slice(0, middle))
      const right = await this.exportWithBisect(refs.slice(middle))
      return {
        items: [...left.items, ...right.items],
        missing: [...left.missing, ...right.missing],
        rejected: [...left.rejected, ...right.rejected],
      }
    }
  }

  /** 卡片内嵌书在服务器上的状态（按 provenance.book_id 查 /status）；没有内嵌书 id 就不查 */
  private async embeddedBookStatuses(items: ContentExportItem[]): Promise<Map<string, ContentStatusItem>> {
    const ids = [...new Set(items.map(embeddedBookIdOf).filter((id): id is string => !!id))]
    if (!ids.length) return new Map()
    this.throwIfCancelled()
    const statuses = await this.withRateLimit(() => this.deps.status(ids.map((id) => ({ kind: 'lorebook' as const, canonical_id: id }))))
    return new Map(statuses.map((status) => [status.canonical_id, status]))
  }

  private prepare(item: ContentExportItem, bookStatuses: Map<string, ContentStatusItem>): Prepared {
    const serverWarnings = item.warnings ?? []
    const lockedReason = lockedReasonOf(item.origin)
    const origin: LocalItemOrigin = {
      server_instance_id: this.deps.serverInstanceId,
      canonical_id: item.origin.canonical_id,
      state_token: item.origin.state_token,
      ...(lockedReason ? { locked_reason: lockedReason } : {}),
      provenance: item.origin.provenance ?? null,
    }
    const self = { suffix: '' as const, canonicalId: item.origin.canonical_id, stateToken: item.origin.state_token }
    try {
      if (item.kind === 'character_template') {
        const { body } = readCardV3(item.document)
        if (isRulesAwareCard(body) || (lockedReason && UNSUPPORTED_LOCKS.has(lockedReason))) {
          return { ok: false, status: 'unsupported', code: RULESET_CARD_UNSUPPORTED, warnings: [...serverWarnings] }
        }
        const pushable = pushableCardDocument(item.document)
        let document: unknown = pushable.document
        const { characterBook } = readCardV3(document)
        const links: PullImport['links'] = [self]
        if (characterBook) {
          const book = ensureEntryIds(characterBook, this.deps.uuid)
          const violation = bookLimitViolations(book, item.origin.canonical_id)[0]
          if (violation) return { ok: false, status: 'rejected', code: violation.code, entryId: violation.entryId, warnings: [...serverWarnings] }
          document = withCharacterBook(document, book)
          const bookId = embeddedBookIdOf(item)
          const bookStatus = bookId ? bookStatuses.get(bookId) : undefined
          if (bookId && bookStatus?.exists) {
            links.push({ suffix: EMBEDDED_BOOK_SUFFIX, canonicalId: bookId, stateToken: bookStatus.state_token })
          }
        }
        const summary = cardSummary(document)
        return {
          ok: true,
          warnings: mergeWarnings(serverWarnings, pushable.warnings),
          input: {
            kind: 'character_template', format: CARD_FORMAT, document, name: summary.name, ruleId: summary.ruleId,
            readOnly: !!lockedReason, origin, links, digest: localDigest(document), baseUrlHint: this.deps.baseUrlHint,
          },
        }
      }
      const book = ensureEntryIds(readLorebookV3(item.document), this.deps.uuid)
      const violation = bookLimitViolations(book, item.origin.canonical_id)[0]
      if (violation) return { ok: false, status: 'rejected', code: violation.code, entryId: violation.entryId, warnings: [...serverWarnings] }
      const document = lorebookDocumentWith(item.document, book)
      const summary = lorebookSummary(document)
      return {
        ok: true,
        warnings: [...serverWarnings],
        input: {
          kind: 'lorebook', format: LOREBOOK_FORMAT, document, name: summary.name, ruleId: '',
          readOnly: !!lockedReason, origin, links: [self], digest: localDigest(document), baseUrlHint: this.deps.baseUrlHint,
        },
      }
    } catch (error) {
      return { ok: false, status: 'rejected', code: codeOf(error), warnings: [...serverWarnings] }
    }
  }

  /** 服务器没变：本项与内嵌书的 state_token 都和映射一致，且没被标记为已删除 */
  private serverUnchanged(link: ServerLink, input: Prepared & { ok: true }): boolean {
    const { library, serverInstanceId } = this.deps
    if (link.remoteDeletedAt || link.stateToken !== input.input.origin.state_token) return false
    let wanted = input.input.links.find((entry) => entry.suffix === EMBEDDED_BOOK_SUFFIX)
    // 内嵌书由本机别的项跟随时写入也不会记它（见 importFromServer），比较时同样不算
    if (wanted && this.bookHeldElsewhere(wanted.canonicalId, link.localId)) wanted = undefined
    const bookLink = library.getLink(serverInstanceId, `${link.localId}${EMBEDDED_BOOK_SUFFIX}`)
    if (!wanted || !bookLink) return !wanted && !bookLink
    return wanted.canonicalId === bookLink.canonicalId && wanted.stateToken === bookLink.stateToken && !bookLink.remoteDeletedAt
  }

  private bookHeldElsewhere(bookCanonicalId: string, cardLocalId: string): boolean {
    const { library, serverInstanceId } = this.deps
    const holder = library.findByCanonical(serverInstanceId, bookCanonicalId)
    if (!holder || holder.localId === `${cardLocalId}${EMBEDDED_BOOK_SUFFIX}`) return false
    const owner = holder.localId.endsWith(EMBEDDED_BOOK_SUFFIX) ? holder.localId.slice(0, -EMBEDDED_BOOK_SUFFIX.length) : holder.localId
    return !!library.getItem(owner)
  }

  private applyItem(item: ContentExportItem, bookStatuses: Map<string, ContentStatusItem>): void {
    const key = keyOf(item.kind, item.origin.canonical_id)
    const prepared = this.prepare(item, bookStatuses)
    if (!prepared.ok) {
      this.setOutcome(key, { status: prepared.status, code: prepared.code, entryId: prepared.entryId, warnings: prepared.warnings })
      return
    }
    const { library, serverInstanceId } = this.deps
    const name = prepared.input.name
    const link = library.findByCanonical(serverInstanceId, item.origin.canonical_id)
    if (link?.localId.endsWith(EMBEDDED_BOOK_SUFFIX)) {
      this.setOutcome(key, { name, status: 'skipped', code: EMBEDDED_BOOK_LINKED, warnings: prepared.warnings })
      return
    }
    const current = link ? library.getItem(link.localId) : null
    let mode: PullImport['mode'] = 'create'
    if (link && current) {
      if (this.serverUnchanged(link, prepared)) {
        // 文档没变但锁定状态变了（例如服务器上装/卸了插件）：只更新只读与来源里的锁定原因
        const lockedReason = prepared.input.origin.locked_reason
        if (current.readOnly !== !!lockedReason || current.origin?.locked_reason !== lockedReason) {
          this.deps.assertServer()
          library.setPulledLock(current.localId, lockedReason)
        }
        this.setOutcome(key, { name, status: 'unchanged', localId: current.localId, warnings: prepared.warnings })
        return
      }
      mode = current.revision > link.syncedRevision ? 'keep-both' : 'update'
    }
    // 写入前确认服务器（身份变了就整体停下，由 start 收尾）
    this.deps.assertServer()
    try {
      const result = library.importFromServer(serverInstanceId, {
        ...prepared.input,
        mode,
        ...(mode === 'update' && current ? { targetLocalId: current.localId } : {}),
        ...(mode === 'keep-both' && current ? { detachLocalId: current.localId } : {}),
      })
      const status: PullItemStatus = mode === 'create' ? 'created' : mode === 'update' ? 'updated' : 'kept-both'
      const warnings = result.skippedBookLink
        ? mergeWarnings(prepared.warnings, [{ code: EMBEDDED_BOOK_HELD_STANDALONE }])
        : prepared.warnings
      this.setOutcome(key, { name, status, localId: result.localId, warnings })
    } catch (error) {
      this.setOutcome(key, { name, status: 'rejected', code: codeOf(error), warnings: prepared.warnings })
    }
  }

  /** 服务器上不存在：本机有映射就标记（不删本机项），否则记为未找到 */
  private markMissing(ref: ExportRef): void {
    const key = keyOf(ref.kind, ref.canonical_id)
    const { library, serverInstanceId } = this.deps
    const link = library.findByCanonical(serverInstanceId, ref.canonical_id)
    if (!link) {
      this.setOutcome(key, { status: 'not-found', code: 'NOT_FOUND' })
      return
    }
    this.deps.assertServer()
    library.markRemoteDeleted(serverInstanceId, [link.localId])
    const owner = link.localId.endsWith(EMBEDDED_BOOK_SUFFIX) ? link.localId.slice(0, -EMBEDDED_BOOK_SUFFIX.length) : link.localId
    this.setOutcome(key, { status: 'server-deleted', localId: owner })
  }

  private async withRateLimit<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await request()
      } catch (error) {
        const wait = Number((error as { retryAfter?: number } | null)?.retryAfter || 0)
        if (statusOf(error) !== 429 || !wait || wait > MAX_RATE_LIMIT_WAIT_SECONDS || attempt >= RATE_LIMIT_RETRIES) throw error
        await this.deps.sleep(wait * 1000)
        this.throwIfCancelled()
      }
    }
  }

  private throwIfCancelled(): void {
    if (this.cancelRequested) throw Object.assign(new Error('cancelled'), { code: CANCELLED })
  }

  private stop(code: string): void {
    const outcomes = this.state.outcomes.map((outcome) =>
      outcome.status === 'pending' ? { ...outcome, status: code === CANCELLED ? 'cancelled' as const : 'not_attempted' as const } : outcome)
    this.update({ phase: 'stopped', stopCode: code, outcomes })
  }

  private setOutcome(key: string, patch: Partial<PullOutcome>): void {
    this.update({
      outcomes: this.state.outcomes.map((outcome) =>
        (keyOf(outcome.kind, outcome.canonicalId) === key ? { ...outcome, ...patch } : outcome)),
    })
  }

  private update(patch: Partial<PullState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }
}

/** 本机已跟随这台服务器的项（重新拉取用）：每个有映射的独立项，不含内嵌书映射 */
export function linkedItemRefs(
  summaries: readonly Pick<LocalItem, 'localId' | 'kind' | 'name'>[],
  links: readonly Pick<ServerLink, 'localId' | 'canonicalId'>[],
): ServerItemRef[] {
  const byLocal = new Map(links.map((link) => [link.localId, link]))
  return summaries.flatMap((summary) => {
    const link = byLocal.get(summary.localId)
    return link ? [{ kind: summary.kind, canonicalId: link.canonicalId, name: summary.name }] : []
  })
}
