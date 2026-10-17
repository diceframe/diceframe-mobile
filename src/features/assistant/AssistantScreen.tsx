import * as React from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import { useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronDown, ChevronUp, FileText, History, RefreshCw, Send, Sparkles, Square } from 'lucide-react-native'

import { assetSource } from '@/api/assets'
import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useAssetUri } from '@/features/play/useAssetUri'
import { contentLanguage, useT } from '@/i18n/t'
import {
  actionNavigationOf,
  messageActions,
  resultAssetId,
  type AssistantEventRecord,
  type AssistantMessage,
  type AssistantNavigation,
} from '@/lib/assistant-agent'
import { mobileRouteOf } from '@/lib/assistant-routes'
import type { AvatarMood } from '@/lib/assistant-reactions'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import { cn } from '@/lib/utils'
import { useAssistantStore } from '@/stores/assistant'
import { useSettingsStore } from '@/stores/settings'

import { AgentApprovalCard } from './AgentApprovalCard'
import { AgentDraftCard } from './AgentDraftCard'
import { AgentMarkdown } from './AgentMarkdown'
import { agentRouteLabel, agentStatusLabel, agentToolLabel } from './agentLabels'
import { ConversationSheet } from './ConversationSheet'
import { DiceFamiliar } from './DiceFamiliar'

/** Agent 结果里的生成图：鉴权资源经 data URI 显示，过期 / 失败时只留文字结果 */
function ResultImage({ assetId, gameKey }: { assetId: string; gameKey?: string }) {
  const path = gameKey
    ? `/games/${encodeURIComponent(gameKey)}/generated-images/${encodeURIComponent(assetId)}`
    : `/generated-images/${encodeURIComponent(assetId)}`
  const uri = useAssetUri(assetSource(path))
  if (!uri) return null
  return <Image source={{ uri }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 8 }} contentFit="cover" />
}

/**
 * 回复下方的操作标签（上游 PR #549）：✓/✕ + 操作名；导航结果带「前往」，生成图直接显示。
 * 不再把原始 JSON 堆在工作区里。
 */
function ActionChip({
  event,
  gameKey,
  onGo,
}: {
  event: AssistantEventRecord
  gameKey?: string
  onGo: (target: AssistantNavigation) => void
}) {
  const t = useT()
  const { payload } = event
  const failed = payload.ok === false
  const target = actionNavigationOf(event)
  const assetId = resultAssetId(payload.result)
  const label = target
    ? t('dfAgentGoTo', { page: agentRouteLabel(t, target.route) })
    : `${agentToolLabel(t, payload.tool)}${failed ? ` · ${t('dfAgentFailure')}` : payload.partial ? ` · ${t('dfAgentPartial')}` : ''}`
  return (
    <View className="gap-1.5">
      {/* 导航标签整颗可点（点了才前往）；其余操作标签只是记录 */}
      <Pressable
        disabled={!target}
        onPress={() => target && onGo(target)}
        className={cn(
          'flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-1',
          target ? 'border-primary active:bg-accent' : 'border-border',
        )}
        accessibilityRole={target ? 'button' : undefined}
      >
        <Text variant="small" className={failed ? 'text-destructive' : 'text-success'}>{failed ? '✕' : '✓'}</Text>
        <Text variant="small" className={target ? 'text-primary' : 'text-muted-foreground'}>{label}</Text>
      </Pressable>
      {assetId ? <ResultImage assetId={assetId} gameKey={gameKey} /> : null}
    </View>
  )
}

