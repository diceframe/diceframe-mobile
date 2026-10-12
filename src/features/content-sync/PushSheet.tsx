import * as React from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { CheckSquare, Square } from 'lucide-react-native'

import { contentCodeText, contentErrorKey, contentErrorMessage } from '@/api/content'
import type { ContentDecision } from '@/api/types'
import { Sheet } from '@/components/patterns/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import { confirmDestructive } from '@/lib/confirm'

import { createPushSession, loadPushList, openPushContext, type PushContext, type PushListItem } from './push-runner'
import type { ItemOutcome, ItemStatus, PlanRow, PushSession, PushState } from './push-session'
import type { LocalSyncState } from './sync-state'

const SYNC_KEYS: Record<LocalSyncState, TKey> = {
  'never': 'dfSyncNever',
  'in-sync': 'dfSyncInSync',
  'local-changes': 'dfSyncLocalChanges',
  'server-changed': 'dfSyncServerChanged',
  'both-changed': 'dfSyncBothChanged',
  'server-deleted': 'dfSyncServerDeleted',
}

const STATUS_KEYS: Record<ItemStatus, TKey> = {
  pending: 'dfPushStatusPending',
  created: 'dfPushStatusCreated',
  updated: 'dfPushStatusUpdated',
  duplicated: 'dfPushStatusDuplicated',
  skipped: 'dfPushStatusSkipped',
  unchanged: 'dfPushStatusUnchanged',
  error: 'dfPushStatusError',
  not_attempted: 'dfPushStatusNotAttempted',
  excluded: 'dfPushStatusExcluded',
  unsupported: 'dfPushStatusUnsupported',
  rejected: 'dfPushStatusRejected',
  cancelled: 'dfPushStatusCancelled',
}

const DECISION_KEYS: Record<ContentDecision, TKey> = {
  update: 'dfPushDecisionUpdate',
  duplicate: 'dfPushDecisionDuplicate',
  skip: 'dfPushDecisionSkip',
}

/**
 * 推送到服务器（M5）：选择本机项 → 预览 → 逐项决策 → 提交，按批进行，可在两步之间停止。
 * 只有房主能打开（入口由调用方按 currentPushAccess 决定是否显示）；没设访问密码的服务器
 * 在开始前必须确认警告。
 */
