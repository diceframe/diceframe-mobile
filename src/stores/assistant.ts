/**
 * DF Agent 会话状态（移植上游 composables/useAssistant.ts 的状态机）。
 *
 * - 一轮对话 = 一次流式 POST：文本增量追加到最后一条助手消息，Agent 事件记进该消息的 events；
 * - 会改数据的操作停在 pendingApproval，用户确认 / 取消才调 /agent/confirm；
 * - 确认请求网络失败时，先拉会话快照看回执——服务端可能已经执行，避免重复执行或误报失败；
 * - 草稿本地改过后，基于旧草稿的批准被围栏（dirtyDraftIds），必须先重审拿到新 plan_digest；
 * - 历史与 session_id 按服务器地址分别存本机（切服务器不串会话），上限同上游。
 *
 * 用 generation 代际号丢弃过期回调：清空、重发、切服务器后，旧请求的回包一律不落地。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

import {
  confirmAssistantAgent,
  getAssistantAgentSession,
  reviewAssistantAgent,
  streamAssistantAgent,
} from '@/api/assistant'
import { ApiError, errorMessage } from '@/api/client'
import { getT } from '@/i18n/t'
import {
  AgentStreamError,
  fenceDirtyApproval,
  findReceipt,
  isStoredMessage,
  messagesForStorage,
  normaliseApproval,
  receiptResponse,
  requestMessagesOf,
  safeNavigation,
  withEvent,
  type AgentApproval,
  type AgentConfirmResult,
  type AgentDraftReview,
  type AgentReceipt,
  type AgentSession,
  type AssistantContext,
  type AssistantDraft,
  type AssistantMessage,
  type AssistantNavigation,
} from '@/lib/assistant-agent'

export interface AssistantDeps {
  stream: typeof streamAssistantAgent
  confirm: typeof confirmAssistantAgent
  review: typeof reviewAssistantAgent
  session: typeof getAssistantAgentSession
  storage: {
    get: (key: string) => Promise<string | null>
    set: (key: string, value: string) => Promise<void>
    remove: (key: string) => Promise<void>
  }
}

export interface AssistantState {
  /** 当前会话所属服务器；为空表示尚未加载 */
  serverKey: string
  messages: AssistantMessage[]
  streaming: boolean
  status: string
  sessionId: string | null
  pendingApproval: AgentApproval | null
  drafts: Record<string, AssistantDraft>
  receipts: AgentReceipt[]
  navigation: AssistantNavigation | null
  actionBusy: boolean
  actionError: string
  /** 打开助手的页面（例如对局里打开会带上 game_key），随每轮请求发给服务端 */
  context: AssistantContext | null
  /** 切换服务器：重置内存态并读入该服务器的本机历史 */
  load: (serverKey: string) => Promise<void>
  setContext: (context: AssistantContext | null) => void
  send: (text: string, language: string) => Promise<void>
  stop: () => void
  retryLast: (language: string) => Promise<void>
  restoreSession: () => Promise<void>
  confirmApproval: (approved?: boolean) => Promise<AgentConfirmResult | undefined>
  cancelApproval: () => Promise<AgentConfirmResult | undefined>
  reviewDraft: (draftId: string, draft: unknown) => Promise<void>
  saveDraft: (draftId: string, language: string) => Promise<void>
  /** 草稿表单一有改动就作废旧批准（服务端也撤回），防止确认的是改动前的内容 */
  invalidateApproval: (draftId?: string) => Promise<void>
  clearNavigation: () => void
  clear: () => Promise<void>
}

const STORAGE_PREFIX = 'diceframe-assistant:v1:'

export function storageKeyOf(serverKey: string): string {
  return STORAGE_PREFIX + encodeURIComponent(serverKey)
}

function isAbort(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError'
}

function streamErrorText(error: unknown): string {
  if (error instanceof AgentStreamError) return error.message || getT()('assistantError')
  if (error instanceof ApiError) return errorMessage(error)
  return getT()('assistantRequestFailed')
}

/** 404/403/401 说明会话已失效（服务端重启或换了房主凭据），丢掉本地会话 id */
function sessionGone(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status)
}

const EMPTY = {
  messages: [] as AssistantMessage[],
  streaming: false,
  status: '',
  sessionId: null as string | null,
  pendingApproval: null as AgentApproval | null,
  drafts: {} as Record<string, AssistantDraft>,
  receipts: [] as AgentReceipt[],
  navigation: null as AssistantNavigation | null,
  actionBusy: false,
  actionError: '',
}

