import * as React from 'react'
import { FlatList, Switch, View } from 'react-native'
import { PackageCheck, Search, Store } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { usePlugins } from '@/hooks/usePlugins'
import { useThemeToken } from '@/lib/theme'

export default function PluginsScreen() {
  const router = useRouter()
  const t = useT()
  const { plugins, loading, error, refresh, installPlugin, uninstallPlugin, togglePlugin } = usePlugins()
  const [query, setQuery] = React.useState('')
  const [tab, setTab] = React.useState<'installed' | 'store'>('installed')
  const gold = useThemeToken('gold')
  const border = useThemeToken('border')

  const filtered = plugins.filter((plugin) => {
    const matchesQuery = `${plugin.name} ${plugin.description ?? ''}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (tab === 'installed' ? plugin.isInstalled : !plugin.isInstalled)
  })

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader title={t('dfPluginsTitle')} subtitle={t('dfPluginsSubtitle')} onBack={() => router.back()} className="px-0" />
      {error ? <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="flex-1 text-destructive" numberOfLines={2}>{error}</Text><Button size="sm" variant="outline" onPress={() => void refresh()}><Text>{t('dfCommonRetry')}</Text></Button></View> : null}
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="mb-3">
        <TabsList>
          <TabsTrigger value="installed"><Text variant="small">{t('pluginsInstalledTab')}</Text></TabsTrigger>
          <TabsTrigger value="store"><Text variant="small">{t('dfPluginsDiscover')}</Text></TabsTrigger>
        </TabsList>
      </Tabs>
      <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Icon as={Search} size={18} className="text-muted-foreground" />
        <Input value={query} onChangeText={setQuery} placeholder={t('dfPluginsSearchPlaceholder')} className="flex-1 border-0 px-0" />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={() => void refresh()}
        renderItem={({ item }) => (
          <Card className="gap-3 py-4">
            <CardContent className="gap-3 px-4">
              <View className="flex-row items-start gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted">
                  <Icon as={item.isInstalled ? PackageCheck : Store} size={20} />
                </View>
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 font-semibold" numberOfLines={1}>{item.name}</Text>
                    <Text variant="small">v{item.version}</Text>
                  </View>
                  <Text variant="small">{item.author ? t('dfPluginsByAuthor', { author: item.author }) : t('dfPluginsCommunity')}</Text>
                </View>
              </View>
              <Text className="leading-6 text-muted-foreground" numberOfLines={3}>{item.description || t('dfPluginsNoDescription')}</Text>
              <View className="flex-row items-center justify-between gap-3 border-t border-border pt-3">
                {item.isInstalled ? (
                  <>
                    <View className="flex-row items-center gap-2">
                      <Switch
                        value={item.isEnabled}
                        onValueChange={() => void togglePlugin(item.id)}
                        trackColor={{ false: border, true: gold }}
                      />
                      <Text variant="small">{item.isEnabled ? t('dfPluginsEnabled') : t('dfPluginsDisabled')}</Text>
                    </View>
                    <Button size="sm" variant="ghost" onPress={() => void uninstallPlugin(item.id)}><Text className="text-destructive">{t('dfPluginsUninstall')}</Text></Button>
                  </>
                ) : (
                  <>
                    <Text variant="small">{t('dfPluginsInstallHint')}</Text>
                    <Button size="sm" onPress={() => void installPlugin(item.id)}><Text>{t('install')}</Text></Button>
                  </>
                )}
              </View>
            </CardContent>
          </Card>
        )}
        ListEmptyComponent={!loading ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={tab === 'installed' ? PackageCheck : Store} size={28} className="text-muted-foreground" />
            <Text className="font-semibold">{tab === 'installed' ? t('dfPluginsEmptyInstalled') : t('dfPluginsEmptyStore')}</Text>
            <Text variant="small">{query ? t('dfPluginsTryOtherKeyword') : t('dfPluginsAvailableHint')}</Text>
          </View>
        ) : null}
      />
    </Screen>
  )
}
