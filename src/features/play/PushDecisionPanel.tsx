import * as React from 'react'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/api/client'
import type { CheckResult } from '@/api/types'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import {
  isSupportedPush,
  pushControlsOf,
  pushRequestBody,
  type PushOperation,
  type PushStatus,
} from '@/lib/push-decision'
import { useGameStore } from '@/stores/game'

const STATUS_KEY: Record<PushStatus, TKey> = {
  pending: 'dfPushRollStatusPending',
  requested: 'dfPushRollStatusRequested',
  offered: 'dfPushRollStatusOffered',
  resolved: 'dfPushRollStatusResolved',
  declined: 'dfPushRollStatusDeclined',
  rejected: 'dfPushRollStatusRejected',
}

/** 与上游 textarea maxlength 一致，服务端同样截断校验 */
const DRAFT_MAX = 1000

/**
 * 检定卡内的孤注一掷区（对齐上游 PushDecisionPanel）。宿主以 push.run_id 作 key 挂载：
 * 换一轮/换一次检定时整个面板重建，草稿与「调整风险」开关自然清空。
 */
export function PushDecisionPanel({
  check,
  actorId,
  isGm,
}: {
  check: CheckResult
  actorId: string
  isGm: boolean
}) {
  const t = useT()
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [adjustingRisk, setAdjustingRisk] = React.useState(false)
  const push = check.push
  if (!push) return null

  if (!isSupportedPush(push)) {
    return (
      <View className="gap-1 rounded-lg border border-border p-3">
        <Text className="font-semibold">{t('dfPushRollTitle')}</Text>
        <Text variant="small" className="text-muted-foreground">{t('dfPushRollStale')}</Text>
      </View>
    )
  }

  const owner = !!actorId && actorId === check.actor_uid
  const controls = pushControlsOf(push, { owner, isGm, adjustingRisk })
  const checkId = check.check_id ?? ''
  const actionable = !!checkId

  const statusText =
    owner && isGm && push.status === 'pending' ? t('dfPushRollOwnerPending')
      : owner && isGm && push.status === 'requested' ? t('dfPushRollOwnerRequested')
        : owner && isGm && push.status === 'offered' ? t('dfPushRollOwnerOffered')
          : t(STATUS_KEY[push.status])

  async function send(operation: PushOperation) {
    if (!push || busy || !actionable) return
    setBusy(true)
    setError('')
    try {
      await useGameStore.getState().decidePush(checkId, operation, pushRequestBody(push, operation, draft.trim()))
      setDraft('')
      if (operation === 'offer') setAdjustingRisk(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const draftEmpty = !draft.trim()

  return (
    <View className="gap-1.5 rounded-lg border border-border p-3">
      <Text className="font-semibold">{t('dfPushRollTitle')}</Text>
      <Text variant="small">{statusText}</Text>
      {push.reason ? (
        <Text variant="small" className="text-muted-foreground">
          {t('dfPushRollReason')}: {push.reason}
        </Text>
      ) : null}
      {push.consequence ? (
        <Text variant="small">
          <Text variant="small" className="font-semibold">{t('dfPushRollRisk')}: </Text>
          {push.consequence}
        </Text>
      ) : null}
      {push.decision_reason ? (
        <Text variant="small" className="text-muted-foreground">
          {push.decision_reason === 'push_disabled_by_gm' ? t('dfPushRollDisabled') : push.decision_reason}
        </Text>
      ) : null}
      {push.original ? (
        <Text variant="small" className="font-mono">
          {push.original.roll ?? '?'} → {check.roll ?? '?'}
        </Text>
      ) : null}
      {push.failed ? (
        <Text variant="small" className="text-destructive">{t('dfPushRollFailed')}</Text>
      ) : null}

      {actionable ? (
        <>
          {push.status === 'pending' && owner ? (
            <Text variant="small" className="text-muted-foreground">{t('dfPushRollHint')}</Text>
          ) : null}
          {controls.adjustRisk ? (
            <Button size="sm" variant="outline" className="self-start" onPress={() => setAdjustingRisk(true)}>
              <Text>{t('dfPushRollAdjustRisk')}</Text>
            </Button>
          ) : null}
          {controls.draft ? (
            <View className="gap-1">
              <Text variant="small" className="text-muted-foreground">
                {controls.draft === 'reason' ? t('dfPushRollReason') : t('dfPushRollRisk')}
              </Text>
              <Textarea
                value={draft}
                onChangeText={setDraft}
                maxLength={DRAFT_MAX}
                editable={!busy}
                numberOfLines={3}
                className="min-h-16"
                accessibilityLabel={controls.draft === 'reason' ? t('dfPushRollReason') : t('dfPushRollRisk')}
              />
            </View>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {controls.request ? (
              <Button size="sm" disabled={busy || draftEmpty} onPress={() => void send('request')}>
                <Text>{t('dfPushRollRequest')}</Text>
              </Button>
            ) : null}
            {controls.review ? (
              <>
                <Button size="sm" disabled={busy || draftEmpty} onPress={() => void send('offer')}>
                  <Text>{t('dfPushRollOffer')}</Text>
                </Button>
                <Button size="sm" variant="outline" disabled={busy || draftEmpty} onPress={() => void send('reject')}>
                  <Text>{t('dfPushRollReject')}</Text>
                </Button>
              </>
            ) : null}
            {controls.confirm ? (
              <Button size="sm" disabled={busy} onPress={() => void send('confirm')}>
                <Text>{t('dfPushRollConfirm')}</Text>
              </Button>
            ) : null}
            {controls.decline ? (
              <Button size="sm" variant="outline" disabled={busy} onPress={() => void send('decline')}>
                <Text>{t('dfPushRollDecline')}</Text>
              </Button>
            ) : null}
          </View>
        </>
      ) : null}
      {error ? (
        <Text variant="small" className="text-destructive" accessibilityRole="alert">{error}</Text>
      ) : null}
    </View>
  )
}
