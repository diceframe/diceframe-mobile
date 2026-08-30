import { useTranslation } from 'react-i18next'

import i18n from './index'
import { SUPPORTED_LOCALES, type Locale } from '@/lib/locale'
import type { T } from './keyset'

export type { T }

/** 组件内取 t()；语言切换时经 useTranslation 订阅触发重渲染 */
export function useT(): T {
  const { t } = useTranslation()
  return t as unknown as T
}

/** 组件外（api 层、纯函数）取当前语言的 t；在抛错等时刻取即时语言 */
export function getT(): T {
  return i18n.t.bind(i18n) as unknown as T
}

/**
 * 内容语言（服务端资源的世界书/规则内容语言）跟随当前 UI 语言。
 * 世界模板、规则库、冒险包等请求的 language 参数都走这里，
 * 切换界面语言后拉到的内容语言随之变化。
 */
export function contentLanguage(): Locale {
  return SUPPORTED_LOCALES.includes(i18n.language as Locale) ? (i18n.language as Locale) : 'zh-CN'
}
