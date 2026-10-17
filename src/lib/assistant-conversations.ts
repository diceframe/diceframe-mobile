/**
 * DF Agent 会话存档（对齐上游 PR #549 的 useAssistantConversations）：对话记录只存本机
 * （每轮请求都会把它发给 Agent），每段会话同时记住自己的服务端 session_id，切回时
 * 草稿与待确认操作随会话恢复。移动端按服务器地址分开存，切服务器不串会话。
 */
import { isStoredMessage, messagesForStorage, type AssistantMessage } from './assistant-agent'

export const MAX_CONVERSATIONS = 30
const TITLE_CHARS = 28
const MAX_TITLE = 60

export interface AssistantConversation {
  id: string
  title: string
  customTitle?: boolean
  createdAt: number
  updatedAt: number
  sessionId: string | null
  messages: AssistantMessage[]
}

export interface ConversationArchive {
  activeId: string
  items: AssistantConversation[]
}

export function newConversationId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function isConversation(value: unknown): value is AssistantConversation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.title === 'string'
    && typeof record.createdAt === 'number' && typeof record.updatedAt === 'number'
    && (record.sessionId === null || typeof record.sessionId === 'string')
}

function storedMessages(value: unknown): AssistantMessage[] {
  return Array.isArray(value) ? value.filter(isStoredMessage).slice(-20) : []
}

export function parseArchive(raw: string | null): ConversationArchive {
  try {
    const parsed = JSON.parse(raw || 'null') as Partial<ConversationArchive> | null
    const items = Array.isArray(parsed?.items)
      ? parsed.items.filter(isConversation).map((item) => ({ ...item, messages: storedMessages(item.messages) }))
      : []
    return { activeId: typeof parsed?.activeId === 'string' ? parsed.activeId : '', items }
  } catch {
    return { activeId: '', items: [] }
  }
}

/** 默认标题 = 第一条用户消息（压空白、截 28 字） */
export function conversationTitle(messages: AssistantMessage[], fallback: string): string {
  const first = messages.find((message) => message.role === 'user' && message.content.trim())
  const text = (first?.content ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  return text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS)}…` : text
}

/**
 * 把当前会话写回存档：空会话不保留；内容或会话 id 变了才刷新时间；
 * 按最近更新排序，超过 30 段丢最旧的。
 */
export function syncConversation(
  archive: ConversationArchive,
  active: { id: string; messages: AssistantMessage[]; sessionId: string | null },
  now = Date.now(),
): ConversationArchive {
  const index = archive.items.findIndex((item) => item.id === active.id)
  const previous = index >= 0 ? archive.items[index] : null
  const items = archive.items.filter((item) => item.id !== active.id)
  if (!active.messages.length) return { activeId: active.id, items }
  const snapshot = messagesForStorage(active.messages)
  const changed = !previous
    || JSON.stringify(previous.messages) !== JSON.stringify(snapshot)
    || previous.sessionId !== active.sessionId
  const entry: AssistantConversation = {
    id: active.id,
    title: previous?.customTitle ? previous.title : conversationTitle(snapshot, previous?.title ?? ''),
    ...(previous?.customTitle ? { customTitle: true } : {}),
    createdAt: previous?.createdAt ?? now,
    updatedAt: changed ? now : previous.updatedAt,
    sessionId: active.sessionId,
    messages: snapshot,
  }
  const sorted = [entry, ...items].sort((left, right) => right.updatedAt - left.updatedAt)
  return { activeId: active.id, items: sorted.slice(0, MAX_CONVERSATIONS) }
}

/** 重命名：压空白、截 60 字，空名不改；之后标题不再随首条消息变 */
export function renameConversation(archive: ConversationArchive, id: string, title: string): ConversationArchive {
  const value = title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
  if (!value || !archive.items.some((item) => item.id === id)) return archive
  return {
    ...archive,
    items: archive.items.map((item) => (item.id === id ? { ...item, title: value, customTitle: true } : item)),
  }
}

export function removeConversation(archive: ConversationArchive, id: string): ConversationArchive {
  return { ...archive, items: archive.items.filter((item) => item.id !== id) }
}
