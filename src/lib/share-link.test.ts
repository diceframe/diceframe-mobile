import { describe, expect, it } from 'vitest'

import { buildShareLink, parseShareLink } from './share-link'

describe('parseShareLink', () => {
  it('解析 hash 路由分享链接', () => {
    const result = parseShareLink('http://192.168.1.5:18000/#/play?game=abc&user=u1&share=1&name=骑士')
    expect(result).toEqual({
      baseUrl: 'http://192.168.1.5:18000',
      game: 'abc',
      user: 'u1',
      name: '骑士',
      delegate: undefined,
    })
  })

  it('解析 join 链接（无 user，需新建角色）', () => {
    const result = parseShareLink('http://h:9876/#/join?game=xyz&share=1')
    expect(result?.game).toBe('xyz')
    expect(result?.user).toBeUndefined()
  })

  it('无协议时补 http', () => {
    expect(parseShareLink('192.168.1.5:18000/#/play?game=abc')?.baseUrl).toBe(
      'http://192.168.1.5:18000',
    )
  })

  it('search 参数形式也可解析', () => {
    expect(parseShareLink('http://h:18000/?game=abc&user=u1')?.user).toBe('u1')
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

  it('构建带用户 ID 的分享链接', () => {
    const link = buildShareLink('game123', 'http://server.com', 'user456')
    expect(link).toBe('http://server.com/#/join?game=game123&share=1&user=user456')
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
