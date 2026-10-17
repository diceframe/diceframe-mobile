/**
 * DF Agent（房主助手）的契约与纯逻辑，对齐上游 frontend-v2 的 api/assistant.ts 与
 * composables/useAssistant.ts。
 *
 * POST /api/assistant/agent/run 返回 SSE 帧流（不是 EventSource 长连接，而是一次 POST 的响应体）：
 * session / status / tool_start / tool_result / draft / approval / navigate 是 Agent 事件；
 * sources = 引用文档；reset = 服务端放大预算重试，清空已显示内容；error = 失败；done = 结束；
 * 其余帧的 data 里带 delta 文本增量。
 *
 * 会改数据的工具不会直接执行：服务端先发 approval（带 approval_id + plan_digest），
 * 用户确认后 POST /agent/confirm 才执行；内容创作先发 draft，可编辑后 /agent/review 重审。
 * 服务端只认房主（owner_authenticated），持分享链接的玩家用不了。
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantContext {
  route: string
  game_key?: string
  world_id?: string
  adventure_id?: string
  book_id?: string
}

export interface AssistantSource {
  source: string
  heading: string
}

export interface AgentDraftReview {
  ok?: boolean
  draft?: unknown
  plan_digest?: string
  blockers?: unknown[]
  kind?: string
  text?: string
  [key: string]: unknown
}

export interface AgentApproval {
  approval_id: string
  plan_digest: string
  tool: string
  label?: string
  arguments?: unknown
  expires_at?: number | string
  recovery_required?: boolean
  expired?: boolean
  preview?: unknown
}

export interface AgentConfirmResult {
  ok: boolean
  result?: unknown
  navigation?: { route: string; query?: Record<string, unknown> }
  cancelled?: boolean
  partial?: boolean
  error?: string
}

export interface AgentReceipt {
  approval_id: string
  plan_digest: string
  result?: unknown
  response?: AgentConfirmResult
}

export interface AgentSession {
  ok?: boolean
  session_id: string
  pending: AgentApproval | null
  drafts: Record<string, AgentDraftReview>
  receipts: AgentReceipt[]
  status?: string
}

export interface AgentReviewResult {
  ok: boolean
  draft_id: string
  review: AgentDraftReview
  approval?: AgentApproval
}

export interface AssistantEventRecord {
  event: string
  payload: Record<string, unknown>
}

export interface AssistantMessage extends ChatMessage {
  sources?: AssistantSource[]
  events?: AssistantEventRecord[]
  error?: string
  stopped?: boolean
}

export interface AssistantDraft {
  draft_id: string
  review: AgentDraftReview
}

export interface AssistantNavigation {
  route: string
  query?: Record<string, string>
}

export const AGENT_EVENTS = ['session', 'status', 'tool_start', 'tool_result', 'draft', 'approval', 'navigate'] as const

export interface AgentStreamHandlers {
  onDelta: (text: string) => void
  onSources?: (sources: AssistantSource[]) => void
  onReset?: () => void
  onAgentEvent?: (event: string, payload: Record<string, unknown>) => void
}

/** 流里的 error 帧：带服务端错误码，界面据此给提示 */
export class AgentStreamError extends Error {
  constructor(message: string, readonly code = 'ASSISTANT_FAILED') {
    super(message)
    this.name = 'AgentStreamError'
  }
}

