import { describe, expect, it } from 'vitest'

import { localeFromTag, resolveLocale, SUPPORTED_LOCALES } from './locale'

describe('localeFromTag', () => {
  it('按主语言子标签归一', () => {
    expect(localeFromTag('zh-CN')).toBe('zh-CN')
    expect(localeFromTag('zh-TW')).toBe('zh-CN')
    expect(localeFromTag('en-US')).toBe('en')
    expect(localeFromTag('en-GB')).toBe('en')
    expect(localeFromTag('ja-JP')).toBe('ja')
    expect(localeFromTag('de-DE')).toBe('de')
    expect(localeFromTag('de-AT')).toBe('de')
  })

  it('无法识别时回落英语', () => {
    expect(localeFromTag('fr-FR')).toBe('en')
    expect(localeFromTag('')).toBe('en')
  })
})

describe('resolveLocale', () => {
  it('显式指定语言时无视设备语言', () => {
    expect(resolveLocale('en', 'zh-CN')).toBe('en')
    expect(resolveLocale('ja', 'en-US')).toBe('ja')
    expect(resolveLocale('de', 'zh-CN')).toBe('de')
    expect(resolveLocale('zh-CN', 'ja-JP')).toBe('zh-CN')
  })

  it('system 偏好按设备语言解析', () => {
    expect(resolveLocale('system', 'en-US')).toBe('en')
    expect(resolveLocale('system', 'ja-JP')).toBe('ja')
    expect(resolveLocale('system', 'de-CH')).toBe('de')
    expect(resolveLocale('system', 'zh-TW')).toBe('zh-CN')
    expect(resolveLocale('system', 'ko-KR')).toBe('en')
  })

  it('支持的语言集合与类型定义一致', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'en', 'ja', 'de'])
  })
})
