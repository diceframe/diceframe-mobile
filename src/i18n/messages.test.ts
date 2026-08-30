import { describe, expect, it } from 'vitest'

import { auth } from './messages/mobile/auth'
import { characters } from './messages/mobile/characters'
import { common } from './messages/mobile/common'
import { lore } from './messages/mobile/lore'
import { overview } from './messages/mobile/overview'
import { play } from './messages/mobile/play'
import { profile } from './messages/mobile/profile'
import { settings } from './messages/mobile/settings'
import { en as webEn } from './messages/web/en'
import { ja as webJa } from './messages/web/ja'
import { zhCN as webZhCN } from './messages/web/zh-CN'

const MOBILE_CLUSTERS = {
  common,
  settings,
  auth,
  overview,
  profile,
  play,
  characters,
  lore,
} as const

const keysOf = (obj: Record<string, unknown>): string[] => Object.keys(obj).sort()

const placeholderParams = (value: string): string[] =>
  [...value.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].map((m) => m[1]).sort()

describe('上游镜像翻译（web 段）', () => {
  it('三语 key 集合一致（同步被截断会在此暴露）', () => {
    const zh = keysOf(webZhCN)
    expect(zh.length).toBeGreaterThan(1000)
    expect(keysOf(webEn)).toEqual(zh)
    expect(keysOf(webJa)).toEqual(zh)
  })

  it('值中不允许残留单花括号占位符（vue-i18n {x} 必须转为 {{x}}）', () => {
    for (const [lang, dict] of Object.entries({ 'zh-CN': webZhCN, en: webEn, ja: webJa })) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${lang}/${key}`).not.toMatch(/(^|[^{])\{[a-zA-Z_][a-zA-Z0-9_]*\}($|[^}])/)
      }
    }
  })
})

describe('移动端 df 簇（mobile 段）', () => {
  it('每个簇三语 key 集合一致且非空', () => {
    for (const [name, cluster] of Object.entries(MOBILE_CLUSTERS)) {
      const zh = keysOf(cluster.zh)
      expect(zh.length, `${name}.zh 不应为空（簇未迁移？）`).toBeGreaterThan(0)
      expect(keysOf(cluster.en), `${name}.en`).toEqual(zh)
      expect(keysOf(cluster.ja), `${name}.ja`).toEqual(zh)
    }
  })

  it('key 全部带 df 前缀且跨簇无重复', () => {
    const seen = new Map<string, string>()
    for (const [name, cluster] of Object.entries(MOBILE_CLUSTERS)) {
      for (const key of keysOf(cluster.zh)) {
        expect(key.startsWith('df'), `${name}/${key} 缺 df 前缀`).toBe(true)
        expect(seen.has(key), `${name}/${key} 与 ${seen.get(key)} 重复定义`).toBe(false)
        seen.set(key, name)
      }
    }
  })

  it('与上游镜像 key 无冲突（合并会被静默覆盖）', () => {
    const webKeys = new Set(keysOf(webZhCN))
    for (const [name, cluster] of Object.entries(MOBILE_CLUSTERS)) {
      for (const key of keysOf(cluster.zh)) {
        expect(webKeys.has(key), `${name}/${key} 与上游 key 冲突`).toBe(false)
      }
    }
  })

  it('同一 key 三语的插值参数一致', () => {
    for (const [name, cluster] of Object.entries(MOBILE_CLUSTERS)) {
      for (const key of keysOf(cluster.zh)) {
        const expected = placeholderParams((cluster.zh as Record<string, string>)[key])
        expect(placeholderParams((cluster.en as Record<string, string>)[key]), `${name}/${key} en 插值参数`).toEqual(expected)
        expect(placeholderParams((cluster.ja as Record<string, string>)[key]), `${name}/${key} ja 插值参数`).toEqual(expected)
      }
    }
  })
})
