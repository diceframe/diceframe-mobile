/**
 * 内容同步 API（/api/content/*，契约见 diceframe/diceframe#494，#500 起为仓库内的
 * docs/content-sync/CONTRACT.md）。只负责请求与响应，不碰本机库：映射写入、逐项事务与
 * 决策界面在 M5（推送）/ M6（拉取）。
 *
 * 契约要点：
 * - 仅房主（访问密码或配对设备令牌）。分享/席位凭证不鉴权，也绝不随这些请求发出：
 *   client 对 /content/ 路径自动走 shareless 模式（无分享 query、无席位/房间头），
 *   401 在这里变成 OWNER_REQUIRED，不触发全局跳登录页。
 * - 每个请求都要 X-TRPG-Confirm（client 对非 GET 统一加；导出与状态查询也是 POST）。
 * - 映射按 server_instance_id 记。先用 resolveContentServer() 锁定「哪台服务器」：
 *   实例 id + 当时的连接地址 + 能力（#500+ 才有 /status 且每个响应都带实例 id）。
 *   之后每个请求、以及 M5/M6 写映射前（assertContentServer），连接地址变了或响应里的
 *   实例 id 对不上就中止（SERVER_MISMATCH）；#500+ 服务端的成功响应缺 id 也算对不上。
 * - 提交遇 409 PLAN_STALE 时响应内嵌新的 preview（PlanStaleError），交给界面重新征询；
 *   部分失败（409 / 500 且带逐项 items）抛 CommitPartialError，逐项结果原样交出。
 */
import type {
  AppConfig,
  ContentCommitResponse,
  ContentCommitRow,
  ContentDecision,
  ContentExportItem,
  ContentExportResponse,
  ContentKind,
  ContentListItem,
  ContentListResponse,
  ContentPreviewResponse,
  ContentPushItem,
  ContentStatusItem,
  ContentStatusResponse,
  ContentSyncSource,
} from './types'
import { ApiError, api, currentBaseUrl, currentToken, errorMessage, normalizeBaseUrl } from './client'
import type { TKey } from '@/i18n/keyset'
import { getT } from '@/i18n/t'
import { isCanonicalId } from '@/lib/local-library/ids'
import { assertWithinLimits, requestLimitViolations } from '@/lib/portable/limits'
import { PortableFormatError } from '@/lib/portable/errors'

/** 客户端自有的错误码（服务端不会返回） */
export const SERVER_MISMATCH = 'SERVER_MISMATCH'
export const CONTENT_SYNC_UNSUPPORTED = 'CONTENT_SYNC_UNSUPPORTED'
export const OWNER_REQUIRED = 'OWNER_REQUIRED'
export const SERVER_IDENTITY_UNAVAILABLE = 'SERVER_IDENTITY_UNAVAILABLE'
export const PLAN_STALE = 'PLAN_STALE'
export const KIND_NOT_SUPPORTED = 'KIND_NOT_SUPPORTED'
export const CURSOR_INVALID = 'CURSOR_INVALID'
/** 客户端自有：列举翻页停不下来（服务端重复给出同一个 cursor，或页数超出上限） */
export const LIST_PAGING_STUCK = 'LIST_PAGING_STUCK'

/** 列举每页最多 500 项（服务端上限） */
export const MAX_LIST_ITEMS = 500
/** 一次列举最多翻的页数（500 × 2000 = 100 万项，远超任何内容库；防止服务端异常时无限翻页） */
export const MAX_LIST_PAGES = 2000
/** 状态查询每次最多 500 项（服务端上限） */
export const MAX_STATUS_ITEMS = 500
/** 退化状态查询（#494 服务端没有 /status）每批导出的项数，与导入上限一致 */
export const EXPORT_STATUS_BATCH = 50
/** 429 后最多重试的次数与单次最长等待（秒） */
const RATE_LIMIT_RETRIES = 3
const MAX_RETRY_WAIT_SECONDS = 120

export class ContentSyncError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 0) {
    super(message)
  }
}

/** 409 PLAN_STALE：服务端按当前状态重新规划的结果，界面据此重新征询决策 */
export class PlanStaleError extends ContentSyncError {
  constructor(public readonly preview: ContentPreviewResponse) {
    super(PLAN_STALE, 'the plan changed on the server; review the fresh preview', 409)
  }
}

/**
 * 提交部分失败（ok:false）：预期内的单项拒绝（409，后续项照常执行）或意外故障
 * （500 IMPORT_FAILED，之后的项 not_attempted）。rows 准确反映写了什么。
 */
export class CommitPartialError extends ContentSyncError {
  constructor(code: string, status: number, public readonly rows: ContentCommitRow[]) {
    super(code, 'some items were not written', status)
  }
}

