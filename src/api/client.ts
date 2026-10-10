/**
 * DiceFrame API 客户端（移植自 frontend-v2/src/api/client.ts）。
 *
 * 与 Web 版的差异：
 * - Web 是同源相对路径 `/api/...`；移动端 baseUrl 可配置（局域网服务器地址）。
 * - Web 从 hash 路由读取玩家分享参数；移动端身份由 settings store 注入
 *   configureApiClient，玩家模式下拼进 /games/... 请求的 query。
 * - 401 不再做页面跳转，而是触发可选的 onUnauthorized 回调（由路由层注册）。
 *
 * 契约要点（与服务端 web_server.py / src/webui 对齐）：
 * - 非 GET 请求必须带 `X-TRPG-Confirm: true`（_require_confirmed_request）。
 * - 429 响应携带 retry_after（abuse-guard 限流）。
 * - 玩家分享链接鉴权：query 参数 game/name/share/delegate 声明分享模式；席位身份走
 *   `X-Seat-Token` 请求头，房间密码令牌走 `X-Room-Token` 请求头（见 lib/seat-credentials）。
 *   `?user=` 只在 Owner 预览或尚未持有席位凭证时下发（无访问密码 / 旧服务端的回退）。
 */

import { getRandomValues } from 'expo-crypto'

import { getT } from '@/i18n/t'
import type { TKey } from '@/i18n/keyset'
import { normalizeBaseUrl } from '@/lib/base-url'
import {
  ROOM_TOKEN_HEADER,
  SEAT_TOKEN_HEADER,
  gameKeyOfApiPath,
  isDelegateFlag,
  readCredential,
  withoutRoomToken,
  withoutSeatToken,
  type CredentialSlots,
} from '@/lib/seat-credentials'
import { UserFacingError } from '@/lib/user-facing-error'

