import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureApiClient } from '@/api/client'
import type { PlayerIdentity } from '@/lib/player-identity'
import { useSettingsStore } from '@/stores/settings'
import { createGameStream } from '@/stream/gameStream'
import { selectCanAskKp, useGameStore } from './game'

vi.mock('@/stream/gameStream', () => ({
  createGameStream: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}))
vi.mock('@/stores/settings', async () => {
  const { create } = await import('zustand')
  return {
    useSettingsStore: create(() => ({
      baseUrl: 'https://table.example', token: null,
      serverSessionTokens: { 'https://table.example': 'session' }, shares: {}, activeShareGame: null,
    })),
    activeIdentityOf: (state: { shares: Record<string, unknown>; activeShareGame: string | null }) => state.shares[state.activeShareGame ?? ''] ?? null,
  }
})

const exchange = {
  id: 'q1', actor_uid: 'u1', actor_name: '调查员', question: '问题', answer: '公开回答',
  round: 3, created_at: '2026-09-08T00:00:00Z', visibility: 'party',
}
const kpResponse = {
  ok: true, kind: 'kp_table_talk', answer: '私密回答', visibility: 'private',
  advanced: false, action_consumed: false, round_number: 3,
}
const fetchMock = vi.fn()
let tableResponse: unknown
let tableStatus: number
let logTotalPages: number
let questionResponse: () => Promise<Response>

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status }) }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function settle() {
  // 微任务队列包含 fetch.text、Promise.all 与 connect 的续段。
  for (let index = 0; index < 25; index += 1) await Promise.resolve()
}

