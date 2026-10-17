import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, configureApiClient } from './client'
import { confirmAssistantAgent, streamAssistantAgent } from './assistant'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  configureApiClient({
    baseUrl: 'http://agent.test',
    token: 'owner-token',
    sessionToken: 'session-test',
    share: { gameKey: 'g', userId: 'player-1', name: 'P' } as never,
    onUnauthorized: undefined,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  configureApiClient({ baseUrl: '', token: null, sessionToken: null, share: null, credentials: {} })
})

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

describe('DF Agent 流式请求', () => {
  it('房主凭据、确认头与会话都带上，分享身份不外带；分块拼帧后按序回调', async () => {
    fetchMock.mockResolvedValueOnce(new Response(streamOf([
      'event: session\ndata: {"session_id":"s1"}\n\ndata: {"del',
      'ta":"你好"}\n\nevent: done\ndata: {}\n\n',
    ]), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    const onDelta = vi.fn()
    const onAgentEvent = vi.fn()
    await streamAssistantAgent([{ role: 'user', content: '开一局' }], 'zh-CN', { onDelta, onAgentEvent }, {
      sessionId: 's0',
      context: { route: 'play', game_key: 'g' },
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://agent.test/api/assistant/agent/run')
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer owner-token')
    expect(headers.get('X-TRPG-Confirm')).toBe('true')
    expect(JSON.parse(String(init?.body))).toEqual({
      messages: [{ role: 'user', content: '开一局' }],
      language: 'zh-CN',
      session_id: 's0',
      context: { route: 'play', game_key: 'g' },
    })
    expect(onAgentEvent).toHaveBeenCalledWith('session', { session_id: 's1' })
    expect(onDelta).toHaveBeenCalledWith('你好')
  })

  it('非 2xx 抛 ApiError 并带服务端错误码', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'owner only', error_code: 'OWNER_REQUIRED' }), { status: 403 }))
    await expect(streamAssistantAgent([], 'en', { onDelta: vi.fn() })).rejects.toMatchObject({ status: 403, code: 'OWNER_REQUIRED' })
    expect(ApiError).toBeDefined()
  })

  it('确认请求只带四个字段', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    await confirmAssistantAgent('s1', 'a1', 'd1', false)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://agent.test/api/assistant/agent/confirm')
    expect(JSON.parse(String(init?.body))).toEqual({ session_id: 's1', approval_id: 'a1', plan_digest: 'd1', approved: false })
  })
})
