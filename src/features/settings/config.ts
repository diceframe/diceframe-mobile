import {
  CircleCheck,
  CircleX,
  Coins,
  Dices,
  HeartCrack,
  Monitor,
  Moon,
  Skull,
  Sparkles,
  Sun,
  Swords,
} from 'lucide-react-native'

import type { T } from '@/i18n/t'
import type { LocalePreference } from '@/lib/locale'

export const SECTIONS = ['server', 'identity', 'appearance', 'language', 'speech', 'haptics', 'updates'] as const

/** 「我的」页菜单等处复用此类型，避免手写联合类型与 SECTIONS 漂移 */
export type SettingsSection = (typeof SECTIONS)[number]

export function sectionMeta(section: SettingsSection, t: T): { title: string; subtitle: string } {
  switch (section) {
    case 'server':
      return { title: t('dfSettingsServer'), subtitle: t('dfSettingsServerHint') }
    case 'identity':
      return { title: t('dfSettingsIdentity'), subtitle: t('dfSettingsIdentityHint') }
    case 'appearance':
      return { title: t('dfSettingsAppearance'), subtitle: t('dfSettingsAppearanceHint') }
    case 'language':
      return { title: t('dfSettingsLanguage'), subtitle: t('dfSettingsLanguageHint') }
    case 'speech':
      return { title: t('dfSettingsSpeech'), subtitle: t('dfSettingsSpeechHint') }
    case 'haptics':
      return { title: t('dfSettingsHaptics'), subtitle: t('dfSettingsHapticsHint') }
    case 'updates':
      return { title: t('dfUpdatesTitle'), subtitle: t('dfUpdatesSubtitle') }
  }
}

export function isSection(value: string | undefined): value is SettingsSection {
  return !!value && SECTIONS.includes(value as SettingsSection)
}

/** 朗读引擎选项：server 对齐 Web 的服务器合成，system 用设备自带 TTS（零配置离线） */
export const TTS_ENGINE_OPTIONS = [
  { value: 'server', labelKey: 'dfSettingsTtsEngineServer', hintKey: 'dfSettingsTtsEngineServerHint' },
  { value: 'system', labelKey: 'dfSettingsTtsEngineSystem', hintKey: 'dfSettingsTtsEngineSystemHint' },
] as const

/** 各事件的手感预览（与叙事推导共用同一触发通道）；as const 保持 key 字面量类型供 t() 校验 */
export const HAPTIC_PREVIEWS = [
  { event: 'dice', labelKey: 'dfHapticDice', icon: Dices },
  { event: 'damage', labelKey: 'dfHapticDamage', icon: HeartCrack },
  { event: 'combat', labelKey: 'dfHapticCombat', icon: Swords },
  { event: 'reward', labelKey: 'dfHapticReward', icon: Coins },
  { event: 'check-pass', labelKey: 'dfHapticCheckPass', icon: CircleCheck },
  { event: 'check-fail', labelKey: 'dfHapticCheckFail', icon: CircleX },
  { event: 'critical', labelKey: 'dfHapticCritical', icon: Sparkles },
  { event: 'fumble', labelKey: 'dfHapticFumble', icon: Skull },
] as const

/** as const 保持 labelKey/descKey 字面量类型供 t() 校验；「我的」页外观行的值也复用 */
export const THEME_OPTIONS = [
  { value: 'system', labelKey: 'dfSettingsThemeSystem', descKey: 'dfSettingsThemeSystemDesc', icon: Monitor },
  { value: 'light', labelKey: 'dfSettingsThemeLight', descKey: 'dfSettingsThemeLightDesc', icon: Sun },
  { value: 'dark', labelKey: 'dfSettingsThemeDark', descKey: 'dfSettingsThemeDarkDesc', icon: Moon },
] as const

// 语言名用各自母语展示（切换语言前也要能认出来），不进文案字典；
// 「我的」页语言行的值也复用这份列表
export const LANGUAGE_OPTIONS: { value: LocalePreference; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]
