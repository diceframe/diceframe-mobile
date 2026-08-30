import { getLocales } from 'expo-localization'
import { useLayoutEffect } from 'react'

import i18n from '@/i18n'
import { resolveLocale } from '@/lib/locale'
import { useSettingsStore } from '@/stores/settings'

/**
 * 把 settings 的语言偏好同步到 i18n 单例。useLayoutEffect 保证首帧前
 * 语言就绪（避免非默认语言用户看到一帧中文）；偏好变化时经
 * useTranslation 的订阅触发全树重渲染。
 */
export function useLocaleSync(): void {
  const language = useSettingsStore((state) => state.language)
  useLayoutEffect(() => {
    const systemTag = getLocales()[0]?.languageTag ?? 'zh-CN'
    void i18n.changeLanguage(resolveLocale(language, systemTag))
  }, [language])
}