/** 一次同步会话锁定的服务器 */
export interface ContentServer {
  serverInstanceId: string
  /** 锁定时的连接地址：之后连接被切走（换服务器、扫码登录别处）就不再是同一会话 */
  baseUrl: string
  /** #500+：每个内容响应都带 server_instance_id，缺失即视为不是这台服务器 */
  strict: boolean
  /** 服务端有 POST /api/content/status（#500+）；否则状态查询退化为批量导出 */
  hasStatus: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mismatch(detail: string): ContentSyncError {
  return new ContentSyncError(SERVER_MISMATCH, detail)
}

/** 连接仍是锁定时那台服务器（M5/M6 写映射前也要调用） */
export function assertContentServer(server: ContentServer): void {
  const current = currentBaseUrl()
  // 同源部署的 Web 端两边都是空串，算同一台
  if (current === '' && server.baseUrl === '') return
  const left = normalizeBaseUrl(current)
  const right = normalizeBaseUrl(server.baseUrl)
  // 规范化对任何无效地址都返回空串：无效的一侧一律视为不同，两个无效地址也不能算同一台
  if (!left || !right || left !== right) {
    throw mismatch(`connection moved from ${server.baseUrl} to ${current}`)
  }
}

/** 响应声明的实例必须是锁定的那台；strict 时成功响应缺 id 也不行 */
function assertSameServer(server: ContentServer, body: unknown, success: boolean): void {
  const actual = isRecord(body) ? body.server_instance_id : undefined
  if (typeof actual === 'string' && actual) {
    if (actual !== server.serverInstanceId) throw mismatch(`expected server ${server.serverInstanceId}, got ${actual}`)
    return
  }
  if (success && server.strict) throw mismatch('response does not name its server instance')
}

/** ApiError → 内容同步语义：401 = 需要房主，路由不存在 = 服务端太旧；并做实例校验 */
function translate(server: ContentServer, error: unknown): unknown {
  if (!(error instanceof ApiError)) return error
  assertSameServer(server, error.body, false)
  if (error.status === 401) return new ContentSyncError(OWNER_REQUIRED, 'owner credential required', 401)
  if (!error.code && (error.status === 404 || error.status === 405)) {
    return new ContentSyncError(CONTENT_SYNC_UNSUPPORTED, 'this server has no content sync API', error.status)
  }
  return error
}

async function contentRequest<T>(server: ContentServer, path: string, body: unknown): Promise<T> {
  assertContentServer(server)
  let response: T
  try {
    response = await api<T>(path, { method: 'POST', body: JSON.stringify(body) }, { shareless: true })
  } catch (error) {
    throw translate(server, error)
  }
  assertContentServer(server)
  assertSameServer(server, response, true)
  return response
}

function requireServer(server: ContentServer): void {
  if (!isCanonicalId(server.serverInstanceId)) {
    throw new ContentSyncError(SERVER_IDENTITY_UNAVAILABLE, 'server instance id is missing')
  }
}

/** 带房主鉴权的 /api/config（匿名探测拿不到 server_instance_id），不带分享上下文 */
export function fetchOwnerConfig(): Promise<AppConfig> {
  return api<AppConfig>('/config', {}, { shareless: true })
}

/**
 * 从房主视角的 /api/config 取实例标识：
 * - 有合法 id → 返回；
 * - server_identity_error（#500）→ SERVER_IDENTITY_UNAVAILABLE；
 * - 没有 id：带着房主凭据仍拿不到 → 服务端太旧（CONTENT_SYNC_UNSUPPORTED）；
 *   没有房主凭据 → 需要房主登录（OWNER_REQUIRED）。
 */
export function serverInstanceIdFromConfig(config: AppConfig, hasOwnerCredential: boolean): string {
  if (isCanonicalId(config.server_instance_id)) return config.server_instance_id
  if (config.server_identity_error) {
    throw new ContentSyncError(SERVER_IDENTITY_UNAVAILABLE, String(config.server_identity_error))
  }
  if (hasOwnerCredential) throw new ContentSyncError(CONTENT_SYNC_UNSUPPORTED, 'server does not expose server_instance_id')
  throw new ContentSyncError(OWNER_REQUIRED, 'owner login required to read server_instance_id')
}

/**
 * 锁定本次同步的服务器：房主 config 给实例 id，再用一次空的 /status 探测能力。
 * 房主 config 在 #494 与 #500 上都带 server_instance_id，分不出新旧；/status 是 #500
 * 才有的端点，且它的响应带实例 id——有它就按 strict 处理（之后缺 id 即不符）。
 * 空探测会计入写入限流（一次）。
 */
export async function resolveContentServer(): Promise<ContentServer> {
  const baseUrl = currentBaseUrl()
  const config = await fetchOwnerConfig()
  const serverInstanceId = serverInstanceIdFromConfig(config, !!currentToken())
  const pending: ContentServer = { serverInstanceId, baseUrl, strict: false, hasStatus: false }
  try {
    const probe = await contentRequest<ContentStatusResponse>(pending, '/content/status', { items: [] })
    const advertised = isRecord(probe) && typeof probe.server_instance_id === 'string' && !!probe.server_instance_id
    return { ...pending, hasStatus: true, strict: advertised }
  } catch (error) {
    if (error instanceof ContentSyncError && error.code === CONTENT_SYNC_UNSUPPORTED) {
      assertContentServer(pending)
      return pending
    }
    throw error
  }
}

export interface ImportRequest {
  server: ContentServer
  source: ContentSyncSource
  items: ContentPushItem[]
}

function importBody(request: ImportRequest): { source: ContentSyncSource; items: ContentPushItem[] } {
  requireServer(request.server)
  if (!isCanonicalId(request.source.id)) {
    throw new ContentSyncError('INSTALL_ID_INVALID', 'install id is not a canonical id')
  }
  return { source: request.source, items: request.items }
}

/** 本地预检请求级限额（50 项、8MB），沿用服务端错误码；条目级限额由调用方逐本检查 */
function checkRequestLimits(itemCount: number, body: unknown): void {
  assertWithinLimits(requestLimitViolations(itemCount, body))
}

/** POST /api/content/import/preview（会计入写入限流，也可能为配对设备首次绑定 install id） */
export async function previewImport(request: ImportRequest): Promise<ContentPreviewResponse> {
  const body = importBody(request)
  checkRequestLimits(body.items.length, body)
  return contentRequest<ContentPreviewResponse>(request.server, '/content/import/preview', body)
}

export interface CommitRequest extends ImportRequest {
  planDigest: string
  /** 每个有 existing 的项都必须给出决策（DECISION_REQUIRED / DECISION_NOT_ALLOWED 由服务端兜底） */
  decisions: Record<string, ContentDecision>
}

/**
 * POST /api/content/import/commit：文档随请求再发一次，服务端重新规划并与 plan_digest 比对。
 * 成功返回逐项结果；409 PLAN_STALE → PlanStaleError；带逐项 items 的失败 → CommitPartialError。
 * 成功提交后的重试不会重复写入：它会得到 PLAN_STALE，新预览显示 unchanged。
 */
export async function commitImport(request: CommitRequest): Promise<ContentCommitResponse> {
  const body = { ...importBody(request), plan_digest: request.planDigest, decisions: request.decisions }
  checkRequestLimits(body.items.length, body)
  try {
    return await contentRequest<ContentCommitResponse>(request.server, '/content/import/commit', body)
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === PLAN_STALE && isRecord(error.body.preview)) {
        throw new PlanStaleError(error.body.preview as unknown as ContentPreviewResponse)
      }
      if (Array.isArray(error.body.items)) {
        throw new CommitPartialError(error.code ?? 'IMPORT_FAILED', error.status, error.body.items as ContentCommitRow[])
      }
    }
    throw error
  }
}

