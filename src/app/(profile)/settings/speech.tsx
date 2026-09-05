import { View } from 'react-native'
import Slider from '@react-native-community/slider'

import { SettingsSectionScreen } from '@/features/settings/section-screen'
import { TTS_ENGINE_OPTIONS } from '@/features/settings/config'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { useThemeToken } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'

export default function SpeechSettingsScreen() {
  const t = useT()
  const settings = useSettingsStore()
  const gold = useThemeToken('gold')
  const border = useThemeToken('border')

  return (
    <SettingsSectionScreen section="speech">
      <Card className="gap-3">
        <CardHeader><CardTitle>{t('dfSettingsSpeech')}</CardTitle></CardHeader>
        <CardContent className="gap-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-semibold">{t('dfSettingsTtsAuto')}</Text>
              <Text variant="small">{t('dfSettingsTtsAutoDesc')}</Text>
            </View>
            <Switch checked={settings.ttsAuto} onCheckedChange={settings.setTtsAuto} />
          </View>
          <Separator />
          <View className="gap-2">
            <Text className="font-semibold">{t('dfSettingsTtsEngine')}</Text>
            {TTS_ENGINE_OPTIONS.map((option) => {
              const active = settings.ttsEngine === option.value
              return (
                <Button
                  key={option.value}
                  variant={active ? 'secondary' : 'outline'}
                  className="min-h-12 justify-start px-4 py-3"
                  onPress={() => settings.setTtsEngine(option.value)}
                  accessibilityState={{ selected: active }}
                >
                  <Text className="font-semibold">{t(option.labelKey)}</Text>
                  {active ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                </Button>
              )
            })}
            {/* 提示跟随所选引擎切换（system 需知悉 iOS 静音键与系统 TTS 依赖） */}
            <Text variant="small">
              {settings.ttsEngine === 'system'
                ? t('dfSettingsTtsEngineSystemHint')
                : t('dfSettingsTtsEngineServerHint')}
            </Text>
          </View>
          <Separator />
          <View className="items-center gap-1 rounded-xl border border-border bg-muted/50 py-5"><Text className="font-mono text-3xl font-semibold tracking-tight">{settings.ttsRate.toFixed(2)}x</Text><Text variant="small">{t('dfSettingsTtsRateLabel')}</Text></View>
          <Slider minimumValue={0.5} maximumValue={2} step={0.25} value={settings.ttsRate} onValueChange={(value) => settings.setTtsRate(Number(value))} minimumTrackTintColor={gold} maximumTrackTintColor={border} />
          <View className="flex-row justify-between"><Text variant="small">{t('dfSettingsTtsSlow')}</Text><Text variant="small">{t('dfSettingsTtsStandard')}</Text><Text variant="small">{t('dfSettingsTtsFast')}</Text></View>
          <Text variant="small">{t('dfSettingsTtsApplyHint')}</Text>
        </CardContent>
      </Card>
    </SettingsSectionScreen>
  )
}