function parsePayload(data: string): Record<string, unknown> {
  try {
    const value = JSON.parse(data) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function isAssistantSource(value: unknown): value is AssistantSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.source === 'string' && typeof record.heading === 'string'
}

/** 分发一个 SSE 帧（空行分隔的一块）；返回 true 表示收到 done，调用方应停止读取。 */
export function dispatchAgentFrame(block: string, handlers: AgentStreamHandlers): boolean {
  const lines = block.split(/\r?\n/)
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message'
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
  if (event === 'done') return true
  if (!data) return false
  const payload = parsePayload(data)
  if ((AGENT_EVENTS as readonly string[]).includes(event)) handlers.onAgentEvent?.(event, payload)
  if (event === 'error') {
    throw new AgentStreamError(
      typeof payload.error === 'string' ? payload.error : '',
      typeof payload.code === 'string' ? payload.code : 'ASSISTANT_FAILED',
    )
  }
  if (event === 'sources') {
    handlers.onSources?.(Array.isArray(payload.sources) ? payload.sources.filter(isAssistantSource) : [])
    return false
  }
  if (event === 'reset') {
    handlers.onReset?.()
    return false
  }
  if (typeof payload.delta === 'string') handlers.onDelta(payload.delta)
  return false
}

/**
 * 增量 SSE 解析器：网络分块可能把一帧切成几段，按空行凑齐整帧再分发。
 * push 返回 true = 已收到 done；finish 处理流结束时残留的最后一帧。
 */
export function createAgentStreamParser(handlers: AgentStreamHandlers) {
  let buffer = ''
  let finished = false

  function drain(final: boolean): boolean {
    while (true) {
      const separator = buffer.match(/\r?\n\r?\n/)
      if (!separator || separator.index === undefined) break
      const block = buffer.slice(0, separator.index)
      buffer = buffer.slice(separator.index + separator[0].length)
      if (dispatchAgentFrame(block, handlers)) return (finished = true)
    }
    if (final && buffer.trim()) {
      const block = buffer
      buffer = ''
      if (dispatchAgentFrame(block, handlers)) return (finished = true)
    }
    return false
  }

  return {
    push(chunk: string): boolean {
      if (finished) return true
      buffer += chunk
      return drain(false)
    },
    finish(): boolean {
      if (finished) return true
      return drain(true)
    },
  }
}

/** 请求消息：去掉空内容，单条截 8000 字，从最近往前取，最多 20 条、合计 24000 字（同上游） */
export function requestMessagesOf(history: ChatMessage[], text: string): ChatMessage[] {
  const candidates: ChatMessage[] = history
    .filter((message) => message.content.trim())
    .map(({ role, content }) => ({ role, content: content.slice(0, 8_000) }))
  candidates.push({ role: 'user', content: text.slice(0, 8_000) })
  const selected: ChatMessage[] = []
  let total = 0
  for (const message of candidates.reverse()) {
    if (selected.length >= 20 || total + message.content.length > 24_000) break
    selected.push(message)
    total += message.content.length
  }
  return selected.reverse()
}

const MAX_EVENT_CHARS = 4_000
/** 事件载荷进历史前去掉疑似凭据字段并截断长文本（历史会持久化到本机） */
const SECRET_KEY = /(password|passwd|token|secret|api[_-]?key|authorization|credential|cookie)/i

function compactValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[…]'
  if (typeof value === 'string') return value.length > MAX_EVENT_CHARS ? `${value.slice(0, MAX_EVENT_CHARS)}…` : value
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (!SECRET_KEY.test(key)) output[key] = compactValue(item, depth + 1)
    }
    return output
  }
  return value
}

export function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const value = compactValue(payload)
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** 追加一条事件记录（tool_result 补齐 ok / partial 便于展示），每条消息最多留 80 条 */
export function withEvent(message: AssistantMessage, event: string, payload: Record<string, unknown>): AssistantMessage {
  let next = payload
  if (event === 'tool_result') {
    const result = payload.result && typeof payload.result === 'object' && !Array.isArray(payload.result)
      ? payload.result as Record<string, unknown>
      : {}
    next = { ...payload, ok: payload.ok ?? result.ok ?? true, partial: payload.partial ?? result.partial ?? false }
  }
  const events = [...(message.events ?? []), { event, payload: compactPayload(next) }].slice(-80)
  return { ...message, events }
}

