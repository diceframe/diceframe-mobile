import { describe, expect, it } from 'vitest'

import type { CurrencySystem, PendingPayment } from '@/api/types'

import { parseCurrencyInput } from './currency'
import {
  buildPurchaseQuotePayload,
  purchaseQuoteKey,
  purchaseQuotesOf,
  purchaseQuoteSourceFor,
  type PurchaseQuote,
} from './purchase-quotes'

const quote: PurchaseQuote = { payer_uid: 'alice', target: '红药水，微苦', quantity: 2 }

const payment: PendingPayment = {
  kind: 'purchase',
  status: 'pending',
  payer_uid: 'alice',
  recipient_uid: 'alice',
  run_id: 'run-1',
  rewards: [{ name: quote.target }, { name: quote.target }],
}

const dollars: CurrencySystem = {
  base_unit: 'cent',
  display_unit: 'dollar',
  units: [{ id: 'cent', name: '美分', rate: 1 }, { id: 'dollar', name: '美元', rate: 100 }],
}

describe('待报价投影', () => {
  it('无投影不显示；仅展示有效意图，数量错误不能静默改成另一笔购买', () => {
    expect(purchaseQuotesOf(null)).toEqual([])
    expect(purchaseQuotesOf({})).toEqual([])
    expect(purchaseQuotesOf({ pending_purchase_quotes: [
      quote,
      { ...quote, target: '  ' },
      { ...quote, payer_uid: '' },
      { ...quote, target: '药'.repeat(121) },
      { ...quote, quantity: 0 },
      { ...quote, quantity: 9 },
      { ...quote, quantity: 1.5 },
    ] })).toEqual([quote])
  })

  it('按付款人、物品和数量去重，报价成功后本轮不提示重复开单', () => {
    const otherPlayer = { ...quote, payer_uid: 'bob' }
    const otherQuantity = { ...quote, quantity: 1 }
    const detail = { pending_purchase_quotes: [quote, quote, otherPlayer, otherQuantity] }
    expect(purchaseQuotesOf(detail)).toEqual([quote, otherPlayer, otherQuantity])
    expect(purchaseQuotesOf(detail, [purchaseQuoteKey(quote)])).toEqual([otherPlayer, otherQuantity])
  })

  it('刷新后已有同一份待确认提案时不再显示待报价，不吞掉其它交易', () => {
    const detail = { run_id: 'run-1', pending_purchase_quotes: [quote] }
    expect(purchaseQuotesOf({ ...detail, economy_proposals: [payment] })).toEqual([])
    expect(purchaseQuotesOf({ ...detail, economy_proposals: [
      { ...payment, run_id: 'old-run' },
      { ...payment, status: 'rejected' },
      { ...payment, payer_uid: 'bob', recipient_uid: 'bob' },
      { ...payment, rewards: [payment.rewards![0]] },
      { ...payment, rewards: [payment.rewards![0], { name: '面包' }] },
    ] })).toEqual([quote])
  })
})

describe('待报价提交', () => {
  it('GM 可为任意席位开单，玩家只能为本席位出价', () => {
    expect(purchaseQuoteSourceFor(quote, 'gm', true)).toBe('gm_manual')
    expect(purchaseQuoteSourceFor(quote, 'alice', false)).toBe('player_self')
    expect(purchaseQuoteSourceFor(quote, 'alice', true)).toBe('gm_manual')
    expect(purchaseQuoteSourceFor(quote, 'bob', false)).toBeNull()
    expect(purchaseQuoteSourceFor(quote, '', true)).toBeNull()
  })

  it('两种入口都只创建提案，保留物品名、数量、付款席和整数金额', () => {
    const amount = parseCurrencyInput('0.25', dollars)
    expect(amount).toBe(25)
    const expected = {
      payer_uid: 'alice', recipient_uid: 'alice', amount: 25,
      reason: '总价', items: [quote.target, quote.target],
    }
    expect(buildPurchaseQuotePayload(quote, 'gm_manual', amount!, ' 总价 ')).toEqual(expected)
    expect(buildPurchaseQuotePayload(quote, 'player_self', amount!, ' 总价 ')).toEqual({ ...expected, source: 'player_self' })
  })

  it('不能把零、非整数基础单位或越界数量转成有效订单', () => {
    expect(() => buildPurchaseQuotePayload(quote, 'gm_manual', 0, '')).toThrow(RangeError)
    expect(() => buildPurchaseQuotePayload(quote, 'player_self', 2.5, '')).toThrow(RangeError)
    expect(() => buildPurchaseQuotePayload({ ...quote, quantity: 9 }, 'player_self', 10, '')).toThrow(RangeError)
  })
})
