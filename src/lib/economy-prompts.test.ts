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

  it('仅读取权威投影，空或缺失投影不复活旧支付队列', () => {
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
    })).toEqual([])
    expect(economyProposalList({ game_key: 'game', pending_payments: [legacy] })).toEqual([])
    expect(economyProposalList(null)).toEqual([])
    expect(economyProposalList()).toEqual([])
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

  it.each(['payer', undefined, '', 'unknown_policy'])('策略 %s 与 resolver 一致：付款人批准、GM 仅取消', (policy) => {
    const payment = pending({ payer_uid: 'payer', approval_policy: policy })
    expect(economyProposalPermissions(payment, 'gm', 'gm')).toEqual({
      canAccept: false,
      canReject: true,
    })
    expect(economyProposalPermissions(payment, 'payer', 'gm')).toEqual({
      canAccept: true,
      canReject: true,
    })
    expect(economyProposalPermissions(payment, 'other', 'gm')).toEqual({
      canAccept: false,
      canReject: false,
    })
  })

  it('显式旧策略仍允许 GM 和存档 uid 付款人批准', () => {
    const payment = pending({ uid: 'payer', approval_policy: 'payer_or_gm_legacy' })
    expect(economyProposalPermissions(payment, 'gm', 'gm')).toEqual({ canAccept: true, canReject: true })
    expect(economyProposalPermissions(payment, 'payer', 'gm')).toEqual({ canAccept: true, canReject: true })
    expect(economyProposalPermissions(payment, 'other', 'gm')).toEqual({ canAccept: false, canReject: false })
  })

  it('付款身份优先使用 payer_uid，空值时保留 uid 存档投影', () => {
    const payment = pending({ payer_uid: 'payer', uid: 'legacy' })
    expect(isEconomyProposalActionable(payment, 'legacy', 'gm')).toBe(false)
    expect(isEconomyProposalActionable(payment, 'payer', 'gm')).toBe(true)
    expect(isEconomyProposalActionable({ ...payment, payer_uid: '' }, 'legacy', 'gm')).toBe(true)
  })

  it('系统策略、已处理提案和未登录身份不可操作', () => {
    expect(isEconomyProposalActionable(pending({ approval_policy: 'system' }), 'gm', 'gm')).toBe(false)
    expect(isEconomyProposalActionable(pending({ status: 'accepted', uid: 'payer' }), 'payer', 'gm')).toBe(false)
    expect(isEconomyProposalActionable(pending({ uid: 'payer' }), '', 'gm')).toBe(false)
  })

  it('跳过已暂时收起的提案，并保留旧 uid 字段兼容', () => {
    const first = pending({ id: 'first', uid: 'player' })
    const second = pending({ id: 'second', payer_uid: 'player' })

    expect(nextEconomyProposal([first, second], 'player', 'gm', new Set(['first']))).toBe(second)
    expect(nextEconomyProposal([first], 'player', 'gm', new Set(['first']))).toBeUndefined()
    expect(nextEconomyProposal([first], 'player', 'gm', new Set())).toBe(first)
  })

  it('仅使用权威 id，忽略只有 payment_id 的提案', () => {
    const missingId = pending({ id: undefined, payment_id: 'legacy', uid: 'player' })
    const emptyId = pending({ id: '', payment_id: 'legacy', uid: 'player' })
    const authoritative = pending({ id: 'current', payment_id: 'legacy', uid: 'player' })

    expect(nextEconomyProposal([missingId, emptyId], 'player', 'gm', new Set())).toBeUndefined()
    expect(nextEconomyProposal([authoritative], 'player', 'gm', new Set(['legacy']))).toBe(authoritative)
    expect(nextEconomyProposal([authoritative], 'player', 'gm', new Set(['current']))).toBeUndefined()
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