export interface ContentRef {
  kind: ContentKind
  canonical_id: string
}

/** POST /api/content/export（拉取）：未知 id 让整个请求 404 NOT_FOUND */
export async function exportContent(server: ContentServer, items: ContentRef[]): Promise<ContentExportItem[]> {
  requireServer(server)
  const body = { items }
  checkRequestLimits(items.length, body)
  const response = await contentRequest<ContentExportResponse>(server, '/content/export', body)
  for (const item of response.items ?? []) {
    const origin = item.origin?.server_instance_id
    if (origin ? origin !== server.serverInstanceId : server.strict) {
      throw mismatch('export origin names another server (or none)')
    }
  }
  return response.items ?? []
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
  return out
}

/**
 * 服务端状态（state_token / provenance / 是否还存在），用于判断「拉取后服务端是否改过」。
 * #500+ 用 POST /api/content/status（每批 ≤500 项）；更早的服务端退化为批量导出
 * （见 statusViaExport，只为 #494 与 #500 之间的服务端保留）。
 */
export async function contentStatus(server: ContentServer, items: ContentRef[]): Promise<ContentStatusItem[]> {
  requireServer(server)
  if (!server.hasStatus) return statusViaExport(server, items)
  const result: ContentStatusItem[] = []
  for (const batch of chunks(items, MAX_STATUS_ITEMS)) {
    const response = await contentRequest<ContentStatusResponse>(server, '/content/status', { items: batch })
    result.push(...(response.items ?? []))
  }
  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 写入限流（60 次/分钟，含导出）：429 按 retry_after 等待后重试，最多 RATE_LIMIT_RETRIES 次 */
async function withRateLimitRetry<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      const wait = error instanceof ApiError && error.status === 429 ? Number(error.retryAfter || 0) : 0
      if (!wait || wait > MAX_RETRY_WAIT_SECONDS || attempt >= RATE_LIMIT_RETRIES) throw error
      await sleep(wait * 1000)
    }
  }
}

