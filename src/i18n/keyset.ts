/**
 * 移动端文案 key 全集与 t() 的轻量类型。
 *
 * 不用 i18next 的 CustomTypeOptions 增强：i18next 的 t 泛型会对整个字典
 * 做模板级类型推导，上游 1787+ key 规模直接触发 TS2589（实例化过深）。
 * 这里只取 key 名做字面量联合，值展宽为 string，用最朴素的函数签名
 * 实现「拼错 key 编译期报错」而不付 i18next 类型机器的成本。
 */
import type { auth } from './messages/mobile/auth'
import type { characters } from './messages/mobile/characters'
import type { common } from './messages/mobile/common'
import type { lore } from './messages/mobile/lore'
import type { overview } from './messages/mobile/overview'
import type { play } from './messages/mobile/play'
import type { profile } from './messages/mobile/profile'
import type { settings } from './messages/mobile/settings'
import type { zhCN as webZhCN } from './messages/web/zh-CN'

type WidenValues<T> = { [K in keyof T]: T[K] extends string ? string : never }

export type AppTranslation = WidenValues<
  typeof webZhCN &
    (typeof common)['zh'] &
    (typeof settings)['zh'] &
    (typeof auth)['zh'] &
    (typeof overview)['zh'] &
    (typeof profile)['zh'] &
    (typeof play)['zh'] &
    (typeof characters)['zh'] &
    (typeof lore)['zh']
>

/** 全部合法文案 key（上游镜像 + 移动端 df 簇） */
export type TKey = keyof AppTranslation

/** 与 react-i18next 的 t 兼容的最小签名；插值走 options */
export type T = (key: TKey, options?: Record<string, unknown>) => string