beforeEach(() => {
  useGameStore.getState().leave()
  useSettingsStore.setState({
    baseUrl: 'https://table.example', token: null,
    serverSessionTokens: { 'https://table.example': 'session' }, shares: {}, activeShareGame: null,
  })
  configureApiClient({
    baseUrl: 'https://table.example', token: null, sessionToken: 'session',
    share: { game: 'g', user: 'u1' }, onUnauthorized: undefined,
  })
  tableResponse = { ok: true, exchanges: [exchange] }
  tableStatus = 200
  logTotalPages = 1
  vi.mocked(createGameStream).mockClear()
  questionResponse = async () => json(kpResponse)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname
    if (path.endsWith('/config')) return json({})
    if (path.endsWith('/characters')) return json({ players: [{ user_id: 'u1' }, { user_id: 'u2' }] })
    if (path.endsWith('/private-log')) return json({ messages: [] })
    if (path.endsWith('/table-talk')) return json(tableResponse, tableStatus)
    if (path.endsWith('/kp-question')) return questionResponse()
    if (path.endsWith('/log')) {
      const page = Number(new URL(url).searchParams.get('page') ?? 1)
      return json({ log: [{ round: 4 - page }], total_pages: logTotalPages })
    }
    if (path.endsWith('/map')) return json({ locations: [] })
    return json({ state: 'active_input', round_number: 3 })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGameStore.getState().leave()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function enter() {
  useGameStore.getState().enter('g')
  await settle()
}

describe('table-talk 生命周期与问答隔离', () => {
  it('入局刷新独立频道，离局清空公开/私密内容', async () => {
    await enter()
    expect(useGameStore.getState().tableTalk).toEqual([exchange])
    await useGameStore.getState().askKp('问题')
    expect(useGameStore.getState().kpQuestionAnswer).toBe('私密回答')
    useGameStore.getState().leave()
    expect(useGameStore.getState()).toMatchObject({ tableTalk: [], kpQuestionAnswer: '', kpQuestionBusy: false })
  })

  it('同一时刻仅发送一次，不消耗行动，私密回答不进入任何日志', async () => {
    await enter()
    const pending = deferred<Response>()
    questionResponse = () => pending.promise
    const first = useGameStore.getState().askKp('问题')
    await useGameStore.getState().askKp('重复问题')
    expect(useGameStore.getState().kpQuestionBusy).toBe(true)
    pending.resolve(json(kpResponse))
    await first
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/kp-question'))).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/action'))).toBe(false)
    expect(useGameStore.getState().log).toEqual([{ round: 3 }])
    expect(useGameStore.getState().privateMessages).toEqual([])
    expect(useGameStore.getState().tableTalk).toEqual([exchange])
  })

  it('公开回答只拉独立频道，不刷新普通 round log', async () => {
    await enter()
    fetchMock.mockClear()
    questionResponse = async () => json({ ...kpResponse, visibility: 'party', exchange })
    await useGameStore.getState().askKp('问题', 'party')
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/games/g/kp-question', '/api/games/g/table-talk',
    ])
  })

  it('离局后重进同一局，旧请求也不能把回答写回来', async () => {
    await enter()
    const pending = deferred<Response>()
    questionResponse = () => pending.promise
    const request = useGameStore.getState().askKp('旧问题')
    useGameStore.getState().leave()
    await enter()
    pending.resolve(json(kpResponse))
    await request
    expect(useGameStore.getState().kpQuestionAnswer).toBe('')
    expect(useGameStore.getState().kpQuestionBusy).toBe(false)
  })

  it('换身份同步清空旧数据，API 同步后以新身份入局并丢弃旧回答', async () => {
    await enter()
    const pending = deferred<Response>()
    questionResponse = () => pending.promise
    const request = useGameStore.getState().askKp('旧问题')
    const identity = { game: 'g', user: 'u2' } as PlayerIdentity
    useSettingsStore.setState({ shares: { g: identity }, activeShareGame: 'g' })
    expect(useGameStore.getState()).toMatchObject({ tableTalk: [], kpQuestionAnswer: '', userId: '' })
    configureApiClient({ share: identity })
    await settle()
    expect(useGameStore.getState().userId).toBe('u2')
    pending.resolve(json(kpResponse))
    await request
    expect(useGameStore.getState().kpQuestionAnswer).toBe('')
  })

  it('reset/restart 清空私密回答并废弃正在进行的旧问答', async () => {
    await enter()
    for (const action of ['resetGame', 'restartGame'] as const) {
      const pending = deferred<Response>()
      questionResponse = () => pending.promise
      const request = useGameStore.getState().askKp('旧问题')
      await useGameStore.getState()[action]()
      pending.resolve(json(kpResponse))
      await request
      expect(useGameStore.getState().kpQuestionAnswer).toBe('')
      expect(useGameStore.getState().kpQuestionBusy).toBe(false)
    }
  })

  it('远端更换 run_id 后重新拉频道并废弃旧私密回答', async () => {
    await enter()
    useGameStore.setState({ detail: { ...useGameStore.getState().detail!, run_id: 'old-run' } })
    const pending = deferred<Response>()
    questionResponse = () => pending.promise
    const request = useGameStore.getState().askKp('旧问题')
    tableResponse = { ok: true, exchanges: [] }
    await useGameStore.getState().refresh()
    pending.resolve(json(kpResponse))
    await request
    expect(useGameStore.getState()).toMatchObject({ tableTalk: [], kpQuestionAnswer: '', kpQuestionBusy: false })
  })

  it('较旧频道请求晚返回时不能覆盖新记录', async () => {
    await enter()
    const pending = deferred<Response>()
    fetchMock.mockImplementationOnce(() => pending.promise)
    const oldRequest = useGameStore.getState().refreshTableTalk()
    const newer = { ...exchange, id: 'q2', answer: '新回答' }
    tableResponse = { ok: true, exchanges: [newer] }
    await useGameStore.getState().refreshTableTalk()
    pending.resolve(json({ ok: true, exchanges: [exchange] }))
    await oldRequest
    expect(useGameStore.getState().tableTalk).toEqual([newer])
  })

  it('切到其他游戏时丢弃迟到的公开频道响应', async () => {
    await enter()
    const pending = deferred<Response>()
    fetchMock.mockImplementationOnce(() => pending.promise)
    const request = useGameStore.getState().refreshTableTalk()
    configureApiClient({ share: { game: 'other', user: 'u2' } })
    tableResponse = { ok: true, exchanges: [] }
    useGameStore.getState().enter('other')
    await settle()
    pending.resolve(json({ ok: true, exchanges: [exchange] }))
    await request
    expect(useGameStore.getState()).toMatchObject({ gameKey: 'other', tableTalk: [] })
  })

  it('后台期间可完成同一身份问答，恢复后不会卡住 busy', async () => {
    await enter()
    const pending = deferred<Response>()
    questionResponse = () => pending.promise
    const request = useGameStore.getState().askKp('问题')
    useGameStore.getState().pause()
    pending.resolve(json(kpResponse))
    await request
    useGameStore.getState().resume()
    await settle()
    expect(useGameStore.getState()).toMatchObject({ kpQuestionAnswer: '私密回答', kpQuestionBusy: false })
  })

  it('没有认领角色不能提问', async () => {
    await enter()
    useGameStore.setState({ players: [] })
    expect(selectCanAskKp(useGameStore.getState())).toBe(false)
    fetchMock.mockClear()
    await useGameStore.getState().askKp('问题')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useGameStore.getState().kpQuestionError).not.toBe('')
  })
})

