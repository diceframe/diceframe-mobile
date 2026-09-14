import { describe, expect, it } from 'vitest'

import { languageLabel, worldContentLocale } from './world-language'

describe('worldContentLocale', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['en-US', 'en'],
    ['ja-JP', 'ja'],
    ['de-DE', 'de'],
    ['Deutsch', 'de'],
    ['German', 'de'],
    ['日本語', 'ja'],
  ] as const)('把 %s 识别为 %s', (input, expected) => {
    expect(worldContentLocale(input)).toBe(expected)
  })

  it('未知或空语言按客户端默认语言回落中文', () => {
    expect(worldContentLocale('fr-FR')).toBe('zh-CN')
    expect(worldContentLocale()).toBe('zh-CN')
  })
})

describe('languageLabel', () => {
  it('用语言自己的名称显示', () => {
    expect(languageLabel('zh-CN')).toBe('简体中文')
    expect(languageLabel('en')).toBe('English')
    expect(languageLabel('ja')).toBe('日本語')
    expect(languageLabel('de-AT')).toBe('Deutsch')
  })
})
