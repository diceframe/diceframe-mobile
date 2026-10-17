import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import {
  adoptCharacterCard,
  allocateCharacterPoints,
  claimSeatToken,
  issueSeatToken,
  joinGame,
  verifyRoomPassword,
  createPaymentProposal,
  fetchAdventures,
  fetchGeneratedImages,
  fetchHealth,
  fetchLog,
  fetchRules,
  fetchWorldCandidates,
  fetchWorldTemplates,
  regenerateSwipe,
  submitAction,
  switchSwipe,
  updateCharacterPortrait,
  updateRulesetCharacterProfile,
} from './games'

vi.mock('./client', () => ({ api: vi.fn() }))

const mockedApi = vi.mocked(api)

describe('games API query 契约', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({})
  })

  it('行动提交：指定技能才带 selected_skill', async () => {
    await submitAction('g', '撬锁')
    expect(JSON.parse(String(mockedApi.mock.lastCall?.[1]?.body))).toEqual({ text: '撬锁' })
    await submitAction('g', '撬锁', '锁匠')
    expect(JSON.parse(String(mockedApi.mock.lastCall?.[1]?.body))).toEqual({ text: '撬锁', selected_skill: '锁匠' })
  })

  it.each([undefined, 0, 2])('日志 page=%s 交给客户端序列化，保留首页 0', async (page) => {
    await fetchLog('game/a', page)
    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/log', { query: { page } })
  })

  it('规则与世界模板使用统一 language 参数', async () => {
    await fetchRules('zh-CN')
    expect(mockedApi).toHaveBeenLastCalledWith('/rules', { query: { language: 'zh-CN' } })
    await fetchWorldTemplates('ja')
    expect(mockedApi).toHaveBeenLastCalledWith('/world-templates', { query: { language: 'ja' } })
  })

  it('世界切换候选使用指定语言，并过滤异语用户世界', async () => {
    mockedApi
      .mockResolvedValueOnce({ templates: [{ id: 'template-de', language: 'de' }] })
      .mockResolvedValueOnce({ worlds: [
        { id: 'world-de', language: 'German' },
        { id: 'world-zh', language: 'zh-CN' },
      ] })

    const candidates = await fetchWorldCandidates('game/a', 'de')

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/world-templates', { query: { language: 'de' } })
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/worlds')
    expect(candidates.map((item) => item.id)).toEqual(['template-de', 'world-de'])
  })

  it('冒险包语言与过滤字段原样交给客户端编码，空过滤项省略', async () => {
    await fetchAdventures('zh-CN', { ruleId: '规则/a', worldId: '世界 & 城市' })
    expect(mockedApi).toHaveBeenLastCalledWith('/adventures', {
      query: { language: 'zh-CN', rule_id: '规则/a', world_id: '世界 & 城市' },
    })
    await fetchAdventures('en', { ruleId: '', worldId: '' })
    expect(mockedApi).toHaveBeenLastCalledWith('/adventures', {
      query: { language: 'en', rule_id: undefined, world_id: undefined },
    })
  })

  it('健康事件保持默认省略 include_resolved 的语义', async () => {
    await fetchHealth('game/a')
    expect(mockedApi).toHaveBeenLastCalledWith('/games/game%2Fa/health', {
      query: { include_resolved: undefined },
    })
    await fetchHealth('game/a', true)
    expect(mockedApi).toHaveBeenLastCalledWith('/games/game%2Fa/health', {
      query: { include_resolved: true },
    })
  })

  it('画廊 purpose 使用统一 query 参数', async () => {
    await fetchGeneratedImages('game/a', 'scene & portrait')
    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/generated-images', {
      query: { purpose: 'scene & portrait' },
    })
  })
})

describe('games API swipe contracts', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({})
  })

  it('switches swipe via POST with swipe_index body', async () => {
    await switchSwipe('game/a', 3, 1)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/swipe/3', {
      method: 'POST',
      body: JSON.stringify({ swipe_index: 1 }),
    })
  })

  it('regenerates a swipe via PUT with empty body', async () => {
    await regenerateSwipe('game/a', 3)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/swipe/3', {
      method: 'PUT',
      body: '{}',
    })
  })
})

describe('games API economy contracts', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({ ok: true })
  })

  it('GM 通过权威 payments 端点创建提案', async () => {
    const payload = {
      payer_uid: 'payer/1',
      recipient_uid: 'recipient/2',
      amount: 12,
      reason: '通行证',
      items: ['通行证'],
    }
    await createPaymentProposal('game/a', payload)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  })
})