/** 上游的页面名；移动端在 features/assistant 里映射到自己的路由 */
export const AGENT_ROUTES = ['overview', 'create', 'play', 'characters', 'library', 'creator', 'map', 'lorebook',
  'worlds', 'adventures', 'modules', 'memory', 'logs', 'rules', 'settings', 'plugins'] as const
const NAV_QUERY_KEYS = new Set(['game', 'section', 'world', 'book', 'adventure', 'intent'])

/** 只接受白名单页面与查询键，拒绝任何像外链 / 脚本的值（导航请求来自模型输出） */
export function safeNavigation(value: unknown): AssistantNavigation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if ('url' in record || 'hash' in record) return null
  let route = typeof record.route === 'string' ? record.route.trim() : ''
  if (route.startsWith('/')) route = route.slice(1)
  if (!(AGENT_ROUTES as readonly string[]).includes(route)) return null
  const query: Record<string, string> = {}
  if (record.query && typeof record.query === 'object' && !Array.isArray(record.query)) {
    for (const [key, raw] of Object.entries(record.query as Record<string, unknown>)) {
      if (!NAV_QUERY_KEYS.has(key) || SECRET_KEY.test(key)) return null
      if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') continue
      const text = String(raw)
      if (text.length <= 200 && !/javascript:|https?:\/\//i.test(text)) query[key] = text
    }
  }
  return { route, ...(Object.keys(query).length ? { query } : {}) }
}

/** expires_at 兼容秒 / 毫秒时间戳与 ISO 字符串 */
export function approvalExpired(value: AgentApproval, now = Date.now()): boolean {
  if (value.recovery_required) return true
  if (value.expires_at === undefined || value.expires_at === null) return false
  const numeric = typeof value.expires_at === 'number' || /^\d+(?:\.\d+)?$/.test(String(value.expires_at))
  const raw = numeric
    ? Number(value.expires_at) * (Number(value.expires_at) < 10_000_000_000 ? 1000 : 1)
    : Date.parse(String(value.expires_at))
  return Number.isFinite(raw) && raw <= now
}

export function normaliseApproval(value: unknown, now = Date.now()): AgentApproval | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.approval_id !== 'string' || typeof record.plan_digest !== 'string' || typeof record.tool !== 'string') return null
  const approval: AgentApproval = {
    approval_id: record.approval_id,
    plan_digest: record.plan_digest,
    tool: record.tool,
    label: typeof record.label === 'string' ? record.label : undefined,
    arguments: record.arguments,
    expires_at: typeof record.expires_at === 'number' || typeof record.expires_at === 'string' ? record.expires_at : undefined,
    preview: record.preview,
    recovery_required: record.recovery_required === true,
  }
  return approvalExpired(approval, now) ? { ...approval, expired: true } : approval
}

/** 待批准操作关联的草稿（在 arguments / preview 里找 draft_id，最多下探 3 层） */
export function approvalDraftId(approval: AgentApproval): string | undefined {
  const find = (value: unknown, depth = 0): string | undefined => {
    if (depth > 3 || !value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const record = value as Record<string, unknown>
    for (const key of ['draft_id', 'draftId']) if (typeof record[key] === 'string') return record[key] as string
    for (const child of Object.values(record)) {
      const found = find(child, depth + 1)
      if (found) return found
    }
    return undefined
  }
  return find(approval.arguments) ?? find(approval.preview)
}

/** 草稿被本地改过后，基于旧草稿的批准不能再确认（先重审，得到新的 plan_digest） */
export function fenceDirtyApproval(approval: AgentApproval | null, dirtyDraftIds: ReadonlySet<string>): AgentApproval | null {
  if (!approval) return null
  const draftId = approvalDraftId(approval)
  if (draftId && dirtyDraftIds.has(draftId)) return { ...approval, expired: true, recovery_required: true }
  return approval
}

/** 回执里的执行结果（新服务端有 response，旧数据只有 result） */
export function receiptResponse(receipt: AgentReceipt): AgentConfirmResult {
  if (receipt.response && typeof receipt.response.ok === 'boolean') return receipt.response
  const raw = receipt.result
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof (raw as Record<string, unknown>).ok === 'boolean') {
    return raw as AgentConfirmResult
  }
  return { ok: true, result: raw }
}

