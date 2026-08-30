/** 支持的界面语言；'zh-CN' 为默认与回退语言（对齐 Web 端 i18n 设定） */
export const SUPPORTED_LOCALES = ['zh-CN', 'en', 'ja'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** 语言偏好：'system' 跟随设备语言（与 themeMode 的 'system' 同构） */
export type LocalePreference = 'system' | Locale

/** 把 BCP-47 语言标签归一到支持的语言；无法识别时回落 zh-CN */
export function localeFromTag(tag: string): Locale {
  const base = tag.toLowerCase()
  if (base.startsWith('zh')) return 'zh-CN'
  if (base.startsWith('ja')) return 'ja'
  if (base.startsWith('en')) return 'en'
  return 'zh-CN'
}

/** 解析用户偏好到实际语言；'system' 按设备语言标签解析 */
export function resolveLocale(preference: LocalePreference, systemTag: string): Locale {
  if (preference !== 'system') return preference
  return localeFromTag(systemTag)
}
