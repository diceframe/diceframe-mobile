import * as React from 'react'
import { X } from 'lucide-react-native'
import { View } from 'react-native'

import type { TableTalkExchange } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { useGameStore } from '@/stores/game'

export interface TableTalkPanelProps {
  gameKey: string
}

/** 放在行动区旁的独立频道，不合并到叙事时间线或普通回合日志。 */
export function TableTalkPanel({ gameKey }: TableTalkPanelProps) {
  const currentGame = useGameStore((state) => state.gameKey)
  const revision = useGameStore((state) => state.tableTalkRevision)
  const exchanges = useGameStore((state) => state.tableTalk)
  const error = useGameStore((state) => state.tableTalkError)
  const loading = useGameStore((state) => state.tableTalkLoading)
  if (gameKey !== currentGame || (!exchanges.length && !error)) return null
  return <TableTalkFeed key={revision} exchanges={exchanges} error={error} loading={loading} />
}

function TableTalkFeed({ exchanges, error, loading }: {
  exchanges: TableTalkExchange[]
  error: string
  loading: boolean
}) {
  const t = useT()
  const [expanded, setExpanded] = React.useState(false)
  const [dismissedThrough, setDismissedThrough] = React.useState<string | null>(null)
  const latestId = exchanges.at(-1)?.id ?? null
  if (!error && dismissedThrough === latestId) return null
  const visible = expanded ? exchanges : exchanges.slice(-2)

  return (
    <View accessibilityLiveRegion="polite" className="my-3 gap-3 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-sm font-semibold text-primary">{t('tableTalkTitle')}</Text>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel={t('close')}
          disabled={!!error}
          onPress={() => { setDismissedThrough(latestId); setExpanded(false) }}
        >
          <Icon as={X} className="size-4 text-muted-foreground" />
        </Button>
      </View>
      {visible.map((exchange) => (
        <View key={exchange.id} className="gap-3 border-l-2 border-primary/30 pl-3">
          <View className="gap-1">
            <Text className="text-xs font-semibold text-muted-foreground">{exchange.actor_name}</Text>
            <Text selectable className="text-sm leading-5">{exchange.question}</Text>
          </View>
          <View className="gap-1">
            <Text className="text-xs font-semibold text-primary">{t('tableTalkGm')}</Text>
            <Text selectable className="text-sm leading-6">{exchange.answer}</Text>
          </View>
        </View>
      ))}
      {error ? (
        <View className="gap-2">
          <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text>
          <Button variant="outline" size="sm" disabled={loading} onPress={() => void useGameStore.getState().refreshTableTalk()}>
            <Text>{t('retry')}</Text>
          </Button>
        </View>
      ) : null}
      {exchanges.length > 2 ? (
        <Button variant="ghost" size="sm" onPress={() => setExpanded(!expanded)}>
          <Text>{expanded ? t('tableTalkCollapse') : t('tableTalkExpand', { count: exchanges.length })}</Text>
        </Button>
      ) : null}
    </View>
  )
}
