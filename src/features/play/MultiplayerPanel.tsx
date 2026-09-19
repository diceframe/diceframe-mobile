import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { Bot, Link, LogOut, UserMinus, UserRound } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { GameDetail, Player } from '@/api/types'
import { useT, type T } from '@/i18n/t'
import {
  controlToggleFor,
  isTemporaryHost,
  playerControlMode,
  type PlayerControlMode,
} from '@/lib/player-control'
import { cn } from '@/lib/utils'

interface MultiplayerPanelProps {
  players: Player[]
  detail: GameDetail
  isGm: boolean
  currentUserId?: string
  onKick: (uid: string) => void
  onSetAway: (uid: string, away: boolean) => void
  onSetControl: (uid: string, mode: 'ai' | 'human') => void
  onCopyLink: (uid: string) => void
  /** 服务器正在为这个席位接管：控制权切换请求还没回来 */
  hostingUid?: string
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

/** 控制方式徽标：AI 临时托管（暂离触发）与 AI 托管（GM 决定）要分得开。 */
function controlBadge(player: Player, t: T): string {
  const mode = playerControlMode(player)
  if (mode === 'ai') return isTemporaryHost(player) ? t('controlAiTemporary') : t('controlAi')
  if (mode === 'unclaimed') return t('controlUnclaimed')
  return t('controlHuman')
}

const CONTROL_BADGE_CLASS: Record<PlayerControlMode, string> = {
  human: 'border-border text-muted-foreground',
  ai: 'border-primary text-primary',
  unclaimed: 'border-dashed border-border text-muted-foreground',
}

function statusLabel(player: Player, detail: GameDetail, t: T): string {
  const awaySet = new Set((detail.multiplayer?.away_players ?? []).map((p) => p.user_id))
  if (awaySet.has(player.user_id)) return t('dfPlayAwayFollowing')
  const actions = detail.multiplayer?.submitted_actions ?? []
  const action = actions.find((a) => a.user_id === player.user_id)
  if (action?.dice_pending) return t('dfPlayNeedsRoll')
  if (action) return t('dfPlayActed')
  return t('dfStateWaiting')
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
  onSetControl,
  onCopyLink,
  hostingUid,
}: MultiplayerPanelProps) {
  const awaySet = new Set((detail.multiplayer?.away_players ?? []).map((p) => p.user_id))
  const canKick = isGm && players.length > 1
  const t = useT()

  if (players.length === 0) {
    return (
      <Text variant="muted" className="py-6 text-center">
        {t('dfPlayNoPlayers')}
      </Text>
    )
  }

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 pb-6">
      <Text variant="small" className="font-semibold text-muted-foreground">
        {t('dfPlayPlayerListCount', { count: players.length })}
      </Text>

      {players.map((player) => {
        const isAway = awaySet.has(player.user_id)
        const isSelf = player.user_id === currentUserId
        const isGmPlayer = player.user_id === detail.gm_uid
        const hosting = Boolean(hostingUid) && player.user_id === hostingUid
        const controlMode = playerControlMode(player)
        const controlToggle = controlToggleFor(player)
        const tone = hosting ? WAITING_TONE : statusTone(player, detail)
        const label = hosting ? t('controlAiTakingOver') : statusLabel(player, detail, t)

        return (
          <View key={player.user_id} className="rounded-xl border border-border bg-card p-3 gap-2">
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone }} />
              <Text className="flex-1 font-medium" numberOfLines={1}>
                {player.character_name || player.user_id}
              </Text>
              {isSelf && (
                <Text variant="small" className="text-primary">
                  {t('dfPlayMe')}
                </Text>
              )}
              {isGmPlayer && (
                <Text variant="small" className="rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground">
                  GM
                </Text>
              )}
              <Text
                variant="small"
                className={cn('rounded-sm border px-1.5 py-0.5', CONTROL_BADGE_CLASS[controlMode])}
              >
                {controlBadge(player, t)}
              </Text>
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
                    <Text variant="small">{t('dfPlayCopyLink')}</Text>
                  </Button>
                  {!isSelf && (
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => onSetAway(player.user_id, !isAway)}
                    >
                      <Icon as={LogOut} size={12} />
                      <Text variant="small">{isAway ? t('dfPlayBackToGame') : t('away')}</Text>
                    </Button>
                  )}
                  {controlToggle && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={hosting}
                      onPress={() => onSetControl(player.user_id, controlToggle)}
                    >
                      <Icon as={controlToggle === 'ai' ? Bot : UserRound} size={12} />
                      <Text variant="small">
                        {controlToggle === 'ai' ? t('controlSetAi') : t('controlStopAi')}
                      </Text>
                    </Button>
                  )}
                  {canKick && !isSelf && !isGmPlayer && (
                    <Button size="sm" variant="destructive" onPress={() => onKick(player.user_id)}>
                      <Icon as={UserMinus} size={12} />
                      <Text variant="small">{t('dfPlayKick')}</Text>
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
