import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { Link, LogOut, UserMinus } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { GameDetail, Player } from '@/api/types'
import { strings } from '@/lib/strings'

interface MultiplayerPanelProps {
  players: Player[]
  detail: GameDetail
  isGm: boolean
  currentUserId?: string
  onKick: (uid: string) => void
  onSetAway: (uid: string, away: boolean) => void
  onCopyLink: (uid: string) => void
}

const ACTED_TONE = '#22c55e'
const WAITING_TONE = '#f59e0b'
const AWAY_TONE = '#6b7280'

function statusTone(player: Player, detail: GameDetail): string {
  const awaySet = new Set((detail.multiplayer?.away_players ?? []).map((p) => p.user_id))
  if (awaySet.has(player.user_id)) return AWAY_TONE
  const actedSet = new Set((detail.multiplayer?.submitted_actions ?? []).map((a) => a.user_id))
  if (actedSet.has(player.user_id)) return ACTED_TONE
  return WAITING_TONE
}

function statusLabel(player: Player, detail: GameDetail): string {
  const awaySet = new Set((detail.multiplayer?.away_players ?? []).map((p) => p.user_id))
  if (awaySet.has(player.user_id)) return strings.play.awayFollowing
  const actions = detail.multiplayer?.submitted_actions ?? []
  const action = actions.find((a) => a.user_id === player.user_id)
  if (action?.dice_pending) return strings.play.needsRoll
  if (action) return strings.play.acted
  return strings.play.waitingAction
}

/**
 * 多人管理面板（对齐 Web MultiplayerPanel：玩家列表 + GM 管理操作）。
 */
export function MultiplayerPanel({
  players,
  detail,
  isGm,
  currentUserId,
  onKick,
  onSetAway,
  onCopyLink,
}: MultiplayerPanelProps) {
  const awaySet = new Set((detail.multiplayer?.away_players ?? []).map((p) => p.user_id))
  const canKick = isGm && players.length > 1

  if (players.length === 0) {
    return (
      <Text variant="muted" className="py-6 text-center">
        暂无玩家
      </Text>
    )
  }

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 pb-6">
      <Text variant="small" className="font-semibold text-muted-foreground">
        {strings.play.playerList}（{players.length}）
      </Text>

      {players.map((player) => {
        const isAway = awaySet.has(player.user_id)
        const isSelf = player.user_id === currentUserId
        const isGmPlayer = player.user_id === detail.gm_uid
        const tone = statusTone(player, detail)
        const label = statusLabel(player, detail)

        return (
          <View key={player.user_id} className="rounded-lg border border-border bg-card p-3 gap-2">
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone }} />
              <Text className="flex-1 font-medium" numberOfLines={1}>
                {player.character_name || player.user_id}
              </Text>
              {isSelf && (
                <Text variant="small" className="text-primary">
                  我
                </Text>
              )}
              {isGmPlayer && (
                <Text variant="small" className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground">
                  GM
                </Text>
              )}
            </View>

            <Text variant="small" className="text-muted-foreground">
              {label}
            </Text>

            {isGm && (
              <>
                <Separator />
                <View className="flex-row gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onPress={() => onCopyLink(player.user_id)}>
                    <Icon as={Link} size={12} />
                    <Text variant="small">{strings.play.copyLink}</Text>
                  </Button>
                  {!isSelf && (
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => onSetAway(player.user_id, !isAway)}
                    >
                      <Icon as={LogOut} size={12} />
                      <Text variant="small">{isAway ? strings.play.back : strings.play.away}</Text>
                    </Button>
                  )}
                  {canKick && !isSelf && !isGmPlayer && (
                    <Button size="sm" variant="destructive" onPress={() => onKick(player.user_id)}>
                      <Icon as={UserMinus} size={12} />
                      <Text variant="small">{strings.play.kick}</Text>
                    </Button>
                  )}
                </View>
              </>
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}
