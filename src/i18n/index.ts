import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { en as webEn } from './messages/web/en'
import { ja as webJa } from './messages/web/ja'
import { zhCN as webZhCN } from './messages/web/zh-CN'
import { auth } from './messages/mobile/auth'
import { characters } from './messages/mobile/characters'
import { common } from './messages/mobile/common'
import { lore } from './messages/mobile/lore'
import { overview } from './messages/mobile/overview'
import { play } from './messages/mobile/play'
import { profile } from './messages/mobile/profile'
import { settings } from './messages/mobile/settings'

const resources = {
  'zh-CN': { translation: { ...webZhCN, ...common.zh, ...settings.zh, ...auth.zh, ...overview.zh, ...profile.zh, ...play.zh, ...characters.zh, ...lore.zh } },
  en: { translation: { ...webEn, ...common.en, ...settings.en, ...auth.en, ...overview.en, ...profile.en, ...play.en, ...characters.en, ...lore.en } },
  ja: { translation: { ...webJa, ...common.ja, ...settings.ja, ...auth.ja, ...overview.ja, ...profile.ja, ...play.ja, ...characters.ja, ...lore.ja } },
}

// i18next 惯用法：默认实例链式 use/init；规则把命名导出误判为更优写法
// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources,
  // 实际语言由 useLocaleSync 依据 settings 偏好解析后 changeLanguage；
  // 这里只是 rehydrate 完成前的初值
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  // 上游 key 是不含点号/冒号的扁平 camelCase，关闭分隔符避免 key 被意外切分
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  // RN 侧无 XSS 转义需求（Text 不解析 HTML）
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

export default i18n
