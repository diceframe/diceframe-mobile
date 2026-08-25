import * as React from 'react'
import { AppState, Pressable, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Mail, Menu, Route, User } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Sheet } from '@/components/patterns/sheet'
import { StatusBadge } from '@/components/patterns/status-badge'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { errorMessage } from '@/api/client'
import { ActionComposer } from '@/features/play/ActionComposer'
import { CharacterPanel } from '@/features/play/CharacterPanel'
import { GameTimeline } from '@/features/play/GameTimeline'
import { GmSheet } from '@/features/play/GmSheet'
import { MapWorkspace } from '@/features/play/MapWorkspace'
import { PlotTracker } from '@/features/play/PlotTracker'
import { PrivateMessagePanel } from '@/features/play/PrivateMessagePanel'
import { useSpeaker } from '@/features/play/useSpeaker'
import { useVoiceInput } from '@/features/play/useVoiceInput'
import { appendActionText } from '@/lib/action-text'
import { gameStateLabel } from '@/lib/game-state'
import { appLayoutForWidth } from '@/lib/layout'
import { strings } from '@/lib/strings'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import { selectGmThinking, useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

export default function PlayScreen() {
  const router = useRouter()
  const { gameKey } = useLocalSearchParams<{ gameKey: string }>()
  const { width } = useWindowDimensions()
  const { isWideTablet, gameSidebarWidth } = appLayoutForWidth(width)

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
  const map = useGameStore((s) => s.map)
  const plotTracker = useGameStore((s) => s.detail?.plot_tracker)
  const actionBusy = useGameStore((s) => s.actionBusy)
  const ttsEnabled = useGameStore((s) => s.ttsEnabled)
  const gmThinking = useGameStore(selectGmThinking)

  const [draft, setDraft] = React.useState('')
  const [characterOpen, setCharacterOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [sidebarTab, setSidebarTab] = React.useState<'plot' | 'map'>('plot')
  const [privateMessageOpen, setPrivateMessageOpen] = React.useState(false)
  const [luckBusyId, setLuckBusyId] = React.useState('')

  const voice = useVoiceInput(gameKey, (text) => {
    setDraft((current) => appendActionText(current, text))
  })
  const speaker = useSpeaker(gameKey)
  const keyboardHeight = useKeyboardHeight()
  const insets = useSafeAreaInsets()

  const pendingLuck = detail?.pending_luck_decisions ?? []
  const submittedActions = detail?.multiplayer?.submitted_actions ?? []
  const privateMessages = useGameStore((s) => s.privateMessages)
  const myPlayer = players.find((player) => player.user_id === userId) ?? null

  React.useEffect(() => {
    if (gameKey) useGameStore.getState().enter(gameKey)
    return () => useGameStore.getState().leave()
  }, [gameKey])

  React.useEffect(() => {
    let previousState = AppState.currentState
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState === 'active' && nextState !== 'active') {
        useGameStore.getState().pause()
      } else if (previousState !== 'active' && nextState === 'active') {
        useGameStore.getState().resume()
      }
      previousState = nextState
    })
    return () => subscription.remove()
  }, [])

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
    try {
      await useGameStore.getState().submit(text)
      setDraft('')
    } catch {
      // 弱网失败时保留草稿，错误由 game store 显示在顶部横幅。
    }
  }

  async function decideLuck(checkId: string, spend: boolean) {
    setLuckBusyId(checkId)
    try {
      await useGameStore.getState().decideLuck(checkId, spend)
    } catch {
      // 错误由 game store 显示在顶部横幅。
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

  const stateLabel = pendingLuck.length
    ? strings.play.luckDecisionPending
    : gmThinking
      ? strings.play.gmThinking
      : gameStateLabel(detail?.state)
  const composerDisabled = pendingLuck.length > 0 || detail?.state === 'ended'
  const composerDisabledReason = pendingLuck.length
    ? strings.play.resolveLuckFirst
    : detail?.state === 'ended'
      ? strings.play.gameEnded
      : undefined

  const statusBadge =
    streamStatus === 'live' ? (
      <StatusBadge tone="success">{strings.play.connected}</StatusBadge>
    ) : streamStatus === 'degraded' ? (
      <StatusBadge tone="warning">{strings.play.polling}</StatusBadge>
    ) : (
      <StatusBadge tone="secondary">{strings.play.connecting}</StatusBadge>
    )

  const storyTools = (
    <Tabs
      value={sidebarTab}
      onValueChange={(value) => setSidebarTab(value as 'plot' | 'map')}
      className="flex-1 pt-1"
    >
      <TabsList>
        <TabsTrigger value="plot">
          <Text variant="small">剧情</Text>
        </TabsTrigger>
        <TabsTrigger value="map">
          <Text variant="small">地图</Text>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="plot" className="min-h-0 flex-1 pt-1">
        <PlotTracker data={plotTracker} />
      </TabsContent>

      <TabsContent value="map" className="min-h-0 flex-1 pt-1">
        <MapWorkspace map={map} currentScene={detail?.scene} />
      </TabsContent>
    </Tabs>
  )

  return (
    <Screen className="gap-0">
      {/* 键盘避让：底部垫高键盘实际高度，输入区始终可见（见 use-keyboard-height 注释） */}
      <View className="flex-1" style={{ paddingBottom: keyboardHeight + insets.bottom }}>
        {/* 顶栏 */}
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/overview'))}
            accessibilityLabel={strings.common.back}
            hitSlop={8}
          >
            <Icon as={ChevronLeft} size={22} />
          </Button>
          <View className="flex-1">
            <Text variant="h4" numberOfLines={1}>
              {detail?.world_name || gameKey}
            </Text>
            <Text variant="small" numberOfLines={1}>
              第 {detail?.round_number ?? '?'} 回合 · {stateLabel}
            </Text>
          </View>
          {statusBadge}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onPress={() => setCharacterOpen(true)}
            accessibilityLabel={strings.play.characterPanel}
          >
            <Icon as={User} size={20} />
          </Button>
          {!isWideTablet && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onPress={() => setSidebarOpen(true)}
              accessibilityLabel="剧情与地图"
            >
              <Icon as={Route} size={20} />
            </Button>
          )}
          {privateMessages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onPress={() => setPrivateMessageOpen(true)}
              accessibilityLabel={`私信（${privateMessages.length}）`}
            >
              <View>
                <Icon as={Mail} size={20} />
                <View className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive" />
              </View>
            </Button>
          )}
          {isGm && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onPress={() => setMenuOpen(true)}
              accessibilityLabel={strings.play.gmCommand}
            >
              <Icon as={Menu} size={20} />
            </Button>
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

        <View className="min-h-0 flex-1 flex-row">
          <View className="min-w-0 flex-1">
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
              disabled={composerDisabled}
              disabledReason={composerDisabledReason}
              quickActions={detail?.quick_actions ?? []}
              voice={voice}
            />
          </View>

          {isWideTablet && (
            <View
              className="border-l border-border bg-card px-3 py-2"
              style={{ width: gameSidebarWidth }}
            >
              {storyTools}
            </View>
          )}
        </View>
      </View>

      <Sheet
        open={characterOpen}
        onClose={() => setCharacterOpen(false)}
        className="h-[80%]"
        scrollable={false}
      >
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

      {/* 窄窗口用抽屉，平板横屏则把剧情与地图常驻在右侧。 */}
      {!isWideTablet && (
        <Sheet
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          className="h-[80%]"
          scrollable={false}
        >
          {storyTools}
        </Sheet>
      )}

      <Sheet
        open={privateMessageOpen}
        onClose={() => setPrivateMessageOpen(false)}
        className="h-[80%]"
        scrollable={false}
      >
        <PrivateMessagePanel messages={privateMessages} />
      </Sheet>
    </Screen>
  )
}