describe('桌边问答 SSE 回调', () => {
  async function enterWithOlderLog() {
    logTotalPages = 3
    await enter()
    await useGameStore.getState().loadOlderLog()
    expect(useGameStore.getState()).toMatchObject({ log: [{ round: 2 }, { round: 3 }], logPage: 2 })
    const callbacks = vi.mocked(createGameStream).mock.calls.at(-1)!
    callbacks[2].onEvent('baseline', { type: 'baseline' }, 'round-3')
    return { getCursor: callbacks[1], handlers: callbacks[2] }
  }

  it.each(['', 'round-3-next'])('table_talk_changed 只刷新频道并保留历史页和游标（事件 ID：%s）', async (cursor) => {
    vi.useFakeTimers()
    const { getCursor, handlers } = await enterWithOlderLog()
    const previous = useGameStore.getState()
    const newer = { ...exchange, id: 'q2', answer: '新公开回答' }
    tableResponse = { ok: true, exchanges: [exchange, newer] }
    fetchMock.mockClear()

    // gameStream 将该 payload 解析为 refresh，store 须按 type 识别独立频道。
    handlers.onEvent('refresh', { type: 'table_talk_changed' }, cursor)
    await settle()
    await vi.advanceTimersByTimeAsync(150)

    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/api/games/g/table-talk'])
    expect(useGameStore.getState()).toMatchObject({ tableTalk: [exchange, newer], logPage: 2, logTotalPages: 3 })
    expect(useGameStore.getState().log).toBe(previous.log)
    expect(useGameStore.getState().detail).toBe(previous.detail)
    expect(getCursor()).toBe(cursor || 'round-3')
  })

  it.each(['connecting', 'degraded'] as const)('SSE 从 %s 恢复 live 时补拉无事件 ID 的问答，保留历史页', async (disconnectedStatus) => {
    vi.useFakeTimers()
    const { getCursor, handlers } = await enterWithOlderLog()
    handlers.onStatusChange('connecting')
    handlers.onStatusChange('live')
    await settle()
    const previous = useGameStore.getState()
    handlers.onStatusChange(disconnectedStatus)
    const missed = { ...exchange, id: 'q2', answer: '断线期间的回答' }
    tableResponse = { ok: true, exchanges: [exchange, missed] }
    fetchMock.mockClear()

    // 恢复时没有问答事件可重放，仅收到连接状态和未变化的基线。
    handlers.onStatusChange('connecting')
    handlers.onStatusChange('live')
    handlers.onEvent('baseline', { type: 'baseline' }, 'round-3')
    await settle()
    handlers.onStatusChange('live')
    await vi.advanceTimersByTimeAsync(150)

    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/api/games/g/table-talk'])
    expect(useGameStore.getState()).toMatchObject({
      tableTalk: [exchange, missed], logPage: 2, logTotalPages: 3, streamStatus: 'live',
    })
    expect(useGameStore.getState().log).toBe(previous.log)
    expect(useGameStore.getState().detail).toBe(previous.detail)
    expect(getCursor()).toBe('round-3')
  })

  it('首次 live 补齐初次加载与订阅间的空窗', async () => {
    const { handlers } = await enterWithOlderLog()
    tableResponse = { ok: true, exchanges: [] }
    fetchMock.mockClear()
    handlers.onStatusChange('connecting')
    handlers.onStatusChange('live')
    await settle()
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/api/games/g/table-talk'])
    expect(useGameStore.getState().tableTalk).toEqual([])
  })

  it('暂停或离局后旧连接的事件与 live 回调不能补拉频道', async () => {
    const { handlers } = await enterWithOlderLog()
    for (const action of ['pause', 'leave'] as const) {
      useGameStore.getState()[action]()
      fetchMock.mockClear()
      handlers.onEvent('refresh', { type: 'table_talk_changed' }, '')
      handlers.onStatusChange('live')
      await settle()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(useGameStore.getState().streamStatus).toBe('idle')
    }
  })
})

