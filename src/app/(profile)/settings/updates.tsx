import { ActivityIndicator, Linking, View } from 'react-native'
import { Download, RefreshCw } from 'lucide-react-native'

import { SettingsSectionScreen } from '@/features/settings/section-screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT, type T } from '@/i18n/t'
import { useAppUpdates } from '@/hooks/useAppUpdates'

/** 拆分包文件名 → 用户可读的架构标签；识别不了的（如 universal）展示原文件名 */
function apkOptionLabel(name: string, t: T): string {
  const lower = name.toLowerCase()
  if (lower.includes('arm64-v8a')) return t('dfUpdatesApkArm64')
  if (lower.includes('armeabi-v7a')) return t('dfUpdatesApkArmv7')
  return t('dfUpdatesApkUniversal', { name })
}

export default function UpdatesSettingsScreen() {
  const t = useT()
  const updates = useAppUpdates()

  return (
    <SettingsSectionScreen section="updates">
      <Card className="gap-3">
        <CardHeader><CardTitle>{t('dfUpdatesAppVersion')}</CardTitle></CardHeader>
        <CardContent className="gap-4">
          <View className="gap-1 rounded-xl border border-border bg-muted/50 p-4">
            <Text className="font-semibold">{t('dfUpdatesCurrentVersion', { version: updates.current.version })}</Text>
            <Text variant="small">{t('dfUpdatesBuildNumber', { build: updates.current.buildVersion || '-' })}</Text>
          </View>
          <Button onPress={() => void updates.check()} disabled={updates.checking}>
            {updates.checking ? <ActivityIndicator className="text-primary-foreground" /> : <Icon as={RefreshCw} size={15} />}
            <Text>{updates.checking ? t('dfUpdatesChecking') : t('dfUpdatesCheckNow')}</Text>
          </Button>
          {updates.error ? <Text variant="small" className="text-destructive">{updates.error}</Text> : null}
          {updates.result ? (
            <View className="gap-3 rounded-xl border border-border bg-card p-4">
              <View className="gap-1">
                <Text className="font-semibold">{updates.result.isNewer ? t('dfUpdatesNewVersionFound', { version: updates.result.latestVersion }) : t('dfUpdatesUpToDate')}</Text>
                <Text variant="small">{t('dfUpdatesReleaseLabel', { name: updates.result.releaseName })}</Text>
              </View>
              {updates.result.releaseNotes ? <Text variant="small" numberOfLines={8}>{updates.result.releaseNotes}</Text> : null}
              {updates.result.isNewer ? (
                <View className="gap-2">
                  <Button onPress={() => void Linking.openURL(updates.result!.apkUrl)}>
                    <Icon as={Download} size={15} />
                    <Text>{t('dfUpdatesDownloadApk')}</Text>
                  </Button>
                  <Text variant="small" className="text-muted-foreground">{t('dfUpdatesApkHint')}</Text>
                  {updates.result.apks.length > 1 ? (
                    <View className="gap-1 rounded-xl border border-border p-2">
                      <Text variant="small" className="px-1 font-semibold text-foreground">{t('dfUpdatesManualPick')}</Text>
                      {updates.result.apks.map((apk) => (
                        <Button key={apk.url} size="sm" variant="ghost" onPress={() => void Linking.openURL(apk.url)}>
                          <Text numberOfLines={1}>{apkOptionLabel(apk.name, t)}</Text>
                        </Button>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          <Text variant="small">{t('dfUpdatesFooter')}</Text>
        </CardContent>
      </Card>
    </SettingsSectionScreen>
  )
}