export function findReceipt(receipts: AgentReceipt[], approval: AgentApproval): AgentReceipt | undefined {
  return receipts.find((item) => item.approval_id === approval.approval_id && item.plan_digest === approval.plan_digest)
}

/** 结果里引用的生成图（generated 资源 id），用于在结果卡里直接显示 */
export function resultAssetId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const record = value as Record<string, unknown>
  const reference = record.reference && typeof record.reference === 'object' ? record.reference as Record<string, unknown> : {}
  if (reference.kind === 'generated' && typeof reference.asset_id === 'string') return reference.asset_id
  return typeof record.asset_id === 'string' ? record.asset_id : ''
}

/** 结果摘要：字符串直出，对象转 JSON；摘要截短、详情不截 */
export function eventResultText(value: unknown, detailed = false): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return detailed ? value : value.slice(0, 180)
  try {
    const text = JSON.stringify(value, null, detailed ? 2 : undefined)
    return detailed ? text : text.slice(0, 240)
  } catch {
    return detailed ? String(value) : String(value).slice(0, 180)
  }
}

export interface DraftItem {
  id?: string
  name?: string
  text?: string
  target?: string
  references?: unknown[]
  [key: string]: unknown
}

export const DRAFT_TARGETS = ['world', 'lorebook', 'character_template', 'adventure'] as const

function draftRecord(review: AgentDraftReview): Record<string, unknown> {
  const draft = review.draft
  return draft && typeof draft === 'object' && !Array.isArray(draft) ? draft as Record<string, unknown> : {}
}

/** 草稿里可编辑的条目（名称 / 正文 / 目标），拷贝一份供表单改 */
export function draftItemsOf(review: AgentDraftReview): DraftItem[] {
  const value = draftRecord(review).items
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is DraftItem => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({ ...item, references: Array.isArray(item.references) ? [...item.references] : item.references }))
}

/** 送去重审的草稿：保留草稿其余字段，换上编辑后的 items，去掉顶层单条字段（以 items 为准） */
export function editedDraftOf(review: AgentDraftReview, items: DraftItem[]): Record<string, unknown> {
  const draft: Record<string, unknown> = { ...draftRecord(review), items: items.map((item) => ({ ...item })) }
  delete draft.name
  delete draft.text
  delete draft.target
  return draft
}

export function draftBlockers(review: AgentDraftReview): string[] {
  const value = review.blockers
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).filter(Boolean)
    : []
}

/** 每条都填了名称、正文、目标才允许送审 */
export function draftItemsComplete(items: DraftItem[]): boolean {
  return items.length > 0 && items.every((item) =>
    String(item.name ?? '').trim() && String(item.text ?? '').trim() && String(item.target ?? '').trim())
}

/** 历史持久化：从最近往前取，最多 20 条、合计 24000 字符（JSON 长度），丢弃不合形的 */
export function messagesForStorage(messages: AssistantMessage[]): AssistantMessage[] {
  const selected: AssistantMessage[] = []
  let chars = 0
  for (const message of [...messages].reverse()) {
    if (selected.length >= 20) break
    const size = JSON.stringify(message).length
    if (selected.length && chars + size > 24_000) break
    selected.push(message)
    chars += size
  }
  return selected.reverse()
}

export function isStoredMessage(value: unknown): value is AssistantMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if ((record.role !== 'user' && record.role !== 'assistant') || typeof record.content !== 'string' || record.content.length > 12_000) return false
  return record.events === undefined || (Array.isArray(record.events) && record.events.every((event) => !!event && typeof event === 'object'))
}
