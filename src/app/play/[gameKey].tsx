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
import { GAME_STATE_LABEL_KEYS, HealthPanel } from '@/features/play/HealthPanel'
import { MapWorkspace } from '@/features/play/MapWorkspace'
import { MultiplayerPanel } from '@/features/play/MultiplayerPanel'
import { PlotTracker } from '@/features/play/PlotTracker'
import { PrivateMessagePanel } from '@/features/play/PrivateMessagePanel'
import { RoomPasswordModal } from '@/features/play/RoomPasswordModal'
import { RuleHelpModal } from '@/features/play/RuleHelpModal'
import { SceneBackdrop } from '@/features/play/SceneBackdrop'
import { SceneGalleryModal } from '@/features/play/SceneGalleryModal'
import { sceneImageSource } from '@/api/assets'
import { WorldSwitchModal } from '@/features/play/WorldSwitchModal'
import { useSpeaker } from '@/features/play/useSpeaker'
import { useAutoSpeak } from '@/features/play/useAutoSpeak'
import { useGameHaptics, playGameHaptic } from '@/features/play/useHaptics'
import { useVoiceInput } from '@/features/play/useVoiceInput'
import { useT, type T } from '@/i18n/t'
import { appendActionText } from '@/lib/action-text'
import { confirmDestructive } from '@/lib/confirm'
import { appLayoutForWidth } from '@/lib/layout'
import { buildShareLink } from '@/lib/share-link'
import { shareExportBlob } from '@/lib/share-export'
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

/**
 * 顶栏对局状态文案：映射与 lib/game-state 的 gameStateLabel 一致，
 * 但经 i18n 输出（lib 版本是中文硬编码，供非 UI 场景复用）。
 */
function stateLabelOf(state: string | undefined, t: T): string {
  if (!state) return t('dfStateUnknownStatus')
  const key = GAME_STATE_LABEL_KEYS[state]
  return key ? t(key) : state
}

