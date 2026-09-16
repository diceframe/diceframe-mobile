import { describe, expect, it } from 'vitest'

import { isPairCode, normalizePairCode, parsePairLink } from './pair-link'

describe('parsePairLink', () => {
  it('解析 Web 设置页出示的配对载荷', () => {
    expect(parsePairLink('diceframe://pair?s=http%3A%2F%2F192.168.1.5%3A18000&c=K4M9QX27')).toEqual({
      baseUrl: 'http://192.168.1.5:18000',
      code: 'K4M9QX27',
    })
  })

  it('保留反代子路径，不把它当成默认端口丢掉', () => {
    expect(parsePairLink('diceframe://pair?s=https%3A%2F%2Fexample.com%2Ftrpg&c=ABCD2345')).toEqual({
      baseUrl: 'https://example.com/trpg',
      code: 'ABCD2345',
    })
  })

  it('拒绝其它 scheme 与分享链接：加入链接走 parseShareLink，两者不能互串', () => {
    expect(parsePairLink('http://192.168.1.5:18000/#/join?game=g1&share=1')).toBeNull()
    expect(parsePairLink('https://evil.example.com/pair?s=x&c=ABCD2345')).toBeNull()
  })

  it('缺地址或配对码形状不对时判为无效', () => {
    expect(parsePairLink('diceframe://pair?c=K4M9QX27')).toBeNull()
    expect(parsePairLink('diceframe://pair?s=http%3A%2F%2F10.0.0.2%3A18000')).toBeNull()
    expect(parsePairLink('diceframe://pair?s=http%3A%2F%2F10.0.0.2%3A18000&c=abc')).toBeNull()
    expect(parsePairLink('diceframe://pair')).toBeNull()
    expect(parsePairLink('')).toBeNull()
  })
})

describe('normalizePairCode', () => {
  it('手输的大小写、空格与连字符都不该判成无效码', () => {
    expect(normalizePairCode(' k4m9-qx27 ')).toBe('K4M9QX27')
    expect(isPairCode('k4m9 qx27')).toBe(true)
  })

  it('长度或字符集不符时判为无效', () => {
    expect(isPairCode('K4M9')).toBe(false)
    expect(isPairCode('K4M9QX2!')).toBe(false)
  })
})
