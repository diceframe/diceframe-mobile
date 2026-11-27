import * as React from 'react'
import { View } from 'react-native'

import { errorMessage } from '@/api/client'
import type { CurrencySystem, PaymentProposalCreatePayload, Player } from '@/api/types'
import { Sheet } from '@/components/patterns/sheet'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { currencyEditableUnitLabel, parseCurrencyInput } from '@/lib/currency'
import { buildPaymentProposalPayload } from '@/lib/economy-prompts'
import { buildPurchaseQuotePayload, type PurchaseQuote, type PurchaseQuoteSource } from '@/lib/purchase-quotes'

interface PaymentComposerSheetProps {
  players: Player[]
  quoteDraft?: { quote: PurchaseQuote; source: PurchaseQuoteSource }
  currencySystem?: CurrencySystem | null
  busy: boolean
  onClose: () => void
  onSubmit: (payload: PaymentProposalCreatePayload) => Promise<void>
}

/** 创建只入队，付款角色仍要另行确认。引用待报价时，角色、物品和数量取自投影。 */
export function PaymentComposerSheet({
  players,
  quoteDraft,
  currencySystem = null,
  busy,
  onClose,
  onSubmit,
}: PaymentComposerSheetProps) {
  const t = useT()
  const firstUid = players[0]?.user_id ?? ''
  const [payerUid, setPayerUid] = React.useState('')
  const [recipientUid, setRecipientUid] = React.useState('')
  const [amountText, setAmountText] = React.useState(quoteDraft ? '' : '1')
  const [reason, setReason] = React.useState('')
  const [items, setItems] = React.useState('')
  const [formError, setFormError] = React.useState('')

  const payer = quoteDraft?.quote.payer_uid || payerUid || firstUid
  const recipient = quoteDraft ? payer : recipientUid || payer
  const payerName = players.find((player) => player.user_id === payer)?.character_name || payer
  // 上限按 canonical 整数；规则还没加载时不能错按无单位金额解析。
  const amount = currencySystem ? parseCurrencyInput(amountText, currencySystem) : null
  const amountValid = amount !== null && amount <= 100000
  // 解析单位可能回退到基础单位；报价输入的是整单总价，不是单价。
  const amountUnit = currencyEditableUnitLabel(currencySystem)
  const amountLabel = t(quoteDraft ? 'dfPlayPurchaseQuoteTotal' : 'paymentAmount')
  const options = players.map((player) => ({
    label: player.character_name || player.user_id,
    value: player.user_id,
  }))

  async function submit() {
    if (!payer || amount === null || !amountValid || busy) return
    setFormError('')
    try {
      const payload = quoteDraft
        ? buildPurchaseQuotePayload(quoteDraft.quote, quoteDraft.source, amount, reason)
        : buildPaymentProposalPayload(payer, recipient, amount, reason, items)
      await onSubmit(payload)
    } catch (error) {
      // Modal 会挡住页面顶部错误横幅，因此表单内也要保留可见错误。
      setFormError(errorMessage(error))
    }
  }

  return (
    <Sheet open onClose={onClose} className="h-auto">
      <View className="gap-4 pt-1">
        <View className="gap-1">
          <Text variant="h3">{t('createPaymentProposal')}</Text>
          <Text variant="muted">{t('paymentProposalHelp')}</Text>
        </View>
        {quoteDraft ? (
          <Text variant="small">
            {t('purchaseQuoteBody', { player: payerName, item: quoteDraft.quote.target, count: quoteDraft.quote.quantity })}
          </Text>
        ) : (
          <>
            <View className="gap-1.5">
              <Text variant="small" className="font-semibold">{t('paymentPayer')}</Text>
              <SheetSelect options={options} value={payer} onValueChange={setPayerUid} />
            </View>
            <View className="gap-1.5">
              <Text variant="small" className="font-semibold">{t('paymentRecipient')}</Text>
              <SheetSelect options={options} value={recipient} onValueChange={setRecipientUid} />
            </View>
          </>
        )}
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold">
            {amountUnit ? `${amountLabel}（${amountUnit}）` : amountLabel}
          </Text>
          <Input
            value={currencySystem ? amountText : ''}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder={currencySystem ? undefined : t('dfCommonLoading')}
            editable={!busy && !!currencySystem}
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
        {!quoteDraft ? (
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('paymentItems')}</Text>
            <Input
              value={items}
              onChangeText={setItems}
              placeholder={t('paymentItemsPlaceholder')}
              editable={!busy}
            />
          </View>
        ) : null}
        {formError ? <Text className="text-sm text-destructive">{formError}</Text> : null}
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onPress={onClose}>
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
