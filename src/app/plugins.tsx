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
import { usePlugins } from '@/hooks/usePlugins'
import { useThemeToken } from '@/lib/theme'

export default function PluginsScreen() {
  const router = useRouter()
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
      <PageHeader title="插件与内容包" subtitle="扩展 DiceFrame 的规则、世界与工具" onBack={() => router.back()} className="px-0" />
      {error ? <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="flex-1 text-destructive" numberOfLines={2}>{error}</Text><Button size="sm" variant="outline" onPress={() => void refresh()}><Text>重试</Text></Button></View> : null}
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="mb-3">
        <TabsList>
          <TabsTrigger value="installed"><Text variant="small">已安装</Text></TabsTrigger>
          <TabsTrigger value="store"><Text variant="small">发现</Text></TabsTrigger>
        </TabsList>
      </Tabs>
      <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Icon as={Search} size={18} className="text-muted-foreground" />
        <Input value={query} onChangeText={setQuery} placeholder="搜索名称或说明" className="flex-1 border-0 px-0" />
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
                  <Text variant="small">{item.author ? `由 ${item.author} 提供` : '社区内容包'}</Text>
                </View>
              </View>
              <Text className="leading-6 text-muted-foreground" numberOfLines={3}>{item.description || '没有提供说明'}</Text>
              <View className="flex-row items-center justify-between gap-3 border-t border-border pt-3">
                {item.isInstalled ? (
                  <>
                    <View className="flex-row items-center gap-2">
                      <Switch
                        value={item.isEnabled}
                        onValueChange={() => void togglePlugin(item.id)}
                        trackColor={{ false: border, true: gold }}
                      />
                      <Text variant="small">{item.isEnabled ? '已启用' : '已停用'}</Text>
                    </View>
                    <Button size="sm" variant="ghost" onPress={() => void uninstallPlugin(item.id)}><Text className="text-destructive">卸载</Text></Button>
                  </>
                ) : (
                  <>
                    <Text variant="small">安装后可在新对局中使用</Text>
                    <Button size="sm" onPress={() => void installPlugin(item.id)}><Text>安装</Text></Button>
                  </>
                )}
              </View>
            </CardContent>
          </Card>
        )}
        ListEmptyComponent={!loading ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={tab === 'installed' ? PackageCheck : Store} size={28} className="text-muted-foreground" />
            <Text className="font-semibold">{tab === 'installed' ? '还没有安装内容包' : '没有匹配的扩展'}</Text>
            <Text variant="small">{query ? '换个关键词试试。' : '可用内容会显示在这里。'}</Text>
          </View>
        ) : null}
      />
    </Screen>
  )
}
