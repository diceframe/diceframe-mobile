import { describe, expect, it } from 'vitest'

import { buildShareLink, parseShareLink, redactShareLink } from './share-link'

describe('parseShareLink', () => {
  it('解析 hash 路由分享链接；只带公开 uid 的旧接管链接标为 legacyUser', () => {
    const result = parseShareLink('http://192.168.1.5:18000/#/play?game=abc&user=u1&share=1&name=骑士')
    expect(result).toEqual({
      baseUrl: 'http://192.168.1.5:18000',
      game: 'abc',
      legacyUser: 'u1',
      name: '骑士',
      delegate: undefined,
    })
  })

  it('解析 join 链接（无凭证，需新建角色）', () => {
    const result = parseShareLink('http://h:9876/#/join?game=xyz&share=1')
    expect(result?.game).toBe('xyz')
    expect(result?.seat).toBeUndefined()
    expect(result?.legacyUser).toBeUndefined()
  })

  it('解析 GM 接管链接的席位凭证（hash 路由 seat=），有凭证时不算旧链接', () => {
    const result = parseShareLink('http://h:18000/#/join?game=abc&share=1&seat=T0k3n%2B%2F&user=u1')
    expect(result?.seat).toBe('T0k3n+/')
    expect(result?.legacyUser).toBeUndefined()
    expect(parseShareLink('http://h:18000/#/join?game=abc&seat=%20%20')?.seat).toBeUndefined()
  })

  it('接管链接指向独立前端时，凭证归属 server 参数指定的后端', () => {
    const result = parseShareLink('https://evil.example/#/join?game=abc&seat=S&server=nas.local:18000')
    expect(result).toMatchObject({ baseUrl: 'http://nas.local:18000', seat: 'S' })
  })

  it('无协议时补 http', () => {
    expect(parseShareLink('192.168.1.5:18000/#/play?game=abc')?.baseUrl).toBe(
      'http://192.168.1.5:18000',
    )
  })

  it('search 参数形式也可解析', () => {
    expect(parseShareLink('http://h:18000/?game=abc&user=u1')?.legacyUser).toBe('u1')
  })

  it('保留同源反向代理路径作为 API 基址', () => {
    expect(parseShareLink('https://play.example.com/trpg/#/join?game=abc')?.baseUrl).toBe(
      'https://play.example.com/trpg',
    )
  })

  it('独立前端链接优先连接 server 参数指定的后端', () => {
    expect(parseShareLink('https://play.example.com/trpg/#/join?game=abc&share=1&server=nas.local:18000')).toMatchObject({
      baseUrl: 'http://nas.local:18000',
      server: 'http://nas.local:18000',
    })
  })

  it('缺 game 或乱输入返回 null', () => {
    expect(parseShareLink('')).toBeNull()
    expect(parseShareLink('not a url at all ://')).toBeNull()
    expect(parseShareLink('http://h:18000/#/play?share=1')).toBeNull()
  })
})

describe('buildShareLink', () => {
  it('构建基础游戏链接', () => {
    const link = buildShareLink('game123', 'http://server.com')
    expect(link).toBe('http://server.com/#/join?game=game123&share=1')
  })

  it('构建带席位凭证的接管链接（不再带公开 uid），可被解析回来', () => {
    const link = buildShareLink('game123', 'http://server.com', 'tok+/=')
    expect(link).toBe('http://server.com/#/join?game=game123&share=1&seat=tok%2B%2F%3D')
    expect(parseShareLink(link)?.seat).toBe('tok+/=')
  })

  it('在独立前端场景携带规范化后的后端地址', () => {
    const link = buildShareLink('game123', 'https://play.example.com/trpg/', undefined, 'nas.local:18000/')
    expect(link).toBe(
      'https://play.example.com/trpg/#/join?game=game123&share=1&server=http%3A%2F%2Fnas.local%3A18000',
    )
  })

  it('无 baseUrl 时也不生成相对链接', () => {
    const link = buildShareLink('game123')
    expect(link).toBe('http://localhost/#/join?game=game123&share=1')
  })
})

describe('redactShareLink', () => {
  it('从可见链接里剥掉 seat 参数，其余参数与顺序不变', () => {
    expect(redactShareLink('http://h/#/join?game=a&seat=SECRET&share=1')).toBe('http://h/#/join?game=a&share=1')
    expect(redactShareLink('http://h/#/join?seat=SECRET&game=a')).toBe('http://h/#/join?game=a')
    expect(redactShareLink('http://h/#/join?game=a&share=1&seat=SECRET')).toBe('http://h/#/join?game=a&share=1')
    expect(redactShareLink('http://h/?SEAT=x&game=a#/join?game=a&seat=y')).toBe('http://h/?game=a#/join?game=a')
  })

  it('没有凭证的链接原样返回', () => {
    const link = 'http://h/#/join?game=a&share=1&server=http%3A%2F%2Fnas'
    expect(redactShareLink(link)).toBe(link)
    expect(redactShareLink('http://h/#/join?game=a&seats=1')).toBe('http://h/#/join?game=a&seats=1')
  })
})
