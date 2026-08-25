import * as React from 'react'
import { ScrollView, View } from 'react-native'
import {
  ArrowLeftRight,
  ArrowUpFromLine,
  BookOpen,
  ChevronFirst,
  ChevronLast,
  CirclePower,
  Cog,
  Download,
  KeyRound,
  Link,
  ListRestart,
  MessageSquare,
  RefreshCw,
  Shield,
  ShieldOff,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { GameDetail, Multiplayer } from '@/api/types'
import { strings } from '@/lib/strings'

interface GmSheetProps {
  detail: GameDetail
  multiplayer?: Multiplayer
  busy: boolean
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
 * GM 工具托盘（对齐 Web GmToolbar 的完整功能子集）。
 * 按功能分区：流程、指令、玩家、模式、存档、私信。
 */
export function GmSheet({
  detail,
  multiplayer,
  busy,
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

  const players = multiplayer?.ready_players ?? []
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
      {/* 流程控制 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          流程
        </Text>
        <View className="flex-row gap-2">
          <Button className="flex-1" disabled={busy} onPress={onAdvance}>
            <Icon as={ChevronLast} size={16} />
            <Text>{strings.play.advance}</Text>
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onPress={onRollback}>
            <Icon as={ChevronFirst} size={16} />
            <Text>{strings.play.rollback}</Text>
          </Button>
        </View>
        <Button variant="outline" disabled={busy} onPress={onRecap}>
          <Icon as={BookOpen} size={16} />
          <Text>{strings.play.recap}</Text>
        </Button>
      </View>

      <Separator />

      {/* GM 指令 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          {strings.play.gmCommand}
        </Text>
        <View className="flex-row gap-2">
          <Input
            value={commandText}
            onChangeText={setCommandText}
            placeholder={strings.play.gmCommandPlaceholder}
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
          玩家
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          <Button variant="outline" className="flex-1" disabled={busy} onPress={onInvite}>
            <Icon as={Link} size={14} />
            <Text>{strings.play.inviteLink}</Text>
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onPress={onBotBind}>
            <Icon as={ArrowUpFromLine} size={14} />
            <Text>{strings.play.botBind}</Text>
          </Button>
        </View>
      </View>

      {/* 多人状态 */}
      {multiplayer?.player_count ? (
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            {strings.play.playerList} · {multiplayer.ready_count ?? 0}/{multiplayer.player_count} 已就绪
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
                    {strings.play.awayFollowing}
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
          {strings.play.mode}
        </Text>
        <Button variant="outline" disabled={busy} onPress={onToggleMode}>
          <Icon as={detail.solo_mode ? Users : UserCircle} size={14} />
          <Text>{detail.solo_mode ? '切换为多人' : '切换为单人'}</Text>
        </Button>
        <Button variant="outline" disabled={busy} onPress={onToggleAccess}>
          <Icon as={detail.player_access_open === false ? Shield : ShieldOff} size={14} />
          <Text>{detail.player_access_open === false ? '开放玩家加入' : '关闭玩家加入'}</Text>
        </Button>
        <Button variant="outline" disabled={busy} onPress={onRoomPassword}>
          <Icon as={KeyRound} size={14} />
          <Text>{detail.has_room_password ? '修改房间密码' : '设置房间密码'}</Text>
        </Button>
        <Button variant="outline" disabled={busy} onPress={onWorldSwitch}>
          <Icon as={ArrowLeftRight} size={14} />
          <Text>{strings.play.worldSwitch}</Text>
        </Button>
      </View>

      <Separator />

      {/* 存档 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          存档
        </Text>
        <Button variant="outline" disabled={busy} onPress={onExport}>
          <Icon as={Download} size={14} />
          <Text>{strings.play.export}</Text>
        </Button>
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onPress={onRestart}>
            <Icon as={RefreshCw} size={14} />
            <Text>{strings.play.restart}</Text>
          </Button>
          <Button variant="destructive" className="flex-1" disabled={busy} onPress={onReset}>
            <Icon as={ListRestart} size={14} />
            <Text>{strings.play.reset}</Text>
          </Button>
        </View>
      </View>

      <Separator />

      {/* 私信 */}
      <View className="gap-2">
        <Text variant="small" className="font-semibold text-muted-foreground">
          {strings.play.perception}
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
                  placeholder={strings.play.perceptionPlaceholder}
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
          <Text variant="muted">暂无玩家</Text>
        )}
      </View>
    </ScrollView>
  )
}
