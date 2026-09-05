import { describe, expect, it } from 'vitest'

import {
  listIdentities,
  removeIdentity,
  resolveActiveIdentity,
  resolveStartupRoute,
  upsertIdentity,
  type IdentitySlots,
  type PlayerIdentity,
} from './player-identity'

const ident = (game: string, user = `user-${game}`): PlayerIdentity => ({ game, user })

describe('槽位增删', () => {
  it('upsert 按游戏键写入，同局覆盖不产生重复槽位', () => {
    let slots: IdentitySlots = {}
    slots = upsertIdentity(slots, ident('game-a'))
    slots = upsertIdentity(slots, ident('game-b'))
    expect(Object.keys(slots)).toEqual(['game-a', 'game-b'])

    const replaced = upsertIdentity(slots, ident('game-a', 'user-2'))
    expect(Object.keys(replaced)).toEqual(['game-a', 'game-b'])
    expect(replaced['game-a'].user).toBe('user-2')
    // 不可变更新：原槽位不被改动
    expect(slots['game-a'].user).toBe('user-game-a')
  })

  it('upsert 缺 gameKey 的脏数据直接忽略', () => {
    const slots: IdentitySlots = { 'game-a': ident('game-a') }
    expect(upsertIdentity(slots, { game: '', user: 'x' })).toBe(slots)
  })

  it('remove 只删指定局，其余槽位不动；不存在的键幂等返回原引用', () => {
    const slots: IdentitySlots = { 'game-a': ident('game-a'), 'game-b': ident('game-b') }
    const next = removeIdentity(slots, 'game-a')
    expect(Object.keys(next)).toEqual(['game-b'])
    expect(slots['game-a']).toBeDefined()

    expect(removeIdentity(next, 'missing')).toBe(next)
  })

  it('listIdentities 保持插入序（加入顺序）', () => {
    const slots: IdentitySlots = { 'game-b': ident('game-b'), 'game-a': ident('game-a') }
    expect(listIdentities(slots).map((identity) => identity.game)).toEqual(['game-b', 'game-a'])
  })
})

describe('当前身份解析', () => {
  it('active 为 null → 无身份', () => {
    expect(resolveActiveIdentity({ 'game-a': ident('game-a') }, null)).toBeNull()
  })

  it('active 命中槽位 → 返回该局身份', () => {
    const slots: IdentitySlots = { 'game-a': ident('game-a'), 'game-b': ident('game-b') }
    expect(resolveActiveIdentity(slots, 'game-b')?.game).toBe('game-b')
  })

  it('active 指向已删除槽位（悬挂 key）→ 视为无身份', () => {
    expect(resolveActiveIdentity({ 'game-a': ident('game-a') }, 'game-gone')).toBeNull()
  })
})

describe('启动分流判定', () => {
  it('未配置服务器 → 登录（优先于一切身份）', () => {
    expect(
      resolveStartupRoute({ baseUrl: '', identities: [ident('game-a')] }),
    ).toBe('login')
  })

  it('恰好一份身份 → 直接进该局', () => {
    expect(
      resolveStartupRoute({ baseUrl: 'http://x', identities: [ident('game-a')] }),
    ).toBe('play')
  })

  it('多份身份 → 身份选择', () => {
    expect(
      resolveStartupRoute({ baseUrl: 'http://x', identities: [ident('game-a'), ident('game-b')] }),
    ).toBe('selector')
  })

  it('零身份 → Owner 路径', () => {
    expect(resolveStartupRoute({ baseUrl: 'http://x', identities: [] })).toBe('owner')
  })
})
