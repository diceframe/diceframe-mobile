import * as React from 'react'
import { FlatList, View } from 'react-native'
import { BookOpenText, LockKeyhole, RefreshCw, Search } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { fetchGames } from '@/api/games'
import type { GameSummary } from '@/api/types'
import { PageHeader } from '@/components/page-header'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { useLogs } from '@/hooks/useLogs'

export default function LogsScreen() {
  const router = useRouter()
  const [games, setGames] = React.useState<GameSummary[]>([])
  const [gameKey, setGameKey] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [kind, setKind] = React.useState<'story' | 'private'>('story')
  const [gamesError, setGamesError] = React.useState('')
  const { logs, loading, error, refreshLogs } = useLogs(gameKey)

  React.useEffect(() => {
    void fetchGames().then((result) => {
      const next = result.games ?? []
      setGames(next)
      setGameKey((current) => current || next[0]?.game_key || '')
    }).catch((cause) => setGamesError(cause instanceof Error ? cause.message : String(cause)))
  }, [])

  const filtered = logs.filter((entry) => entry.kind === kind && `${entry.title} ${entry.content} ${entry.detail || ''}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 900, alignSelf: 'center' }}>
      <PageHeader title="对局记录" subtitle={`${filtered.length} 条真实记录 · 来自服务器叙事日志`} onBack={() => router.back()} className="px-0" right={<Button size="sm" variant="outline" onPress={() => void refreshLogs()} disabled={loading || !gameKey}><Icon as={RefreshCw} size={15} /><Text>{loading ? '刷新中' : '刷新'}</Text></Button>} />
      {error || gamesError ? <View className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="text-destructive">{error || gamesError}</Text></View> : null}
      <View className="mb-3"><SheetSelect options={games.map((game) => ({ label: game.world_name || game.game_key, value: game.game_key }))} value={gameKey} onValueChange={setGameKey} placeholder="选择对局" /></View>
      <Tabs value={kind} onValueChange={(value) => setKind(value as typeof kind)} className="mb-3"><TabsList><TabsTrigger value="story"><Text variant="small">公开叙事</Text></TabsTrigger><TabsTrigger value="private"><Text variant="small">私密消息</Text></TabsTrigger></TabsList></Tabs>
      <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3"><Icon as={Search} size={17} className="text-muted-foreground" /><Input value={query} onChangeText={setQuery} placeholder="搜索记录内容" className="flex-1 border-0 px-0" /></View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={() => void refreshLogs()}
        renderItem={({ item }) => <Card className="gap-2 py-4"><CardContent className="gap-2 px-4"><View className="flex-row items-center gap-2"><View className="h-8 w-8 items-center justify-center rounded-full bg-primary/15"><Icon as={item.kind === 'story' ? BookOpenText : LockKeyhole} size={15} /></View><Text className="flex-1 font-semibold">{item.title}</Text>{item.round > 0 ? <Text variant="small">第 {item.round} 轮</Text> : null}</View><Text className="leading-6">{item.content}</Text>{item.detail ? <View className="rounded-lg bg-muted p-3"><Text variant="small" className="font-semibold">玩家行动</Text><Text variant="small" className="mt-1">{item.detail}</Text></View> : null}</CardContent></Card>}
        ListEmptyComponent={!loading ? <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12"><Icon as={kind === 'story' ? BookOpenText : LockKeyhole} size={28} className="text-muted-foreground" /><Text className="font-semibold">{gameKey ? '没有匹配的对局记录' : '请先选择对局'}</Text><Text variant="small">这里只显示服务器已经保存的内容。</Text></View> : null}
      />
    </Screen>
  )
}
