import type { GameDetail, PaymentProposalCreatePayload, PendingPayment } from '@/api/types'

import { buildPaymentProposalPayload } from './economy-prompts'

export type PurchaseQuote = NonNullable<GameDetail['pending_purchase_quotes']>[number]
export type PurchaseQuoteSource = 'gm_manual' | 'player_self'

/** 当前投影没有报价 ID；上游按付款人、物品、数量去重。 */
export function purchaseQuoteKey(quote: PurchaseQuote): string {
  return JSON.stringify([quote.payer_uid, quote.target.toLowerCase(), quote.quantity])
}

function validQuote(quote: PurchaseQuote): boolean {
  return typeof quote?.payer_uid === 'string' && !!quote.payer_uid.trim()
    && typeof quote.target === 'string' && !!quote.target.trim()
    && Array.from(quote.target).length <= 120
    && Number.isInteger(quote.quantity) && quote.quantity >= 1 && quote.quantity <= 8
}

function proposalCoversQuote(proposal: PendingPayment, quote: PurchaseQuote): boolean {
  // 本端生成的报价用同名物品重复 N 次。只匹配整单，避免把不同数量或组合购误当成同一笔。
  return proposal.status === 'pending' && proposal.kind === 'purchase'
    && proposal.payer_uid === quote.payer_uid && proposal.recipient_uid === quote.payer_uid
    && Array.isArray(proposal.rewards) && proposal.rewards.length === quote.quantity
    && proposal.rewards.every((reward) => typeof reward?.name === 'string' && reward.name.toLowerCase() === quote.target.toLowerCase())
}

export function purchaseQuotesOf(
  detail: Pick<GameDetail, 'pending_purchase_quotes' | 'economy_proposals' | 'run_id'> | null | undefined,
  submitted: readonly string[] = [],
): PurchaseQuote[] {
  const seen = new Set(submitted)
  if (!Array.isArray(detail?.pending_purchase_quotes)) return []
  const proposals = Array.isArray(detail.economy_proposals) ? detail.economy_proposals : []
  const result: PurchaseQuote[] = []
  for (const row of detail.pending_purchase_quotes) {
    if (!validQuote(row)) continue
    const quote = { ...row, target: row.target.trim() }
    const key = purchaseQuoteKey(quote)
    if (seen.has(key)) continue
    seen.add(key)
    // 服务端意图是回合内投影，开单后仍可能在详情里。待确认的权威提案优先。
    if (proposals.some((proposal) => proposal && proposal.run_id === detail.run_id && proposalCoversQuote(proposal, quote))) continue
    result.push(quote)
  }
  return result
}

export function purchaseQuoteSourceFor(quote: PurchaseQuote, actorId: string, isGm: boolean): PurchaseQuoteSource | null {
  if (!actorId) return null
  if (isGm) return 'gm_manual'
  return quote.payer_uid === actorId ? 'player_self' : null
}

export function buildPurchaseQuotePayload(
  quote: PurchaseQuote,
  source: PurchaseQuoteSource,
  amount: number,
  reason: string,
): PaymentProposalCreatePayload {
  if (!validQuote(quote)) throw new RangeError('invalid purchase quote')
  const { payer_uid: payerUid, target, quantity } = quote
  return {
    ...buildPaymentProposalPayload(payerUid, payerUid, amount, reason, ''),
    // 投影里的目标是一个完整物品名，可能包含逗号。不能用手工表单的分隔符拆开。
    items: Array.from({ length: quantity }, () => target.trim()),
    ...(source === 'player_self' ? { source } : {}),
  }
}
