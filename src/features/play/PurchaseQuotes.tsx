import { View } from 'react-native'

import type { Player } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { purchaseQuoteKey, purchaseQuoteSourceFor, type PurchaseQuote } from '@/lib/purchase-quotes'

export function PurchaseQuotes({
  quotes,
  players,
  actorId,
  isGm,
  busy,
  readOnly,
  onOpenQuote,
}: {
  quotes: PurchaseQuote[]
  players: Player[]
  actorId: string
  isGm: boolean
  busy: boolean
  readOnly: boolean
  onOpenQuote: (quote: PurchaseQuote) => void
}) {
  const t = useT()

  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-3">
      <Text className="font-semibold">{t('dfPlayPurchaseQuotes')}</Text>
      {quotes.map((quote) => {
        const payer = players.find((player) => player.user_id === quote.payer_uid)
        const source = payer && !readOnly ? purchaseQuoteSourceFor(quote, actorId, isGm) : null
        return (
          <View key={purchaseQuoteKey(quote)} className="items-start gap-1 border-t border-border pt-2">
            <Text variant="small">
              {t('purchaseQuoteBody', {
                player: payer?.character_name || quote.payer_uid,
                item: quote.target,
                count: quote.quantity,
              })}
            </Text>
            {source ? (
              <Button className="min-h-11" variant="outline" disabled={busy} onPress={() => onOpenQuote(quote)}>
                <Text>{t(source === 'gm_manual' ? 'purchaseQuoteGmOpen' : 'purchaseQuoteSelfBid')}</Text>
              </Button>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
