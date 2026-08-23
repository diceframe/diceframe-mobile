import * as React from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Menu, User } from 'lucide-react-native'

import { Screen } from '@/components/screen'
import { Badge, BadgeText } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { Sheet } from '@/components/ui/sheet'
import { Text } from '@/components/ui/text'
import { errorMessage } from '@/api/client'
import { ActionComposer } from '@/features/play/ActionComposer'
import { CharacterPanel } from '@/features/play/CharacterPanel'
import { GameTimeline } from '@/features/play/GameTimeline'
import { GmSheet } from '@/features/play/GmSheet'
import { useSpeaker } from '@/features/play/useSpeaker'
import { useVoiceInput } from '@/features/play/useVoiceInput'
import { strings } from '@/lib/strings'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import { selectGmThinking, useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

export default function PlayScreen() {
  const router = useRouter()
  const { gameKey } = useLocalSearchParams<{ gameKey: string }>()

  const detail = useGameStore((s) => s.detail)
  const players = useGameStore((s) => s.players)
  const loading = useGameStore((s) => s.loading)
  const error = useGameStore((s) => s.error)
  const log = useGameStore((s) => s.log)
  const logPage = useGameStore((s) => s.logPage)
  const logTotalPages = useGameStore((s) => s.logTotalPages)
  const liveNarration = useGameStore((s) => s.liveNarration)
  const streamStatus = useGameStore((s) => s.streamStatus)
  const isGm = useGameStore((s) => s.isGm)
  const userId = useGameStore((s) => s.userId)
  const ruleAttrs = useGameStore((s) => s.ruleAttrs)
  const ruleMeta = useGameStore((s) => s.ruleMeta)
  const actionBusy = useGameStore((s) => s.actionBusy)
  const ttsEnabled = useGameStore((s) => s.ttsEnabled)
  const gmThinking = useGameStore(selectGmThinking)

  const [draft, setDraft] = React.useState('')
  const [characterOpen, setCharacterOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [luckBusyId, setLuckBusyId] = React.useState('')

  const voice = useVoiceInput(gameKey, (text) => {
    setDraft((current) => (current ? `${current}${text}` : text))
  })
  const speaker = useSpeaker(gameKey)
  const keyboardHeight = useKeyboardHeight()

  const pendingLuck = detail?.pending_luck_decisions ?? []
  const submittedActions = detail?.multiplayer?.submitted_actions ?? []
  const myPlayer = players.find((player) => player.user_id === userId) ?? null

  React.useEffect(() => {
    if (gameKey) useGameStore.getState().enter(gameKey)
    return () => useGameStore.getState().leave()
  }, [gameKey])

  // 玩家身份失效（被踢/存档重置）时清掉本地身份、回加入页重新加入
  // （对齐 Web isStoredPlayerMember 检查；multiplayer 缺省的独占局不校验）
  React.useEffect(() => {
    if (isGm || !userId || !detail?.multiplayer) return
    const members = [
      ...(detail.multiplayer.ready_players ?? []),
      ...(detail.multiplayer.waiting_players ?? []),
      ...(detail.multiplayer.away_players ?? []),
    ]
    if (!members.some((player) => player.user_id === userId)) {
      useSettingsStore.getState().setShare(null)
      router.replace({ pathname: '/join' })
    }
  }, [isGm, userId, detail, router])

  async function send() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await useGameStore.getState().submit(text)
  }

  async function decideLuck(checkId: string, spend: boolean) {
    setLuckBusyId(checkId)
    try {
      await useGameStore.getState().decideLuck(checkId, spend)
    } finally {
      setLuckBusyId('')
    }
  }

  async function runGm(action: () => Promise<void>) {
    try {
      await action()
    } catch (e) {
      useGameStore.setState({ error: errorMessage(e) })
    }
  }

  const statusBadge =
    streamStatus === 'live' ? (
      <Badge variant="success">
        <BadgeText>{strings.play.connected}</BadgeText>
      </Badge>
    ) : streamStatus === 'degraded' ? (
      <Badge variant="warning">
        <BadgeText>{strings.play.polling}</BadgeText>
      </Badge>
    ) : (
      <Badge variant="secondary">
        <BadgeText>{strings.play.connecting}</BadgeText>
      </Badge>
    )

  return (
    <Screen className="gap-0">
      {/* 键盘避让：底部垫高键盘实际高度，输入区始终可见（见 use-keyboard-height 注释） */}
      <View className="flex-1" style={{ paddingBottom: keyboardHeight }}>
        {/* 顶栏 */}
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
          <IconButton
            className="h-9 w-9"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/overview'))}
            accessibilityLabel={strings.common.back}
            hitSlop={8}
          >
            <ChevronLeft size={22} className="text-foreground" />
          </IconButton>
          <View className="flex-1">
            <Text variant="h4" numberOfLines={1}>
              {detail?.world_name || gameKey}
            </Text>
            <Text variant="small" numberOfLines={1}>
              第 {detail?.round_number ?? '?'} 回合 · {detail?.state ?? '…'}
            </Text>
          </View>
          {statusBadge}
          <IconButton
            className="h-9 w-9"
            onPress={() => setCharacterOpen(true)}
            accessibilityLabel={strings.play.characterPanel}
          >
            <User size={20} className="text-foreground" />
          </IconButton>
          {isGm && (
            <IconButton
              className="h-9 w-9"
              onPress={() => setMenuOpen(true)}
              accessibilityLabel={strings.play.gmCommand}
            >
              <Menu size={20} className="text-foreground" />
            </IconButton>
          )}
        </View>

        {error ? (
          <Pressable
            className="px-3 py-1.5"
            onPress={() => void useGameStore.getState().refresh()}
          >
            {/* var() 令牌色不支持 /xx 透明度修饰符，用叠加层淡化 */}
            <View className="absolute inset-0 bg-destructive opacity-10" />
            <Text className="text-destructive" numberOfLines={1}>
              {error} · 点击重试
            </Text>
          </Pressable>
        ) : null}

        {/* 时间线 */}
        <View className="flex-1">
          <GameTimeline
            gameKey={gameKey}
            log={log}
            players={players}
            currentUserId={userId}
            loading={loading}
            logPage={logPage}
            logTotalPages={logTotalPages}
            pendingLuck={pendingLuck}
            luckBusy={!!luckBusyId}
            liveNarration={liveNarration}
            gmThinking={gmThinking}
            submittedActions={submittedActions}
            onLoadOlder={() => void useGameStore.getState().loadOlderLog()}
            onDecideLuck={(check, spend) =>
              void decideLuck(check.check_id ?? '', spend)
            }
            ttsEnabled={ttsEnabled}
            onSpeak={(text) => void speaker.speak(text)}
          />
        </View>

        {/* 输入区 */}
        <ActionComposer
          value={draft}
          onChangeText={setDraft}
          onSend={() => void send()}
          busy={actionBusy}
          quickActions={detail?.quick_actions ?? []}
          voice={voice}
        />
      </View>

      <Sheet open={characterOpen} onClose={() => setCharacterOpen(false)} className="h-[80%]">
        <View className="flex-1 gap-4 pt-1">
          <CharacterPanel
            gameKey={gameKey}
            player={myPlayer}
            ruleAttrs={ruleAttrs}
            ruleMeta={ruleMeta}
          />
        </View>
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <GmSheet
          multiplayer={detail?.multiplayer}
          busy={actionBusy}
          onAdvance={() => void runGm(() => useGameStore.getState().advance())}
          onRollback={() => void runGm(() => useGameStore.getState().rollback())}
          onCommand={(text) => void runGm(() => useGameStore.getState().command(text))}
        />
      </Sheet>
    </Screen>
  )
}
