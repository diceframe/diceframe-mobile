import { describe, expect, it, vi } from 'vitest'

import { runTakeover, seatHandlingOnParse } from './join-takeover'

const DEEP = 'http://h/#/join?game=g&share=1&seat=FROM-LINK'
const REDACTED = 'http://h/#/join?game=g&share=1'

describe('#9 安全评审：深链带来的席位凭证不在解析时写入', () => {
  it('输入框是深链预填（凭证被隐藏）：解析时不写入，留到用户在找回步骤确认', () => {
    expect(seatHandlingOnParse({ rawLink: undefined, fieldText: REDACTED, incomingLink: DEEP, seat: 'FROM-LINK' })).toBe('defer')
  })

  it('用户自己粘贴 / 扫码的带 seat= 链接：保持原行为，解析时写入', () => {
    expect(seatHandlingOnParse({ rawLink: undefined, fieldText: DEEP, incomingLink: '', seat: 'FROM-LINK' })).toBe('store')
    expect(seatHandlingOnParse({ rawLink: DEEP, fieldText: REDACTED, incomingLink: DEEP, seat: 'FROM-LINK' })).toBe('store')
    expect(seatHandlingOnParse({ rawLink: undefined, fieldText: REDACTED, incomingLink: '', seat: '' })).toBe('none')
  })
})

describe('#9 安全评审：确认找回时才写入；替换本机已有席位要再确认', () => {
  function deps(overrides: Partial<Parameters<typeof runTakeover>[0]> = {}) {
    return {
      pendingSeat: 'FROM-LINK',
      storedSeat: '',
      confirmReplace: vi.fn(async () => true),
      join: vi.fn(async (token: string) => ({ user_id: 'u-new', seat_token: `${token}-rotated` })),
      store: vi.fn(),
      ...overrides,
    }
  }

  it('本机没有这一局的席位：确认找回后用链接里的凭证找回，并写入服务端返回的凭证', async () => {
    const d = deps()
    const result = await runTakeover(d)
    expect(result).toEqual({ user_id: 'u-new', seat_token: 'FROM-LINK-rotated' })
    expect(d.confirmReplace).not.toHaveBeenCalled()
    expect(d.join).toHaveBeenCalledWith('FROM-LINK')
    expect(d.store).toHaveBeenCalledWith('FROM-LINK-rotated')
  })

  it('本机已有不同的席位凭证：先明确确认替换；取消时不找回、不写入，原凭证保留', async () => {
    const d = deps({ storedSeat: 'MINE', confirmReplace: vi.fn(async () => false) })
    expect(await runTakeover(d)).toBe('cancelled')
    expect(d.confirmReplace).toHaveBeenCalledOnce()
    expect(d.join).not.toHaveBeenCalled()
    expect(d.store).not.toHaveBeenCalled()
  })

  it('确认替换后才找回并写入', async () => {
    const d = deps({ storedSeat: 'MINE' })
    await runTakeover(d)
    expect(d.confirmReplace).toHaveBeenCalledOnce()
    expect(d.store).toHaveBeenCalledWith('FROM-LINK-rotated')
  })

  it('找回失败：不写入，原凭证保留', async () => {
    const d = deps({ storedSeat: 'MINE', join: vi.fn(async () => { throw new Error('SEAT_TOKEN_INVALID') }) })
    await expect(runTakeover(d)).rejects.toThrow('SEAT_TOKEN_INVALID')
    expect(d.store).not.toHaveBeenCalled()
  })

  it('链接里的凭证与本机相同：不必再确认', async () => {
    const d = deps({ storedSeat: 'FROM-LINK' })
    await runTakeover(d)
    expect(d.confirmReplace).not.toHaveBeenCalled()
  })
})

describe('找回步骤展示要接管的角色', () => {
  it('按 viewer 席位从成员名单取角色名，取不到退回 uid；不是席位返回空串', async () => {
    const { seatCharacterNameOf } = await import('./player-identity')
    const multiplayer = { ready_players: [{ user_id: 'u1', character_name: '艾莉' }], waiting_players: [] }
    expect(seatCharacterNameOf({ viewer: { kind: 'seat', uid: 'u1' }, multiplayer })).toBe('艾莉')
    expect(seatCharacterNameOf({ viewer: { kind: 'seat', uid: 'u9' }, multiplayer })).toBe('u9')
    expect(seatCharacterNameOf({ viewer: { kind: 'outsider' } } as never)).toBe('')
  })
})
