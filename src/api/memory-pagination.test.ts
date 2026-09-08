import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import { fetchMemories } from './library'

vi.mock('./client', () => ({ api: vi.fn() }))
const mockedApi = vi.mocked(api)

beforeEach(() => {
  mockedApi.mockReset()
  mockedApi.mockResolvedValue({ memories: [], total: 0 })
})

describe('记忆分页 HTTP 契约', () => {
  it('明确发送首页 limit=50 / offset=0，并保留响应 total', async () => {
    mockedApi.mockResolvedValueOnce({ memories: [{ id: 1 }], total: 101 })
    const response = await fetchMemories('guild#42', '', { limit: 50, offset: 0 })
    expect(mockedApi).toHaveBeenCalledWith('/games/guild%2342/memories', {
      query: { keyword: undefined, limit: 50, offset: 0 },
    })
    expect(response).toEqual({ memories: [{ id: 1 }], total: 101 })
  })

  it('后续页编码对局路径，关键词交给客户端统一编码', async () => {
    await fetchMemories('guild/a#42', '公爵 & 伯爵', { limit: 50, offset: 100 })
    expect(mockedApi).toHaveBeenCalledWith('/games/guild%2Fa%2342/memories', {
      query: { keyword: '公爵 & 伯爵', limit: 50, offset: 100 },
    })
  })

  it('未指定分页时省略 limit/offset，空关键词由业务层省略', async () => {
    await fetchMemories('game')
    expect(mockedApi).toHaveBeenCalledWith('/games/game/memories', {
      query: { keyword: undefined, limit: undefined, offset: undefined },
    })
  })

  it.each([
    [500, -3, 200, 0],
    [30.9, 50.9, 30, 50],
    [0, 0, 1, 0],
    [Number.NaN, Number.POSITIVE_INFINITY, 50, 0],
  ])('将 limit %s / offset %s 约束为有效 HTTP 整数', async (limit, offset, expectedLimit, expectedOffset) => {
    await fetchMemories('game', '', { limit, offset })
    expect(mockedApi).toHaveBeenCalledWith('/games/game/memories', {
      query: { keyword: undefined, limit: expectedLimit, offset: expectedOffset },
    })
  })

  it('请求失败向调用者传播，供原页重试', async () => {
    const error = new Error('网络断开')
    mockedApi.mockRejectedValueOnce(error)
    await expect(fetchMemories('game', '', { limit: 50, offset: 50 })).rejects.toBe(error)
  })
})
