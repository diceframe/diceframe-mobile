import * as React from 'react'
import { ScrollView, View } from 'react-native'
import {
  ArrowLeftRight,
  ArrowUpFromLine,
  BookOpen,
  ChevronFirst,
  ChevronLast,
  Download,
  KeyRound,
  Link,
  ListRestart,
  MessageSquare,
  RefreshCw,
  Shield,
  ShieldOff,
  UserCircle,
  Users,
} from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { GameDetail, Multiplayer } from '@/api/types'
import { useT } from '@/i18n/t'

interface GmSheetProps {
  detail: GameDetail
  multiplayer?: Multiplayer
  busy: boolean
  showFlowControls?: boolean
  showPlayerRoster?: boolean
  onAdvance: () => void
  onRollback: () => void
  onCommand: (text: string) => void
  onRecap: () => void
  onBotBind: () => void
  onInvite: () => void
  onToggleMode: () => void
  onToggleAccess: () => void
  onRoomPassword: () => void
  onWorldSwitch: () => void
  onExport: () => void
  onReset: () => void
  onRestart: () => void
  onPerception: (uid: string, text: string) => void
}

/**
 * GM 桌面管理托盘。
 * 高频流程可由对局页常驻控制条承载；这里集中放指令、房间、存档和私密感知。
 */
