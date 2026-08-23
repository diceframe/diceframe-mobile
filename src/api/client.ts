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
 * - 玩家分享链接鉴权：query 参数 game/user/name/share/delegate/room_token。
 */

export class ApiError extends Error {
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
  if (data && typeof data === 'object' && 'error_code' in data) {
    const code = (data as { error_code?: unknown }).error_code
    return typeof code === 'string' && code ? code : undefined
  }
  return undefined
}

/** 玩家分享链接身份（JoinView 解析自 Web 分享链接） */
export interface ShareIdentity {
  game: string
  user: string
  name?: string
  delegate?: string
  roomToken?: string
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
   */
  sessionToken: string | null
  onUnauthorized?: () => void
}

const context: ApiContext = { baseUrl: '', token: null, share: null, sessionToken: null }

export function configureApiClient(patch: Partial<ApiContext>): void {
  Object.assign(context, patch)
}

export function currentShare(): ShareIdentity | null {
  return context.share
}

export function currentToken(): string | null {
  return context.token
}

export function currentSessionToken(): string | null {
  return context.sessionToken
}

/** 生成 32 位 hex 会话 token（与服务端 uuid4().hex 同格式） */
export function generateSessionToken(): string {
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += Math.floor(Math.random() * 16).toString(16)
  }
  return token
}

function ensureSessionToken(): string {
  if (!context.sessionToken) context.sessionToken = generateSessionToken()
  return context.sessionToken
}

/** 补全协议、去尾部斜杠：`192.168.1.5:18000` → `http://192.168.1.5:18000` */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  return url.replace(/\/+$/, '')
}

/** 玩家模式下需要拼到 /games/... 请求上的 query 参数（对齐 Web shareQuery） */
export function shareQuery(): URLSearchParams | null {
  const share = context.share
  if (!share) return null
  const q = new URLSearchParams()
  q.set('game', share.game)
  q.set('user', share.user)
  if (share.name) q.set('name', share.name)
  q.set('share', '1')
  if (share.delegate) q.set('delegate', share.delegate)
  if (share.roomToken) q.set('room_token', share.roomToken)
  return q
}

export function buildUrl(path: string, extra?: URLSearchParams): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const q = extra ? new URLSearchParams(extra) : null
  return `${context.baseUrl}/api${normalized}${q && q.size > 0 ? (normalized.includes('?') ? '&' : '?') + q.toString() : ''}`
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

function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers)
  const rawBody = isRawBody(init.body)
  if (!rawBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (context.token) headers.set('Authorization', `Bearer ${context.token}`)
  if (!headers.has('Cookie')) headers.set('Cookie', `trpg_session=${ensureSessionToken()}`)
  if (init.method && init.method !== 'GET') headers.set('X-TRPG-Confirm', 'true')
  return headers
}

function retryAfterOf(data: unknown): number | undefined {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const seconds = Number(payload.retry_after)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const raw = await response.text()
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function errorFrom(data: Record<string, unknown>, status: number): ApiError {
  const message =
    typeof data.error === 'string' && data.error ? data.error : `HTTP ${status}`
  return new ApiError(message, status, errorCodeOf(data), retryAfterOf(data))
}

function handleUnauthorized(response: Response, isPlayerShare: boolean): void {
  // 玩家分享请求的 401 属于身份/房间密码问题，在当前页面报错即可；
  // Owner 模式下交给路由层跳登录。
  if (response.status === 401 && !isPlayerShare && context.onUnauthorized) {
    context.onUnauthorized()
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const url = buildUrl(path, shareQuery() ?? undefined)
  const response = await fetch(url, { ...init, headers: buildHeaders(init) })
  const data = (await readJson(response)) as T & Record<string, unknown>
  handleUnauthorized(response, !!context.share)
  if (!response.ok) throw errorFrom(data, response.status)
  return data
}

export async function apiBlob(path: string, init: RequestInit = {}): Promise<Response> {
  const url = buildUrl(path, shareQuery() ?? undefined)
  const response = await fetch(url, { ...init, headers: buildHeaders(init) })
  handleUnauthorized(response, !!context.share)
  if (!response.ok) {
    throw errorFrom(await readJson(response), response.status)
  }
  return response
}

/** POST /api/login 校验 owner 密码 */
export async function validateAccessToken(value: string): Promise<void> {
  const headers = new Headers()
  if (value) headers.set('Authorization', `Bearer ${value}`)
  const response = await fetch(buildUrl('/login'), { method: 'POST', headers })
  const data = await readJson(response)
  if (response.status === 429) {
    throw new ApiError('请求过于频繁，请稍后再试', 429, errorCodeOf(data), retryAfterOf(data))
  }
  if (!response.ok) throw new ApiError('密码不正确或服务器拒绝访问', response.status)
}

export type OwnerAccessStatus = 'allowed' | 'login-required' | 'unavailable'

/** GET /api/me：探测 owner 访问态（不带分享参数，玩家身份不得越权） */
export async function checkOwnerAccess(): Promise<OwnerAccessStatus> {
  try {
    const headers = new Headers()
    if (context.token) headers.set('Authorization', `Bearer ${context.token}`)
    const response = await fetch(buildUrl('/me'), { headers })
    if (response.status === 401) return 'login-required'
    return response.ok ? 'allowed' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** GET /api/config（公开接口，敏感字段已脱敏） */
export async function fetchAppConfig(): Promise<import('./types').AppConfig> {
  return api<import('./types').AppConfig>('/config')
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
