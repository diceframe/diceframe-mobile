import * as React from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'
import { CheckSquare, Square } from 'lucide-react-native'

import { contentErrorKey, contentErrorMessage } from '@/api/content'
import type { ContentKind } from '@/api/types'
import { Sheet } from '@/components/patterns/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'

import { createPullSession, type PullContext } from './pull-runner'
import { RULESET_CARD_UNSUPPORTED, type PullItemStatus, type PullOutcome, type PullSession, type PullState, type ServerItemSource } from './pull-session'
import { isSelectable, pullListRows, pullProgress, type PullListRow, type PullRowState } from './pull-view'
import { openPushContext } from './push-runner'

const ROW_KEYS: Record<PullRowState, TKey> = {
  'new': 'dfPullStateNew',
  'embedded': 'dfPullStateEmbedded',
  'in-sync': 'dfSyncInSync',
  'local-changes': 'dfSyncLocalChanges',
  'server-changed': 'dfSyncServerChanged',
  'both-changed': 'dfSyncBothChanged',
  'server-deleted': 'dfSyncServerDeleted',
}

const STATUS_KEYS: Record<PullItemStatus, TKey> = {
  'pending': 'dfPushStatusPending',
  'created': 'dfPullStatusCreated',
  'updated': 'dfPullStatusUpdated',
  'kept-both': 'dfPullStatusKeptBoth',
  'unchanged': 'dfPushStatusUnchanged',
  'unsupported': 'dfPushStatusUnsupported',
  'rejected': 'dfPushStatusRejected',
  'skipped': 'dfPushStatusSkipped',
  'server-deleted': 'dfPullStatusServerDeleted',
  'not-found': 'dfPullStatusNotFound',
  'cancelled': 'dfPushStatusCancelled',
  'not_attempted': 'dfPushStatusNotAttempted',
}

/**
 * 从服务器拉取（M6）：列出服务器上的某类内容 → 勾选 → 逐项拉取，显示进度与每项结果，
 * 可在两项之间停止。列举来源由调用方经 ServerItemSource 注入（真实列举接口待服务端合入）。
 */
export function PullSheet({ open, kind, source, onClose }: {
  open: boolean
  kind: ContentKind
  source: (context: PullContext) => ServerItemSource
  onClose: () => void
}) {
  const t = useT()
  const [context, setContext] = React.useState<PullContext | null>(null)
  const [rows, setRows] = React.useState<PullListRow[] | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [session, setSession] = React.useState<PullSession | null>(null)
  const [state, setState] = React.useState<PullState | null>(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const opened = await openPushContext()
        const refs = await source(opened).list(kind)
        if (cancelled) return
        setContext(opened)
        setRows(pullListRows(refs, opened.library, opened.server.serverInstanceId))
      } catch (cause) {
        if (!cancelled) setError(contentErrorMessage(cause))
      }
    })()
    return () => { cancelled = true }
  }, [open, kind, source])

  React.useEffect(() => session?.subscribe(setState), [session])

  function toggle(canonicalId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(canonicalId)) next.delete(canonicalId)
      else next.add(canonicalId)
      return next
    })
  }

  async function start() {
    if (!context || !rows || !selected.size) return
    const created = createPullSession(context, rows.filter((row) => selected.has(row.ref.canonicalId)).map((row) => row.ref))
    setSession(created)
    setState(created.getState())
    await created.start()
  }

  function close() {
    session?.cancel()
    onClose()
  }

  function outcomeText(outcome: PullOutcome): string {
    if (outcome.status === 'kept-both') return t('dfPullKeptBothHint')
    if (outcome.code === RULESET_CARD_UNSUPPORTED) return t('dfPullRulesetUnsupported')
    if (outcome.code === 'ENTRY_TOO_LARGE' && outcome.entryId) return t('dfPushEntryTooLarge', { entry: outcome.entryId })
    const key = contentErrorKey(outcome.code)
    return key ? t(key) : ''
  }

  const selectable = rows?.filter(isSelectable) ?? []
  const progress = state ? pullProgress(state.outcomes) : null

  return (
    <Sheet open={open} onClose={close} className="h-[85%]" scrollable={false}>
      <View className="min-h-0 flex-1 gap-3 pt-1">
        <Text variant="h3">{t('dfPullTitle')}</Text>
        {error ? <Text className="text-destructive">{error}</Text> : null}

        {!session ? (
          <>
            <Text variant="small" className="text-muted-foreground">{t('dfPullSelectHint')}</Text>
            {!rows && !error ? <ActivityIndicator /> : null}
            {rows && !rows.length ? <Text variant="muted">{t('dfPullNothing')}</Text> : null}
            <ScrollView className="flex-1" contentContainerClassName="gap-1 pb-4">
              {rows?.map((row) => {
                const enabled = isSelectable(row)
                return (
                  <Pressable
                    key={row.ref.canonicalId}
                    disabled={!enabled}
                    onPress={() => toggle(row.ref.canonicalId)}
                    className={`flex-row items-center gap-3 rounded-lg border border-border px-3 py-2 ${enabled ? '' : 'opacity-50'}`}
                  >
                    <Icon as={selected.has(row.ref.canonicalId) ? CheckSquare : Square} size={18} />
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1}>{row.ref.name || row.ref.canonicalId}</Text>
                    </View>
                    <Badge variant="outline"><Text className="text-[10px]">{t(ROW_KEYS[row.state])}</Text></Badge>
                    {row.ref.lockedReason ? <Badge variant="secondary"><Text className="text-[10px]">{t('dfPullLocked')}</Text></Badge> : null}
                  </Pressable>
                )
              })}
            </ScrollView>
            <View className="flex-row gap-2 pb-4">
              <Button variant="outline" className="flex-1" disabled={!selectable.length}
                onPress={() => setSelected(new Set(selectable.map((row) => row.ref.canonicalId)))}>
                <Text>{t('dfPushSelectAll')}</Text>
              </Button>
              <Button className="flex-1" disabled={!selected.size || !context} onPress={() => void start()}>
                <Text>{t('dfPullStart')}</Text>
              </Button>
            </View>
          </>
        ) : state ? (
          <>
            {state.phase === 'pulling' && progress ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator />
                <Text variant="small">{t('dfPullProgress', progress)}</Text>
              </View>
            ) : null}
            {state.phase === 'stopped' && state.stopCode ? (
              <Text className="text-destructive">{t(contentErrorKey(state.stopCode) ?? 'dfPullStopped')}</Text>
            ) : null}
            <ScrollView className="flex-1" contentContainerClassName="gap-2 pb-4">
              {state.outcomes.map((outcome) => (
                <View key={`${outcome.kind}:${outcome.canonicalId}`} className="gap-0.5 rounded-lg border border-border p-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 font-medium" numberOfLines={1}>{outcome.name || outcome.canonicalId}</Text>
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
              {state.phase === 'pulling' ? (
                <Button variant="outline" className="flex-1" onPress={() => session.cancel()}><Text>{t('dfPushStop')}</Text></Button>
              ) : (
                <Button className="flex-1" onPress={close}>
                  <Text>{state.phase === 'done' ? t('dfPullDone') : t('dfPushClose')}</Text>
                </Button>
              )}
            </View>
          </>
        ) : null}
      </View>
    </Sheet>
  )
}
