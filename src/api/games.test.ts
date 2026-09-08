import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import {
  allocateCharacterPoints,
  createPaymentProposal,
  fetchAdventures,
  fetchGeneratedImages,
  fetchHealth,
  fetchLog,
  fetchRules,
  fetchWorldTemplates,
  regenerateSwipe,
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
