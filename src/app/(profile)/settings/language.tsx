import { View } from 'react-native'

import { SettingsSectionScreen } from '@/features/settings/section-screen'
import { LANGUAGE_OPTIONS } from '@/features/settings/config'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { useSettingsStore } from '@/stores/settings'

export default function LanguageSettingsScreen() {
  const t = useT()
  const settings = useSettingsStore()

  return (
    <SettingsSectionScreen section="language">
      <Card className="gap-3">
        <CardHeader><CardTitle>{t('dfSettingsLanguage')}</CardTitle></CardHeader>
        <CardContent className="gap-2">
          <Button
            variant={settings.language === 'system' ? 'secondary' : 'outline'}
            className="min-h-12 justify-start px-4 py-3"
            onPress={() => settings.setLanguage('system')}
            accessibilityState={{ selected: settings.language === 'system' }}
          >
            <Text className="font-semibold">{t('dfSettingsFollowSystem')}</Text>
            {settings.language === 'system' ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
          </Button>
          {LANGUAGE_OPTIONS.map((option) => {
            const active = settings.language === option.value
            return (
              <Button
                key={option.value}
                variant={active ? 'secondary' : 'outline'}
                className="min-h-12 justify-start px-4 py-3"
                onPress={() => settings.setLanguage(option.value)}
                accessibilityState={{ selected: active }}
              >
                <Text className="font-semibold">{option.label}</Text>
                {active ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </Button>
            )
          })}
        </CardContent>
      </Card>
    </SettingsSectionScreen>
  )
}
