import * as React from 'react'
import { Pressable, RefreshControl, View } from 'react-native'
import { useNavigation, useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { Plus, Trash2 } from 'lucide-react-native'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Badge, BadgeText } from '@/components/ui/badge'
import { Button, ButtonText } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { errorMessage } from '@/api/client'
import { batchDeleteGames, deleteGame, fetchGames } from '@/api/games'
import type { GameSummary } from '@/api/types'
import { gameStateLabel, gameStateVariant } from '@/lib/game-state'
import { useThemeToken } from '@/lib/theme-colors'
import { strings } from '@/lib/strings'
import { CreateGameSheet } from '@/features/overview/CreateGameSheet'

type SortMode = 'recent' | 'oldest' | 'name' | 'round'

function activityTime(game: GameSummary): number | null {
  for (const value of [game.last_activity, game.started_at]) {
    if (!value) continue
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) return timestamp
  }
  return null
}

function sortGames(games: GameSummary[], mode: SortMode): GameSummary[] {
  return [...games].sort((left, right) => {
    const nameA = String(left.world_name || left.game_key)
    const nameB = String(right.world_name || right.game_key)
    if (mode === 'name') return nameA.localeCompare(nameB)
    if (mode === 'round') {
      const diff = Number(right.round_number || 0) - Number(left.round_number || 0)
      if (diff !== 0) return diff
    }
    const aTime = activityTime(left)
    const bTime = activityTime(right)
    if (aTime === null && bTime === null) return nameA.localeCompare(nameB)
    if (aTime === null) return 1
    if (bTime === null) return -1
    const oldestFirst = mode === 'oldest'
    const diff = oldestFirst ? aTime - bTime : bTime - aTime
    if (diff !== 0) return diff
    return nameA.localeCompare(nameB)
  })
}

function OverviewContent({
  error,
  games,
  sorted,
  selected,
  refreshing,
  busy,
  mutedForeground,
  onRetry,
  onRefresh,
  onSelect,
  onRemove,
  onCreate,
  onOpen,
}: {
  error: string
  games: GameSummary[] | null
  sorted: GameSummary[]
  selected: Set<string>
  refreshing: boolean
  busy: boolean
  mutedForeground: string
  onRetry: () => void
  onRefresh: () => void
  onSelect: (key: string) => void
  onRemove: (key: string) => void
  onCreate: () => void
  onOpen: (key: string) => void
}) {
  if (error) {
    return (
      <View className="gap-3">
        <Text className="text-destructive">{error}</Text>
        <Button onPress={onRetry} className="self-start">
          <ButtonText>{strings.common.retry}</ButtonText>
        </Button>
      </View>
    )
  }

  if (games === null) {
    return (
      <View className="gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </View>
    )
  }

  if (sorted.length === 0) {
    return (
      <View className="mt-8 items-center gap-4">
        <Text variant="muted" className="text-center">
          {strings.overview.empty}
        </Text>
        <Button onPress={onCreate}>
          <ButtonText>创建第一个对局</ButtonText>
        </Button>
      </View>
    )
  }

  return (
    <FlashList
      data={sorted}
      keyExtractor={(item) => item.game_key}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mutedForeground} />
      }
      renderItem={({ item }) => {
        const isSelected = selected.has(item.game_key)
        return (
          <Pressable
            onPress={() => {
              if (selected.size > 0) {
                onSelect(item.game_key)
              } else {
                onOpen(item.game_key)
              }
            }}
            onLongPress={() => onSelect(item.game_key)}
            className={`mb-3 active:opacity-80 ${isSelected ? 'ring-2 ring-primary' : ''}`}
          >
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex-1">{item.world_name || item.game_key}</CardTitle>
                <Badge variant={gameStateVariant(item.state)}>
                  <BadgeText>{gameStateLabel(item.state)}</BadgeText>
                </Badge>
              </CardHeader>
              <CardContent className="flex-row gap-4">
                <Text variant="small">
                  {strings.overview.round} {item.round_number ?? 0}
                </Text>
                <Text variant="small">
                  {strings.overview.players} {item.player_count ?? 0}/{item.max_players ?? '-'}
                </Text>
                <Text variant="small" className="flex-1 text-right">
                  {item.last_activity?.slice(0, 10) ?? ''}
                </Text>
              </CardContent>
              {isSelected && (
                <CardContent className="pt-0">
                  <View className="flex-row gap-2">
                    <Button size="sm" variant="destructive" disabled={busy} onPress={() => onRemove(item.game_key)}>
                      <ButtonText>删除</ButtonText>
                    </Button>
                  </View>
                </CardContent>
              )}
            </Card>
          </Pressable>
        )
      }}
    />
  )
}

