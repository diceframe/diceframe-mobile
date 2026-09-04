import * as React from 'react'
import { View } from 'react-native'

import { errorMessage } from '@/api/client'
import type { Player } from '@/api/types'
import { Sheet } from '@/components/patterns/sheet'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { buildPaymentProposalPayload } from '@/lib/economy-prompts'

interface PaymentComposerSheetProps {
  open: boolean
  players: Player[]
  busy: boolean
  onClose: () => void
  onSubmit: (payload: ReturnType<typeof buildPaymentProposalPayload>) => Promise<void>
}

/** GM 发起支付提案；创建只入队，实际扣款由付款角色确认。 */
export function PaymentComposerSheet({
  open,
  players,
  busy,
  onClose,
  onSubmit,
}: PaymentComposerSheetProps) {
  const t = useT()
  const firstUid = players[0]?.user_id ?? ''
  const [payerUid, setPayerUid] = React.useState('')
  const [recipientUid, setRecipientUid] = React.useState('')
  const [amountText, setAmountText] = React.useState('1')
  const [reason, setReason] = React.useState('')
  const [items, setItems] = React.useState('')
  const [formError, setFormError] = React.useState('')

  const payer = payerUid || firstUid
  const recipient = recipientUid || payer
  const amount = Number(amountText)
  const amountValid = Number.isInteger(amount) && amount >= 1 && amount <= 100000
  const options = players.map((player) => ({
    label: player.character_name || player.user_id,
    value: player.user_id,
  }))

  async function submit() {
    if (!payer || !amountValid || busy) return
    setFormError('')
    try {
      await onSubmit(buildPaymentProposalPayload(payer, recipient, amount, reason, items))
    } catch (error) {
      // Modal 会挡住页面顶部错误横幅，因此表单内也要保留可见错误。
      setFormError(errorMessage(error))
    }
  }

  function close() {
    setFormError('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} className="h-auto">
      <View className="gap-4 pt-1">
        <View className="gap-1">
          <Text variant="h3">{t('createPaymentProposal')}</Text>
          <Text variant="muted">{t('paymentProposalHelp')}</Text>
        </View>
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold">{t('paymentPayer')}</Text>
          <SheetSelect options={options} value={payer} onValueChange={setPayerUid} />
        </View>
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold">{t('paymentRecipient')}</Text>
          <SheetSelect options={options} value={recipient} onValueChange={setRecipientUid} />
        </View>
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold">{t('paymentAmount')}</Text>
          <Input
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            editable={!busy}
          />
        </View>
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold">{t('paymentReason')}</Text>
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder={t('paymentReasonPlaceholder')}
            maxLength={240}
            editable={!busy}
          />
        </View>
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold">{t('paymentItems')}</Text>
          <Input
            value={items}
            onChangeText={setItems}
            placeholder={t('paymentItemsPlaceholder')}
            editable={!busy}
          />
        </View>
        {formError ? <Text className="text-sm text-destructive">{formError}</Text> : null}
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onPress={close}>
            <Text>{t('cancel')}</Text>
          </Button>
          <Button className="flex-1" disabled={busy || !payer || !amountValid} onPress={() => void submit()}>
            <Text>{busy ? t('saving') : t('createProposal')}</Text>
          </Button>
        </View>
      </View>
    </Sheet>
  )
}