export default function PlayScreen() {
  const t = useT()
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
  const loadingOlder = useGameStore((s) => s.loadingOlderLog)
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
  // 服务器开启语音合成（ttsEnabled）时，新 GM 叙事到达自动朗读；首次加载只记基线不回放历史
  useAutoSpeak(ttsEnabled, log, (text) => void speaker.speak(text))
  // 叙事落地/检定结果/私密感知的震动反馈（开关在设置页，默认开启）
  useGameHaptics()
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
      void playGameHaptic('submit')
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
      const settings = useSettingsStore.getState()
      const config = await fetchAppConfig()
      const link = buildShareLink(
        gameKey,
        config.public_base_url || settings.baseUrl,
        undefined,
        settings.baseUrl,
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
      const safeKey = gameKey.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'game'
      await shareExportBlob(
        blob,
        `diceframe-${safeKey}-${Date.now()}.zip`,
        t('dfPlayExportDialogTitle'),
      )
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
    const confirmed = await confirmDestructive({
      title: t('dfPlayResetTitle'),
      message: t('dfPlayResetMessage'),
      confirmText: t('dfCommonConfirm'),
      cancelText: t('dfCommonCancel'),
    })
    if (!confirmed) return
    try {
      await useGameStore.getState().resetGame()
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleRestart() {
    const confirmed = await confirmDestructive({
      title: t('dfPlayRestartTitle'),
      message: t('dfPlayRestartMessage'),
      confirmText: t('dfCommonConfirm'),
      cancelText: t('dfCommonCancel'),
    })
    if (!confirmed) return
    try {
      await useGameStore.getState().restartGame()
    } catch {
      // 错误由 store 处理
    }
  }

  async function handleKick(uid: string) {
    const confirmed = await confirmDestructive({
      title: t('dfPlayKickTitle'),
      message: t('dfPlayKickMessage'),
      confirmText: t('dfCommonConfirm'),
      cancelText: t('dfCommonCancel'),
    })
    if (!confirmed) return
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
      const settings = useSettingsStore.getState()
      const config = await fetchAppConfig()
      const link = buildShareLink(
        gameKey,
        config.public_base_url || settings.baseUrl,
        uid,
        settings.baseUrl,
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
    ? t('luckDecisionState')
    : gmThinking
      ? t('dfPlayGmThinking')
      : stateLabelOf(detail?.state, t)
  const composerDisabled = pendingLuck.length > 0 || detail?.state === 'ended'
  const composerDisabledReason = pendingLuck.length
    ? t('dfPlayResolveLuckFirst')
    : detail?.state === 'ended'
      ? t('dfPlayGameEnded')
      : undefined

  const statusBadge =
    streamStatus === 'live' ? (
      <StatusBadge tone="success">{t('dfPlayConnected')}</StatusBadge>
    ) : streamStatus === 'degraded' ? (
      <StatusBadge tone="warning">{t('dfPlayPolling')}</StatusBadge>
    ) : (
      <StatusBadge tone="secondary">{t('connecting')}</StatusBadge>
    )

  function openStoryTool(tab: 'plot' | 'map') {
    setSidebarTab(tab)
    if (!isWideTablet) setSidebarOpen(true)
  }

  function openGmPanel(tab: 'controls' | 'players' | 'health' = 'controls') {
    setGmPanelTab(tab)
    setMenuOpen(true)
  }

  // 手机抽屉：情境行按钮本身就是入口和选中态，抽屉里不再重复一层剧情/地图切换，
  // 内容直接跟最近点按的入口走（与角色/感知各自独立抽屉同一模式）。
  const storySheetContent =
    sidebarTab === 'plot' ? (
      <View className="min-h-0 flex-1 pt-1">
        <PlotTracker data={plotTracker} />
      </View>
    ) : (
      <View className="min-h-0 flex-1 pt-1">
        <MapWorkspace map={map} currentScene={detail?.scene} />
      </View>
    )

  // 平板常驻侧栏：宽屏情境行不出现剧情/地图入口，内部切换条是唯一导航，保留 Tabs。
  const storyTools = (
    <Tabs
      value={sidebarTab}
      onValueChange={(value) => setSidebarTab(value as typeof sidebarTab)}
      className="flex-1 pt-1"
    >
      <TabsList>
        <TabsTrigger value="plot">
          <Text variant="small">{t('dfPlayTabPlot')}</Text>
        </TabsTrigger>
        <TabsTrigger value="map">
          <Text variant="small">{t('dfPlayTabMap')}</Text>
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

  // 对话背景跟随服务端最新场景图：自动生图完成后 detail.scene_image 更新，
  // SSE 刷新到端上即自动换背景；无生成图（builtin/缺 asset_id）时保持素底。
  const backdropSource = sceneImageSource(gameKey, detail?.scene_image)

  // GM 回合流程常驻输入区上方；桌面管理入口只保留情境行一处，避免同屏重复。
  const gmRoundControls = isGm ? (
    <View className="flex-row gap-2 border-t border-border px-3 pt-2">
      <Button
        size="sm"
        className="flex-1"
        disabled={busy}
        onPress={() => void runGm(() => useGameStore.getState().advance())}
      >
        <Text>{t('dfPlayAdvance')}</Text>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1"
        disabled={busy}
        onPress={() => void runGm(() => useGameStore.getState().rollback())}
      >
        <Text>{t('dfPlayRollback')}</Text>
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
            accessibilityLabel={t('dfCommonBack')}
            hitSlop={8}
          >
            <Icon as={ChevronLeft} size={22} />
          </Button>
          <View className="flex-1">
            <Text variant="h4" numberOfLines={1}>
              {detail?.world_name || gameKey}
            </Text>
            <Text variant="small" numberOfLines={1}>
              {t('dfPlayRoundState', { round: detail?.round_number ?? '?', state: stateLabel })}
            </Text>
          </View>
          {statusBadge}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onPress={() => setUtilityOpen(true)}
            accessibilityLabel={t('dfPlayMoreActions')}
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
            <Text>{t('dfPlayTabCharacter')}</Text>
          </Button>
          {!isWideTablet && (
            <>
              {/* 高亮只在抽屉打开期间跟随入口；关掉即熄灭，不常驻 */}
              <Button
                size="sm"
                variant={sidebarOpen && sidebarTab === 'plot' ? 'secondary' : 'ghost'}
                onPress={() => openStoryTool('plot')}
              >
                <Icon as={Route} size={16} />
                <Text>{t('dfPlayTabPlot')}</Text>
              </Button>
              <Button
                size="sm"
                variant={sidebarOpen && sidebarTab === 'map' ? 'secondary' : 'ghost'}
                onPress={() => openStoryTool('map')}
              >
                <Icon as={Map} size={16} />
                <Text>{t('dfPlayTabMap')}</Text>
              </Button>
            </>
          )}
          {privateMessages.length > 0 && (
            <Button size="sm" variant="ghost" onPress={() => setPrivateMessageOpen(true)}>
              <View>
                <Icon as={Mail} size={16} />
                <View className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" />
              </View>
              <Text>{t('dfPlayTabPerception', { count: privateMessages.length })}</Text>
            </Button>
          )}
          {isGm && (
            <Button size="sm" variant="ghost" onPress={() => openGmPanel()}>
              <Icon as={Menu} size={16} />
              <Text>{t('dfPlayTabGmPanel')}</Text>
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
              {t('dfPlayErrorRetry', { error })}
            </Text>
          </Pressable>
        ) : null}

        <View className="min-h-0 flex-1 flex-row">
          <View className="min-w-0 flex-1">
            {/* 时间线（生图后以最新场景图作低亮度背景） */}
            <View className="flex-1">
              <SceneBackdrop source={backdropSource} />
              <GameTimeline
                gameKey={gameKey}
                log={log}
                players={players}
                currentUserId={userId}
                loading={loading}
                loadingOlder={loadingOlder}
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
              <Text>{t('dfCharacterCardSelect')}</Text>
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
            <TabsTrigger value="controls"><Text variant="small">{t('dfPlayTabControls')}</Text></TabsTrigger>
            <TabsTrigger value="players"><Text variant="small">{t('players')}</Text></TabsTrigger>
            <TabsTrigger value="health"><Text variant="small">{t('dfPlayStatus')}</Text></TabsTrigger>
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

      {/* 低频页面工具：与情境行重复的入口（角色/感知/桌面管理）不在这里重复出现 */}
      <Sheet open={utilityOpen} onClose={() => setUtilityOpen(false)} className="h-auto">
        <View className="gap-2 pt-1">
          <Text variant="h4">{t('dfPlayMoreActions')}</Text>
          <Button
            variant="outline"
            onPress={() => {
              setUtilityOpen(false)
              setRuleHelpOpen(true)
            }}
          >
            <Icon as={HelpCircle} size={17} />
            <Text>{t('ruleHelp')}</Text>
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
              <Text>{t('sceneGallery')}</Text>
            </Button>
          )}
        </View>
      </Sheet>

      {/* 侧边栏（窄屏抽屉）：内容跟随情境行点按的入口，见 storySheetContent */}
      {!isWideTablet && (
        <Sheet
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          className="h-[80%]"
          scrollable={false}
        >
          {storySheetContent}
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
