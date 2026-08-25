import * as React from 'react'
import { View } from 'react-native'
import { ChevronFirst, ChevronLast, Terminal } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import { Icon } from '@/components/ui/icon'
import type { Multiplayer } from '@/api/types'
import { strings } from '@/lib/strings'

/** GM 工具（推进/回退/GM 指令 + 多人状态），对齐 Web GmToolbar 的 v1 子集 */
export function GmSheet({
  multiplayer,
  busy,
  onAdvance,
  onRollback,
  onCommand,
}: {
  multiplayer?: Multiplayer
  busy: boolean
  onAdvance: () => void
  onRollback: () => void
  onCommand: (text: string) => void
}) {
  const [commandText, setCommandText] = React.useState('')

  return (
    <View className="gap-4 pb-4">
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

      <Separator />

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
            onSubmitEditing={() => {
              if (commandText.trim()) {
                onCommand(commandText.trim())
                setCommandText('')
              }
            }}
          />
          <Button
            size="icon"
            disabled={busy || !commandText.trim()}
            onPress={() => {
              onCommand(commandText.trim())
              setCommandText('')
            }}
            accessibilityLabel={strings.play.gmCommand}
          >
            <Icon as={Terminal} size={18} />
          </Button>
        </View>
      </View>

      {multiplayer?.player_count ? (
        <>
          <Separator />
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold text-muted-foreground">
              多人状态 · {multiplayer.ready_count ?? 0}/{multiplayer.player_count} 已就绪
            </Text>
            {(multiplayer.ready_players ?? []).map((player) => (
              <Text key={player.user_id} className="text-sm">
                ✅ {player.character_name}
              </Text>
            ))}
            {(multiplayer.waiting_players ?? []).map((player) => (
              <Text key={player.user_id} className="text-sm text-muted-foreground">
                ⏳ {player.character_name}
              </Text>
            ))}
            {(multiplayer.away_players ?? []).map((player) => (
              <Text key={player.user_id} className="text-sm text-muted-foreground">
                💤 {player.character_name}（暂离）
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </View>
  )
}
