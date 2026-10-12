import { describe, expect, it, vi } from 'vitest'

import {
  credentialKey,
  gameKeyOfApiPath,
  isDelegateFlag,
  isFinalClaimFailure,
  parseJoinNotice,
  readCredential,
  resolveTakeoverToken,
  withRoomToken,
  withSeatToken,
  withoutRoomToken,
  withoutSeatToken,
} from './seat-credentials'

describe('凭证槽位按后端 + 对局分槽', () => {
  it('同一 gameKey 在不同后端是不同槽位；缺后端或缺局时不读不写', () => {
    expect(credentialKey('http://a:18000', 'g')).not.toBe(credentialKey('http://b:18000', 'g'))
    expect(credentialKey('', 'g')).toBe('')
    expect(credentialKey('http://a', '')).toBe('')

    const slots = withSeatToken({}, 'http://a', 'g', 'seat')
    expect(readCredential(slots, 'http://a', 'g')).toEqual({ seat: 'seat' })
    expect(readCredential(slots, 'http://b', 'g')).toEqual({})
    expect(readCredential(slots, 'http://a', 'other')).toEqual({})
    expect(withSeatToken(slots, '', 'g', 'x')).toBe(slots)
  })

  it('席位凭证与房间令牌互不覆盖；清空最后一项时移除整个槽位', () => {
    let slots = withSeatToken({}, 'http://a', 'g', ' seat ')
    slots = withRoomToken(slots, 'http://a', 'g', 'room')
    expect(readCredential(slots, 'http://a', 'g')).toEqual({ seat: 'seat', room: 'room' })
    slots = withoutSeatToken(slots, 'http://a', 'g')
    expect(readCredential(slots, 'http://a', 'g')).toEqual({ room: 'room' })
    slots = withoutRoomToken(slots, 'http://a', 'g')
    expect(slots).toEqual({})
  })

  it('无变化时返回原引用（空值、非字符串、重复写入、删除不存在的项）', () => {
    const slots = withSeatToken({}, 'http://a', 'g', 'seat')
    expect(withSeatToken(slots, 'http://a', 'g', '')).toBe(slots)
    expect(withSeatToken(slots, 'http://a', 'g', 42)).toBe(slots)
    expect(withSeatToken(slots, 'http://a', 'g', 'seat')).toBe(slots)
    expect(withoutRoomToken(slots, 'http://a', 'g')).toBe(slots)
    const empty = {}
    expect(withoutSeatToken(empty, 'http://a', 'g')).toBe(empty)
  })
})

describe('gameKeyOfApiPath', () => {
  it('取 /games/<key> 的解码后键，非对局路径为空', () => {
    expect(gameKeyOfApiPath('/games/abc/log')).toBe('abc')
    expect(gameKeyOfApiPath(`/games/${encodeURIComponent('web|room/a ?#中')}/sse-ticket`)).toBe('web|room/a ?#中')
    expect(gameKeyOfApiPath('/games/abc?share=1')).toBe('abc')
    expect(gameKeyOfApiPath('games/abc')).toBe('abc')
    expect(gameKeyOfApiPath('/games')).toBe('')
    expect(gameKeyOfApiPath('/character-cards')).toBe('')
    expect(gameKeyOfApiPath('/games/%E0%A4%A')).toBe('')
  })
})

describe('辅助判定', () => {
  it('delegate 标记与服务端同语义', () => {
    expect(['1', 'true', 'yes'].every(isDelegateFlag)).toBe(true)
    expect([undefined, null, '', '0', 'd1'].some(isDelegateFlag)).toBe(false)
  })

  it('只有明确的席位归属结论才算 claim 最终失败；网络/限流/旧服务端不下结论', () => {
    expect(isFinalClaimFailure({ status: 409, code: 'SEAT_TOKEN_EXISTS' })).toBe(true)
    expect(isFinalClaimFailure({ status: 403, code: 'SEAT_NOT_BOUND' })).toBe(true)
    expect(isFinalClaimFailure({ status: 403, code: 'GM_SEAT_REQUIRES_OWNER' })).toBe(true)
    expect(isFinalClaimFailure({ status: 404 })).toBe(false)
    expect(isFinalClaimFailure({ status: 401 })).toBe(false)
    expect(isFinalClaimFailure({ status: 429 })).toBe(false)
    expect(isFinalClaimFailure(null)).toBe(false)
  })

  it('加入页 notice 只接受已知取值', () => {
    expect(parseJoinNotice('seat')).toBe('seat')
    expect(parseJoinNotice('seat-invalid')).toBe('seat-invalid')
    expect(parseJoinNotice('room')).toBe('room')
    expect(parseJoinNotice('other')).toBeNull()
    expect(parseJoinNotice(['seat'])).toBeNull()
  })
})

describe('resolveTakeoverToken（GM 接管链接）', () => {
  const exists = Object.assign(new Error('in use'), { code: 'SEAT_TOKEN_EXISTS' })

  it('席位空闲时直接签发，不轮换也不打扰 GM', async () => {
    const issue = vi.fn().mockResolvedValue('fresh')
    const confirmRotate = vi.fn()
    await expect(resolveTakeoverToken('', { issue, confirmRotate })).resolves.toBe('fresh')
    expect(issue).toHaveBeenCalledWith({ rotate: false })
    expect(confirmRotate).not.toHaveBeenCalled()
  })

  it('缓存的旧链接交给服务端复核，仍有效则原样复用', async () => {
    const issue = vi.fn().mockResolvedValue('cached')
    await expect(resolveTakeoverToken('cached', { issue, confirmRotate: vi.fn() })).resolves.toBe('cached')
    expect(issue).toHaveBeenCalledWith({ rotate: false, check: 'cached' })
  })

  it('席位正被使用：GM 确认后才 rotate；取消则不签发', async () => {
    const issue = vi.fn().mockRejectedValueOnce(exists).mockResolvedValueOnce('rotated')
    const confirmRotate = vi.fn().mockResolvedValue(true)
    await expect(resolveTakeoverToken('stale', { issue, confirmRotate })).resolves.toBe('rotated')
    expect(confirmRotate).toHaveBeenCalledWith(true)
    expect(issue).toHaveBeenLastCalledWith({ rotate: true })

    const issue2 = vi.fn().mockRejectedValueOnce(exists)
    await expect(resolveTakeoverToken('', { issue: issue2, confirmRotate: vi.fn().mockResolvedValue(false) })).resolves.toBeNull()
    expect(issue2).toHaveBeenCalledTimes(1)
  })

  it('其他错误原样抛出', async () => {
    const failure = Object.assign(new Error('forbidden'), { code: 'GM_ONLY' })
    await expect(resolveTakeoverToken('', { issue: vi.fn().mockRejectedValue(failure), confirmRotate: vi.fn() })).rejects.toBe(failure)
  })
})
