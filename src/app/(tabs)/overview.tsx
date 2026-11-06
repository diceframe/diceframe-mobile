import * as React from 'react'
import { Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native'
import { GlassView } from 'expo-glass-effect'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation, useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { Check, ChevronDown, ChevronRight, ListChecks, LogIn, Plus, ScrollText, Trash2, X } from 'lucide-react-native'

import { PageHeader } from '@/components/page-header'
import { SceneCover } from '@/components/patterns/scene-cover'
import { StatusBadge } from '@/components/patterns/status-badge'
import { UpdateBell } from '@/components/patterns/update-bell'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { errorMessage } from '@/api/client'
import { batchDeleteGames, fetchGames } from '@/api/games'
import { gameSceneCoverSource } from '@/api/assets'
import type { GameSummary } from '@/api/types'
import { gameStateLabel, gameStateTone } from '@/lib/game-state'
import { featuredGame, sortGames, type GameSortMode } from '@/lib/game-sort'
import { withAlpha } from '@/lib/glass'
import { appLayoutForWidth } from '@/lib/layout'
import { confirmDestructive } from '@/lib/confirm'
import { useThemeToken } from '@/lib/theme'
import { useT } from '@/i18n/t'
import { useAppUpdates } from '@/hooks/useAppUpdates'
import { useTabBarOverlap } from '@/lib/tab-bar-overlap'

const styles = StyleSheet.create({
  infoPanel: {
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    // borderColor 由 useThemeToken('border') 注入：硬编码白描边在浅色主题下不可读
    padding: 14,
    overflow: 'hidden',
  },
})

/**
 * 首页顶部的「最近 / 进行中的冒险」（对齐 Web OverviewView 的 overview-featured）：
 * 场景大图 + 标题、当前场景、轮次 / 玩家 / 状态，和一个直接进入的主按钮。
 */
function FeaturedGameCard({ game, coverBase, onOpen }: { game: GameSummary; coverBase: string; onOpen: () => void }) {
  const t = useT()
  const name = game.world_name || game.game_key
  return (
    <Card className="mb-4 gap-0 overflow-hidden p-0">
      <SceneCover
        source={gameSceneCoverSource(game.game_key, game.rule_id)}
        className="absolute inset-0"
        accessibilityLabel={t('dfOverviewCoverA11y', { name })}
      />
      {/* 图的下半段压一层卡片底色，文字落在渐变上，浅色 / 深色主题都读得清 */}
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(coverBase, 0), withAlpha(coverBase, 0.82), withAlpha(coverBase, 0.95)]}
        locations={[0.05, 0.42, 0.75]}
        style={StyleSheet.absoluteFill}
      />
      <View className="min-h-[260px] justify-end gap-1.5 p-4">
        <Text className="text-xs font-semibold tracking-wider text-primary">{t('recentAdventures')}</Text>
        <Text className="font-display text-2xl font-semibold text-foreground" numberOfLines={2}>
          {name}
        </Text>
        <Text variant="small" numberOfLines={1}>
          {game.scene || t('notStarted')}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Text variant="small">
            {t('roundPrefix')}{game.round_number ?? 0}{t('roundSuffix')}
          </Text>
          <Text variant="small">
            {t('players')} {game.player_count ?? 0}/{game.max_players ?? '-'}
          </Text>
          <StatusBadge tone={gameStateTone(game.state)}>{gameStateLabel(game.state)}</StatusBadge>
        </View>
        <Button size="lg" className="mt-3" onPress={onOpen} accessibilityLabel={`${t('enter')} ${name}`}>
          <Text>{t('enter')}</Text>
          <Icon as={LogIn} size={18} />
        </Button>
      </View>
    </Card>
  )
}

