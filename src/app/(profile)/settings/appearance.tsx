import { View } from 'react-native'

import { SettingsSectionScreen } from '@/features/settings/section-screen'
import { THEME_OPTIONS } from '@/features/settings/config'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { useSettingsStore } from '@/stores/settings'

export default function AppearanceSettingsScreen() {
  const t = useT()
  const settings = useSettingsStore()

  return (
    <SettingsSectionScreen section="appearance">
      <Card className="gap-3">
        <CardHeader><CardTitle>{t('dfSettingsTheme')}</CardTitle></CardHeader>
        <CardContent className="gap-2">
          {THEME_OPTIONS.map((option) => {
            const active = settings.themeMode === option.value
            return <Button key={option.value} variant={active ? 'secondary' : 'outline'} className="h-auto min-h-16 justify-start px-4 py-3" onPress={() => settings.setThemeMode(option.value)} accessibilityState={{ selected: active }}><View className="h-9 w-9 items-center justify-center rounded-full bg-background"><Icon as={option.icon} size={17} /></View><View className="min-w-0 flex-1 items-start gap-1"><Text className="font-semibold">{t(option.labelKey)}</Text><Text variant="small" className="text-left">{t(option.descKey)}</Text></View>{active ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}</Button>
          })}
        </CardContent>
      </Card>
    </SettingsSectionScreen>
  )
}