describe('games API level-up contracts', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({ ok: true })
  })

  it('向当前玩家 PUT 属性值，不自行提交剩余点数或其它角色字段', async () => {
    const attributes = { str: 19, dex: 12, custom: 7 }
    await allocateCharacterPoints('game/a', 'user/1', attributes)
    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/character/user%2F1', {
      method: 'PUT',
      body: JSON.stringify({ attributes }),
    })
  })

  it.each([{ ok: false, error: '角色不存在' }, { error: '规则拒绝操作' }])('保留服务端拒绝原因供面板显示', async (response) => {
    mockedApi.mockResolvedValue(response)
    await expect(allocateCharacterPoints('game', 'user', { str: 19 })).rejects.toThrow(response.error)
  })
})

describe('games API portrait contracts', () => {
  const portrait = { kind: 'builtin' as const, id: 'dnd5e:0' }

  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({})
  })

  it('legacy 局 PUT 整卡端点，body 只带 portrait', async () => {
    await updateCharacterPortrait('game/a', 'user/1', portrait)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/character/user%2F1', {
      method: 'PUT',
      body: JSON.stringify({ portrait }),
    })
  })

  it('rules-aware 局 PATCH profile 端点，body 只带 portrait', async () => {
    await updateRulesetCharacterProfile('game/a', 'user/1', null)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/character/user%2F1/profile', {
      method: 'PATCH',
      body: JSON.stringify({ portrait: null }),
    })
  })
})

describe('席位凭证相关端点契约', () => {
  beforeEach(() => {
    mockedApi.mockReset()
  })

  it('找回已有席位：join_as_new=false，显式带上 X-Seat-Token；新建不带', async () => {
    mockedApi.mockResolvedValue({ ok: true, user_id: 'u1' })
    await joinGame('game/a', { join_as_new: false }, { seatToken: 'S' })
    expect(mockedApi).toHaveBeenLastCalledWith('/games/game%2Fa/players', {
      method: 'POST',
      headers: { 'X-Seat-Token': 'S' },
      body: JSON.stringify({ join_as_new: false }),
    })
    await joinGame('game/a', { join_as_new: true, character_name: 'A' })
    expect(mockedApi.mock.lastCall?.[1]).toMatchObject({ method: 'POST', headers: undefined })
  })

  it('claim 走 POST（client 统一补 confirm 头），只返回凭证本身', async () => {
    mockedApi.mockResolvedValue({ ok: true, user_id: 'u1', seat_token: 'first' })
    await expect(claimSeatToken('game/a')).resolves.toBe('first')
    expect(mockedApi).toHaveBeenLastCalledWith('/games/game%2Fa/seat-token/claim', {
      method: 'POST', body: '{}', signal: undefined,
    })
    mockedApi.mockResolvedValue({ ok: true })
    await expect(claimSeatToken('game/a')).rejects.toThrow()
  })

  it('GM 签发接管凭证：默认不轮换，check 复核旧链接', async () => {
    mockedApi.mockResolvedValue({ ok: true, seat_token: 'T' })
    await expect(issueSeatToken('g', 'p/1', { rotate: false, check: 'old' })).resolves.toBe('T')
    expect(mockedApi).toHaveBeenLastCalledWith('/games/g/players/p%2F1/seat-token', {
      method: 'POST', body: JSON.stringify({ rotate: false, check: 'old' }),
    })
    await issueSeatToken('g', 'p', { rotate: true })
    expect(mockedApi.mock.lastCall?.[1]).toMatchObject({ body: JSON.stringify({ rotate: true }) })
  })

  it('房间密码换令牌：令牌由调用方保存，不拼进任何 URL', async () => {
    mockedApi.mockResolvedValue({ ok: true, room_token: 'R', expires_at: 1 })
    await expect(verifyRoomPassword('g', 'pw')).resolves.toBe('R')
    expect(mockedApi).toHaveBeenLastCalledWith('/games/g/verify-room-password', {
      method: 'POST', body: JSON.stringify({ password: 'pw' }),
    })
  })

  it('采用卡库角色卡只传 card_id，走 adopt-card 而不是整卡 PUT', async () => {
    mockedApi.mockResolvedValue({ ok: true })
    await adoptCharacterCard('g', 'u/1', { card_id: 'c1', id: 'ignored', character_name: 'A', hp: 99, gold: 999 })
    expect(mockedApi).toHaveBeenLastCalledWith('/games/g/character/u%2F1/adopt-card', {
      method: 'POST', body: JSON.stringify({ card_id: 'c1' }),
    })
    await adoptCharacterCard('g', 'u', { id: 'lib-2', character_name: 'B' })
    expect(mockedApi.mock.lastCall?.[1]).toMatchObject({ body: JSON.stringify({ card_id: 'lib-2' }) })
    const calls = mockedApi.mock.calls.length
    await expect(adoptCharacterCard('g', 'u', { character_name: 'C' })).rejects.toThrow()
    expect(mockedApi.mock.calls.length).toBe(calls)
  })
})