function OverviewContent({
  error,
  games,
  sorted,
  selected,
  managing,
  refreshing,
  mutedForeground,
  coverBase,
  columns,
  header,
  onRetry,
  onRefresh,
  onSelect,
  onCreate,
  onOpen,
}: {
  error: string
  games: GameSummary[] | null
  sorted: GameSummary[]
  selected: Set<string>
  managing: boolean
  refreshing: boolean
  mutedForeground: string
  coverBase: string
  columns: 1 | 2 | 3
  /** 列表头：最近冒险 / 存档统计 / 排序与管理，随列表一起滚动 */
  header: React.ReactElement | null
  onRetry: () => void
  onRefresh: () => void
  onSelect: (key: string) => void
  onCreate: () => void
  onOpen: (key: string) => void
}) {
  // 悬浮胶囊标签栏盖住的底部高度：列表滑到胶囊下面，滚到底时最后一张卡不被挡住
  const tabBarOverlap = useTabBarOverlap()
  const t = useT()
  const border = useThemeToken('border')

  if (error) {
    return (
      <View className="gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
        <Text className="text-destructive">{error}</Text>
        <Button onPress={onRetry} className="self-start" variant="outline" size="sm">
          <Text>{t('dfCommonRetry')}</Text>
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
      <View className="mt-10 items-center gap-4">
        <View className="h-20 w-20 items-center justify-center rounded-full border border-dashed border-border bg-muted/50">
          <Icon as={ScrollText} size={30} className="text-muted-foreground" />
        </View>
        <Text variant="muted" className="text-center">
          {t('dfOverviewEmpty')}
        </Text>
        <Button onPress={onCreate}>
          <Text>{t('dfOverviewCreateFirst')}</Text>
        </Button>
      </View>
    )
  }

  return (
    <FlashList
      key={`game-grid-${columns}`}
      data={sorted}
      numColumns={columns}
      ListHeaderComponent={header}
      keyExtractor={(item) => item.game_key}
      contentContainerStyle={{ paddingBottom: 32 + tabBarOverlap }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mutedForeground} />
      }
      renderItem={({ item }) => {
        const isSelected = selected.has(item.game_key)
        return (
          <Pressable
            onPress={() => {
              if (managing) {
                onSelect(item.game_key)
              } else {
                onOpen(item.game_key)
              }
            }}
            accessibilityRole={managing ? 'checkbox' : 'button'}
            accessibilityState={managing ? { checked: isSelected } : undefined}
            accessibilityLabel={item.world_name || item.game_key}
            className="mb-3 flex-1 active:opacity-80"
            style={columns > 1 ? { marginHorizontal: 6 } : undefined}
          >
            <Card
              className={`gap-2 overflow-hidden p-0 ${isSelected ? 'border-[3px] border-primary' : ''}`}
            >
              <SceneCover
                source={gameSceneCoverSource(item.game_key, item.rule_id)}
                className="absolute inset-0"
                accessibilityLabel={t('dfOverviewCoverA11y', { name: item.world_name || item.game_key })}
              />
              {managing && (
                <View
                  pointerEvents="none"
                  className={`absolute left-3 top-3 z-10 h-9 w-9 items-center justify-center rounded-full border-2 shadow-sm shadow-black/20 ${
                    isSelected ? 'border-primary bg-primary' : 'border-primary bg-card'
                  }`}
                >
                  {isSelected ? (
                    <Icon as={Check} size={19} className="text-primary-foreground" />
                  ) : null}
                </View>
              )}
              <View className="min-h-[196px] justify-end p-3">
                <GlassView
                  glassEffectStyle="regular"
                  tintColor={coverBase}
                  pointerEvents="box-none"
                  style={[styles.infoPanel, { backgroundColor: `${coverBase}E6`, borderColor: border }]}
                >
                  <CardHeader className="flex-row items-start justify-between">
                    <CardTitle className="flex-1">
                      {item.world_name || item.game_key}
                    </CardTitle>
                    <StatusBadge tone={gameStateTone(item.state)} className="mt-0.5">
                      {gameStateLabel(item.state)}
                    </StatusBadge>
                  </CardHeader>
                  <CardContent className="flex-row flex-wrap gap-x-4 gap-y-1">
                    <Text variant="small">
                      {t('dfOverviewRound')} {item.round_number ?? 0}
                    </Text>
                    <Text variant="small">
                      {t('players')} {item.player_count ?? 0}/{item.max_players ?? '-'}
                    </Text>
                    <Text variant="small" className="flex-1 text-right">
                      {item.last_activity?.slice(0, 10) ?? ''}
                    </Text>
                  </CardContent>
                </GlassView>
              </View>
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
  const t = useT()
  const { width } = useWindowDimensions()
  const { gameListColumns } = appLayoutForWidth(width)
  const mutedForeground = useThemeToken('mutedForeground')
  const coverBase = useThemeToken('card')
  const updates = useAppUpdates({ autoCheck: true })

  const [games, setGames] = React.useState<GameSummary[] | null>(null)
  const [error, setError] = React.useState('')
  const [refreshing, setRefreshing] = React.useState(false)
  const [reloadToken, setReloadToken] = React.useState(0)
  const [sort, setSort] = React.useState<GameSortMode>('recent')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [managing, setManaging] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [statsOpen, setStatsOpen] = React.useState(true)

  function openCreate() {
    router.push('/create')
  }

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
    return navigation.addListener('focus', () => {
      setReloadToken((t) => t + 1)
      void updates.check({ automatic: true })
    })
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

  function toggleManaging() {
    if (managing) clearSelection()
    setManaging((value) => !value)
  }

  function manageSelect(key: string) {
    setManaging(true)
    toggleSelect(key)
  }

  async function batchRemove() {
    if (selected.size === 0) return
    const confirmed = await confirmDestructive({
      title: t('dfOverviewBatchDeleteTitle'),
      message: t('dfOverviewBatchDeleteMessage'),
      confirmText: t('dfCommonConfirm'),
      cancelText: t('dfCommonCancel'),
    })
    if (!confirmed) return
    setBusy(true)
    try {
      const result = await batchDeleteGames([...selected])
      const deleted = new Set(result.deleted)
      setGames((prev) => prev?.filter((g) => !deleted.has(g.game_key)) ?? null)
      setSelected(new Set())
      if (result.failed.length > 0) {
        setError(t('dfOverviewBatchResult', { ok: result.deleted.length, failed: result.failed.length }))
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // 统计
  const sorted = games ? sortGames(games, sort) : []
  const totalGames = games?.length ?? 0
  const activeGames = games?.filter((g) => ['active_action', 'active_judgment', 'waiting'].includes(g.state ?? '')).length ?? 0
  const totalPlayers = games?.reduce((sum, g) => sum + Number(g.player_count || 0), 0) ?? 0
  const totalRounds = games?.reduce((sum, g) => sum + Number(g.round_number || 0), 0) ?? 0

  const featured = games ? featuredGame(games) : null
  // 列表头随存档列表一起滚动：首屏先看到最近的冒险，往下才是统计、排序和全部存档
  const listHeader = featured ? (
    <View>
      <FeaturedGameCard
        game={featured}
        coverBase={coverBase}
        onOpen={() => router.push({ pathname: '/play/[gameKey]', params: { gameKey: featured.game_key } })}
      />

      {/* 存档统计（对齐 Web 的 archiveStats 折叠区）：窄卡片不放图标，纯「标签 + 数字」两行最透气 */}
      <Pressable
        onPress={() => setStatsOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: statsOpen }}
        hitSlop={8}
        className="mb-2 flex-row items-center gap-1 self-start active:opacity-70"
      >
        <Icon as={statsOpen ? ChevronDown : ChevronRight} size={14} className="text-muted-foreground" />
        <Text variant="small" className="font-semibold">{t('archiveStats')}</Text>
      </Pressable>
      {statsOpen && (
        <View className="mb-3 flex-row gap-2">
          <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{t('dfOverviewStatTotal')}</Text>
            <Text className="font-mono text-lg font-semibold text-primary">{totalGames}</Text>
          </View>
          <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{t('activeGames')}</Text>
            <Text className="font-mono text-lg font-semibold text-primary">{activeGames}</Text>
          </View>
          <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{t('players')}</Text>
            <Text className="font-mono text-lg font-semibold text-primary">{totalPlayers}</Text>
          </View>
          <View className="flex-1 rounded-md border border-border bg-muted px-3 py-2">
            <Text variant="small">{t('dfOverviewRound')}</Text>
            <Text className="font-mono text-lg font-semibold text-primary">{totalRounds}</Text>
          </View>
        </View>
      )}

      {/* 排序与管理态分行：窄屏不让四段排序和操作按钮互相挤压 */}
      <View className="mb-4 gap-3">
        {!managing ? (
          <View className="flex-row items-center gap-2">
            <Tabs
              value={sort}
              onValueChange={(v) => setSort(v as GameSortMode)}
              className="min-w-0 flex-1"
            >
              <TabsList className="mr-0 w-full">
                <TabsTrigger value="recent" className="min-w-0 flex-1 px-1">
                  <Text variant="small">{t('dfOverviewSortRecent')}</Text>
                </TabsTrigger>
                <TabsTrigger value="oldest" className="min-w-0 flex-1 px-1">
                  <Text variant="small">{t('dfOverviewSortOldest')}</Text>
                </TabsTrigger>
                <TabsTrigger value="name" className="min-w-0 flex-1 px-1">
                  <Text variant="small">{t('dfOverviewSortName')}</Text>
                </TabsTrigger>
                <TabsTrigger value="round" className="min-w-0 flex-1 px-1">
                  <Text variant="small">{t('dfOverviewRound')}</Text>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              className="h-11 px-3"
              onPress={toggleManaging}
              accessibilityLabel={t('dfOverviewManage')}
            >
              <Icon as={ListChecks} size={16} />
              <Text>{t('dfOverviewManage')}</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-3 rounded-xl border border-primary bg-muted p-3">
            <View className="flex-row items-start gap-3">
              <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-primary">
                <Icon as={ListChecks} size={18} className="text-primary-foreground" />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-semibold">
                  {selected.size > 0
                    ? t('dfOverviewSelectedCount', { count: selected.size })
                    : t('dfOverviewManage')}
                </Text>
                <Text variant="small">{t('dfOverviewManageHint')}</Text>
              </View>
              <Button variant="secondary" size="sm" onPress={toggleManaging}>
                <Text>{t('finish')}</Text>
              </Button>
            </View>

            {selected.size > 0 && (
              <View className="flex-row justify-end gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onPress={clearSelection}>
                  <Icon as={X} size={16} />
                  <Text>{t('clearSelection')}</Text>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={batchRemove}
                  accessibilityLabel={t('dfOverviewBatchDeleteA11y')}
                  disabled={busy}
                >
                  <Icon as={Trash2} size={16} />
                  <Text>{t('dfCommonDelete')}</Text>
                </Button>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  ) : null

  return (
    <Screen
      className="px-4"
      style={{ width: '100%', maxWidth: 1280, alignSelf: 'center' }}
    >
      <PageHeader
        title={t('dfOverviewTitle')}
        className="px-0"
        right={
          <View className="flex-row items-center gap-2">
            {updates.result?.isNewer ? (
              <UpdateBell
                version={updates.result.latestVersion}
                onPress={() => router.push('/(profile)/settings/updates')}
              />
            ) : null}
            <Button size="sm" onPress={openCreate} accessibilityLabel={t('dfOverviewNew')}>
              <Icon as={Plus} size={16} />
              <Text>{t('dfOverviewNew')}</Text>
            </Button>
          </View>
        }
      />

      <OverviewContent
        error={error}
        games={games}
        sorted={sorted}
        selected={selected}
        managing={managing}
        refreshing={refreshing}
        mutedForeground={mutedForeground}
        coverBase={coverBase}
        columns={gameListColumns}
        header={listHeader}
        onRetry={() => setReloadToken((t) => t + 1)}
        onRefresh={refresh}
        onSelect={manageSelect}
        onCreate={openCreate}
        onOpen={(key) => router.push({ pathname: '/play/[gameKey]', params: { gameKey: key } })}
      />
    </Screen>
  )
}
