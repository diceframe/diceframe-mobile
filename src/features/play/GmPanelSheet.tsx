import { Share } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'

import { Sheet } from '@/components/patterns/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { errorMessage, fetchAppConfig } from '@/api/client'
import { exportGame, fetchBotBindToken } from '@/api/games'
import type { GameDetail, HealthResponse, Player } from '@/api/types'
import { GmSheet } from '@/features/play/GmSheet'
import { HealthPanel } from '@/features/play/HealthPanel'
import { MultiplayerPanel } from '@/features/play/MultiplayerPanel'
import { useT } from '@/i18n/t'
import { confirmDestructive } from '@/lib/confirm'
import { buildShareLink } from '@/lib/share-link'
import { shareExportBlob } from '@/lib/share-export'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

/** 简单的剪贴板工具（优先使用 React Native 内置 Clipboard） */
async function copyToClipboard(text: string): Promise<void> {
  try {
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

type GmPanelTab = 'controls' | 'players' | 'health'

interface GmPanelSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 页签状态由宿主持有：打开入口（情境行）决定落点，与拆分前一致 */
  tab: GmPanelTab
  onTabChange: (tab: GmPanelTab) => void
  gameKey: string
  detail: GameDetail | null
  players: Player[]
  isGm: boolean
  currentUserId: string
  health: HealthResponse | null
  busy: boolean
  /** 面板内只负责收起自己；房间密码/换世界/支付提案弹窗由宿主屏幕持有 */
  onOpenRoomPassword: () => void
  onOpenWorldSwitch: () => void
  onOpenPaymentComposer: () => void
}

/** GM 桌面管理抽屉：流程、玩家和健康事件各自成组，不与剧情地图混放。 */
export function GmPanelSheet({
  open,
  onOpenChange,
  tab,
  onTabChange,
  gameKey,
  detail,
  players,
  isGm,
  currentUserId,
  health,
  busy,
  onOpenRoomPassword,
  onOpenWorldSwitch,
  onOpenPaymentComposer,
}: GmPanelSheetProps) {
  const t = useT()

  async function runGm(action: () => Promise<void>) {
    try {
      await action()
    } catch (e) {
      useGameStore.setState({ error: errorMessage(e) })
    }
  }

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
      // 「绑定」是 Bot 端协议命令字，不随界面语言变化，故不做 i18n
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
      const safeKey =
        gameKey.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'game'
      await shareExportBlob(
        blob,
        `diceframe-${safeKey}-${Date.now()}.zip`,
        t('dfPlayExportDialogTitle'),
      )
    } catch {
      // 错误由 store 处理
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

  return (
    <Sheet open={open} onClose={() => onOpenChange(false)} className="h-[85%]" scrollable={false}>
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as GmPanelTab)}
        className="min-h-0 flex-1"
      >
        <TabsList>
          <TabsTrigger value="controls">
            <Text variant="small">{t('dfPlayTabControls')}</Text>
          </TabsTrigger>
          <TabsTrigger value="players">
            <Text variant="small">{t('players')}</Text>
          </TabsTrigger>
          <TabsTrigger value="health">
            <Text variant="small">{t('dfPlayStatus')}</Text>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="controls" className="min-h-0 flex-1 pt-2">
          <GmSheet
            detail={detail!}
            multiplayer={detail?.multiplayer}
            busy={busy}
            showFlowControls={false}
            showPlayerRoster={false}
            onAdvance={() =>
              void runGm(() => useGameStore.getState().advance())
            }
            onRollback={() =>
              void runGm(() => useGameStore.getState().rollback())
            }
            onCommand={(text) =>
              void runGm(() => useGameStore.getState().command(text))
            }
            onRecap={() => void handleRecap()}
            onBotBind={() => void handleBotBind()}
            onInvite={() => void handleInvite()}
            onToggleMode={() =>
              void runGm(() => useGameStore.getState().toggleMode())
            }
            onToggleAccess={() =>
              void runGm(() => useGameStore.getState().toggleAccess())
            }
            onRoomPassword={() => {
              onOpenChange(false)
              onOpenRoomPassword()
            }}
            onWorldSwitch={() => {
              onOpenChange(false)
              onOpenWorldSwitch()
            }}
            onCreatePayment={() => {
              onOpenChange(false)
              onOpenPaymentComposer()
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
            currentUserId={currentUserId}
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
  )
}
