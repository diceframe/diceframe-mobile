import * as React from 'react'
import { View } from 'react-native'

import { errorMessage } from '@/api/client'
import type { PaymentResolveResponse, PendingPayment } from '@/api/types'
import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import {
  economyProposalPermissions,
  isNonBlockingPersonalPurchase,
} from '@/lib/economy-prompts'

interface PaymentModalProps {
  payment: PendingPayment | null
  currency: string
  playerName: (uid?: string) => string
  actorId: string
  gmUid: string
  runId: string
  solo?: boolean
  onDismiss: (paymentId: string) => void
  onResolve: (paymentId: string, accepted: boolean) => Promise<PaymentResolveResponse>
}

/** 权威经济提案弹窗：个人支付、购买与 GM 奖励；全队分摊已随上游 schema 8 退役。 */
export function PaymentModal({
  payment,
  currency,
  playerName,
  actorId,
  gmUid,
  runId,
  solo = false,
  onDismiss,
  onResolve,
}: PaymentModalProps) {
  const t = useT()
  const [busy, setBusy] = React.useState(false)
  const [resolveError, setResolveError] = React.useState('')
  const paymentId = String(payment?.id ?? '')

  function dismiss() {
    if (!busy && paymentId) onDismiss(paymentId)
  }

  async function resolve(accepted: boolean) {
    if (!paymentId || busy) return
    setBusy(true)
    setResolveError('')
    try {
      await onResolve(paymentId, accepted)
      // 决议写入成功就立即本地收起；后续 detail 刷新失败也不能诱导重复提交。
      onDismiss(paymentId)
    } catch (error) {
      // store 同时写顶部横幅；弹窗保留错误，避免当前提案失去重试上下文。
      setResolveError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!payment || !paymentId) return null

  const isReward = payment.kind === 'reward'
  const permission = economyProposalPermissions(payment, actorId, gmUid)
  const target = playerName(payment.payer_uid || payment.uid)
  const reason = payment.reason ? t('gmPaymentReason', { reason: payment.reason }) : ''
  const title = isReward ? t('economyRewardTitle') : t('gmPaymentTitle')
  const content = isReward
    ? t(solo ? 'economySoloRewardContent' : 'economyRewardContent', {
        target: playerName(payment.recipient_uid || payment.uid),
        amount: payment.amount ?? 0,
        currency,
        reason: payment.reason ?? '',
      })
    : t('gmPaymentContent', {
        target,
        amount: payment.amount ?? 0,
        currency,
        reason,
      })
  const help = isReward
    ? t(solo ? 'economySoloRewardHelp' : 'economyRewardHelp')
    : isNonBlockingPersonalPurchase(payment, runId)
      ? t('economyPersonalPurchaseHelp')
      : t('gmPaymentHelp')
  const dismissLabel = isNonBlockingPersonalPurchase(payment, runId)
    ? t('economyPostpone')
    : t('economyViewLater')
  const confirmLabel = isReward
    ? t(solo ? 'economySoloRewardConfirm' : 'economyApproveReward')
    : t('confirmPurchase')
  const rewardNames = (payment.rewards ?? []).map((item) => item.name).join(' · ')

  return (
    <Sheet open onClose={dismiss}>
      <View className="gap-4 pb-2">
        <Text variant="h3">{title}</Text>
        <Text>{content}</Text>
        {rewardNames ? <Text>{t('gmPaymentRewards', { items: rewardNames })}</Text> : null}
        <Text variant="muted">{help}</Text>
        {resolveError ? <Text className="text-sm text-destructive">{resolveError}</Text> : null}
        <View className="flex-row flex-wrap gap-2">
          <Button variant="outline" className="min-w-28 flex-1" disabled={busy} onPress={dismiss}>
            <Text>{dismissLabel}</Text>
          </Button>
          {permission.canReject ? (
            <Button
              variant="destructive"
              className="min-w-24 flex-1"
              disabled={busy}
              onPress={() => void resolve(false)}
            >
              <Text>{permission.canAccept ? t('reject') : t('cancel')}</Text>
            </Button>
          ) : null}
          {permission.canAccept ? (
            <Button className="min-w-28 flex-1" disabled={busy} onPress={() => void resolve(true)}>
              <Text>{busy ? t('dfPlayPaymentResolving') : confirmLabel}</Text>
            </Button>
          ) : null}
        </View>
      </View>
    </Sheet>
  )
}