export default function OverviewScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const mutedForeground = useThemeToken('mutedForeground')

  const [games, setGames] = React.useState<GameSummary[] | null>(null)
  const [error, setError] = React.useState('')
  const [refreshing, setRefreshing] = React.useState(false)
  const [reloadToken, setReloadToken] = React.useState(0)
  const [sort, setSort] = React.useState<SortMode>('recent')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let active = true
    void (async () => {
      try {
        const result = await fetchGames()
        if (active) {
          setGames(result.games ?? [])
          setError('')
        }
      } catch (e) {
        if (active) setError(errorMessage(e))
      } finally {
        if (active) setRefreshing(false)
      }
    })()
    return () => {
      active = false
    }
  }, [reloadToken])

  // 聚焦时刷新（对齐 Web 的 onMounted load）
  React.useEffect(() => {
    return navigation.addListener('focus', () => setReloadToken((t) => t + 1))
  }, [navigation])

  function refresh() {
    setRefreshing(true)
    setReloadToken((t) => t + 1)
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function removeGame(key: string) {
    setBusy(true)
    try {
      await deleteGame(key)
      setGames((prev) => prev?.filter((g) => g.game_key !== key) ?? null)
      setSelected((prev) => {
        if (!prev.has(key)) return prev
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function batchRemove() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const result = await batchDeleteGames([...selected])
      const deleted = new Set(result.deleted)
      setGames((prev) => prev?.filter((g) => !deleted.has(g.game_key)) ?? null)
      setSelected(new Set())
      if (result.failed.length > 0) {
        setError(`删除完成：成功 ${result.deleted.length}，失败 ${result.failed.length}`)
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function onCreated(gameKey: string) {
    setReloadToken((t) => t + 1)
    router.push({ pathname: '/play/[gameKey]', params: { gameKey } })
  }

  // 统计
  const sorted = games ? sortGames(games, sort) : []
  const totalGames = games?.length ?? 0
  const activeGames = games?.filter((g) => ['active_action', 'active_judgment', 'waiting'].includes(g.state ?? '')).length ?? 0
  const totalPlayers = games?.reduce((sum, g) => sum + Number(g.player_count || 0), 0) ?? 0
  const totalRounds = games?.reduce((sum, g) => sum + Number(g.round_number || 0), 0) ?? 0

  return (
    <Screen className="px-4">
      <PageHeader
        title={strings.overview.title}
        className="px-0"
        right={
          <IconButton onPress={() => setCreateOpen(true)} accessibilityLabel="创建对局">
            <Plus size={22} className="text-foreground" />
          </IconButton>
        }
      />

      {/* 统计条 */}
      {games !== null && totalGames > 0 && (
        <View className="mb-3 flex-row gap-2">
          <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">总对局</Text>
            <Text className="font-mono text-lg font-semibold">{totalGames}</Text>
          </View>
          <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">进行中</Text>
            <Text className="font-mono text-lg font-semibold">{activeGames}</Text>
          </View>
          <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">玩家</Text>
            <Text className="font-mono text-lg font-semibold">{totalPlayers}</Text>
          </View>
          <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">回合</Text>
            <Text className="font-mono text-lg font-semibold">{totalRounds}</Text>
          </View>
        </View>
      )}

      {/* 排序 + 批量操作 */}
      {games !== null && totalGames > 0 && (
        <View className="mb-3 gap-2">
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Tabs value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                <TabsList>
                  <TabsTrigger value="recent">
                    <Text variant="small">最近</Text>
                  </TabsTrigger>
                  <TabsTrigger value="oldest">
                    <Text variant="small">最早</Text>
                  </TabsTrigger>
                  <TabsTrigger value="name">
                    <Text variant="small">名称</Text>
                  </TabsTrigger>
                  <TabsTrigger value="round">
                    <Text variant="small">回合</Text>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </View>
            {selected.size > 0 && (
              <IconButton onPress={batchRemove} accessibilityLabel="批量删除" disabled={busy}>
                <Trash2 size={20} className="text-destructive" />
              </IconButton>
            )}
          </View>
          {selected.size > 0 && (
            <View className="flex-row items-center justify-between">
              <Text variant="small">已选 {selected.size} 个对局</Text>
              <Pressable onPress={clearSelection}>
                <Text variant="small" className="text-primary">
                  清除选择
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <OverviewContent
        error={error}
        games={games}
        sorted={sorted}
        selected={selected}
        refreshing={refreshing}
        busy={busy}
        mutedForeground={mutedForeground}
        onRetry={() => setReloadToken((t) => t + 1)}
        onRefresh={refresh}
        onSelect={toggleSelect}
        onRemove={(key) => void removeGame(key)}
        onCreate={() => setCreateOpen(true)}
        onOpen={(key) => router.push({ pathname: '/play/[gameKey]', params: { gameKey: key } })}
      />

      <CreateGameSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
    </Screen>
  )
}
