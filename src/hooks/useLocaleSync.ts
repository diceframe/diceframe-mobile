import { getLocales } from 'expo-localization'
import { useLayoutEffect } from 'react'

import { configureApiClient } from '@/api/client'
import i18n from '@/i18n'
import { resolveLocale } from '@/lib/locale'
import { useSettingsStore } from '@/stores/settings'

/**
 * 把 settings 的语言偏好同步到 i18n 单例和 API client。useLayoutEffect 保证首帧前
 * 语言就绪（避免非默认语言用户看到一帧中文）；偏好变化时经
 * useTranslation 的订阅触发全树重渲染。API client 据此带上 Accept-Language，
 * 服务端返回的提示文案与界面语言一致。
 */
export function useLocaleSync(): void {
  const language = useSettingsStore((state) => state.language)
  useLayoutEffect(() => {
    const systemTag = getLocales()[0]?.languageTag ?? 'zh-CN'
    const locale = resolveLocale(language, systemTag)
    configureApiClient({ language: locale })
    void i18n.changeLanguage(locale)
  }, [language])
}