export function createAssistantStore(deps: AssistantDeps) {
  let generation = 0
  let controller: AbortController | null = null
  const dirtyDraftIds = new Set<string>()

  return create<AssistantState>((set, get) => {
    async function persist() {
      const { serverKey, messages, sessionId } = get()
      if (!serverKey) return
      try {
        await deps.storage.set(storageKeyOf(serverKey), JSON.stringify({ sessionId, messages: messagesForStorage(messages) }))
      } catch {
        // 本机历史只是便利，写不进去不影响当前会话
      }
    }

    function updateLastAssistant(update: (message: AssistantMessage) => AssistantMessage) {
      const messages = [...get().messages]
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'assistant') {
          messages[index] = update(messages[index])
          set({ messages })
          return
        }
      }
    }

    function applySession(snapshot: AgentSession) {
      const drafts: Record<string, AssistantDraft> = {}
      if (snapshot.drafts && typeof snapshot.drafts === 'object') {
        for (const [id, review] of Object.entries(snapshot.drafts)) {
          if (review && typeof review === 'object') drafts[id] = { draft_id: id, review: review as AgentDraftReview }
        }
      }
      // 本地改过还没重审的草稿以本地为准，服务端快照不覆盖
      for (const id of dirtyDraftIds) if (get().drafts[id]) drafts[id] = get().drafts[id]
      set({
        sessionId: snapshot.session_id || get().sessionId,
        pendingApproval: fenceDirtyApproval(normaliseApproval(snapshot.pending), dirtyDraftIds),
        receipts: Array.isArray(snapshot.receipts)
          ? snapshot.receipts.map((receipt) => ({ ...receipt, result: receipt.result !== undefined ? receipt.result : receipt.response?.result }))
          : [],
        drafts,
        status: typeof snapshot.status === 'string' ? snapshot.status : '',
      })
    }

    function addResult(result: AgentConfirmResult, tool: string) {
      updateLastAssistant((message) => withEvent(message, 'tool_result', {
        ok: result.ok, partial: result.partial, tool, result: result.result, error: result.error,
      }))
      if (result.navigation) set({ navigation: safeNavigation(result.navigation) })
    }

    function adoptReceipt(pending: AgentApproval, receipt: AgentReceipt): AgentConfirmResult {
      const recovered = receiptResponse(receipt)
      set({ pendingApproval: null, actionError: recovered.ok ? '' : recovered.error || getT()('assistantError') })
      addResult(recovered, pending.tool)
      return recovered
    }

    return {
      serverKey: '',
      ...EMPTY,
      context: null,

      async load(serverKey) {
        if (serverKey === get().serverKey) return
        generation += 1
        controller?.abort()
        controller = null
        dirtyDraftIds.clear()
        set({ serverKey, ...EMPTY })
        if (!serverKey) return
        const current = generation
        let raw: string | null = null
        try {
          raw = await deps.storage.get(storageKeyOf(serverKey))
        } catch {
          raw = null
        }
        if (current !== generation) return
        try {
          const parsed = JSON.parse(raw || 'null') as { sessionId?: unknown; messages?: unknown } | null
          set({
            sessionId: typeof parsed?.sessionId === 'string' && parsed.sessionId.trim() ? parsed.sessionId : null,
            messages: Array.isArray(parsed?.messages) ? parsed.messages.filter(isStoredMessage).slice(-20) : [],
          })
        } catch {
          // 坏数据当没有历史
        }
      },

      setContext(context) {
        set({ context })
      },

      async send(text, language) {
        const value = text.trim()
        if (!value || get().streaming) return
        const requestMessages = requestMessagesOf(get().messages, value)
        const current = ++generation
        const abort = new AbortController()
        controller = abort
        set({
          messages: [...get().messages, { role: 'user', content: value }, { role: 'assistant', content: '', events: [] }],
          streaming: true,
          status: '',
          actionError: '',
        })
        const live = () => current === generation && !abort.signal.aborted
        try {
          await deps.stream(requestMessages, language, {
            onDelta(delta) {
              if (live()) updateLastAssistant((message) => ({ ...message, content: message.content + delta }))
            },
            onSources(sources) {
              if (live()) updateLastAssistant((message) => ({ ...message, sources }))
            },
            onReset() {
              if (live()) updateLastAssistant((message) => ({ ...message, content: '' }))
            },
            onAgentEvent(event, payload) {
              if (!live()) return
              updateLastAssistant((message) => withEvent(message, event, payload))
              if (event === 'session' && typeof payload.session_id === 'string' && payload.session_id.trim()) {
                set({ sessionId: payload.session_id.trim() })
              }
              if (event === 'status') set({ status: typeof payload.message === 'string' ? payload.message : '' })
              if (event === 'approval') set({ pendingApproval: fenceDirtyApproval(normaliseApproval(payload), dirtyDraftIds) })
              if (event === 'draft' && typeof payload.draft_id === 'string' && payload.review && typeof payload.review === 'object') {
                const draftId = payload.draft_id
                set({ drafts: { ...get().drafts, [draftId]: { draft_id: draftId, review: payload.review as AgentDraftReview } } })
              }
              if (event === 'navigate') set({ navigation: safeNavigation(payload) })
            },
          }, { signal: abort.signal, sessionId: get().sessionId ?? undefined, context: get().context ?? undefined })
        } catch (error) {
          if (current !== generation) return
          if (isAbort(error) || abort.signal.aborted) updateLastAssistant((message) => ({ ...message, stopped: true }))
          else updateLastAssistant((message) => ({ ...message, error: streamErrorText(error) }))
        } finally {
          if (current === generation) {
            controller = null
            set({ streaming: false })
            await persist()
          }
        }
      },

      stop() {
        if (!controller) return
        updateLastAssistant((message) => ({ ...message, stopped: true }))
        controller.abort()
      },

      async retryLast(language) {
        if (get().streaming) return
        const messages = get().messages
        let userIndex = -1
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index].role === 'user') {
            userIndex = index
            break
          }
        }
        if (userIndex < 0) return
        const text = messages[userIndex].content
        set({ messages: messages.slice(0, userIndex) })
        await get().send(text, language)
      },

      async restoreSession() {
        const sessionId = get().sessionId
        if (!sessionId || get().streaming || get().actionBusy) return
        const current = generation
        try {
          const snapshot = await deps.session(sessionId)
          if (current !== generation || get().streaming || get().actionBusy) return
          applySession(snapshot)
        } catch (error) {
          if (current !== generation) return
          if (sessionGone(error)) {
            set({ sessionId: null, pendingApproval: null, drafts: {}, receipts: [] })
            await persist()
          }
        }
      },

      async confirmApproval(approved = true) {
        const pending = get().pendingApproval
        const sessionId = get().sessionId
        if (!pending || !sessionId || get().actionBusy) return undefined
        if (approved && (pending.expired || pending.recovery_required)) return undefined
        // 已有回执说明这一步早已执行过（比如上次确认回包丢了），直接采用回执，不再执行一遍
        const known = findReceipt(get().receipts, pending)
        if (known) return adoptReceipt(pending, known)
        const current = generation
        set({ actionBusy: true, actionError: '' })
        try {
          const result = await deps.confirm(sessionId, pending.approval_id, pending.plan_digest, approved)
          if (current !== generation) return undefined
          set({ pendingApproval: null })
          if (result.ok && approved) {
            set({ receipts: [...get().receipts, { approval_id: pending.approval_id, plan_digest: pending.plan_digest, result: result.result, response: result }] })
          }
          addResult(result, pending.tool)
          if (!result.ok) set({ actionError: result.error || getT()('assistantError') })
          await persist()
          return result
        } catch (error) {
          if (current !== generation) return undefined
          // 回包丢了不代表没执行：拉一次会话快照，有回执就以回执为准
          try {
            const snapshot = await deps.session(sessionId)
            if (current === generation) {
              applySession(snapshot)
              const receipt = findReceipt(get().receipts, pending)
              if (receipt) return adoptReceipt(pending, receipt)
            }
          } catch {
            // 保留原始的确认失败给用户看
          }
          set({ actionError: errorMessage(error) })
          return undefined
        } finally {
          if (current === generation) set({ actionBusy: false })
        }
      },

      async cancelApproval() {
        get().stop()
        return get().confirmApproval(false)
      },

      async reviewDraft(draftId, draft) {
        const sessionId = get().sessionId
        if (!sessionId || get().actionBusy) return
        const current = generation
        set({ pendingApproval: null, actionBusy: true, actionError: '' })
        try {
          const result = await deps.review(sessionId, draftId, draft)
          if (current !== generation) return
          dirtyDraftIds.delete(draftId)
          set({
            drafts: { ...get().drafts, [draftId]: { draft_id: draftId, review: result.review } },
            pendingApproval: fenceDirtyApproval(normaliseApproval(result.approval), dirtyDraftIds),
          })
          await persist()
        } catch (error) {
          if (current === generation) set({ actionError: errorMessage(error) })
        } finally {
          if (current === generation) set({ actionBusy: false })
        }
      },

      async saveDraft(draftId, language) {
        // 保存走对话：让 Agent 调 save_content，服务端据此发出待确认的保存操作
        await get().send(getT()('dfAgentSaveDraftPrompt', { id: draftId }), language)
      },

      async invalidateApproval(draftId) {
        if (draftId) dirtyDraftIds.add(draftId)
        const pending = get().pendingApproval
        set({ pendingApproval: null })
        const sessionId = get().sessionId
        if (!pending || !sessionId) return
        const current = generation
        set({ actionBusy: true })
        try {
          await deps.confirm(sessionId, pending.approval_id, pending.plan_digest, false)
        } catch {
          // 本地围栏已经挡住确认旧方案，服务端撤回失败不影响安全
        } finally {
          if (current === generation) set({ actionBusy: false })
        }
      },

      clearNavigation() {
        set({ navigation: null })
      },

      async clear() {
        generation += 1
        controller?.abort()
        controller = null
        dirtyDraftIds.clear()
        set({ ...EMPTY })
        const { serverKey } = get()
        if (!serverKey) return
        try {
          await deps.storage.remove(storageKeyOf(serverKey))
        } catch {
          // 同 persist
        }
      },
    }
  })
}

export const useAssistantStore = createAssistantStore({
  stream: streamAssistantAgent,
  confirm: confirmAssistantAgent,
  review: reviewAssistantAgent,
  session: getAssistantAgentSession,
  storage: {
    get: (key) => AsyncStorage.getItem(key),
    set: (key, value) => AsyncStorage.setItem(key, value),
    remove: (key) => AsyncStorage.removeItem(key),
  },
})