export function GmSheet({
  detail,
  multiplayer,
  busy,
  showFlowControls = true,
  showPlayerRoster = true,
  onAdvance,
  onRollback,
  onCommand,
  onRecap,
  onBotBind,
  onInvite,
  onToggleMode,
  onToggleAccess,
  onRoomPassword,
  onWorldSwitch,
  onExport,
  onReset,
  onRestart,
  onPerception,
}: GmSheetProps) {
  const [commandText, setCommandText] = React.useState('')
  const [perceptionTarget, setPerceptionTarget] = React.useState('')
  const [perceptionText, setPerceptionText] = React.useState('')
  const t = useT()

  const allPlayers = [
    ...(multiplayer?.ready_players ?? []),
    ...(multiplayer?.waiting_players ?? []),
    ...(multiplayer?.away_players ?? []),
  ]

  function submitCommand() {
    if (commandText.trim()) {
      onCommand(commandText.trim())
      setCommandText('')
    }
  }

  function submitPerception() {
    if (perceptionTarget && perceptionText.trim()) {
      onPerception(perceptionTarget, perceptionText.trim())
      setPerceptionText('')
    }
  }

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-6">
      {showFlowControls && (
        <>
          {/* 流程控制 */}
          <View className="gap-2">
            <Text variant="small" className="font-semibold text-muted-foreground">
              {t('dfPlayFlow')}
            </Text>
            <View className="flex-row gap-2">
              <Button className="flex-1" disabled={busy} onPress={onAdvance}>
                <Icon as={ChevronLast} size={16} />
                <Text>{t('dfPlayAdvance')}</Text>
              </Button>
              <Button variant="outline" className="flex-1" disabled={busy} onPress={onRollback}>
                <Icon as={ChevronFirst} size={16} />
                <Text>{t('dfPlayRollback')}</Text>
              </Button>
            </View>
          </View>
          <Separator />
        </>
      )}

      <Button variant="outline" disabled={busy} onPress={onRecap}>
        <Icon as={BookOpen} size={16} />
        <Text>{t('dfPlayRecap')}</Text>
      </Button>

      {/* GM 指令 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          {t('dfPlayGmCommand')}
        </Text>
        <View className="flex-row gap-2">
          <Input
            value={commandText}
            onChangeText={setCommandText}
            placeholder={t('dfPlayGmCommandPlaceholder')}
            className="flex-1"
            autoCapitalize="none"
            editable={!busy}
            onSubmitEditing={submitCommand}
          />
          <Button size="icon" disabled={busy || !commandText.trim()} onPress={submitCommand}>
            <Icon as={ChevronLast} size={18} />
          </Button>
        </View>
      </View>

      <Separator />

      {/* 玩家 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          {t('players')}
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          <Button variant="outline" className="flex-1" disabled={busy} onPress={onInvite}>
            <Icon as={Link} size={14} />
            <Text>{t('inviteLink')}</Text>
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onPress={onBotBind}>
            <Icon as={ArrowUpFromLine} size={14} />
            <Text>{t('dfPlayBotBind')}</Text>
          </Button>
        </View>
      </View>

      {/* 多人状态 */}
      {showPlayerRoster && multiplayer?.player_count ? (
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            {t('dfPlayPlayerListReady', {
              ready: multiplayer.ready_count ?? 0,
              total: multiplayer.player_count,
            })}
          </Text>
          {allPlayers.map((player) => {
            const isAway = multiplayer.away_players?.some((p) => p.user_id === player.user_id)
            return (
              <View key={player.user_id} className="flex-row items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: isAway ? '#6b7280' : '#22c55e' }} />
                <Text className="flex-1 text-sm" numberOfLines={1}>
                  {player.character_name}
                </Text>
                {isAway && (
                  <Text variant="small" className="text-muted-foreground">
                    {t('dfPlayAwayFollowing')}
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      ) : null}

      <Separator />

      {/* 模式 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          {t('mode')}
        </Text>
        <Button variant="outline" disabled={busy} onPress={onToggleMode}>
          <Icon as={detail.solo_mode ? Users : UserCircle} size={14} />
          <Text>{detail.solo_mode ? t('dfPlaySwitchToMulti') : t('dfPlaySwitchToSolo')}</Text>
        </Button>
        <Button variant="outline" disabled={busy} onPress={onToggleAccess}>
          <Icon as={detail.player_access_open === false ? Shield : ShieldOff} size={14} />
          <Text>{detail.player_access_open === false ? t('dfPlayOpenAccess') : t('dfPlayCloseAccess')}</Text>
        </Button>
        <Button variant="outline" disabled={busy} onPress={onRoomPassword}>
          <Icon as={KeyRound} size={14} />
          <Text>{detail.has_room_password ? t('dfPlayRoomPasswordEdit') : t('dfPlayRoomPasswordSet')}</Text>
        </Button>
        <Button variant="outline" disabled={busy} onPress={onWorldSwitch}>
          <Icon as={ArrowLeftRight} size={14} />
          <Text>{t('dfPlayWorldSwitch')}</Text>
        </Button>
      </View>

      <Separator />

      {/* 存档 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          {t('dfPlaySaveSection')}
        </Text>
        <Button variant="outline" disabled={busy} onPress={onExport}>
          <Icon as={Download} size={14} />
          <Text>{t('dfPlayExport')}</Text>
        </Button>
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onPress={onRestart}>
            <Icon as={RefreshCw} size={14} />
            <Text>{t('dfPlayRestart')}</Text>
          </Button>
          <Button variant="destructive" className="flex-1" disabled={busy} onPress={onReset}>
            <Icon as={ListRestart} size={14} />
            <Text>{t('dfPlayReset')}</Text>
          </Button>
        </View>
      </View>

      <Separator />

      {/* 私信 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          {t('dfPlayPerception')}
        </Text>
        {allPlayers.length > 0 ? (
          <>
            <View className="flex-row flex-wrap gap-1.5">
              {allPlayers.map((player) => (
                <Button
                  key={player.user_id}
                  size="sm"
                  variant={perceptionTarget === player.user_id ? 'default' : 'outline'}
                  onPress={() =>
                    setPerceptionTarget(perceptionTarget === player.user_id ? '' : player.user_id)
                  }
                >
                  <Text variant="small">{player.character_name}</Text>
                </Button>
              ))}
            </View>
            {perceptionTarget && (
              <View className="flex-row gap-2">
                <Input
                  value={perceptionText}
                  onChangeText={setPerceptionText}
                  placeholder={t('dfPlayPerceptionPlaceholder')}
                  className="flex-1"
                  autoCapitalize="none"
                  editable={!busy}
                  onSubmitEditing={submitPerception}
                />
                <Button
                  size="icon"
                  disabled={busy || !perceptionText.trim()}
                  onPress={submitPerception}
                >
                  <Icon as={MessageSquare} size={16} />
                </Button>
              </View>
            )}
          </>
        ) : (
          <Text variant="muted">{t('dfPlayNoPlayers')}</Text>
        )}
      </View>
    </ScrollView>
  )
}
