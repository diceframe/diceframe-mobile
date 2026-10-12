import { describe, expect, it } from 'vitest'

import { createJoinBounceGuard, joinBounceKey } from './join-bounce'
import { cardsFailureNeedsRoomGate } from './join-room-gate'
import { decodeJoinLink, encodeJoinLink, joinLinkFromParams, joinLinkParams, rewriteJoinDeepLink } from './join-deep-link'
import { buildShareLink, parseShareLink } from './share-link'

const LINK = 'http://127.0.0.1:18100/#/join?game=GK&share=1&name=%E8%89%BE%E8%8E%89'

function linkOf(path: string): string {
  const query = new URLSearchParams(path.slice(path.indexOf('?') + 1))
  return joinLinkFromParams({ link64: query.get('link64') ?? undefined })
}

describe('邀请链接经路由参数传递（实机：深链里的 # 片段被截断）', () => {
  it('link64 往返保留 # 片段、& 与非 ASCII 字符', () => {
    for (const link of [LINK, 'https://例子.test/#/join?game=g&share=1&name=艾莉', '']) {
      expect(decodeJoinLink(encodeJoinLink(link))).toBe(link)
      expect(encodeJoinLink(link)).toMatch(/^[A-Za-z0-9_-]*$/)
    }
    expect(decodeJoinLink('not base64!')).toBe('')
  })

  it('diceframe://join?link=<整体编码的链接>：改写成 link64，链接完整（含 #/join?...）', () => {
    const path = rewriteJoinDeepLink(`diceframe://join?link=${encodeURIComponent(LINK)}`)
    expect(path.startsWith('/join?link64=')).toBe(true)
    expect(path).not.toContain('#')
    expect(linkOf(path)).toBe(LINK)
    expect(parseShareLink(linkOf(path))).toMatchObject({ game: 'GK', baseUrl: 'http://127.0.0.1:18100' })
  })

  it('链接未编码（# 与 & 原样）也能完整取出；link 之后的其他参数保留', () => {
    expect(linkOf(rewriteJoinDeepLink(`diceframe://join?link=${LINK}`))).toBe(LINK)
    const path = rewriteJoinDeepLink(`diceframe://join?link=${encodeURIComponent(LINK)}&notice=seat`)
    expect(new URLSearchParams(path.slice(path.indexOf('?') + 1)).get('notice')).toBe('seat')
    expect(linkOf(path)).toBe(LINK)
  })

  it('其他深链原样放行', () => {
    expect(rewriteJoinDeepLink('diceframe://play/GK')).toBe('diceframe://play/GK')
    expect(rewriteJoinDeepLink('diceframe://join')).toBe('diceframe://join')
  })

  it('App 内跳回加入页（buildShareLink → 路由参数）同样保留片段', () => {
    const link = buildShareLink('GK', 'http://h:18000', undefined, 'http://h:18000')
    expect(link).toContain('#')
    expect(joinLinkFromParams(joinLinkParams(link))).toBe(link)
    // 旧写法 link= 仍然认
    expect(joinLinkFromParams({ link })).toBe(link)
  })
})

describe('跳回加入页去重（实机：同一秒三次 /config + 三次详情）', () => {
  it('同一局 3 秒内只跳一次；换一局或过了窗口再跳', () => {
    let now = 0
    const guard = createJoinBounceGuard(() => now)
    expect(guard('h:GK')).toBe(true)
    expect(guard('h:GK')).toBe(false)
    expect(guard('h:other')).toBe(true)
    now = 5000
    expect(guard('h:other')).toBe(true)
    expect(guard('h:GK')).toBe(true)
  })
})

describe('#1 终审：跳转去重按原因区分', () => {
  it('同一局不同原因（席位凭证失效 / 房间访问过期）不会被前一次吞掉', () => {
    const guard = createJoinBounceGuard(() => 0)
    expect(guard(joinBounceKey('h', 'GK', 'seat'))).toBe(true)
    expect(guard(joinBounceKey('h', 'GK', 'room'))).toBe(true)
    expect(guard(joinBounceKey('h', 'GK', 'room'))).toBe(false)
  })
})

describe('#1 终审：加入页拉卡失败时识别房间访问失效', () => {
  it('403 needs_room_password，或有房间密码但令牌已被清掉：回房间密码步骤', () => {
    expect(cardsFailureNeedsRoomGate({ needsRoomPassword: true }, true, true)).toBe(true)
    expect(cardsFailureNeedsRoomGate(new Error('network'), true, false)).toBe(true)
  })

  it('其他失败（网络、没有房间密码的局、令牌还在）：照常降级为没有可选的卡', () => {
    expect(cardsFailureNeedsRoomGate(new Error('network'), true, true)).toBe(false)
    expect(cardsFailureNeedsRoomGate(new Error('network'), false, false)).toBe(false)
    expect(cardsFailureNeedsRoomGate({ needsRoomPassword: false }, false, false)).toBe(false)
  })
})
