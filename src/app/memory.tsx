import * as React from 'react'
import { FlatList, View } from 'react-native'
import { Brain, Search, X } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { fetchGames } from '@/api/games'
import { deleteMemory, fetchMemories, type MemoryRecord } from '@/api/library'
import type { GameSummary } from '@/api/types'
import { PageHeader } from '@/components/page-header'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'

function memoryText(item: MemoryRecord) {
  const entity = String(item.entity || '')
  const relation = String(item.relation || '')
  const value = String(item.value || item.content || item.text || item.summary || '')
  return [entity, relation, value].filter(Boolean).join(' · ')
}

export default function MemoryScreen() {
  const router = useRouter()
  const [games, setGames] = React.useState<GameSummary[]>([])
  const [gameKey, setGameKey] = React.useState('')
  const [memories, setMemories] = React.useState<MemoryRecord[]>([])
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    void fetchGames().then((result) => {
      const next = result.games ?? []
      setGames(next)
      setGameKey((current) => current || next[0]?.game_key || '')
    }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [])

  const load = React.useCallback(async (targetGameKey: string, keyword = '') => {
    if (!targetGameKey) { setMemories([]); setLoading(false); return }
    setLoading(true)
    try {
      const result = await fetchMemories(targetGameKey, keyword)
      setMemories(result.memories ?? result.entries ?? [])
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { queueMicrotask(() => void load(gameKey)) }, [gameKey, load])

  async function remove(id: number) {
    const result = await deleteMemory(gameKey, id)
    if (result.ok === false) throw new Error(result.error || '删除记忆失败')
    await load(gameKey, query)
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader title="叙事记忆" subtitle="按对局管理服务器生成的长期事实" onBack={() => router.back()} className="px-0" />
      {error ? <View className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="text-destructive">{error}</Text></View> : null}
      <View className="mb-3"><SheetSelect options={games.map((game) => ({ label: game.world_name || game.game_key, value: game.game_key }))} value={gameKey} onValueChange={setGameKey} placeholder="选择对局" /></View>
      <View className="mb-3 flex-row gap-2"><View className="flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3"><Icon as={Search} size={17} className="text-muted-foreground" /><Input value={query} onChangeText={setQuery} onSubmitEditing={() => void load(gameKey, query)} placeholder="按实体名称检索" className="flex-1 border-0 px-0" /></View>{query ? <Button size="icon" variant="outline" onPress={() => { setQuery(''); void load(gameKey) }}><Icon as={X} size={18} /></Button> : <Button size="sm" disabled={!gameKey} onPress={() => void load(gameKey, query)}><Text>搜索</Text></Button>}</View>
      <FlatList
        data={memories}
        keyExtractor={(item) => String(item.id)}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={loading}
        onRefresh={() => void load(gameKey, query)}
        renderItem={({ item }) => <Card className="gap-3 py-4"><CardContent className="gap-3 px-4"><View className="flex-row items-center gap-2"><View className="h-8 w-8 items-center justify-center rounded-full bg-primary/15"><Icon as={Brain} size={16} /></View><Text variant="small" className="flex-1">置信度 {Number(item.confidence ?? 1).toFixed(2)}{item.source_round ? ` · 第 ${item.source_round} 轮` : ''}</Text><Button size="sm" variant="ghost" onPress={() => void remove(item.id)}><Text className="text-destructive">遗忘</Text></Button></View><Text className="leading-6">{memoryText(item) || '空记忆'}</Text><Text variant="small">{String(item.updated_at || item.created_at || '')}</Text></CardContent></Card>}
        ListEmptyComponent={!loading ? <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12"><Icon as={Brain} size={28} className="text-muted-foreground" /><Text className="font-semibold">{gameKey ? '这局还没有长期记忆' : '请先选择对局'}</Text><Text variant="small">记忆由对局推进时自动提取，不在这里手工伪造。</Text></View> : null}
      />
    </Screen>
  )
}
