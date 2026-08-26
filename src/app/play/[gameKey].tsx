import * as React from 'react'
import { AppState, Pressable, ScrollView, Share, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  HelpCircle,
  Image as ImageIcon,
  Mail,
  Map,
  Menu,
  MoreHorizontal,
  Route,
  User,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Sheet } from '@/components/patterns/sheet'
import { StatusBadge } from '@/components/patterns/status-badge'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { errorMessage, fetchAppConfig } from '@/api/client'
import { exportGame, fetchBotBindToken, setGameRoomPassword } from '@/api/games'
import type { GeneratedImageItem } from '@/api/types'
import { ActionComposer } from '@/features/play/ActionComposer'
import { CharacterCardsModal } from '@/features/play/CharacterCardsModal'
import { CharacterPanel } from '@/features/play/CharacterPanel'
import { GameTimeline } from '@/features/play/GameTimeline'
import { GmSheet } from '@/features/play/GmSheet'
import { HealthPanel } from '@/features/play/HealthPanel'
import { MapWorkspace } from '@/features/play/MapWorkspace'
import { MultiplayerPanel } from '@/features/play/MultiplayerPanel'
import { PlotTracker } from '@/features/play/PlotTracker'
import { PrivateMessagePanel } from '@/features/play/PrivateMessagePanel'
import { RoomPasswordModal } from '@/features/play/RoomPasswordModal'
import { RuleHelpModal } from '@/features/play/RuleHelpModal'
import { SceneGalleryModal } from '@/features/play/SceneGalleryModal'
import { WorldSwitchModal } from '@/features/play/WorldSwitchModal'
import { useSpeaker } from '@/features/play/useSpeaker'
import { useVoiceInput } from '@/features/play/useVoiceInput'
import { appendActionText } from '@/lib/action-text'
import { gameStateLabel } from '@/lib/game-state'
import { appLayoutForWidth } from '@/lib/layout'
import { buildShareLink } from '@/lib/share-link'
import { strings } from '@/lib/strings'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import { selectGmThinking, useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

/** 简单的剪贴板工具（优先使用 React Native 内置 Clipboard） */
async function copyToClipboard(text: string): Promise<void> {
  try {
    const { Clipboard } = await import('react-native')
    if (Clipboard?.setString) {
      Clipboard.setString(text)
      return
    }
  } catch {
    // 回退：使用 Share API
  }
  // 最终回退：尝试使用 Share 分享纯文本
  try {
    await Share.share({ message: text })
  } catch {
    // 用户取消分享
  }
}

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
  const gmBusy = useGameStore((s) => s.gmBusy)
  const ttsEnabled = useGameStore((s) => s.ttsEnabled)
  const health = useGameStore((s) => s.health)
  const gmThinking = useGameStore(selectGmThinking)

  const [draft, setDraft] = React.useState('')
  const [characterOpen, setCharacterOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [sidebarTab, setSidebarTab] = React.useState<'plot' | 'map'>('plot')
  const [gmPanelTab, setGmPanelTab] = React.useState<'controls' | 'players' | 'health'>('controls')
  const [utilityOpen, setUtilityOpen] = React.useState(false)
  const [privateMessageOpen, setPrivateMessageOpen] = React.useState(false)
  const [luckBusyId, setLuckBusyId] = React.useState('')
  // 模态框状态
  const [worldSwitchOpen, setWorldSwitchOpen] = React.useState(false)
  const [worldCandidates, setWorldCandidates] = React.useState<
    import('@/api/types').WorldCandidate[]
  >([])
  const [worldLoading, setWorldLoading] = React.useState(false)
  const [roomPasswordOpen, setRoomPasswordOpen] = React.useState(false)
  const [cardsOpen, setCardsOpen] = React.useState(false)
  const [cards, setCards] = React.useState<import('@/api/types').CharacterCard[]>([])
  const [cardsLoading, setCardsLoading] = React.useState(false)
  const [ruleHelpOpen, setRuleHelpOpen] = React.useState(false)
  const [sceneGalleryOpen, setSceneGalleryOpen] = React.useState(false)
  const [sceneImages, setSceneImages] = React.useState<GeneratedImageItem[]>([])
  const [sceneImagesLoading, setSceneImagesLoading] = React.useState(false)

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

  const busy = actionBusy || gmBusy

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

  // GM 工具处理函数
  async function handleRecap() {
    try {
      await useGameStore.getState().storyRecap()
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleBotBind() {
    if (!gameKey) return
    try {
      const token = await fetchBotBindToken(gameKey)
      const command = `绑定 ${gameKey} ${token}`
      await copyToClipboard(command)
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleInvite() {
    if (!gameKey) return
    try {
      const config = await fetchAppConfig()
      const link = buildShareLink(
        gameKey,
        config.public_base_url || undefined,
        undefined,
        undefined,
      )
      await copyToClipboard(link)
    } catch {
      // 静默失败
    }
  }

  async function handleExport() {
    if (!gameKey) return
    try {
      const blob = await exportGame(gameKey)
      // 使用 RN 的 Share API 分享文件
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          await Share.share({ message: `DiceFrame 存档: ${detail?.world_name || gameKey}` })
        } catch {
          // 用户取消分享
        }
      }
      reader.readAsDataURL(blob)
    } catch {
      // 错误由 store 处理
    }
  }

  async function openWorldSwitch() {
    if (!gameKey) return
    setWorldSwitchOpen(true)
    setWorldLoading(true)
    try {
      const candidates = await useGameStore.getState().fetchWorldCandidates()
      setWorldCandidates(candidates)
    } catch {
      // 静默失败
    } finally {
      setWorldLoading(false)
    }
  }

  async function handleWorldSwitch(worldId: string) {
    try {
      await useGameStore.getState().switchWorld(worldId)
      setWorldSwitchOpen(false)
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleRoomPassword(password: string) {
    if (!gameKey) return
    try {
      await setGameRoomPassword(gameKey, password)
      setRoomPasswordOpen(false)
      await useGameStore.getState().refresh()
    } catch {
      // 错误由 store 处理
    }
  }

  async function openCards() {
    if (!gameKey) return
    setCardsOpen(true)
    setCardsLoading(true)
    try {
      const result = await useGameStore.getState().fetchCharacterCards()
      setCards(result.cards ?? [])
    } catch {
      // 静默失败
    } finally {
      setCardsLoading(false)
    }
  }

  async function handleSelectCard(card: import('@/api/types').CharacterCard) {
    try {
      await useGameStore.getState().applyCharacterCard(card)
      setCardsOpen(false)
    } catch {
      // 错误由 store 处理
    }
  }

  async function openSceneGallery() {
    if (!gameKey) return
    setSceneGalleryOpen(true)
    setSceneImagesLoading(true)
    try {
      const images = await useGameStore.getState().fetchGeneratedImages()
      setSceneImages(images)
    } catch {
      // 静默失败
    } finally {
      setSceneImagesLoading(false)
    }
  }

  async function handleReset() {
    try {
      await useGameStore.getState().resetGame()
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleRestart() {
    try {
      await useGameStore.getState().restartGame()
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleKick(uid: string) {
    try {
      await useGameStore.getState().kick(uid)
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleSetAway(uid: string, away: boolean) {
    try {
      await useGameStore.getState().setAway(uid, away)
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleCopyLink(uid: string) {
    if (!gameKey) return
    try {
      const config = await fetchAppConfig()
      const link = buildShareLink(
        gameKey,
        config.public_base_url || undefined,
        uid,
        undefined,
      )
      await copyToClipboard(link)
    } catch {
      // 静默失败
    }
  }

  async function handlePerception(uid: string, text: string) {
    try {
      await useGameStore.getState().privateMessage(uid, text)
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleResolveHealth(id: string, action: 'resolve' | 'ignore') {
    try {
      await useGameStore.getState().resolveHealth(id, action)
    } catch {
      // 错误由 store 处理
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

  function openStoryTool(tab: 'plot' | 'map') {
    setSidebarTab(tab)
    if (!isWideTablet) setSidebarOpen(true)
  }

  function openGmPanel(tab: 'controls' | 'players' | 'health' = 'controls') {
    setGmPanelTab(tab)
    setMenuOpen(true)
  }

  const storyTools = (
    <Tabs
      value={sidebarTab}
      onValueChange={(value) => setSidebarTab(value as typeof sidebarTab)}
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

  const gmRoundControls = isGm ? (
    <View className="flex-row gap-2 border-t border-border px-3 pt-2">
      <Button
        size="sm"
        className="flex-1"
        disabled={busy}
        onPress={() => void runGm(() => useGameStore.getState().advance())}
      >
        <Text>{strings.play.advance}</Text>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1"
        disabled={busy}
        onPress={() => void runGm(() => useGameStore.getState().rollback())}
      >
        <Text>{strings.play.rollback}</Text>
      </Button>
      <Button size="sm" variant="ghost" onPress={() => openGmPanel()}>
        <Icon as={Menu} size={16} />
        <Text>管理</Text>
      </Button>
    </View>
  ) : null

  return (
    <Screen className="gap-0">
      {/* 键盘避让：底部垫高键盘实际高度，输入区始终可见 */}
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
            onPress={() => setUtilityOpen(true)}
            accessibilityLabel="更多操作"
          >
            <Icon as={MoreHorizontal} size={21} />
          </Button>
        </View>

        {/* 情境入口：只放当前游玩中会频繁切换的内容。 */}
        <ScrollView
          horizontal
          className="max-h-11 border-b border-border"
          contentContainerClassName="items-center gap-1 px-3 py-1"
          showsHorizontalScrollIndicator={false}
        >
          <Button size="sm" variant="ghost" onPress={() => setCharacterOpen(true)}>
            <Icon as={User} size={16} />
            <Text>角色</Text>
          </Button>
          {!isWideTablet && (
            <>
              <Button
                size="sm"
                variant={sidebarTab === 'plot' ? 'secondary' : 'ghost'}
                onPress={() => openStoryTool('plot')}
              >
                <Icon as={Route} size={16} />
                <Text>剧情</Text>
              </Button>
              <Button
                size="sm"
                variant={sidebarTab === 'map' ? 'secondary' : 'ghost'}
                onPress={() => openStoryTool('map')}
              >
                <Icon as={Map} size={16} />
                <Text>地图</Text>
              </Button>
            </>
          )}
          {privateMessages.length > 0 && (
            <Button size="sm" variant="ghost" onPress={() => setPrivateMessageOpen(true)}>
              <View>
                <Icon as={Mail} size={16} />
                <View className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" />
              </View>
              <Text>感知 {privateMessages.length}</Text>
            </Button>
          )}
          {isGm && (
            <Button size="sm" variant="ghost" onPress={() => openGmPanel()}>
              <Icon as={Menu} size={16} />
              <Text>桌面管理</Text>
            </Button>
          )}
        </ScrollView>

        {error ? (
          <Pressable
            className="px-3 py-1.5"
            onPress={() => void useGameStore.getState().refresh()}
          >
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
              busy={busy}
              disabled={composerDisabled}
              disabledReason={composerDisabledReason}
              quickActions={detail?.quick_actions ?? []}
              voice={voice}
              topControls={gmRoundControls}
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

      {/* 角色面板 */}
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
          {isGm && (
            <Button variant="outline" onPress={() => void openCards()}>
              <Text>{strings.play.selectCard}</Text>
            </Button>
          )}
        </View>
      </Sheet>

      {/* GM 桌面管理：流程、玩家和健康事件各自成组，不与剧情地图混放。 */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} className="h-[85%]" scrollable={false}>
        <Tabs
          value={gmPanelTab}
          onValueChange={(value) => setGmPanelTab(value as typeof gmPanelTab)}
          className="min-h-0 flex-1"
        >
          <TabsList>
            <TabsTrigger value="controls"><Text variant="small">管理</Text></TabsTrigger>
            <TabsTrigger value="players"><Text variant="small">玩家</Text></TabsTrigger>
            <TabsTrigger value="health"><Text variant="small">状态</Text></TabsTrigger>
          </TabsList>
          <TabsContent value="controls" className="min-h-0 flex-1 pt-2">
            <GmSheet
              detail={detail!}
              multiplayer={detail?.multiplayer}
              busy={busy}
              showFlowControls={false}
              showPlayerRoster={false}
              onAdvance={() => void runGm(() => useGameStore.getState().advance())}
              onRollback={() => void runGm(() => useGameStore.getState().rollback())}
              onCommand={(text) => void runGm(() => useGameStore.getState().command(text))}
              onRecap={() => void handleRecap()}
              onBotBind={() => void handleBotBind()}
              onInvite={() => void handleInvite()}
              onToggleMode={() => void runGm(() => useGameStore.getState().toggleMode())}
              onToggleAccess={() => void runGm(() => useGameStore.getState().toggleAccess())}
              onRoomPassword={() => {
                setMenuOpen(false)
                setRoomPasswordOpen(true)
              }}
              onWorldSwitch={() => {
                setMenuOpen(false)
                void openWorldSwitch()
              }}
              onExport={() => void handleExport()}
              onReset={() => void handleReset()}
              onRestart={() => void handleRestart()}
              onPerception={(uid, text) => void handlePerception(uid, text)}
            />
          </TabsContent>
          <TabsContent value="players" className="min-h-0 flex-1 pt-2">
            <MultiplayerPanel
              players={players}
              detail={detail!}
              isGm={isGm}
              currentUserId={userId}
              onKick={(uid) => void handleKick(uid)}
              onSetAway={(uid, away) => void handleSetAway(uid, away)}
              onCopyLink={(uid) => void handleCopyLink(uid)}
            />
          </TabsContent>
          <TabsContent value="health" className="min-h-0 flex-1 pt-2">
            <HealthPanel
              health={health}
              detail={detail}
              isGm={isGm}
              onResolve={(id, action) => void handleResolveHealth(id, action)}
            />
          </TabsContent>
        </Tabs>
      </Sheet>

      {/* 低频页面工具 */}
      <Sheet open={utilityOpen} onClose={() => setUtilityOpen(false)} className="h-auto">
        <View className="gap-2 pt-1">
          <Text variant="h4">更多操作</Text>
          <Button
            variant="outline"
            onPress={() => {
              setUtilityOpen(false)
              setCharacterOpen(true)
            }}
          >
            <Icon as={User} size={17} />
            <Text>角色详情</Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => {
              setUtilityOpen(false)
              setRuleHelpOpen(true)
            }}
          >
            <Icon as={HelpCircle} size={17} />
            <Text>{strings.play.ruleHelp}</Text>
          </Button>
          {isGm && (
            <Button
              variant="outline"
              onPress={() => {
                setUtilityOpen(false)
                void openSceneGallery()
              }}
            >
              <Icon as={ImageIcon} size={17} />
              <Text>{strings.play.sceneGallery}</Text>
            </Button>
          )}
          {privateMessages.length > 0 && (
            <Button
              variant="outline"
              onPress={() => {
                setUtilityOpen(false)
                setPrivateMessageOpen(true)
              }}
            >
              <Icon as={Mail} size={17} />
              <Text>私密感知（{privateMessages.length}）</Text>
            </Button>
          )}
          {isGm && (
            <Button
              onPress={() => {
                setUtilityOpen(false)
                openGmPanel()
              }}
            >
              <Icon as={Menu} size={17} />
              <Text>桌面管理</Text>
            </Button>
          )}
        </View>
      </Sheet>

      {/* 侧边栏（窄屏抽屉） */}
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

      {/* 私信面板 */}
      <Sheet
        open={privateMessageOpen}
        onClose={() => setPrivateMessageOpen(false)}
        className="h-[80%]"
        scrollable={false}
      >
        <PrivateMessagePanel messages={privateMessages} />
      </Sheet>

      {/* 世界观切换 */}
      <WorldSwitchModal
        open={worldSwitchOpen}
        currentWorldId={detail?.world_id}
        candidates={worldCandidates}
        loading={worldLoading}
        busy={busy}
        onClose={() => setWorldSwitchOpen(false)}
        onSwitch={(worldId) => void handleWorldSwitch(worldId)}
      />

      {/* 房间密码 */}
      <RoomPasswordModal
        open={roomPasswordOpen}
        hasPassword={detail?.has_room_password ?? false}
        busy={busy}
        onClose={() => setRoomPasswordOpen(false)}
        onSave={(password) => void handleRoomPassword(password)}
      />

      {/* 角色卡选择 */}
      <CharacterCardsModal
        open={cardsOpen}
        cards={cards}
        loading={cardsLoading}
        busy={busy}
        onClose={() => setCardsOpen(false)}
        onSelect={(card) => void handleSelectCard(card)}
      />

      {/* 规则帮助 */}
      <RuleHelpModal
        open={ruleHelpOpen}
        meta={ruleMeta}
        onClose={() => setRuleHelpOpen(false)}
      />

      {/* 场景图集 */}
      <SceneGalleryModal
        open={sceneGalleryOpen}
        gameKey={gameKey}
        images={sceneImages}
        loading={sceneImagesLoading}
        onClose={() => setSceneGalleryOpen(false)}
      />
    </Screen>
  )
}
