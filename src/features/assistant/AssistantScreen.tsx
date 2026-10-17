import * as React from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import { useRouter, type Href } from 'expo-router'
import { ChevronDown, ChevronUp, FileText, RefreshCw, Send, Sparkles, Square, Trash2 } from 'lucide-react-native'

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
  eventResultText,
  resultAssetId,
  type AssistantEventRecord,
  type AssistantMessage,
} from '@/lib/assistant-agent'
import { mobileRouteOf } from '@/lib/assistant-routes'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import { cn } from '@/lib/utils'
import { useAssistantStore } from '@/stores/assistant'
import { useSettingsStore } from '@/stores/settings'

import { AgentApprovalCard } from './AgentApprovalCard'
import { AgentDraftCard } from './AgentDraftCard'
import { AgentMarkdown } from './AgentMarkdown'
import { agentStatusLabel, agentToolLabel } from './agentLabels'

/** Agent 结果里的生成图：鉴权资源经 data URI 显示，过期 / 失败时只留文字结果 */
function ResultImage({ assetId, gameKey }: { assetId: string; gameKey?: string }) {
  const path = gameKey
    ? `/games/${encodeURIComponent(gameKey)}/generated-images/${encodeURIComponent(assetId)}`
    : `/generated-images/${encodeURIComponent(assetId)}`
  const uri = useAssetUri(assetSource(path))
  if (!uri) return null
  return <Image source={{ uri }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 8 }} contentFit="cover" />
}

function ToolResult({ event, gameKey }: { event: AssistantEventRecord; gameKey?: string }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const { payload } = event
  const failed = payload.ok === false
  const assetId = resultAssetId(payload.result)
  const summary = eventResultText(payload.result) || (typeof payload.error === 'string' ? payload.error : '')
  return (
    <View className="gap-1.5 border-t border-border pt-2">
      <Text variant="small">
        <Text variant="small" className={cn('font-semibold', failed ? 'text-destructive' : 'text-success')}>
          {failed ? t('dfAgentFailure') : payload.partial ? t('dfAgentPartial') : t('dfAgentSuccess')}
        </Text>
        {' · '}{agentToolLabel(t, payload.tool)}
      </Text>
      {summary ? <Text variant="small" className="text-muted-foreground" numberOfLines={3}>{summary}</Text> : null}
      {assetId ? <ResultImage assetId={assetId} gameKey={gameKey} /> : null}
      {payload.result !== undefined ? (
        <>
          <Pressable onPress={() => setOpen(!open)} className="self-start active:opacity-70">
            <Text variant="small" className="text-muted-foreground">{open ? t('dfAgentHideDetails') : t('dfAgentDetails')}</Text>
          </Pressable>
          {open ? <Text selectable className="font-mono text-xs text-muted-foreground">{eventResultText(payload.result, true)}</Text> : null}
        </>
      ) : null}
    </View>
  )
}

function MessageBubble({
  message,
  last,
  streaming,
  awaitingApproval,
  onRetry,
}: {
  message: AssistantMessage
  last: boolean
  streaming: boolean
  awaitingApproval: boolean
  onRetry: () => void
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
  const [resultsOpen, setResultsOpen] = React.useState(false)
  const [navigationMissing, setNavigationMissing] = React.useState(false)
  const scrollRef = React.useRef<ScrollView>(null)
  const language = contentLanguage()

  React.useEffect(() => {
    if (!ownerToken || !baseUrl) return
    const store = useAssistantStore.getState()
    void store.load(baseUrl).then(() => useAssistantStore.getState().restoreSession())
  }, [baseUrl, ownerToken])

  const draftList = Object.values(drafts)
  const toolResults = messages.flatMap((message) => message.events ?? []).filter((event) => event.event === 'tool_result')
  const hasTasks = draftList.length > 0 || !!pendingApproval || !!actionError || !!navigation || toolResults.length > 0
  const workspaceVisible = hasTasks || streaming || messages.length > 0
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

  function send(text: string) {
    const value = text.trim()
    if (!value || streaming) return
    setDraft('')
    setNavigationMissing(false)
    void useAssistantStore.getState().send(value, language)
  }

  function followNavigation() {
    if (!navigation) return
    const href = mobileRouteOf(navigation)
    if (!href) {
      setNavigationMissing(true)
      return
    }
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
          <Button
            variant="ghost"
            size="icon"
            disabled={!messages.length}
            onPress={() => void useAssistantStore.getState().clear()}
            accessibilityLabel={t('assistantClear')}
          >
            <Icon as={Trash2} size={18} />
          </Button>
        }
      />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pb-4"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {!messages.length ? (
          <View className="items-center gap-3 py-8">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/15">
              <Icon as={Sparkles} size={26} className="text-primary" />
            </View>
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
            onRetry={() => void useAssistantStore.getState().retryLast(language)}
          />
        ))}

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
                {!hasTasks ? <Text variant="small" className="text-muted-foreground">{t('dfAgentWorkspaceHint')}</Text> : null}
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

                {toolResults.length ? (
                  <View className="gap-2">
                    <Pressable onPress={() => setResultsOpen(!resultsOpen)} className="flex-row items-center gap-1 active:opacity-70">
                      <Text variant="small" className="font-semibold">{t('dfAgentTool')} ({toolResults.length})</Text>
                      <Icon as={resultsOpen ? ChevronUp : ChevronDown} size={14} className="text-muted-foreground" />
                    </Pressable>
                    {resultsOpen ? toolResults.map((event, index) => (
                      <ToolResult key={index} event={event} gameKey={context?.game_key} />
                    )) : null}
                  </View>
                ) : null}

                {navigation ? (
                  <View className="gap-1">
                    <Button size="sm" variant="outline" className="self-start" onPress={followNavigation}>
                      <Text>{navigation.route === 'play' ? t('dfAgentOpenGame') : t('dfAgentOpenPage')}</Text>
                    </Button>
                    {navigationMissing ? <Text variant="small" className="text-muted-foreground">{t('dfAgentPageUnavailable')}</Text> : null}
                  </View>
                ) : null}

                {messages.length && !streaming && !pendingApproval ? (
                  <Button size="sm" variant="ghost" className="self-start" onPress={() => send(t('dfAgentContinue'))}>
                    <Text>{t('dfAgentContinue')}</Text>
                  </Button>
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

      <View className="flex-row items-end gap-2 border-t border-border px-3 pt-2" style={{ paddingBottom: 8 + keyboardHeight }}>
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
    </Screen>
  )
}
