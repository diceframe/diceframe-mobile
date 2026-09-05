import * as React from 'react'
import { AppState, Pressable, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Sheet } from '@/components/patterns/sheet'
import { StatusBadge } from '@/components/patterns/status-badge'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { errorMessage } from '@/api/client'
import {
  regenerateSwipe,
  setGameRoomPassword,
  switchSwipe,
} from '@/api/games'
import type {
  CharacterPortrait,
  GeneratedImageItem,
  PaymentProposalCreatePayload,
} from '@/api/types'
import { ActionComposer } from '@/features/play/ActionComposer'
import { CharacterCardsModal } from '@/features/play/CharacterCardsModal'
import { CharacterPanel } from '@/features/play/CharacterPanel'
import { CharacterPortraitSheet } from '@/features/play/CharacterPortraitSheet'
import { GameContextRow } from '@/features/play/GameContextRow'
import { GameTimeline } from '@/features/play/GameTimeline'
import { GmPanelSheet } from '@/features/play/GmPanelSheet'
import { GAME_STATE_LABEL_KEYS } from '@/features/play/HealthPanel'
import { MapWorkspace } from '@/features/play/MapWorkspace'
import { PaymentComposerSheet } from '@/features/play/PaymentComposerSheet'
import { PaymentModal } from '@/features/play/PaymentModal'
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
import { ttsAvailableOf } from '@/features/play/tts-options'
import { UtilitySheet } from '@/features/play/UtilitySheet'
import { useGameHaptics, playGameHaptic } from '@/features/play/useHaptics'
import { useVoiceInput } from '@/features/play/useVoiceInput'
import { useT, type T } from '@/i18n/t'
import { gameLifecycleAction } from '@/lib/game-lifecycle'
import {
  economyCurrencyLabel,
  economyProposalList,
  isNonBlockingPersonalPurchase,
  nextEconomyProposal,
} from '@/lib/economy-prompts'
import { appLayoutForWidth } from '@/lib/layout'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import {
  selectGmThinking,
  selectMyPendingPayments,
  useGameStore,
} from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

/**
 * 顶栏对局状态文案：映射与 lib/game-state 的 gameStateLabel 一致，
 * 但经 i18n 输出（lib 版本是中文硬编码，供非 UI 场景复用）。
 */
function stateLabelOf(state: string | undefined, t: T): string {
  if (!state) return t('dfStateUnknownStatus')
  const key = GAME_STATE_LABEL_KEYS[state]
  return key ? t(key) : state
}

