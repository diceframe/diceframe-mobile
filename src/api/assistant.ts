import { api, apiStream } from './client'
import {
  createAgentStreamParser,
  type AgentConfirmResult,
  type AgentReviewResult,
  type AgentSession,
  type AgentStreamHandlers,
  type AssistantContext,
  type ChatMessage,
} from '@/lib/assistant-agent'

/**
 * DF Agent 只对房主开放：一律走 shareless（带房主凭据、不带任何分享身份），
 * 即使当前正以玩家身份在某局里，也不会把席位凭证发给助手接口。
 */
const OWNER_ONLY = { shareless: true } as const

/**
 * 运行一轮 Agent，按 SSE 帧回调。expo/fetch 支持逐块读取响应体；
 * 拿不到 body 读取器的环境（个别 Web / 测试替身）退化为读完整段再解析，功能不变、只是不流式。
 */
export async function streamAssistantAgent(
  messages: ChatMessage[],
  language: string,
  handlers: AgentStreamHandlers,
  options: { signal?: AbortSignal; sessionId?: string; context?: AssistantContext } = {},
): Promise<void> {
  const response = await apiStream('/assistant/agent/run', {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    body: JSON.stringify({
      messages,
      language,
      ...(options.sessionId ? { session_id: options.sessionId } : {}),
      ...(options.context ? { context: options.context } : {}),
    }),
    signal: options.signal,
  }, OWNER_ONLY)
  const parser = createAgentStreamParser(handlers)
  const reader = response.body?.getReader?.()
  if (!reader) {
    parser.push(await response.text())
    parser.finish()
    return
  }
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        parser.push(decoder.decode())
        parser.finish()
        return
      }
      if (parser.push(decoder.decode(value, { stream: true }))) {
        await reader.cancel()
        return
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function confirmAssistantAgent(
  sessionId: string,
  approvalId: string,
  planDigest: string,
  approved: boolean,
): Promise<AgentConfirmResult> {
  return api<AgentConfirmResult>('/assistant/agent/confirm', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, approval_id: approvalId, plan_digest: planDigest, approved }),
  }, OWNER_ONLY)
}

export function reviewAssistantAgent(sessionId: string, draftId: string, draft: unknown): Promise<AgentReviewResult> {
  return api<AgentReviewResult>('/assistant/agent/review', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, draft_id: draftId, draft }),
  }, OWNER_ONLY)
}

export function getAssistantAgentSession(sessionId: string): Promise<AgentSession> {
  return api<AgentSession>(`/assistant/agent/session/${encodeURIComponent(sessionId)}`, {}, OWNER_ONLY)
}
