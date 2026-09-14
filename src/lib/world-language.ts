import type { Locale } from '@/lib/locale'

/** 历史世界可能存语言名而非 BCP-47 标签；识别只用于内容筛选，不改变规则身份。 */
export function worldContentLocale(language?: string | null): Locale {
  const value = String(language ?? '').trim().toLowerCase()
  if (value === 'ja' || value.startsWith('ja-') || value.includes('日本語')) return 'ja'
  if (value === 'de' || value.startsWith('de-') || value === 'german' || value.includes('deutsch')) return 'de'
  if (value === 'en' || value.startsWith('en-')) return 'en'
  // 内置历史内容没有语言标记；未知内容标记也不能因 UI 回退策略被误分到英语。
  return 'zh-CN'
}

/** 语言名用母语展示，切换界面语言后仍能认出内容所属语言。 */
export function languageLabel(language?: string | null): string {
  const labels: Record<Locale, string> = {
    'zh-CN': '简体中文',
    en: 'English',
    ja: '日本語',
    de: 'Deutsch',
  }
  return labels[worldContentLocale(language)]
}