/** 对局屏主体：路由只做薄壳，界面实现在 features/play（与 WorldsScreen 等同一模式） */
export default function GameScreen() {
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
  // 服务器配置了非 browser TTS 引擎（game store 字段，勿与本地朗读可用性混淆）
  const serverTtsEnabled = useGameStore((s) => s.ttsEnabled)
  const health = useGameStore((s) => s.health)
  const gmThinking = useGameStore(selectGmThinking)
  const myPendingPayments = useGameStore(selectMyPendingPayments)

  const [draft, setDraft] = React.useState('')
  const [characterOpen, setCharacterOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [gmPanelTab, setGmPanelTab] = React.useState<
    'controls' | 'players' | 'health'
  >('controls')
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [sidebarTab, setSidebarTab] = React.useState<'plot' | 'map'>('plot')
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
  const [cards, setCards] = React.useState<
    import('@/api/types').CharacterCard[]
  >([])
  const [cardsLoading, setCardsLoading] = React.useState(false)
  const [ruleHelpOpen, setRuleHelpOpen] = React.useState(false)
  // 对局内换头像抽屉（对齐 Web PlayView 的 showPortraitEditor：面板发事件、屏幕持有弹窗）
  const [portraitOpen, setPortraitOpen] = React.useState(false)
  const [sceneGalleryOpen, setSceneGalleryOpen] = React.useState(false)
  const [paymentComposerOpen, setPaymentComposerOpen] = React.useState(false)
  const [sceneImages, setSceneImages] = React.useState<GeneratedImageItem[]>([])
  const [sceneImagesLoading, setSceneImagesLoading] = React.useState(false)
  // 「稍后」仅是本地收起；按 game/run 隔离，重开一局不会误用旧提案 id。
  const [dismissedPayments, setDismissedPayments] = React.useState<{
    scope: string
    ids: string[]
  }>({ scope: '', ids: [] })

  const voice = useVoiceInput(gameKey, sendVoice)
  const speaker = useSpeaker(gameKey)
  // 朗读可用性 = 用户选的引擎能出声（system 引擎随设备自带 TTS 恒可用，
  // server 引擎跟随服务器 TTS 配置 serverTtsEnabled）；首次加载只记基线不回放历史
  const ttsEngine = useSettingsStore((s) => s.ttsEngine)
  const ttsAuto = useSettingsStore((s) => s.ttsAuto)
  const ttsAvailable = ttsAvailableOf(ttsEngine, serverTtsEnabled)
  useAutoSpeak(ttsAuto && ttsAvailable, log, (text) => void speaker.speak(text))
  // 叙事落地/检定结果/私密感知的震动反馈（开关在设置页，默认开启）
  useGameHaptics()
  const keyboardHeight = useKeyboardHeight()
  const insets = useSafeAreaInsets()

  const pendingLuck = detail?.pending_luck_decisions ?? []
  const submittedActions = detail?.multiplayer?.submitted_actions ?? []
  const privateMessages = useGameStore((s) => s.privateMessages)
  const myPlayer = players.find((player) => player.user_id === userId) ?? null
  const paymentScope = `${gameKey}:${detail?.run_id || ''}`
  const dismissedPaymentIds = dismissedPayments.scope === paymentScope
    ? dismissedPayments.ids
    : []
  const currentPayment = nextEconomyProposal(
    myPendingPayments,
    userId,
    String(detail?.gm_uid || ''),
    new Set(dismissedPaymentIds),
  ) ?? null
  const economyCurrency = economyCurrencyLabel(ruleMeta)
  const hasBlockingEconomyProposal = economyProposalList(detail).some(
    (proposal) => proposal.status === 'pending'
      && !isNonBlockingPersonalPurchase(proposal, String(detail?.run_id || '')),
  )

  const busy = actionBusy || gmBusy

  React.useEffect(() => {
    if (gameKey) useGameStore.getState().enter(gameKey)
    return () => useGameStore.getState().leave()
  }, [gameKey])

  React.useEffect(() => {
    let previousState = AppState.currentState
    const subscription = AppState.addEventListener('change', (nextState) => {
      const action = gameLifecycleAction(previousState, nextState)
      if (action) useGameStore.getState()[action]()
      previousState = nextState
    })
    return () => subscription.remove()
  }, [])

  // 玩家身份失效（被踢/存档重置）时只清该局的身份槽位、回加入页重新加入；
  // 多局身份各自独立，不能连坐其他局的保存身份
  React.useEffect(() => {
    if (isGm || !userId || !detail?.multiplayer) return
    const members = [
      ...(detail.multiplayer.ready_players ?? []),
      ...(detail.multiplayer.waiting_players ?? []),
      ...(detail.multiplayer.away_players ?? []),
    ]
    if (!members.some((player) => player.user_id === userId)) {
      useSettingsStore.getState().removeShare(gameKey)
      router.replace({ pathname: '/join' })
    }
  }, [isGm, userId, detail, router])

  async function sendVoice(text: string) {
    // 录音/编辑期间对局可能已经变化，发送时重新检查当前状态。
    const current = useGameStore.getState()
    if (current.gameKey !== gameKey || current.detail?.state === 'ended') {
      throw new Error(t('dfPlayGameEnded'))
    }
    if (current.actionBusy || current.gmBusy) throw new Error(t('dfPlayVoiceSendBusy'))
    if (current.detail?.pending_luck_decisions?.length) throw new Error(t('dfPlayResolveLuckFirst'))
    if (economyProposalList(current.detail).some(
      (proposal) => proposal.status === 'pending'
        && !isNonBlockingPersonalPurchase(proposal, String(current.detail?.run_id || '')),
    )) throw new Error(t('apiErrors.economy_decision_pending'))
    await current.submit(text)
    void playGameHaptic('submit')
  }

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
      // 错误由 game store 显示在顶部横幅。
    }
  }

  /** 提交头像草稿（store 内按 rules-aware 能力自动分流 PUT/PATCH）；失败时抛回抽屉保持打开 */
  async function handleSavePortrait(portrait: CharacterPortrait | null) {
    await useGameStore.getState().updatePortrait(portrait)
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

  /** 切换/重生成叙事分支后必须刷新：服务端把选中分支写回了 gm_response */
  async function handleSwipeTo(round: number, swipeIndex: number) {
    await switchSwipe(gameKey, round, swipeIndex)
    await useGameStore.getState().refresh()
  }

  async function handleRerollSwipe(round: number) {
    await regenerateSwipe(gameKey, round)
    await useGameStore.getState().refresh()
  }

  async function handleCreatePayment(payload: PaymentProposalCreatePayload) {
    await useGameStore.getState().createPayment(payload)
    setPaymentComposerOpen(false)
  }

  const stateLabel = pendingLuck.length
    ? t('luckDecisionState')
    : gmThinking
      ? t('dfPlayGmThinking')
      : stateLabelOf(detail?.state, t)
  const composerDisabled =
    pendingLuck.length > 0 || hasBlockingEconomyProposal || detail?.state === 'ended'
  const composerDisabledReason = pendingLuck.length
    ? t('dfPlayResolveLuckFirst')
    : hasBlockingEconomyProposal
      ? t('apiErrors.economy_decision_pending')
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
        disabled={busy || hasBlockingEconomyProposal}
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
      <View
        className="flex-1"
        style={{ paddingBottom: keyboardHeight + insets.bottom }}
      >
        {/* 顶栏 */}
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/overview')
            }
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
              {t('dfPlayRoundState', {
                round: detail?.round_number ?? '?',
                state: stateLabel,
              })}
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
        <GameContextRow
          isWideTablet={isWideTablet}
          sidebarOpen={sidebarOpen}
          sidebarTab={sidebarTab}
          onOpenCharacter={() => setCharacterOpen(true)}
          onOpenStoryTool={openStoryTool}
          showPendingPayments={myPendingPayments.length > 0 && !currentPayment}
          pendingPaymentsCount={myPendingPayments.length}
          onShowPendingPayments={() =>
            setDismissedPayments({ scope: paymentScope, ids: [] })
          }
          privateMessagesCount={privateMessages.length}
          onOpenPrivateMessages={() => setPrivateMessageOpen(true)}
          isGm={isGm}
          onOpenGmPanel={() => openGmPanel()}
        />

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
                ttsAvailable={ttsAvailable}
                onSpeak={(text) => void speaker.speak(text)}
                isGm={isGm}
                onSwipeTo={handleSwipeTo}
                onReroll={handleRerollSwipe}
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
            onEditPortrait={() => setPortraitOpen(true)}
          />
          {isGm && (
            <Button variant="outline" onPress={() => void openCards()}>
              <Text>{t('dfCharacterCardSelect')}</Text>
            </Button>
          )}
        </View>
      </Sheet>

      {/* GM 桌面管理抽屉（流程/玩家/健康事件）；房间密码等弹窗仍由本屏持有 */}
      <GmPanelSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        tab={gmPanelTab}
        onTabChange={setGmPanelTab}
        gameKey={gameKey}
        detail={detail}
        players={players}
        isGm={isGm}
        currentUserId={userId}
        health={health}
        busy={busy}
        onOpenRoomPassword={() => setRoomPasswordOpen(true)}
        onOpenWorldSwitch={() => void openWorldSwitch()}
        onOpenPaymentComposer={() => setPaymentComposerOpen(true)}
      />

      {/* 低频页面工具 */}
      <UtilitySheet
        open={utilityOpen}
        onOpenChange={setUtilityOpen}
        isGm={isGm}
        onOpenRuleHelp={() => setRuleHelpOpen(true)}
        onOpenSceneGallery={() => void openSceneGallery()}
      />

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

      {/* 对局内换头像：PortraitPicker 五来源 + 草稿保存，busy/错误由 store 与抽屉内管理 */}
      <CharacterPortraitSheet
        open={portraitOpen}
        onClose={() => setPortraitOpen(false)}
        ruleId={ruleMeta?.rule_id ?? ''}
        name={myPlayer?.character_name ?? ''}
        value={myPlayer?.character_sheet?.portrait ?? null}
        busy={busy}
        onSave={handleSavePortrait}
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

      <PaymentComposerSheet
        open={paymentComposerOpen}
        players={players}
        busy={gmBusy}
        onClose={() => setPaymentComposerOpen(false)}
        onSubmit={handleCreatePayment}
      />

      {/* 权威经济提案：支持付款人、GM 奖励与多人分摊；稍后收起后顶栏保留入口。 */}
      <PaymentModal
        key={String(currentPayment?.id || currentPayment?.payment_id || '')}
        payment={currentPayment}
        currency={economyCurrency}
        playerName={(uid) =>
          players.find((player) => player.user_id === uid)?.character_name || uid || '—'
        }
        actorId={userId}
        gmUid={String(detail?.gm_uid || '')}
        runId={String(detail?.run_id || '')}
        solo={Boolean(detail?.solo_mode)}
        onDismiss={(paymentId) =>
          setDismissedPayments((current) => {
            const ids = current.scope === paymentScope ? current.ids : []
            return {
              scope: paymentScope,
              ids: ids.includes(paymentId) ? ids : [...ids, paymentId],
            }
          })
        }
        onResolve={(paymentId, accepted) =>
          useGameStore.getState().decidePayment(paymentId, accepted)
        }
      />
    </Screen>
  )
}
