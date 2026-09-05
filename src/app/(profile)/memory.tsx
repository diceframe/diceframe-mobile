import * as React from 'react'
import { FlatList, View } from 'react-native'
import { Brain, Search, X } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { fetchGames } from '@/api/games'
import {
  deleteMemory,
  fetchMemories,
  updateMemory,
  type MemoryRecord,
} from '@/api/library'
import type { GameSummary } from '@/api/types'
import { PageHeader } from '@/components/page-header'
import { Sheet } from '@/components/patterns/sheet'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/t'
import { errorMessage } from '@/api/client'
import { formatDateTime } from '@/lib/datetime'
import { memoryDisplayText } from '@/lib/memory-display'

export default function MemoryScreen() {
  const router = useRouter()
  const t = useT()
  const [games, setGames] = React.useState<GameSummary[]>([])
  const [gameKey, setGameKey] = React.useState('')
  const [memories, setMemories] = React.useState<MemoryRecord[]>([])
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    async function loadGames() {
      try {
        const result = await fetchGames()
        const next = result.games ?? []
        setGames(next)
        setGameKey((current) => current || next[0]?.game_key || '')
      } catch (cause) {
        setError(errorMessage(cause))
      }
    }
    queueMicrotask(() => void loadGames())
  }, [])

  async function load(targetGameKey: string, keyword = '') {
    if (!targetGameKey) {
      setMemories([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await fetchMemories(targetGameKey, keyword)
      setMemories(result.memories ?? result.entries ?? [])
      setError('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    queueMicrotask(() => void load(gameKey))
  }, [gameKey])

  async function remove(id: number) {
    const result = await deleteMemory(gameKey, id)
    if (result.ok === false)
      throw new Error(result.error || t('dfMemoryDeleteFailed'))
    await load(gameKey, query)
  }

  // 服务端 PUT /memories/{id} 只接受 entity/relation/value/confidence 四个字段
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [editEntity, setEditEntity] = React.useState('')
  const [editRelation, setEditRelation] = React.useState('')
  const [editValue, setEditValue] = React.useState('')
  const [editBusy, setEditBusy] = React.useState(false)

  function closeEdit() {
    setEditOpen(false)
    setEditingId(null)
    setEditEntity('')
    setEditRelation('')
    setEditValue('')
  }

  function openEdit(item: MemoryRecord) {
    setEditingId(item.id)
    setEditEntity(String(item.entity ?? ''))
    setEditRelation(String(item.relation ?? ''))
    setEditValue(
      String(item.value ?? item.content ?? item.text ?? item.summary ?? ''),
    )
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editingId || !editValue.trim()) return
    setEditBusy(true)
    try {
      await updateMemory(gameKey, editingId, {
        entity: editEntity.trim(),
        relation: editRelation.trim(),
        value: editValue.trim(),
      })
      closeEdit()
      await load(gameKey, query)
    } catch (cause) {
      setError(errorMessage(cause, 'dfMemoryEditFailed'))
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <Screen
      className="px-4"
      style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}
    >
      <PageHeader
        title={t('dfMemoryTitle')}
        subtitle={t('dfMemorySubtitle')}
        onBack={() => router.back()}
        className="px-0"
      />
      {error ? (
        <View className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <Text className="text-destructive">{error}</Text>
        </View>
      ) : null}
      <View className="mb-3">
        <SheetSelect
          options={games.map((game) => ({
            label: game.world_name || game.game_key,
            value: game.game_key,
          }))}
          value={gameKey}
          onValueChange={setGameKey}
          placeholder={t('dfProfileSelectGame')}
        />
      </View>
      <View className="mb-3 flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Icon as={Search} size={17} className="text-muted-foreground" />
          <Input
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void load(gameKey, query)}
            placeholder={t('dfMemorySearchPlaceholder')}
            className="flex-1 rounded-none border-0 bg-transparent px-0 shadow-none"
          />
        </View>
        {query ? (
          <Button
            size="icon"
            variant="outline"
            onPress={() => {
              setQuery('')
              void load(gameKey)
            }}
          >
            <Icon as={X} size={18} />
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!gameKey}
            onPress={() => void load(gameKey, query)}
          >
            <Text>{t('search')}</Text>
          </Button>
        )}
      </View>
      <FlatList
        data={memories}
        keyExtractor={(item) => String(item.id)}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={loading}
        onRefresh={() => void load(gameKey, query)}
        renderItem={({ item }) => (
          <Card className="gap-3 py-4">
            <CardContent className="gap-3 px-4">
              <View className="flex-row items-center gap-2">
                <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Icon as={Brain} size={16} />
                </View>
                <Text variant="small" className="flex-1" numberOfLines={1}>
                  {t('dfMemoryConfidence', {
                    score: Number(item.confidence ?? 1).toFixed(2),
                  })}
                  {item.source_round
                    ? ` · ${t('roundLabel', { round: item.source_round })}`
                    : ''}
                </Text>
              </View>
              <Text className="leading-6">
                {memoryDisplayText(item) || t('dfMemoryEmpty')}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text variant="small" className="flex-1 mr-2">
                  {formatDateTime(item.updated_at || item.created_at)}
                </Text>
                <View className="flex-row gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => openEdit(item)}
                  >
                    <Text>{t('edit')}</Text>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => void remove(item.id)}
                  >
                    <Text className="text-destructive">{t('forget')}</Text>
                  </Button>
                </View>
              </View>
            </CardContent>
          </Card>
        )}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
              <Icon as={Brain} size={28} className="text-muted-foreground" />
              <Text className="font-semibold">
                {gameKey
                  ? t('dfMemoryEmptyForGame')
                  : t('dfProfileSelectGameFirst')}
              </Text>
              <Text variant="small">{t('dfMemoryEmptyHint')}</Text>
            </View>
          ) : null
        }
      />

      <Sheet open={editOpen} onClose={closeEdit} className="h-auto">
        <View className="gap-4 pt-1">
          <Text variant="h3">{t('dfMemoryEditTitle')}</Text>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">
              {t('dfMemoryEntityLabel')}
            </Text>
            <Input value={editEntity} onChangeText={setEditEntity} />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">
              {t('dfMemoryRelationLabel')}
            </Text>
            <Input value={editRelation} onChangeText={setEditRelation} />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">
              {t('dfMemoryValueLabel')}
            </Text>
            <Textarea
              value={editValue}
              onChangeText={setEditValue}
              className="min-h-28"
            />
          </View>
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={closeEdit}>
              <Text>{t('dfCommonCancel')}</Text>
            </Button>
            <Button
              className="flex-1"
              disabled={editBusy || !editValue.trim()}
              onPress={() => void saveEdit()}
            >
              <Text>{t('dfCommonSave')}</Text>
            </Button>
          </View>
        </View>
      </Sheet>
    </Screen>
  )
}