function MessageBubble({
  message,
  last,
  streaming,
  awaitingApproval,
  gameKey,
  onRetry,
  onGo,
}: {
  message: AssistantMessage
  last: boolean
  streaming: boolean
  awaitingApproval: boolean
  gameKey?: string
  onRetry: () => void
  onGo: (target: AssistantNavigation) => void
}) {
  const t = useT()
  const [showSources, setShowSources] = React.useState(false)
  if (message.role === 'user') {
    return (
      <View className="max-w-[85%] self-end rounded-lg rounded-tr-sm bg-primary/15 px-3 py-2">
        <Text selectable className="leading-6">{message.content}</Text>
      </View>
    )
  }
  const placeholder = last && !message.content && (streaming || awaitingApproval)
  return (
    <View className="flex-row gap-2">
      <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-primary/15">
        <Icon as={Sparkles} size={14} className="text-primary" />
      </View>
      <View className="min-w-0 flex-1 gap-1.5">
        {message.content ? (
          <View className="rounded-lg rounded-tl-sm border border-border bg-card px-3 py-2">
            <AgentMarkdown text={message.content} />
          </View>
        ) : placeholder ? (
          <View className="flex-row items-center gap-2 self-start rounded-lg border border-border bg-card px-3 py-2">
            {awaitingApproval ? null : <ActivityIndicator size="small" />}
            <Text variant="small" className="text-muted-foreground">
              {awaitingApproval ? t('dfAgentStatusApproval') : t('assistantThinking')}
            </Text>
          </View>
        ) : null}
        {messageActions(message).map((event, index) => (
          <ActionChip key={index} event={event} gameKey={gameKey} onGo={onGo} />
        ))}
        {message.sources?.length ? (
          <View className="gap-1">
            <Pressable onPress={() => setShowSources(!showSources)} className="flex-row items-center gap-1 self-start active:opacity-70">
              <Icon as={FileText} size={12} className="text-muted-foreground" />
              <Text variant="small" className="text-muted-foreground">{t('assistantSources')}</Text>
            </Pressable>
            {showSources ? message.sources.map((source) => (
              <Text key={`${source.source}:${source.heading}`} variant="small" className="ml-4 text-muted-foreground">• {source.heading}</Text>
            )) : null}
          </View>
        ) : null}
        {message.error || message.stopped ? (
          <View className="flex-row items-center gap-2">
            <Text variant="small" className={message.error ? 'text-destructive' : 'text-muted-foreground'}>
              {message.error || t('assistantStopped')}
            </Text>
            {last ? (
              <Pressable onPress={onRetry} className="flex-row items-center gap-1 active:opacity-70" accessibilityRole="button">
                <Icon as={RefreshCw} size={12} className="text-primary" />
                <Text variant="small" className="text-primary">{t('assistantRetry')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

/**
 * DF Agent 主屏（对齐上游 AssistantPanel）：对话流 + 任务工作区（状态、内容草稿、待确认操作、
 * 执行结果、页面跳转）+ 输入区。只对房主开放；进入时按当前服务器载入本机历史并恢复会话。
 */
export function AssistantScreen() {
  const t = useT()
  const router = useRouter()
  const keyboardHeight = useKeyboardHeight()
  // Screen 不含底边安全区；键盘高度不含导航条，两者相加才落在键盘上方（同对局页输入区）
  const insets = useSafeAreaInsets()
  const baseUrl = useSettingsStore((s) => s.baseUrl)
  const ownerToken = useSettingsStore((s) => s.token)
  const messages = useAssistantStore((s) => s.messages)
  const streaming = useAssistantStore((s) => s.streaming)
  const status = useAssistantStore((s) => s.status)
  const pendingApproval = useAssistantStore((s) => s.pendingApproval)
  const drafts = useAssistantStore((s) => s.drafts)
  const navigation = useAssistantStore((s) => s.navigation)
  const actionBusy = useAssistantStore((s) => s.actionBusy)
  const actionError = useAssistantStore((s) => s.actionError)
  const context = useAssistantStore((s) => s.context)
  const [draft, setDraft] = React.useState('')
  const [workspaceOpen, setWorkspaceOpen] = React.useState(true)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [navigationMissing, setNavigationMissing] = React.useState(false)
  const scrollRef = React.useRef<ScrollView>(null)
  const language = contentLanguage()

  React.useEffect(() => {
    if (!ownerToken || !baseUrl) return
    const store = useAssistantStore.getState()
    void store.load(baseUrl).then(() => useAssistantStore.getState().restoreSession())
  }, [baseUrl, ownerToken])

  const draftList = Object.values(drafts)
  // 上游 #549：工作区只在有事要处理时出现——草稿、待确认、出错、有待前往的页面、或执行中有进度
  // 回答里 navigate 的页面已经以「前往」标签挂在那条回复下面，工作区不再重复；
  // 只有确认操作后带出的跳转（如建局后的「打开游戏」）才放进工作区
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
  const chipNavigations = lastAssistant ? messageActions(lastAssistant).map(actionNavigationOf) : []
  const navigationInChip = !!navigation && chipNavigations.some((item) => item
    && item.route === navigation.route && item.query?.game === navigation.query?.game)
  const pendingNavigation = navigation && !navigationInChip ? navigation : null
  const hasTasks = draftList.length > 0 || !!pendingApproval || !!actionError || !!pendingNavigation
  const workspaceVisible = hasTasks || (streaming && !!status)
  const attention = !!actionError || !!pendingApproval?.expired || !!pendingApproval?.recovery_required
  const workspaceStatus = attention
    ? t('dfAgentAttention')
    : pendingApproval
      ? t('dfAgentStatusApproval')
      : streaming || actionBusy
        ? t('dfAgentWorking')
        : draftList.length
          ? t('dfAgentDrafts', { count: draftList.length })
          : t('dfAgentStatusIdle')
  const busy = streaming || actionBusy
  // 骰灵表情跟随助手状态（同上游入口）：处理中托腮、待确认举手、出错着急
  const headerMood: AvatarMood = streaming || actionBusy ? 'thinking' : pendingApproval ? 'attention' : actionError ? 'worried' : 'idle'

  function send(text: string) {
    const value = text.trim()
    if (!value || streaming) return
    setDraft('')
    setNavigationMissing(false)
    void useAssistantStore.getState().send(value, language)
  }

  /**
   * 前往 Agent 打开的页面。上游悬浮窗会在回答中自动跳转；移动端助手是全屏页，自动跳走会
   * 打断正在看的回复，所以保持显式按钮，用户点了才走。
   */
  function go(target: AssistantNavigation) {
    const href = mobileRouteOf(target)
    if (!href) {
      setNavigationMissing(true)
      return
    }
    setNavigationMissing(false)
    useAssistantStore.getState().clearNavigation()
    router.push(href as Href)
  }

  if (!ownerToken) {
    return (
      <Screen>
        <PageHeader title={t('assistantTitle')} onBack={() => router.back()} />
        <View className="gap-4 px-4">
          <Text variant="muted">{t('dfAgentOwnerOnly')}</Text>
          <Button className="self-start" onPress={() => router.push('/login')}>
            <Text>{t('dfSettingsServer')}</Text>
          </Button>
        </View>
      </Screen>
    )
  }

  const quickQuestions = [
    t('dfAgentCreate'),
    t('dfAgentStart'),
    t('assistantQuickPlayers'),
    t('assistantQuickPlugin'),
    t('assistantQuickLogs'),
  ]

  return (
    <Screen>
      <PageHeader
        title={t('assistantTitle')}
        subtitle={t('assistantSubtitle')}
        onBack={() => router.back()}
        right={
          <View className="flex-row items-center gap-1">
            {messages.length ? <DiceFamiliar mood={headerMood} size={36} hands={false} /> : null}
            <Button variant="ghost" size="icon" onPress={() => setHistoryOpen(true)} accessibilityLabel={t('dfAgentHistory')}>
              <Icon as={History} size={18} />
            </Button>
          </View>
        }
      />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pb-4"
        keyboardShouldPersistTaps="handled"
        // 有对话才跟随到底部；空状态从顶部看（骰灵和引导在上面）
        onContentSizeChange={() => {
          if (messages.length) scrollRef.current?.scrollToEnd({ animated: true })
          else scrollRef.current?.scrollTo({ y: 0, animated: false })
        }}
      >
        {!messages.length ? (
          <View className="items-center gap-3 py-8">
            <DiceFamiliar mood={headerMood === 'idle' ? 'happy' : headerMood} size={96} />
            <Text className="text-center font-semibold">{t('assistantEmpty')}</Text>
            <Text variant="muted" className="text-center">{t('assistantEmptyHint')}</Text>
            <View className="w-full gap-2">
              {quickQuestions.map((question) => (
                <Pressable
                  key={question}
                  onPress={() => send(question)}
                  disabled={streaming}
                  className="rounded-lg border border-border px-3 py-2.5 active:bg-accent"
                >
                  <Text>{question}</Text>
                </Pressable>
              ))}
            </View>
            <Text variant="small" className="text-center text-muted-foreground">{t('assistantVersionHint')}</Text>
          </View>
        ) : null}

        {messages.map((message, index) => (
          <MessageBubble
            key={index}
            message={message}
            last={index === messages.length - 1}
            streaming={streaming}
            awaitingApproval={!!pendingApproval}
            gameKey={context?.game_key}
            onRetry={() => void useAssistantStore.getState().retryLast(language)}
            onGo={go}
          />
        ))}

        {/* 标签与工作区的「前往」都可能指向移动端没有的页面，提示放在两者之外 */}
        {navigationMissing ? <Text variant="small" className="text-muted-foreground">{t('dfAgentPageUnavailable')}</Text> : null}

        {workspaceVisible ? (
          <View className="gap-2.5 rounded-xl border border-border bg-card/60 p-3">
            <Pressable
              onPress={() => setWorkspaceOpen(!workspaceOpen)}
              className="flex-row items-center gap-2 active:opacity-70"
              accessibilityRole="button"
              accessibilityState={{ expanded: workspaceOpen }}
            >
              <Text className="flex-1 font-semibold">{t('dfAgentWorkspaceTitle')}</Text>
              <Text variant="small" className={attention || pendingApproval ? 'text-warning' : 'text-muted-foreground'}>
                {workspaceStatus}
              </Text>
              <Icon as={workspaceOpen ? ChevronUp : ChevronDown} size={16} className="text-muted-foreground" />
            </Pressable>

            {workspaceOpen ? (
              <View className="gap-2.5">
                {pendingApproval || (streaming && status) ? (
                  <Text variant="small" className="text-muted-foreground">
                    {t('dfAgentStatus')}: {pendingApproval ? t('dfAgentStatusApproval') : agentStatusLabel(t, status)}
                  </Text>
                ) : null}

                {draftList.map((item) => (
                  <AgentDraftCard
                    key={`${item.draft_id}:${item.review.plan_digest ?? ''}:${String(item.review.ok)}`}
                    draft={item}
                    disabled={busy}
                    onEdit={(draftId) => void useAssistantStore.getState().invalidateApproval(draftId)}
                    onReview={(draftId, edited) => void useAssistantStore.getState().reviewDraft(draftId, edited)}
                    onSave={(draftId) => void useAssistantStore.getState().saveDraft(draftId, language)}
                  />
                ))}

                {actionError ? <Text variant="small" className="text-destructive" accessibilityRole="alert">{actionError}</Text> : null}

                {pendingNavigation ? (
                  <View className="gap-1">
                    <Button size="sm" variant="outline" className="self-start" onPress={() => go(pendingNavigation)}>
                      <Text>{pendingNavigation.route === 'play' ? t('dfAgentOpenGame') : t('dfAgentGoTo', { page: agentRouteLabel(t, pendingNavigation.route) })}</Text>
                    </Button>
                  </View>
                ) : null}

                {pendingApproval ? (
                  <AgentApprovalCard
                    approval={pendingApproval}
                    busy={actionBusy}
                    onConfirm={() => void useAssistantStore.getState().confirmApproval(true)}
                    onCancel={() => void useAssistantStore.getState().cancelApproval()}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View className="flex-row items-end gap-2 border-t border-border px-3 pt-2" style={{ paddingBottom: 8 + keyboardHeight + insets.bottom }}>
        <Textarea
          value={draft}
          onChangeText={setDraft}
          placeholder={t('assistantPlaceholder')}
          numberOfLines={4}
          className="min-h-11 flex-1"
          accessibilityLabel={t('assistantPlaceholder')}
        />
        {streaming ? (
          <Button size="icon" variant="outline" className="h-11 w-11" onPress={() => useAssistantStore.getState().stop()} accessibilityLabel={t('assistantStop')}>
            <Icon as={Square} size={18} />
          </Button>
        ) : (
          <Button size="icon" className="h-11 w-11" disabled={!draft.trim()} onPress={() => send(draft)} accessibilityLabel={t('assistantSend')}>
            <Icon as={Send} size={18} />
          </Button>
        )}
      </View>
      <ConversationSheet open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </Screen>
  )
}
