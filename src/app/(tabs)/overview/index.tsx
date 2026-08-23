import * as React from 'react'
import { Pressable, RefreshControl, View } from 'react-native'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Badge, BadgeText } from '@/components/ui/badge'
import { Button, ButtonText } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Text } from '@/components/ui/text'
import { errorMessage } from '@/api/client'
import { fetchGames } from '@/api/games'
import type { GameSummary } from '@/api/types'
import { useThemeToken } from '@/lib/theme-colors'
import { strings } from '@/lib/strings'

const STATE_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'info'> = {
  active_action: 'success',
  active_judgment: 'warning',
  waiting: 'secondary',
  paused: 'secondary',
  ended: 'default',
}

export default function OverviewScreen() {
  const router = useRouter()
  const mutedForeground = useThemeToken('mutedForeground')

  const [games, setGames] = React.useState<GameSummary[] | null>(null)
  const [error, setError] = React.useState('')
  const [refreshing, setRefreshing] = React.useState(false)
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let active = true
    async function run() {
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
    }
    run()
    return () => {
      active = false
    }
  }, [reloadToken])

  function retry() {
    setReloadToken((token) => token + 1)
  }

  function refresh() {
    setRefreshing(true)
    retry()
  }

  return (
    <Screen className="px-4">
      <PageHeader title={strings.overview.title} className="px-0" />

      {error ? (
        <View className="gap-3">
          <Text className="text-destructive">{error}</Text>
          <Button onPress={retry} className="self-start">
            <ButtonText>{strings.common.retry}</ButtonText>
          </Button>
        </View>
      ) : games === null ? (
        <View className="gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </View>
      ) : games.length === 0 ? (
        <Text variant="muted" className="mt-8 text-center">
          {strings.overview.empty}
        </Text>
      ) : (
        <FlashList
          data={games}
          keyExtractor={(item) => item.game_key}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={mutedForeground} />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/play/[gameKey]', params: { gameKey: item.game_key } })
              }
              className="mb-3 active:opacity-80"
            >
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex-1">{item.world_name || item.game_key}</CardTitle>
                  <Badge variant={STATE_VARIANT[item.state ?? ''] ?? 'secondary'}>
                    <BadgeText>{item.state || 'unknown'}</BadgeText>
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
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  )
}
