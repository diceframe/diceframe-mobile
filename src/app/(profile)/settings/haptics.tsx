import { View } from 'react-native'

import { SettingsSectionScreen } from '@/features/settings/section-screen'
import { HAPTIC_PREVIEWS } from '@/features/settings/config'
import { playGameHaptic } from '@/features/play/useHaptics'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { useSettingsStore } from '@/stores/settings'

export default function HapticsSettingsScreen() {
  const t = useT()
  const settings = useSettingsStore()

  return (
    <SettingsSectionScreen section="haptics">
      <Card className="gap-3">
        <CardHeader><CardTitle>{t('dfSettingsGameHaptics')}</CardTitle></CardHeader>
        <CardContent className="gap-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-semibold">{t('dfSettingsHapticsToggle')}</Text>
              <Text variant="small">{t('dfSettingsHapticsToggleDesc')}</Text>
            </View>
            <Switch
              checked={settings.hapticsEnabled}
              onCheckedChange={(checked) => {
                settings.setHapticsEnabled(checked)
                // 打开的瞬间给一次试震，立即确认手感与开关生效
                if (checked) void playGameHaptic('check-pass')
              }}
            />
          </View>
          <Separator />
          <View className="gap-2">
            <Text variant="small" className="font-semibold">{t('dfSettingsHapticsTry')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {HAPTIC_PREVIEWS.map((preview) => (
                <Button key={preview.event} size="sm" variant="outline" onPress={() => void playGameHaptic(preview.event)}>
                  <Icon as={preview.icon} size={15} />
                  <Text>{t(preview.labelKey)}</Text>
                </Button>
              ))}
            </View>
            <Text variant="small">{t('dfSettingsHapticsPlatformHint')}</Text>
          </View>
        </CardContent>
      </Card>
    </SettingsSectionScreen>
  )
}