/** POST /api/content/list 的一页（#508）；cursor 为 null 取第一页 */
export function listContentPage(server: ContentServer, kind: ContentKind, cursor: string | null, limit = MAX_LIST_ITEMS): Promise<ContentListResponse> {
  requireServer(server)
  return contentRequest<ContentListResponse>(server, '/content/list', { kind, cursor, limit })
}

/**
 * 列出服务器上某一类的全部内容（#508，按 canonical_id 的 keyset 分页）：
 * - 只在 next_cursor 为 null 时结束——中途删了东西时某页可能很短甚至为空；
 * - 400 CURSOR_INVALID：从头重来一次，再失败就抛出；
 * - 429 按 retry_after 等待后重试（同其他内容请求）；
 * - 每页都校验实例 id 与连接地址（contentRequest），中途换了服务器整个列举失败，不返回半份结果；
 * - 服务端重复给出用过的 cursor、或页数超过 MAX_LIST_PAGES：抛 LIST_PAGING_STUCK，不无限翻页。
 * KIND_NOT_SUPPORTED（服务器没开 Lorebook）与旧服务端的裸 404/405 原样抛出，由调用方决定怎么展示。
 */
export async function listContent(server: ContentServer, kind: ContentKind): Promise<ContentListItem[]> {
  let restarted = false
  for (;;) {
    const items: ContentListItem[] = []
    const seen = new Set<string>()
    let cursor: string | null = null
    try {
      do {
        if (seen.size >= MAX_LIST_PAGES) throw new ContentSyncError(LIST_PAGING_STUCK, `listing exceeded ${MAX_LIST_PAGES} pages`)
        const page: ContentListResponse = await withRateLimitRetry(() => listContentPage(server, kind, cursor))
        items.push(...(page.items ?? []))
        cursor = page.next_cursor ?? null
        if (cursor !== null) {
          if (seen.has(cursor)) throw new ContentSyncError(LIST_PAGING_STUCK, 'server repeated a list cursor')
          seen.add(cursor)
        }
      } while (cursor !== null)
      return items
    } catch (error) {
      if (!restarted && error instanceof ApiError && error.code === CURSOR_INVALID) {
        restarted = true
        continue
      }
      throw error
    }
  }
}

function missingStatus(ref: ContentRef): ContentStatusItem {
  return { kind: ref.kind, canonical_id: ref.canonical_id, exists: false, state_token: '', provenance: null }
}

/**
 * 临时退化（只给 #494 ~ #500 之间、没有 /status 的服务端）：每批 50 项导出；
 * 批里有不存在的 id 时整批 404 NOT_FOUND，就二分该批找出缺失项（记 exists:false）；
 * 429 按 retry_after 等待。逐项导出会很快撞上 60 次/分钟的写入限流。
 */
async function statusViaExport(server: ContentServer, items: ContentRef[]): Promise<ContentStatusItem[]> {
  const result: ContentStatusItem[] = []
  for (const batch of chunks(items, EXPORT_STATUS_BATCH)) result.push(...(await exportStatusBatch(server, batch)))
  return result
}

async function exportStatusBatch(server: ContentServer, refs: ContentRef[]): Promise<ContentStatusItem[]> {
  let exported: ContentExportItem[]
  try {
    exported = await withRateLimitRetry(() => exportContent(server, refs))
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
    if (refs.length === 1) return [missingStatus(refs[0])]
    const middle = Math.ceil(refs.length / 2)
    return [
      ...(await exportStatusBatch(server, refs.slice(0, middle))),
      ...(await exportStatusBatch(server, refs.slice(middle))),
    ]
  }
  const byId = new Map(exported.map((item) => [item.origin.canonical_id, item]))
  return refs.map((ref) => {
    const item = byId.get(ref.canonical_id)
    return item
      ? { kind: ref.kind, canonical_id: ref.canonical_id, exists: true, state_token: item.origin.state_token, provenance: item.origin.provenance ?? null }
      : missingStatus(ref)
  })
}

