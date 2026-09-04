import { describe, expect, it } from 'vitest'

import type { PendingPayment } from '@/api/types'
import {
  buildPaymentProposalPayload,
  economyProposalList,
  economyProposalPermissions,
  isEconomyProposalActionable,
  isNonBlockingPersonalPurchase,
  nextEconomyProposal,
} from './economy-prompts'

function pending(values: Partial<PendingPayment>): PendingPayment {
  return { id: 'proposal', status: 'pending', ...values }
}

describe('权威经济提案', () => {
  it('只有无副作用的个人购买允许非阻塞稍后处理', () => {
    const purchase = pending({
      id: 'purchase',
      run_id: 'run-1',
      kind: 'purchase',
      payer_uid: 'player',
      recipient_uid: 'player',
      approval_policy: 'payer',
      rewards: [{ name: 'Potion' }],
    })
    expect(isNonBlockingPersonalPurchase(purchase, 'run-1')).toBe(true)
    expect(isNonBlockingPersonalPurchase(purchase, 'run-2')).toBe(false)
    expect(isNonBlockingPersonalPurchase({ ...purchase, effect_group_id: 'effect-1' }, 'run-1')).toBe(false)
    expect(isNonBlockingPersonalPurchase({ ...purchase, memory_delta: { note: 'later' } }, 'run-1')).toBe(false)
    expect(isNonBlockingPersonalPurchase({ ...purchase, approval_policy: 'all_contributors' }, 'run-1')).toBe(false)
  })

  it('优先使用权威投影，空投影兼容旧支付队列', () => {
    const legacy = pending({ id: 'legacy', uid: 'player' })
    const authoritative = pending({ id: 'authoritative', payer_uid: 'player' })

    expect(economyProposalList({
      game_key: 'game',
      pending_payments: [legacy],
      economy_proposals: [authoritative],
    })).toEqual([authoritative])
    expect(economyProposalList({
      game_key: 'game',
      pending_payments: [legacy],
      economy_proposals: [],
    })).toEqual([legacy])
  })

  it('付款只交给付款人，GM 审批的奖励只交给 GM', () => {
    const charge = pending({ id: 'charge', payer_uid: 'payer', approval_policy: 'payer' })
    const reward = pending({ id: 'reward', recipient_uid: 'player', approval_policy: 'gm' })

    expect(isEconomyProposalActionable(charge, 'payer', 'gm')).toBe(true)
    expect(isEconomyProposalActionable(charge, 'other', 'gm')).toBe(false)
    expect(isEconomyProposalActionable(reward, 'player', 'gm')).toBe(false)
    expect(isEconomyProposalActionable(reward, 'gm', 'gm')).toBe(true)
  })

  it('分摊参与者确认后不再操作，GM 仍可取消阻塞提案', () => {
    const split = pending({
      approval_policy: 'all_contributors',
      contributors: [
        { uid: 'first', amount: 2 },
        { uid: 'second', amount: 3 },
      ],
      approvals: { first: true },
    })

    expect(isEconomyProposalActionable(split, 'first', 'gm')).toBe(false)
    expect(isEconomyProposalActionable(split, 'second', 'gm')).toBe(true)
    expect(economyProposalPermissions(split, 'gm', 'gm')).toEqual({
      canAccept: false,
      canReject: true,
    })
  })

  it('GM 对普通付款只有取消权，缺少策略的旧支付保留批准权', () => {
    const payment = pending({ payer_uid: 'payer', approval_policy: 'payer' })
    expect(economyProposalPermissions(payment, 'gm', 'gm')).toEqual({
      canAccept: false,
      canReject: true,
    })
    expect(economyProposalPermissions(
      { ...payment, approval_policy: undefined },
      'gm',
      'gm',
    )).toEqual({ canAccept: true, canReject: true })
  })

  it('跳过已暂时收起的提案，并保留旧 uid 字段兼容', () => {
    const first = pending({ id: 'first', uid: 'player' })
    const second = pending({ id: 'second', payer_uid: 'player' })

    expect(nextEconomyProposal([first, second], 'player', 'gm', new Set(['first']))).toBe(second)
    expect(nextEconomyProposal([first], 'player', 'gm', new Set(['first']))).toBeUndefined()
    expect(nextEconomyProposal([first], 'player', 'gm', new Set())).toBe(first)
  })

  it('按服务端边界清洗 GM 手工提案', () => {
    const payload = buildPaymentProposalPayload(
      'payer',
      '',
      12,
      `  ${'r'.repeat(250)}  `,
      '药水， 通行证、地图\n钥匙,卷轴,护符,绳索,火把,第九件',
    )
    expect(payload.recipient_uid).toBe('payer')
    expect(payload.amount).toBe(12)
    expect(payload.reason).toHaveLength(240)
    expect(payload.items).toEqual(['药水', '通行证', '地图', '钥匙', '卷轴', '护符', '绳索', '火把'])
    expect(() => buildPaymentProposalPayload('payer', '', 12.8, '', '')).toThrow(RangeError)
  })
})