export function PushSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const [context, setContext] = React.useState<PushContext | null>(null)
  const [list, setList] = React.useState<PushListItem[] | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [session, setSession] = React.useState<PushSession | null>(null)
  const [state, setState] = React.useState<PushState | null>(null)
  const [error, setError] = React.useState('')
  // 打开 / 列举失败后重试：换一个值重新跑加载
  const [loadAttempt, setLoadAttempt] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const opened = await openPushContext()
        const items = await loadPushList(opened)
        if (cancelled) return
        setContext(opened)
        setList(items)
      } catch (cause) {
        if (!cancelled) setError(contentErrorMessage(cause))
      }
    })()
    return () => { cancelled = true }
  }, [open, loadAttempt])

  React.useEffect(() => session?.subscribe(setState), [session])

  function toggle(localId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(localId)) next.delete(localId)
      else next.add(localId)
      return next
    })
  }

  async function start() {
    if (!context || !selected.size) return
    if (context.access === 'passwordless') {
      const ok = await confirmDestructive({
        title: t('dfPushPasswordlessTitle'),
        message: t('dfPushPasswordlessMessage'),
        confirmText: t('dfPushPasswordlessConfirm'),
        cancelText: t('dfCommonCancel'),
      })
      if (!ok) return
    }
    const created = createPushSession(context, [...selected])
    setSession(created)
    setState(created.getState())
    await created.start()
  }

  function close() {
    session?.cancel()
    onClose()
  }

  const nameOf = (localId: string) => list?.find((item) => item.summary.localId === localId)?.summary.name ?? localId

  function rowTitle(row: PlanRow): string {
    return row.clientRef === row.localId ? nameOf(row.localId) : t('dfPushEmbeddedBook', { name: nameOf(row.localId) })
  }

  function outcomeText(outcome: ItemOutcome): string {
    if (outcome.code === 'ENTRY_TOO_LARGE' && outcome.entryId) return t('dfPushEntryTooLarge', { entry: outcome.entryId })
    return contentCodeText(outcome.code)
  }

  const busy = state?.phase === 'previewing' || state?.phase === 'committing'

  return (
    <Sheet open={open} onClose={close} className="h-[85%]" scrollable={false}>
      <View className="min-h-0 flex-1 gap-3 pt-1">
        <Text variant="h3">{t('dfPushTitle')}</Text>
        {error ? (
          <View className="gap-2">
            <Text className="text-destructive">{error}</Text>
            {!session ? (
              <Button variant="outline" onPress={() => { setError(''); setLoadAttempt((attempt) => attempt + 1) }}>
                <Text>{t('dfCommonRetry')}</Text>
              </Button>
            ) : null}
          </View>
        ) : null}

        {!session ? (
          // 选择要推送的本机项
          <>
            <Text variant="small" className="text-muted-foreground">{t('dfPushSelectHint')}</Text>
            {!list && !error ? <ActivityIndicator /> : null}
            {list && !list.length ? <Text variant="muted">{t('dfPushNothing')}</Text> : null}
            <ScrollView className="flex-1" contentContainerClassName="gap-1 pb-4">
              {list?.map(({ summary, syncState }) => (
                <Pressable
                  key={summary.localId}
                  onPress={() => toggle(summary.localId)}
                  className="flex-row items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <Icon as={selected.has(summary.localId) ? CheckSquare : Square} size={18} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1}>{summary.name || summary.localId}</Text>
                    <Text variant="small" className="text-muted-foreground">
                      {summary.kind === 'lorebook' ? 'Lorebook' : summary.ruleId}
                    </Text>
                  </View>
                  <Badge variant="outline"><Text className="text-[10px]">{t(SYNC_KEYS[syncState])}</Text></Badge>
                  {summary.readOnly ? <Badge variant="secondary"><Text className="text-[10px]">{t('dfLocalCardReadOnly')}</Text></Badge> : null}
                </Pressable>
              ))}
            </ScrollView>
            {list?.some((item) => item.summary.kind === 'lorebook' && (item.syncState === 'server-changed' || item.syncState === 'both-changed')) ? (
              <Text variant="small" className="text-muted-foreground">{t('dfPushBookRevisionNote')}</Text>
            ) : null}
            <View className="flex-row gap-2 pb-4">
              <Button variant="outline" className="flex-1" disabled={!list?.length}
                onPress={() => setSelected(new Set(list?.map((item) => item.summary.localId)))}>
                <Text>{t('dfPushSelectAll')}</Text>
              </Button>
              <Button className="flex-1" disabled={!selected.size || !context} onPress={() => void start()}>
                <Text>{t('dfPushPreview')}</Text>
              </Button>
            </View>
          </>
        ) : state ? (
          <>
            {state.batchCount > 1 ? (
              <Text variant="small" className="text-muted-foreground">
                {t('dfPushBatch', { index: Math.min(state.batchIndex + 1, state.batchCount), count: state.batchCount })}
              </Text>
            ) : null}
            {busy ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator />
                <Text variant="small">{state.phase === 'previewing' ? t('dfPushPreviewing') : t('dfPushCommitting')}</Text>
              </View>
            ) : null}
            {state.stale ? <Text className="text-destructive">{t('dfPushStale')}</Text> : null}
            {state.phase === 'stopped' && state.stopCode ? (
              <Text className="text-destructive">{contentCodeText(state.stopCode, 'dfErrorsUnexpected')}</Text>
            ) : null}

            <ScrollView className="flex-1" contentContainerClassName="gap-2 pb-4">
              {state.phase === 'review' && state.plan ? state.plan.rows.map((row) => (
                <View key={row.clientRef} className={`gap-1 rounded-lg border p-3 ${row.changed ? 'border-destructive' : 'border-border'}`}>
                  <Text className="font-medium" numberOfLines={1}>{rowTitle(row)}</Text>
                  <Text variant="small" className="text-muted-foreground">
                    {t(row.action === 'create' ? 'dfPushActionCreate'
                      : row.action === 'unchanged' ? 'dfPushActionUnchanged'
                        : row.action === 'unsupported' ? 'dfPushActionUnsupported' : 'dfPushActionUpdate')}
                  </Text>
                  {row.existing?.server_modified ? <Text variant="small" className="text-destructive">{t('dfPushServerModified')}</Text> : null}
                  {row.kind === 'lorebook' && row.existing && row.action === 'update' ? (
                    <>
                      <Text variant="small">{t('dfPushEntriesDiff', {
                        add: row.existing.entries_add ?? 0, update: row.existing.entries_update ?? 0, remove: row.existing.entries_remove ?? 0,
                      })}</Text>
                      <Text variant="small" className="text-muted-foreground">{t('dfPushMirrorNote')}</Text>
                    </>
                  ) : null}
                  {row.existing?.bindings?.length ? (
                    <Text variant="small">{t('dfPushBindings', { count: row.existing.bindings.length })}</Text>
                  ) : null}
                  {row.reason && contentErrorKey(row.reason) ? <Text variant="small">{t(contentErrorKey(row.reason)!)}</Text> : null}
                  {row.warnings.map((warning) => (
                    <Text key={warning.code} variant="small" className="text-muted-foreground">
                      {contentErrorKey(warning.code) ? t(contentErrorKey(warning.code)!) : warning.message || warning.code}
                    </Text>
                  ))}
                  {row.existing && row.action !== 'unchanged' ? (
                    <View className="flex-row flex-wrap gap-2 pt-1">
                      {row.allowed.map((decision) => (
                        <Button key={decision} size="sm" variant={row.decision === decision ? 'default' : 'outline'}
                          onPress={() => session.setDecision(row.clientRef, decision)}>
                          <Text>{t(DECISION_KEYS[decision])}</Text>
                        </Button>
                      ))}
                    </View>
                  ) : null}
                </View>
              )) : null}

              {/* 各项结果（进行中也显示已出结果的项） */}
              {state.outcomes.filter((outcome) => outcome.status !== 'pending' || state.phase === 'done' || state.phase === 'stopped').map((outcome) => (
                <View key={outcome.localId} className="gap-0.5 rounded-lg border border-border p-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 font-medium" numberOfLines={1}>{outcome.name || outcome.localId}</Text>
                    <Badge variant="outline"><Text className="text-[10px]">{t(STATUS_KEYS[outcome.status])}</Text></Badge>
                  </View>
                  {outcomeText(outcome) ? <Text variant="small" className="text-muted-foreground">{outcomeText(outcome)}</Text> : null}
                  {outcome.warnings.map((warning) => (
                    <Text key={warning.code} variant="small" className="text-muted-foreground">
                      {contentErrorKey(warning.code) ? t(contentErrorKey(warning.code)!) : warning.message || warning.code}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>

            <View className="flex-row gap-2 pb-4">
              {state.phase === 'review' ? (
                <>
                  <Button variant="outline" className="flex-1" onPress={() => session.cancel()}><Text>{t('dfPushStop')}</Text></Button>
                  <Button className="flex-1" disabled={session.undecided().length > 0} onPress={() => void session.commit()}>
                    <Text>{t('dfPushCommit')}</Text>
                  </Button>
                </>
              ) : state.phase === 'paused' ? (
                <>
                  <Button variant="outline" className="flex-1" onPress={() => void session.continueWithNext()}><Text>{t('dfPushContinue')}</Text></Button>
                  <Button className="flex-1" onPress={() => void session.retryFailed()}><Text>{t('dfPushRetryFailed')}</Text></Button>
                </>
              ) : busy ? (
                <Button variant="outline" className="flex-1" onPress={() => session.cancel()}><Text>{t('dfPushStop')}</Text></Button>
              ) : (
                <Button className="flex-1" onPress={close}>
                  <Text>{state.phase === 'done' ? t('dfPushDone') : t('dfPushClose')}</Text>
                </Button>
              )}
            </View>
          </>
        ) : null}
      </View>
    </Sheet>
  )
}