export class ApiError extends Error {
  /** 403 且服务端声明 needs_room_password：房间令牌缺失/过期/改密吊销，需要重新输入房间密码 */
  needsRoomPassword = false
  /**
   * 错误响应的完整 JSON 正文。内容同步需要它：409 PLAN_STALE 内嵌新的 preview，
   * 提交的部分失败（409/500）带逐项结果 items。其余调用方一般只看 code/status。
   */
  body: Record<string, unknown> = {}

  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfter?: number,
  ) {
    super(message)
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

export function errorCodeOf(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const payload = data as { error_code?: unknown; code?: unknown }
  for (const code of [payload.error_code, payload.code]) {
    if (typeof code === 'string' && code) return code
  }
  return undefined
}

/**
 * 玩家分享链接身份（JoinView 解析自 Web 分享链接）。
 * user 是席位的公开 uid（展示与 game store 用），不是凭证；席位凭证与房间令牌
 * 只放在 ApiContext.credentials 里，按后端地址 + gameKey 分槽。
 */
export interface ShareIdentity {
  game: string
  user: string
  name?: string
  delegate?: string
}

/** 服务端拒绝了本机保存的分享凭证：调用方据此清身份/回加入页（client 已先从内存移除） */
export interface ShareCredentialRejection {
  kind: 'seat' | 'room'
  baseUrl: string
  game: string
}

interface ApiContext {
  baseUrl: string
  token: string | null
  share: ShareIdentity | null
  /**
   * 自管理的 trpg_session 会话 token。RN（尤其 Android/OkHttp）读不到
   * set-cookie 响应头，也没有自动 cookie 管理，因此由客户端自行生成
   * uuid token 并以 Cookie 头主动携带；服务端 session_middleware 对任意
   * 未知 token 都会建档（token → user_id），claim-gm/rebind 都基于它生效。
   * Web 端例外：浏览器禁止 JS 设置 Cookie 头，会话由服务端 httponly
   * Set-Cookie + 浏览器 cookie jar 自动管理（与 frontend-v2 一致）。
   */
  sessionToken: string | null
  /** 分享凭证槽位（席位凭证 / 房间令牌），键 = credentialKey(baseUrl, gameKey) */
  credentials: CredentialSlots
  onUnauthorized?: () => void
  onShareCredentialRejected?: (rejection: ShareCredentialRejection) => void
}

const context: ApiContext = { baseUrl: '', token: null, share: null, sessionToken: null, credentials: {} }

export function configureApiClient(patch: Partial<ApiContext>): void {
  Object.assign(context, patch)
}

export function currentShare(): ShareIdentity | null {
  return context.share
}

export function currentBaseUrl(): string {
  return context.baseUrl
}

export function currentToken(): string | null {
  return context.token
}

export function currentSessionToken(): string | null {
  return context.sessionToken
}

/** 当前后端上是否持有该局的席位凭证（不暴露明文；claim 流程据此判断是否需要换取） */
export function hasSeatToken(gameKey: string): boolean {
  return !!readCredential(context.credentials, context.baseUrl, gameKey).seat
}

/** 当前后端上是否持有该局的房间令牌（加入页据此决定是否先要房间密码） */
export function hasRoomToken(gameKey: string): boolean {
  return !!readCredential(context.credentials, context.baseUrl, gameKey).room
}

/**
 * 「进入对局」类幂等写请求遇到短时限流（429 + Retry-After）时等待后重试一次
 * （对齐 Web retryOnRateLimit）：同桌玩家常共用一个公网 IP，短暂的写配额不该把人卡在
 * 加入页。只用于重复执行无副作用的请求（找回席位、领取首枚凭证）。
 */
export async function retryOnRateLimit<T>(request: () => Promise<T>, maxWaitSeconds = 10): Promise<T> {
  try {
    return await request()
  } catch (error) {
    const wait = error instanceof ApiError && error.status === 429 ? Number(error.retryAfter || 0) : 0
    if (!wait || wait > maxWaitSeconds) throw error
    await new Promise((resolve) => setTimeout(resolve, wait * 1000))
    return await request()
  }
}

/**
 * 生成 32 位 hex 会话 token（与服务端 uuid4().hex 同格式）。
 * 会话 token 绑定席位/GM 身份，必须用密码学安全随机源（expo-crypto；Math.random 可预测）。
 */
export function generateSessionToken(): string {
  const bytes = getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function ensureSessionToken(): string {
  if (!context.sessionToken) context.sessionToken = generateSessionToken()
  return context.sessionToken
}

/**
 * 服务器唯一键：实现在 lib/base-url（邀请链接解析与凭证槽位共用同一份），
 * 这里转出以保持既有 import 路径。
 */
export { normalizeBaseUrl }

/**
 * 分享模式下是否下发公开 uid（对齐 Web shareQuery 的 sendUser）：
 * Owner 预览/代操作要指名席位；持有席位凭证的玩家只凭请求头证明身份，
 * 不再把 uid 放进 URL。没有凭证时保留 `?user=`——无访问密码的服务端与
 * 席位凭证上线前的旧服务端仍按它识别玩家。
 */
function sendsShareUser(share: ShareIdentity): boolean {
  return !!context.token || !hasSeatToken(share.game)
}

/** 分享模式下由身份统一接管的 query 字段：业务 query 与 path 里的同名值一律丢弃 */
const SHARE_QUERY_KEYS = ['game', 'user', 'name', 'share', 'delegate', 'room_token'] as const

/** 玩家模式下需要拼到 /games/... 请求上的 query 参数（对齐 Web shareQuery） */
export function shareQuery(): URLSearchParams | null {
  const share = context.share
  if (!share) return null
  const q = new URLSearchParams()
  q.set('game', share.game)
  if (share.user && sendsShareUser(share)) q.set('user', share.user)
  if (share.name) q.set('name', share.name)
  q.set('share', '1')
  if (share.delegate) q.set('delegate', share.delegate)
  return q
}

/**
 * 拼完整 API 地址。extra 覆盖 path 里的同名 query；drop 里的字段先从 path 自带的
 * query 中删除（分享身份接管的字段，防止 path 里旧的 user/room_token 漏出去）。
 */
export function buildUrl(path: string, extra?: URLSearchParams, drop: readonly string[] = []): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (!extra?.size && !drop.length) return `${context.baseUrl}/api${normalized}`
  const queryIndex = normalized.indexOf('?')
  const pathname = queryIndex < 0 ? normalized : normalized.slice(0, queryIndex)
  const q = new URLSearchParams(queryIndex < 0 ? '' : normalized.slice(queryIndex + 1))
  for (const key of drop) q.delete(key)
  extra?.forEach((value, key) => q.set(key, value))
  const query = q.toString()
  return `${context.baseUrl}/api${pathname}${query ? `?${query}` : ''}`
}

export function buildStaticAssetUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${context.baseUrl}/v2-assets${normalized}`
}

/** 游戏 SSE 地址（一次性票据 + 游标 + 分享参数；对齐 Web gameEventSource） */
export function buildPlaySseUrl(gameKey: string, ticket: string, cursor = ''): string {
  const q = shareQuery() ?? new URLSearchParams()
  q.set('ticket', ticket)
  if (cursor) q.set('cursor', cursor)
  return buildUrl(`/games/${encodeURIComponent(gameKey)}/sse`, q)
}

type RawBody = Uint8Array | ArrayBuffer | FormData | Blob

function isRawBody(body: unknown): body is RawBody {
  return (
    body instanceof Uint8Array ||
    (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob)
  )
}

/**
 * 席位凭证：只给玩家模式（有分享身份、非 Owner、非 delegate 代操作）下、
 * 当前后端上该请求所属对局的凭证。Owner/GM 自己的请求一律不隐式带——
 * 它们以 GM 身份执行，预览席位靠 `?user=` 指名。
 */
function applySeatTokenHeader(headers: Headers, path: string): void {
  if (headers.has(SEAT_TOKEN_HEADER) || context.token) return
  const share = context.share
  if (!share || isDelegateFlag(share.delegate)) return
  const token = readCredential(context.credentials, context.baseUrl, gameKeyOfApiPath(path)).seat
  if (token) headers.set(SEAT_TOKEN_HEADER, token)
}

/** 房间令牌只走请求头（不进 URL/访问日志），且只发给签发它的那台后端上的那一局 */
function applyRoomTokenHeader(headers: Headers, path: string): void {
  if (headers.has(ROOM_TOKEN_HEADER)) return
  const token = readCredential(context.credentials, context.baseUrl, gameKeyOfApiPath(path)).room
  if (token) headers.set(ROOM_TOKEN_HEADER, token)
}

/**
 * 请求的身份模式：
 * - owner（默认）：Owner 凭据 + 会话 + 当前分享身份（玩家模式时）；
 * - shareless：Owner 凭据 + 会话，但**不带任何分享上下文**（分享 query、席位凭证、
 *   房间令牌）。/api/content/* 一律如此：内容库是 Owner 的，分享凭证不鉴权，
 *   也不该随内容同步请求发出去；
 * - anonymous：什么凭据都不带（公开配置、配对兑换）。
 */
export type RequestMode = 'owner' | 'shareless' | 'anonymous'

export interface ApiOptions {
  anonymous?: boolean
  /** 不带分享上下文；/content/ 开头的路径自动启用 */
  shareless?: boolean
}

function requestModeOf(path: string, options: ApiOptions): RequestMode {
  if (options.anonymous === true) return 'anonymous'
  if (options.shareless === true || /^\/?content\//.test(path)) return 'shareless'
  return 'owner'
}

function buildHeaders(init: RequestInit, mode: RequestMode, path: string): Headers {
  const anonymous = mode === 'anonymous'
  const headers = new Headers(init.headers)
  const rawBody = isRawBody(init.body)
  if (!rawBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (anonymous) {
    // 匿名探测（公开配置等）不得带出任何实例凭据，包括调用方显式塞进来的分享凭证
    headers.delete(SEAT_TOKEN_HEADER)
    headers.delete(ROOM_TOKEN_HEADER)
  } else {
    if (context.token) headers.set('Authorization', `Bearer ${context.token}`)
    // Web 浏览器会静默丢弃 JS 设置的 Cookie 头，交给服务端 Set-Cookie +
    // cookie jar 自动管理；不引入 react-native 依赖以保证 node 测试环境可用
    if (typeof document === 'undefined' && !headers.has('Cookie')) {
      headers.set('Cookie', `trpg_session=${ensureSessionToken()}`)
    }
    if (mode === 'owner') {
      applySeatTokenHeader(headers, path)
      applyRoomTokenHeader(headers, path)
    } else {
      headers.delete(SEAT_TOKEN_HEADER)
      headers.delete(ROOM_TOKEN_HEADER)
    }
  }
  if (init.method && init.method !== 'GET') headers.set('X-TRPG-Confirm', 'true')
  return headers
}

function retryAfterOf(data: unknown, response?: Response): number | undefined {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  // 正文 retry_after 优先；限流中间件同时下发标准 Retry-After 头（秒），作兜底
  for (const raw of [payload.retry_after, response?.headers.get('Retry-After')]) {
    if (raw === null || raw === undefined || raw === '') continue
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  }
  return undefined
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const raw = await response.text()
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function errorFrom(data: Record<string, unknown>, status: number, response?: Response): ApiError {
  const message =
    typeof data.error === 'string' && data.error ? data.error : `HTTP ${status}`
  const error = new ApiError(message, status, errorCodeOf(data), retryAfterOf(data, response))
  error.needsRoomPassword = status === 403 && data.needs_room_password === true
  error.body = data
  return error
}

/**
 * 服务端拒绝了本机保存的分享凭证（对齐 Web handleRejectedSeatToken / RoomToken）：
 * - 401 SEAT_TOKEN_INVALID：席位凭证被 GM 重新签发或席位已移除；
 * - 403 needs_room_password：房间令牌过期或 GM 改了房间密码。
 * 先从内存槽位移除，避免后续请求继续带着失效凭证，再交给路由层清持久化/回加入页。
 * Owner 请求不走这里：它从不隐式携带席位凭证，也不受房间密码约束。
 */
function noteRejectedCredential(path: string, error: ApiError): void {
  if (context.token) return
  const game = gameKeyOfApiPath(path)
  if (!game) return
  const baseUrl = context.baseUrl
  let kind: ShareCredentialRejection['kind'] | null = null
  if (error.status === 401 && error.code === 'SEAT_TOKEN_INVALID') {
    kind = 'seat'
    context.credentials = withoutSeatToken(context.credentials, baseUrl, game)
  } else if (error.needsRoomPassword && context.share) {
    kind = 'room'
    context.credentials = withoutRoomToken(context.credentials, baseUrl, game)
  }
  if (kind) context.onShareCredentialRejected?.({ kind, baseUrl, game })
}

function handleUnauthorized(response: Response, isPlayerShare: boolean): void {
  // 玩家分享请求的 401 属于身份/房间密码问题，在当前页面报错即可；
  // Owner 模式下交给路由层跳登录。
  if (response.status === 401 && !isPlayerShare && context.onUnauthorized) {
    context.onUnauthorized()
  }
}

export type ApiQuery = Record<string, string | number | boolean | null | undefined>

export interface ApiRequestInit extends RequestInit {
  query?: ApiQuery
}

function requestQuery(query: ApiQuery | undefined, anonymous = false): { params: URLSearchParams; drop: string[] } {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) params.set(key, String(value))
  }
  const share = anonymous ? null : shareQuery()
  if (!share) return { params, drop: [] }
  // 当前分享身份优先于业务参数及 path 中的同名字段，避免重复参数产生鉴权歧义；
  // 身份不下发的字段（持凭证时的 user、已废弃的 room_token）也不许从别处漏出去。
  for (const key of SHARE_QUERY_KEYS) params.delete(key)
  share.forEach((value, key) => params.set(key, value))
  return { params, drop: [...SHARE_QUERY_KEYS] }
}

function originOf(url: string): string {
  try {
    const base = typeof location !== 'undefined' ? location.href : undefined
    return new URL(url, base).origin
  } catch {
    return ''
  }
}

/**
 * 重定向防线：请求头里手动带着会话 Cookie、席位凭证与房间令牌，跟随跨源跳转会把
 * 它们原样发给别的主机（服务端 API 本身从不重定向）。
 * - 一律 `redirect: 'manual'`：浏览器与 expo/fetch 据此不跟随；
 * - RN 内置 fetch（XMLHttpRequest）忽略该选项会自行跟随，只能事后按最终地址拒收，
 *   并提示用户直接填写最终地址（多见于 http→https 的反代跳转）。
 */
async function guardedFetch(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, redirect: 'manual' })
  const finalUrl = response.url
  const crossOrigin = !!finalUrl && !!originOf(url) && originOf(finalUrl) !== originOf(url)
  const unfollowedRedirect = response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)
  if (crossOrigin || unfollowedRedirect) {
    throw new ApiError('cross-origin redirect blocked', response.status, 'CROSS_ORIGIN_REDIRECT')
  }
  return response
}

async function send(path: string, init: ApiRequestInit, mode: RequestMode): Promise<Response> {
  const { query, ...requestInit } = init
  const { params, drop } = requestQuery(query, mode !== 'owner')
  const url = buildUrl(path, params, drop)
  return guardedFetch(url, { ...requestInit, headers: buildHeaders(requestInit, mode, path) })
}

function failure(path: string, response: Response, data: Record<string, unknown>, mode: RequestMode): ApiError {
  const error = errorFrom(data, response.status, response)
  if (mode === 'owner') noteRejectedCredential(path, error)
  return error
}

export async function api<T = unknown>(
  path: string,
  init: ApiRequestInit = {},
  options: ApiOptions = {},
): Promise<T> {
  const mode = requestModeOf(path, options)
  const response = await send(path, init, mode)
  const data = (await readJson(response)) as T & Record<string, unknown>
  // shareless（内容同步）的 401 是「需要房主」，由调用方提示，不触发全局跳登录页
  if (mode !== 'shareless') handleUnauthorized(response, mode === 'owner' ? !!context.share : false)
  if (!response.ok) throw failure(path, response, data, mode)
  return data
}

export async function apiBlob(
  path: string,
  init: ApiRequestInit = {},
  options: ApiOptions = {},
): Promise<Response> {
  const mode = requestModeOf(path, options)
  const response = await send(path, init, mode)
  if (mode !== 'shareless') handleUnauthorized(response, mode === 'owner' ? !!context.share : false)
  if (!response.ok) throw failure(path, response, await readJson(response), mode)
  return response
}

/** POST /api/login 校验 owner 密码 */
export async function validateAccessToken(value: string): Promise<void> {
  const headers = new Headers()
  if (value) headers.set('Authorization', `Bearer ${value}`)
  const response = await guardedFetch(buildUrl('/login'), { method: 'POST', headers })
  const data = await readJson(response)
  if (response.status === 429) {
    throw new ApiError('请求过于频繁，请稍后再试', 429, errorCodeOf(data), retryAfterOf(data, response))
  }
  if (response.status === 401 || response.status === 403) throw new UserFacingError('dfLoginWrongPassword')
  if (!response.ok) throw errorFrom(data, response.status, response)
}

export type OwnerAccessStatus = 'allowed' | 'login-required' | 'unavailable'

/** GET /api/me：探测 owner 访问态（不带分享参数，玩家身份不得越权） */
export async function checkOwnerAccess(): Promise<OwnerAccessStatus> {
  try {
    const headers = new Headers()
    if (context.token) headers.set('Authorization', `Bearer ${context.token}`)
    const response = await guardedFetch(buildUrl('/me'), { headers })
    if (response.status === 401) return 'login-required'
    return response.ok ? 'allowed' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** GET /api/config（公开接口，敏感字段已脱敏） */
export async function fetchAppConfig(): Promise<import('./types').AppConfig> {
  // 公开配置探测用于登录与服务器切换，不应携带任一实例的凭据或会话。
  return api<import('./types').AppConfig>('/config', {}, { anonymous: true })
}

export function errorMessage(error: unknown, fallback: TKey = 'dfErrorsUnexpected'): string {
  const t = getT()
  if (error instanceof UserFacingError) return t(error.key)
  if (error instanceof ApiError) {
    if (error.code === 'CROSS_ORIGIN_REDIRECT') return t('dfErrorsRedirectBlocked')
    if (error.code) {
      // 只展示已收录的业务提示；未知错误码和服务端异常原文留在异常对象中供排查。
      // 上游 apiErrors 既有原样大写码（FIELD_REQUIRES_GM / SEAT_TOKEN_*）也有小写码：先精确后小写。
      for (const key of new Set([`apiErrors.${error.code}`, `apiErrors.${error.code.toLowerCase()}`])) {
        const translated = t(key as TKey)
        if (translated !== key) return translated
      }
    }
    if (error.status === 429) {
      const seconds = error.retryAfter
      return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
        ? t('dfErrorsRateLimitedWait', { seconds: Math.ceil(seconds) })
        : t('dfErrorsRateLimited')
    }
    if (error.status === 401) return t('dfErrorsUnauthorized')
    if (error.status === 403) return t('dfErrorsForbidden')
    if (error.status === 404) return t('dfErrorsNotFound')
    if (error.status === 408 || error.status === 504) return t('dfErrorsTimeout')
    if (error.status >= 500) return t('dfErrorsServerUnavailable')
    if (error.status === 409) return t('dfErrorsConflict')
    if (error.status === 413) return t('dfErrorsFileTooLarge')
    if (error.status === 400 || error.status === 422) return t('dfErrorsInvalidInput')
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return t('dfErrorsTimeout')
    // fetch 在浏览器和原生端的错误名称不同，只识别网络特征，不暴露异常内容。
    if (/network request failed|failed to fetch|fetch failed|networkerror|load failed|network is offline|econnrefused|enotfound/i.test(error.message)) {
      return t('dfCommonNetworkError')
    }
  }
  return t(fallback)
}