describe('独立频道失败与兼容', () => {
  it('404 缺端点只禁用桌边记录，不影响核心 detail，也不重复请求', async () => {
    tableStatus = 404
    tableResponse = {}
    await enter()
    expect(useGameStore.getState()).toMatchObject({ tableTalkSupported: false, tableTalk: [], tableTalkError: '', error: '' })
    expect(useGameStore.getState().detail).not.toBeNull()
    fetchMock.mockClear()
    await useGameStore.getState().refresh()
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/table-talk'))).toBe(false)
  })

  it.each([401, 403, 429, 500])('HTTP %s 清空旧记录并保留可见错误，可以重试', async (status) => {
    await enter()
    tableStatus = status
    tableResponse = { error: 'failed' }
    await useGameStore.getState().refreshTableTalk()
    expect(useGameStore.getState().tableTalk).toEqual([])
    expect(useGameStore.getState().tableTalkError).not.toBe('')
    expect(useGameStore.getState().tableTalkSupported).not.toBe(false)
    tableStatus = 200
    tableResponse = { ok: true, exchanges: [exchange] }
    await useGameStore.getState().refreshTableTalk()
    expect(useGameStore.getState().tableTalkError).toBe('')
    expect(useGameStore.getState().tableTalk).toEqual([exchange])
  })

  it('读取权限失效后，之前正在生成的私密回答也不能写回', async () => {
    await enter()
    const pending = deferred<Response>()
    questionResponse = () => pending.promise
    const request = useGameStore.getState().askKp('旧问题')
    tableStatus = 403
    await useGameStore.getState().refreshTableTalk()
    pending.resolve(json(kpResponse))
    await request
    expect(useGameStore.getState()).toMatchObject({ tableTalk: [], kpQuestionAnswer: '', kpQuestionBusy: false })
    expect(useGameStore.getState().tableTalkError).not.toBe('')
  })

  it('旧服务端缺提问端点时保留提示，关闭重开也不会无解释地禁用', async () => {
    await enter()
    questionResponse = async () => json({}, 404)
    await useGameStore.getState().askKp('问题')
    useGameStore.getState().clearKpQuestion()
    expect(useGameStore.getState().kpQuestionSupported).toBe(false)
    expect(useGameStore.getState().kpQuestionError).not.toBe('')
  })

  it('模型错误释放 busy 并在 Sheet 保留错误，不误判成不支持', async () => {
    await enter()
    questionResponse = async () => json({ code: 'LLM_NOT_CONFIGURED' }, 503)
    await useGameStore.getState().askKp('问题')
    expect(useGameStore.getState().kpQuestionError).not.toBe('')
    expect(useGameStore.getState().kpQuestionBusy).toBe(false)
    expect(useGameStore.getState().kpQuestionSupported).not.toBe(false)
  })
})
