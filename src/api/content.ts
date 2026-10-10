/**
 * 内容同步 API（/api/content/*，契约见 diceframe/diceframe#494，#500 起为仓库内的
 * docs/content-sync/CONTRACT.md）。只负责请求与响应，不碰本机库：映射写入、逐项事务与
 * 决策界面在 M5（推送）/ M6（拉取）。
 *
 * 契约要点：
 * - 仅房主（访问密码或配对设备令牌）。分享/席位凭证不鉴权，也绝不随这些请求发出：
 *   client 对 /content/ 路径自动走 shareless 模式（无分享 query、无席位/房间头）。
 * - 每个请求都要 X-TRPG-Confirm（client 对非 GET 统一加；导出与状态查询也是 POST）。
 * - 映射按 server_instance_id 记：响应里带 server_instance_id 时（#500 起）必须与
 *   预期一致，否则中止（SERVER_MISMATCH），避免把 A 服务器的 canonical id 记到 B 上。
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
  ContentPreviewResponse,
  ContentPushItem,
  ContentStatusItem,
  ContentStatusResponse,
  ContentSyncSource,
} from './types'
import { ApiError, api, errorMessage } from './client'
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

/** 状态查询每次最多 500 项（服务端上限） */
export const MAX_STATUS_ITEMS = 500

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 响应声明的实例与预期不同（拿着 A 的映射在跟 B 说话）就中止 */
function assertSameServer(expected: string, body: unknown): void {
  const actual = isRecord(body) ? body.server_instance_id : undefined
  if (typeof actual === 'string' && actual && actual !== expected) {
    throw new ContentSyncError(SERVER_MISMATCH, `expected server ${expected}, got ${actual}`)
  }
}

/** ApiError → ContentSyncError（路由不存在 = 服务端太旧），并做实例校验 */
function translate(expected: string, error: unknown): unknown {
  if (!(error instanceof ApiError)) return error
  assertSameServer(expected, error.body)
  if (!error.code && (error.status === 404 || error.status === 405)) {
    return new ContentSyncError(CONTENT_SYNC_UNSUPPORTED, 'this server has no content sync API', error.status)
  }
  return error
}

async function contentRequest<T>(expected: string, path: string, body: unknown): Promise<T> {
  let response: T
  try {
    response = await api<T>(path, { method: 'POST', body: JSON.stringify(body) }, { shareless: true })
  } catch (error) {
    throw translate(expected, error)
  }
  assertSameServer(expected, response)
  return response
}

function requireServer(serverInstanceId: string): void {
  if (!isCanonicalId(serverInstanceId)) {
    throw new ContentSyncError(SERVER_IDENTITY_UNAVAILABLE, 'server instance id is missing')
  }
}

export interface ImportRequest {
  /** 期望对话的服务器（来自带鉴权的 /api/config） */
  serverInstanceId: string
  source: ContentSyncSource
  items: ContentPushItem[]
}

function importBody(request: ImportRequest): { source: ContentSyncSource; items: ContentPushItem[] } {
  requireServer(request.serverInstanceId)
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
  return contentRequest<ContentPreviewResponse>(request.serverInstanceId, '/content/import/preview', body)
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
    return await contentRequest<ContentCommitResponse>(request.serverInstanceId, '/content/import/commit', body)
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
export async function exportContent(serverInstanceId: string, items: ContentRef[]): Promise<ContentExportItem[]> {
  requireServer(serverInstanceId)
  const body = { items }
  checkRequestLimits(items.length, body)
  const response = await contentRequest<ContentExportResponse>(serverInstanceId, '/content/export', body)
  for (const item of response.items ?? []) {
    if (item.origin?.server_instance_id && item.origin.server_instance_id !== serverInstanceId) {
      throw new ContentSyncError(SERVER_MISMATCH, 'export origin names another server')
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
 * 优先 POST /api/content/status（#500，每次 ≤500 项，自动分批）；服务端还没有这个端点时
 * 退化为逐项 export（未知 id 记为 exists:false，不让整批失败）。
 */
export async function contentStatus(serverInstanceId: string, items: ContentRef[]): Promise<ContentStatusItem[]> {
  requireServer(serverInstanceId)
  const result: ContentStatusItem[] = []
  for (const batch of chunks(items, MAX_STATUS_ITEMS)) {
    try {
      const response = await contentRequest<ContentStatusResponse>(serverInstanceId, '/content/status', { items: batch })
      result.push(...(response.items ?? []))
    } catch (error) {
      if (!(error instanceof ContentSyncError) || error.code !== CONTENT_SYNC_UNSUPPORTED) throw error
      result.push(...(await statusViaExport(serverInstanceId, batch)))
    }
  }
  return result
}

async function statusViaExport(serverInstanceId: string, items: ContentRef[]): Promise<ContentStatusItem[]> {
  const result: ContentStatusItem[] = []
  for (const ref of items) {
    try {
      const [exported] = await exportContent(serverInstanceId, [ref])
      result.push({
        kind: ref.kind,
        canonical_id: ref.canonical_id,
        exists: !!exported,
        state_token: exported?.origin.state_token ?? '',
        provenance: exported?.origin.provenance ?? null,
      })
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error
      result.push({ kind: ref.kind, canonical_id: ref.canonical_id, exists: false, state_token: '', provenance: null })
    }
  }
  return result
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
  IMPORT_FAILED: 'dfContentImportFailed',
  CARD_IDENTITY_CONFLICT: 'dfContentIdentityConflict',
  LOREBOOK_IDENTITY_CONFLICT: 'dfContentIdentityConflict',
  NOT_FOUND: 'dfContentNotFound',
  SERVER_IDENTITY_UNAVAILABLE: 'dfContentServerIdentityUnavailable',
  SERVER_MISMATCH: 'dfContentServerMismatch',
  CONTENT_SYNC_UNSUPPORTED: 'dfContentSyncUnsupported',
}

/** 错误码 → 文案键；不认识的码返回 null（交给通用 errorMessage） */
export function contentErrorKey(code: string | undefined): TKey | null {
  return (code && CONTENT_ERROR_KEYS[code]) || null
}

/** 内容同步的用户可见错误：先按内容同步错误码，其余（网络、429 等）走通用 errorMessage */
export function contentErrorMessage(error: unknown): string {
  const code = error instanceof ContentSyncError || error instanceof PortableFormatError || error instanceof ApiError
    ? error.code
    : undefined
  const key = contentErrorKey(code)
  return key ? getT()(key) : errorMessage(error)
}