/**
 * 错误码、预览原因码（reason，锁定项只能保留两份或跳过）与警告码 → 文案键。
 * 服务端码均核对过 upstream 源码（content_modules / character_card_import / lorebook）。
 */
const CONTENT_ERROR_KEYS: Record<string, TKey> = {
  PLAN_STALE: 'dfContentPlanStale',
  DECISION_REQUIRED: 'dfContentDecisionRequired',
  DECISION_NOT_ALLOWED: 'dfContentDecisionNotAllowed',
  SOURCE_NOT_THIS_DEVICE: 'dfContentSourceNotThisDevice',
  INSTALL_ID_IN_USE: 'dfContentInstallIdInUse',
  INSTALL_ID_INVALID: 'dfContentInstallIdInvalid',
  OWNER_REQUIRED: 'dfContentOwnerRequired',
  BODY_TOO_LARGE: 'dfContentBodyTooLarge',
  TOO_MANY_ITEMS: 'dfContentTooManyItems',
  TOO_MANY_ENTRIES: 'dfContentTooManyEntries',
  ENTRY_TOO_LARGE: 'dfContentEntryTooLarge',
  REQUEST_INVALID: 'dfContentRequestInvalid',
  KIND_NOT_SUPPORTED: 'dfContentKindNotSupported',
  RULESET_CARD_UNSUPPORTED: 'dfContentRulesetCardUnsupported',
  CARD_V3_INVALID: 'dfContentCardInvalid',
  IMPORT_SOURCE_INVALID: 'dfContentImportSourceInvalid',
  IMPORT_FAILED: 'dfContentImportFailed',
  CARD_IDENTITY_CONFLICT: 'dfContentIdentityConflict',
  LOREBOOK_IDENTITY_CONFLICT: 'dfContentIdentityConflict',
  NOT_FOUND: 'dfContentNotFound',
  SERVER_IDENTITY_UNAVAILABLE: 'dfContentServerIdentityUnavailable',
  SERVER_MISMATCH: 'dfContentServerMismatch',
  CONTENT_SYNC_UNSUPPORTED: 'dfContentSyncUnsupported',
  // 预览原因码（allowed 只剩 duplicate / skip）
  PLUGIN_CARD: 'dfContentReasonPluginCard',
  PLUGIN_BOOK: 'dfContentReasonPluginBook',
  TRACKED_BY_OTHER_SOURCE: 'dfContentReasonTrackedByOtherSource',
  DETACHED_FROM_OTHER_SOURCE: 'dfContentReasonDetachedFromOtherSource',
  RULESET_CARD: 'dfContentReasonRulesetCard',
  // 本机推送前的排除原因与取消
  LOCAL_ITEM_READ_ONLY: 'dfContentLocalReadOnly',
  LOREBOOK_V3_INVALID: 'dfContentLorebookInvalid',
  CANCELLED: 'dfContentCancelled',
  // 拉取
  EMBEDDED_BOOK_LINKED: 'dfPullEmbeddedBookLinked',
  CURSOR_INVALID: 'dfContentCursorInvalid',
  LIST_PAGING_STUCK: 'dfContentListPagingStuck',
  EMBEDDED_BOOK_HELD_STANDALONE: 'dfPullEmbeddedBookHeldStandalone',
  // 警告码
  PORTRAIT_NOT_PORTABLE: 'dfContentWarningPortraitNotPortable',
  BOOK_NOT_IMPORTED: 'dfContentWarningBookNotImported',
}

/** 错误 / 原因 / 警告码 → 文案键；不认识的码返回 null（交给通用 errorMessage 或原文） */
export function contentErrorKey(code: string | undefined): TKey | null {
  return (code && CONTENT_ERROR_KEYS[code]) || null
}

/**
 * 配对兑换时 install id 被拒的提示（与推送时的同名错误码文案不同）：
 * 配对时的 409 INSTALL_ID_IN_USE 说明服务端没有 #495 的接管，只能去 Web 吊销旧设备。
 */
export function pairingInstallIdNoticeKey(code: string | undefined): TKey | null {
  if (code === 'INSTALL_ID_IN_USE') return 'dfContentPairingInstallIdInUse'
  if (code === 'INSTALL_ID_INVALID') return 'dfContentInstallIdInvalid'
  return null
}

/** 内容同步的用户可见错误：先按内容同步错误码，其余（网络、429 等）走通用 errorMessage */
export function contentErrorMessage(error: unknown): string {
  const code = error instanceof ContentSyncError || error instanceof PortableFormatError || error instanceof ApiError
    ? error.code
    : undefined
  const key = contentErrorKey(code)
  return key ? getT()(key) : errorMessage(error)
}
