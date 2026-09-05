import { Pressable, ScrollView, View } from 'react-native'
import {
  BookOpenText,
  Brain,
  ChevronRight,
  CircleUserRound,
  FileText,
  Gavel,
  Globe2,
  Languages,
  PackageOpen,
  Palette,
  RefreshCw,
  Server,
  Vibrate,
  Volume2,
} from 'lucide-react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { LANGUAGE_OPTIONS, THEME_OPTIONS, type SettingsSection } from '@/features/settings/config'
import { activeIdentityOf, useSettingsStore } from '@/stores/settings'

interface MenuRowProps {
  icon: typeof Server
  label: string
  detail?: string
  onPress: () => void
}

function MenuRow({ icon, label, detail, onPress }: MenuRowProps) {
  return (
    <Pressable
      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-accent"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}，${detail}` : label}
    >
      <View className="h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
        <Icon as={icon} size={17} />
      </View>
      <Text className="flex-1 font-medium">{label}</Text>
      {detail ? <Text variant="small" className="max-w-[42%] text-right" numberOfLines={1}>{detail}</Text> : null}
      <Icon as={ChevronRight} size={17} className="text-muted-foreground" />
    </Pressable>
  )
}

function MenuGroup({ children }: { children: React.ReactNode }) {
  const rows = Array.isArray(children) ? children : [children]
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="px-0 py-0">
        {rows.map((row, index) => (
          <View key={index}>{index > 0 ? <Separator className="ml-16" /> : null}{row}</View>
        ))}
      </CardContent>
    </Card>
  )
}

export default function ProfileScreen() {
  const router = useRouter()
  const t = useT()
  const settings = useSettingsStore()
  const activeIdentity = activeIdentityOf(settings)
  const identity = settings.token ? t('dfProfileGmLoggedIn') : activeIdentity ? activeIdentity.name || t('dfProfilePlayerJoined') : t('dfSettingsNotLoggedIn')
  // 语言值用原生名展示（跟设置页同一份列表）；跟随系统时才走文案字典
  const languageLabel =
    settings.language === 'system'
      ? t('dfSettingsFollowSystem')
      : (LANGUAGE_OPTIONS.find((option) => option.value === settings.language)?.label ?? '')

  const openSetting = (section: SettingsSection) => {
    router.push(`/settings/${section}`)
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <PageHeader title={t('dfTabProfile')} subtitle={t('dfProfileSubtitle')} className="px-0" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-8">
        {/* 身份摘要卡：点击直达「身份与登录」，通用偏好仍走下方设置组，避免重复入口 */}
        <Pressable
          className="flex-row items-center gap-4 rounded-xl border border-border bg-card px-5 py-5 active:bg-accent"
          onPress={() => openSetting('identity')}
          accessibilityRole="button"
          accessibilityLabel={t('dfProfileCardA11y')}
        >
          <View className="h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
            <Icon as={CircleUserRound} size={27} />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="h3" numberOfLines={1}>{t('dfProfileAdventurerCard')}</Text>
            <Text variant="small" numberOfLines={1}>{identity} · {settings.baseUrl || t('dfProfileNoServer')}</Text>
          </View>
          <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
        </Pressable>

        <View className="gap-2">
          <Text variant="small" className="px-1 font-semibold text-foreground">{t('dfCommonSettings')}</Text>
          <MenuGroup>
            <MenuRow icon={Server} label={t('dfSettingsServer')} detail={settings.baseUrl ? settings.baseUrl.replace(/^https?:\/\//, '') : t('dfProfileServerNotConnected')} onPress={() => openSetting('server')} />
            <MenuRow icon={CircleUserRound} label={t('dfSettingsIdentity')} detail={identity} onPress={() => openSetting('identity')} />
            <MenuRow icon={Palette} label={t('dfSettingsAppearance')} detail={t(THEME_OPTIONS.find((option) => option.value === settings.themeMode)?.labelKey ?? 'dfSettingsThemeSystem')} onPress={() => openSetting('appearance')} />
            <MenuRow icon={Languages} label={t('dfSettingsLanguage')} detail={languageLabel} onPress={() => openSetting('language')} />
            <MenuRow icon={Volume2} label={t('dfSettingsSpeech')} detail={`${settings.ttsRate.toFixed(2)}x`} onPress={() => openSetting('speech')} />
            <MenuRow icon={Vibrate} label={t('dfSettingsHaptics')} detail={settings.hapticsEnabled ? t('dfProfileHapticsOn') : t('dfProfileHapticsOff')} onPress={() => openSetting('haptics')} />
            <MenuRow icon={RefreshCw} label={t('dfUpdatesTitle')} detail={`v${Constants.expoConfig?.version ?? '-'}`} onPress={() => openSetting('updates')} />
          </MenuGroup>
        </View>

        {/* 冒险工具与法律信息共用一张卡片，压缩页面层级；版本号作页面脚注 */}
        <View className="gap-2">
          <Text variant="small" className="px-1 font-semibold text-foreground">{t('dfProfileTools')}</Text>
          <MenuGroup>
            <MenuRow icon={Globe2} label={t('dfProfileWorlds')} onPress={() => router.push('/worlds')} />
            <MenuRow icon={PackageOpen} label={t('dfPluginsTitle')} onPress={() => router.push('/plugins')} />
            <MenuRow icon={Brain} label={t('dfMemoryTitle')} onPress={() => router.push('/memory')} />
            <MenuRow icon={BookOpenText} label={t('dfLogsTitle')} onPress={() => router.push('/logs')} />
            <MenuRow icon={Gavel} label={t('dfRulesTitle')} onPress={() => router.push('/rules')} />
            <MenuRow icon={FileText} label={t('legalDocumentLabel')} onPress={() => router.push('/legal')} />
          </MenuGroup>
        </View>

        <Text variant="small" className="text-center text-muted-foreground">
          {t('dfProfileFooter', { version: Constants.expoConfig?.version ?? '-' })}
        </Text>
      </ScrollView>
    </Screen>
  )
}
