import * as React from 'react'
import { View } from 'react-native'

import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { errorMessage } from '@/api/client'
import type { PendingPayment } from '@/api/types'
import { useT } from '@/i18n/t'

interface PaymentModalProps {
  /** 当前用户名下的待决议支付请求（selectMyPendingPayment 派生），null 表示无请求不弹 */
  payment: PendingPayment | null
  /** 决议回调：走 store.decidePayment（POST /payments/{id} 后 refresh） */
  onResolve: (paymentId: string, accepted: boolean) => Promise<void>
}

/**
 * GM 支付决议弹窗（补齐 Web PlayView 的 pending_payments 流程）。
 *
 * 弹出语义与 Web 略有收敛：Web 每次 detail 刷新都会把未决议的同一请求重新弹出
 * （「稍后」只延迟到下一次刷新）；移动端输入靠软键盘占屏，反复抢焦点代价更高，
 * 因此同一请求「稍后」后不再自动重弹，直到出现新的请求 id。请求仍会留在
 * detail.pending_payments 里，玩家随时可从再次进入对局页等新请求时机处理。
 */
export function PaymentModal({ payment, onResolve }: PaymentModalProps) {
  const t = useT()
  // 服务端决议路由只认支付 id；上游契约里 id/payment_id 双字段并存，取前者回退后者
  const paymentId = payment?.id ?? payment?.payment_id
  const paymentKey = paymentId ? String(paymentId) : ''

  const [dismissedKey, setDismissedKey] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [resolveError, setResolveError] = React.useState('')
  // 记录最近一次自动弹出过的请求 key，用于识别「新请求」
  const lastShownKeyRef = React.useRef('')

  // 新请求 key 出现（含上一条决议完、refresh 带回队列里的下一条）时清掉
  // 「稍后」记忆与失败态，保证每次新请求都会弹出
  React.useEffect(() => {
    if (!paymentKey || paymentKey === lastShownKeyRef.current) return
    lastShownKeyRef.current = paymentKey
    setDismissedKey('')
    setResolveError('')
  }, [paymentKey])

  // 决议成功后立即收起，不等 refresh 往返；失败则保持展开让玩家重试或稍后
  const open = !!payment && !!paymentKey && paymentKey !== dismissedKey

  function later() {
    if (busy) return
    setDismissedKey(paymentKey)
  }

  async function resolve(accepted: boolean) {
    if (!paymentKey || busy) return
    setBusy(true)
    setResolveError('')
    try {
      await onResolve(paymentKey, accepted)
      setDismissedKey(paymentKey)
    } catch (e) {
      // store 已把错误写入顶部横幅；弹窗内再留一行便于对照当前请求重试
      setResolveError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open || !payment) return null

  const reason = payment.reason ? t('gmPaymentReason', { reason: payment.reason }) : ''
  // 分隔符用语言中立的「 · 」，避免中文顿号出现在英/日文界面
  const rewardNames = (payment.rewards ?? []).map((item) => item.name).join(' · ')

  return (
    <Sheet open onClose={later}>
      <View className="gap-4 pb-2">
        <Text variant="h3">{t('gmPaymentTitle')}</Text>
        <Text>{t('gmPaymentContent', { amount: payment.amount ?? 0, reason })}</Text>
        {rewardNames.length > 0 && (
          <Text>{t('gmPaymentRewards', { items: rewardNames })}</Text>
        )}
        <Text variant="muted">{t('gmPaymentHelp')}</Text>
        {resolveError ? (
          <Text className="text-sm text-destructive">{resolveError}</Text>
        ) : null}
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onPress={later}>
            <Text>{t('later')}</Text>
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={busy}
            onPress={() => void resolve(false)}
          >
            <Text>{t('reject')}</Text>
          </Button>
          <Button className="flex-1" disabled={busy} onPress={() => void resolve(true)}>
            <Text>{busy ? t('dfPlayPaymentResolving') : t('confirmPurchase')}</Text>
          </Button>
        </View>
      </View>
    </Sheet>
  )
}
