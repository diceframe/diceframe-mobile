import * as React from 'react'
import { FlatList, View } from 'react-native'
import { Brain, Search, X } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchGames } from '@/api/games'
import {
  deleteMemory,
  fetchMemories,
  updateMemory,
  type MemoryRecord,
} from '@/api/library'
import type { GameSummary } from '@/api/types'
import { PageHeader } from '@/components/page-header'
import { PageNavigation } from '@/components/patterns/page-navigation'
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
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import {
  createMemoryPagination,
  MEMORY_PAGE_SIZE,
  memoryPageMeta,
  memoryPaginationReducer,
} from '@/lib/memory-pagination'

export default function MemoryScreen() {
  const router = useRouter()
  const t = useT()
  const keyboardHeight = useKeyboardHeight()
  const insets = useSafeAreaInsets()
  const [games, setGames] = React.useState<GameSummary[]>([])
  const [pagination, dispatch] = React.useReducer(memoryPaginationReducer, undefined, createMemoryPagination)
  const { gameKey, keyword, page, memories, loading, requestId, contextId } = pagination
  const meta = memoryPageMeta(pagination)
  const [query, setQuery] = React.useState('')
  const [gamesLoading, setGamesLoading] = React.useState(true)
  const [gamesError, setGamesError] = React.useState('')
  const [gamesAttempt, setGamesAttempt] = React.useState(0)
  const [mutationBusy, setMutationBusy] = React.useState(false)
  const mutationLock = React.useRef(false)
  const editSession = React.useRef(0)
  const error = gamesError || pagination.error

  React.useEffect(() => {
    let active = true
    async function loadGames() {
      try {
        const result = await fetchGames()
        if (!active) return
        const next = result.games ?? []
        setGames(next)
        setGamesError('')
        dispatch({ type: 'game', gameKey: next[0]?.game_key || '' })
      } catch (cause) {
        if (active) setGamesError(errorMessage(cause))
      } finally {
        if (active) setGamesLoading(false)
      }
    }
    void loadGames()
    return () => { active = false }
  }, [gamesAttempt])

  React.useEffect(() => {
    if (!gameKey) return
    let active = true
    async function load() {
      try {
        const response = await fetchMemories(gameKey, keyword, {
          limit: MEMORY_PAGE_SIZE,
          offset: (page - 1) * MEMORY_PAGE_SIZE,
        })
        if (active) dispatch({ type: 'success', requestId, response })
      } catch (cause) {
        if (active) dispatch({ type: 'failure', requestId, error: errorMessage(cause) })
      }
    }
    void load()
    return () => { active = false }
  }, [gameKey, keyword, page, requestId])

  function retry() {
    if (gamesError) {
      setGamesLoading(true)
      setGamesError('')
      setGamesAttempt((attempt) => attempt + 1)
    } else {
      dispatch({ type: 'refresh' })
    }
  }

  function search(value = query) {
    closeEdit()
    dispatch({ type: 'search', keyword: value })
  }

  async function remove(id: number) {
    if (mutationLock.current || loading) return
    mutationLock.current = true
    setMutationBusy(true)
    try {
      const result = await deleteMemory(gameKey, id)
      if (result.ok === false) throw new Error(result.error || t('dfMemoryDeleteFailed'))
      dispatch({ type: 'refresh', contextId })
    } catch (cause) {
      dispatch({ type: 'mutationFailure', contextId, error: errorMessage(cause, 'dfMemoryDeleteFailed') })
    } finally {
      mutationLock.current = false
      setMutationBusy(false)
    }
  }

  // 服务端 PUT /memories/{id} 只接受 entity/relation/value/confidence 四个字段
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [editEntity, setEditEntity] = React.useState('')
  const [editRelation, setEditRelation] = React.useState('')
  const [editValue, setEditValue] = React.useState('')

  function closeEdit() {
    editSession.current += 1
    setEditOpen(false)
    setEditingId(null)
    setEditEntity('')
    setEditRelation('')
    setEditValue('')
  }

  function openEdit(item: MemoryRecord) {
    if (mutationLock.current || loading) return
    editSession.current += 1
    setEditingId(item.id)
    setEditEntity(String(item.entity ?? ''))
    setEditRelation(String(item.relation ?? ''))
    setEditValue(
      String(item.value ?? item.content ?? item.text ?? item.summary ?? ''),
    )
    setEditOpen(true)
  }

  async function saveEdit() {
    if (editingId === null || !editValue.trim() || mutationLock.current) return
    mutationLock.current = true
    const session = editSession.current
    setMutationBusy(true)
    try {
      const result = await updateMemory(gameKey, editingId, {
        entity: editEntity.trim(),
        relation: editRelation.trim(),
        value: editValue.trim(),
      })
      if (result.ok === false) throw new Error(result.error || t('dfMemoryEditFailed'))
      // 取消或切换上下文后，旧保存结果不能关闭后续编辑会话。
      if (editSession.current === session) closeEdit()
      dispatch({ type: 'refresh', contextId })
    } catch (cause) {
      dispatch({ type: 'mutationFailure', contextId, error: errorMessage(cause, 'dfMemoryEditFailed') })
    } finally {
      mutationLock.current = false
      setMutationBusy(false)
    }
  }

  return (
    <Screen
      className="px-4"
      style={{ width: '100%', maxWidth: 840, alignSelf: 'center', paddingBottom: Math.max(keyboardHeight, insets.bottom) }}
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
          <Button size="sm" variant="outline" disabled={loading || gamesLoading || mutationBusy} onPress={retry}>
            <Text>{t('retry')}</Text>
          </Button>
        </View>
      ) : null}
      <View className="mb-3">
        <SheetSelect
          options={games.map((game) => ({
            label: game.world_name || game.game_key,
            value: game.game_key,
          }))}
          value={gameKey}
          onValueChange={(value) => {
            setQuery('')
            closeEdit()
            dispatch({ type: 'game', gameKey: value })
          }}
          placeholder={t('dfProfileSelectGame')}
        />
      </View>
      <View className="mb-3 flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Icon as={Search} size={17} className="text-muted-foreground" />
          <Input
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => search()}
            editable={!!gameKey}
            placeholder={t('dfMemorySearchPlaceholder')}
            className="flex-1 rounded-none border-0 bg-transparent px-0 shadow-none"
          />
        </View>
        {query || keyword ? (
          <Button
            size="icon"
            variant="outline"
            accessibilityLabel={t('clear')}
            disabled={!gameKey}
            onPress={() => {
              setQuery('')
              search('')
            }}
          >
            <Icon as={X} size={18} />
          </Button>
        ) : null}
        <Button size="sm" disabled={!gameKey} onPress={() => search()}>
          <Text>{t('search')}</Text>
        </Button>
      </View>
      {gameKey && pagination.total !== null ? (
        <View className="mb-3 gap-1">
          <Text variant="small">{t('memoryMeta', { total: meta.total, start: meta.start, end: meta.end })}</Text>
          {keyword ? <Text variant="small">{t('keywords')} · {keyword}</Text> : null}
        </View>
      ) : null}
      <FlatList
        key={`${gameKey}:${keyword}:${page}`}
        data={memories}
        keyExtractor={(item) => String(item.id)}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={loading || gamesLoading}
        onRefresh={retry}
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
                    disabled={loading || mutationBusy}
                    onPress={() => openEdit(item)}
                  >
                    <Text>{t('edit')}</Text>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={loading || mutationBusy}
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
          !loading && !gamesLoading && !error ? (
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
      {gameKey && pagination.total !== null && meta.pages > 1 ? (
        <PageNavigation
          key={`${pagination.contextId}`}
          page={page}
          pages={meta.pages}
          disabled={loading || mutationBusy}
          onPageChange={(next) => dispatch({ type: 'page', page: next })}
        />
      ) : null}

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
              disabled={mutationBusy || !editValue.trim()}
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
