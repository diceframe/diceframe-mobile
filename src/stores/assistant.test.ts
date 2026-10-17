import { describe, expect, it, vi } from 'vitest'

import type { AgentStreamHandlers } from '@/lib/assistant-agent'

import { createAssistantStore, storageKeyOf, type AssistantDeps } from './assistant'

const approval = { approval_id: 'a1', plan_digest: 'd1', tool: 'save_content', arguments: { draft_id: 'dr1' } }

function setup(script?: (handlers: AgentStreamHandlers) => void | Promise<void>) {
  const storage = new Map<string, string>()
  const deps = {
    stream: vi.fn(async (_messages, _language, handlers: AgentStreamHandlers) => {
      await script?.(handlers)
    }),
    confirm: vi.fn(async () => ({ ok: true, result: { saved: true } })),
    review: vi.fn(async () => ({ ok: true, draft_id: 'dr1', review: { ok: true, kind: 'lorebook' }, approval: { ...approval, approval_id: 'a2', plan_digest: 'd2' } })),
    session: vi.fn(async () => ({ session_id: 's1', pending: null, drafts: {}, receipts: [] })),
    storage: {
      get: async (key: string) => storage.get(key) ?? null,
      set: async (key: string, value: string) => { storage.set(key, value) },
      remove: async (key: string) => { storage.delete(key) },
    },
  } satisfies AssistantDeps
  return { store: createAssistantStore(deps as unknown as AssistantDeps), deps, storage }
}

describe('DF Agent 会话', () => {
  it('一轮对话：增量拼进最后一条助手消息，记录会话、待批准与草稿，并按服务器存本机', async () => {
    const { store, deps, storage } = setup((h) => {
      h.onAgentEvent?.('session', { session_id: 's1' })
      h.onDelta('好')
      h.onDelta('的')
      h.onAgentEvent?.('draft', { draft_id: 'dr1', review: { ok: true, kind: 'lorebook' } })
      h.onAgentEvent?.('approval', approval)
      h.onAgentEvent?.('navigate', { route: 'lorebook' })
    })
    await store.getState().load('http://a')
    store.getState().setContext({ route: 'play', game_key: 'g' })
    await store.getState().send('写个世界书', 'zh-CN')
    const state = store.getState()
    expect(state.messages.map((m) => [m.role, m.content])).toEqual([['user', '写个世界书'], ['assistant', '好的']])
    expect(state.sessionId).toBe('s1')
    expect(state.pendingApproval?.approval_id).toBe('a1')
    expect(Object.keys(state.drafts)).toEqual(['dr1'])
    expect(state.navigation).toEqual({ route: 'lorebook' })
    expect(state.streaming).toBe(false)
    expect((deps.stream.mock.calls[0] as unknown[])[3]).toMatchObject({ context: { route: 'play', game_key: 'g' } })
    expect(JSON.parse(storage.get(storageKeyOf('http://a'))!).sessionId).toBe('s1')
  })

  it('确认成功：清掉待批准、记回执、结果进事件；同一批准不会再执行第二次', async () => {
    const { store, deps } = setup((h) => {
      h.onAgentEvent?.('session', { session_id: 's1' })
      h.onAgentEvent?.('approval', approval)
    })
    await store.getState().load('http://a')
    await store.getState().send('保存', 'zh-CN')
    await store.getState().confirmApproval(true)
    expect(deps.confirm).toHaveBeenCalledWith('s1', 'a1', 'd1', true)
    expect(store.getState().pendingApproval).toBeNull()
    expect(store.getState().receipts).toHaveLength(1)
    expect(store.getState().messages.at(-1)?.events?.at(-1)).toMatchObject({ event: 'tool_result', payload: { ok: true, tool: 'save_content' } })
    store.setState({ pendingApproval: approval })
    await store.getState().confirmApproval(true)
    expect(deps.confirm).toHaveBeenCalledTimes(1)
  })

  it('确认回包丢失：拉会话快照，有回执就按已执行处理，不报失败', async () => {
    const { store, deps } = setup((h) => {
      h.onAgentEvent?.('session', { session_id: 's1' })
      h.onAgentEvent?.('approval', approval)
    })
    deps.confirm.mockRejectedValueOnce(new Error('Network request failed'))
    deps.session.mockResolvedValueOnce({
      session_id: 's1', pending: null, drafts: {},
      receipts: [{ approval_id: 'a1', plan_digest: 'd1', response: { ok: true, result: { saved: true } } }],
    } as never)
    await store.getState().load('http://a')
    await store.getState().send('保存', 'zh-CN')
    const result = await store.getState().confirmApproval(true)
    expect(result).toMatchObject({ ok: true })
    expect(store.getState().actionError).toBe('')
    expect(store.getState().pendingApproval).toBeNull()
  })

  it('草稿改动后旧批准作废并撤回；重审拿到新批准后才能确认', async () => {
    const { store, deps } = setup((h) => {
      h.onAgentEvent?.('session', { session_id: 's1' })
      h.onAgentEvent?.('approval', approval)
    })
    await store.getState().load('http://a')
    await store.getState().send('写', 'zh-CN')
    await store.getState().invalidateApproval('dr1')
    expect(deps.confirm).toHaveBeenLastCalledWith('s1', 'a1', 'd1', false)
    expect(store.getState().pendingApproval).toBeNull()
    await store.getState().reviewDraft('dr1', { items: [] })
    expect(store.getState().pendingApproval).toMatchObject({ approval_id: 'a2' })
    expect(store.getState().pendingApproval?.expired).toBeUndefined()
  })

  it('过期批准不能确认，只能取消', async () => {
    const { store, deps } = setup()
    await store.getState().load('http://a')
    store.setState({ sessionId: 's1', pendingApproval: { ...approval, expired: true } })
    expect(await store.getState().confirmApproval(true)).toBeUndefined()
    expect(deps.confirm).not.toHaveBeenCalled()
  })

  it('流里报错与主动停止分别标记在助手消息上', async () => {
    const { store, deps } = setup()
    deps.stream.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'AgentStreamError', code: 'RATE' }))
    await store.getState().load('http://a')
    await store.getState().send('a', 'zh-CN')
    expect(store.getState().messages.at(-1)?.error).toBeTruthy()
    deps.stream.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    await store.getState().send('b', 'zh-CN')
    expect(store.getState().messages.at(-1)?.stopped).toBe(true)
  })

  it('历史按服务器隔离；会话失效（404）时丢掉本地会话 id', async () => {
    const { store, deps, storage } = setup()
    storage.set(storageKeyOf('http://b'), JSON.stringify({ sessionId: 'sb', messages: [{ role: 'user', content: 'hi' }, { bad: true }] }))
    await store.getState().load('http://a')
    expect(store.getState().messages).toEqual([])
    await store.getState().load('http://b')
    expect(store.getState().messages).toEqual([{ role: 'user', content: 'hi' }])
    const { ApiError } = await import('@/api/client')
    deps.session.mockRejectedValueOnce(new ApiError('gone', 404))
    await store.getState().restoreSession()
    expect(store.getState().sessionId).toBeNull()
    await store.getState().clear()
    expect(storage.has(storageKeyOf('http://b'))).toBe(false)
  })
})
