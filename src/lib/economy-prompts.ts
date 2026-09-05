import type {
  GameDetail,
  PaymentProposalCreatePayload,
  PendingPayment,
  RuleMeta,
} from '@/api/types'
import { contentLanguage, getT } from '@/i18n/t'

/** 与服务端 fail-closed 策略一致：只有本局、本人收货且无延迟副作用的购买允许稍后处理。 */
export function isNonBlockingPersonalPurchase(
  proposal: PendingPayment,
  currentRunId: string,
): boolean {
  const payer = String(proposal.payer_uid || proposal.uid || '')
  const recipient = String(proposal.recipient_uid || payer)
  const deferredFields = [
    'deferred_effects',
    'memory_delta',
    'scene_image_prompt',
    'quest',
    'plot',
    'private_info',
    'quick_actions',
    'narrative_effects',
  ]
  return proposal.status === 'pending'
    && Boolean(currentRunId)
    && proposal.run_id === currentRunId
    && proposal.kind === 'purchase'
    && proposal.approval_policy === 'payer'
    && Boolean(payer)
    && recipient === payer
    && !(proposal.contributors?.length)
    && Boolean(proposal.rewards?.length)
    && !proposal.effect_group_id
    && !deferredFields.some((field) => Boolean(proposal[field]))
}

/** economy_proposals 是唯一权威投影；缺失或为空时均无待处理提案。 */
export function economyProposalList(detail?: GameDetail | null): PendingPayment[] {
  return detail?.economy_proposals ?? []
}

export interface EconomyProposalPermissions {
  canAccept: boolean
  canReject: boolean
}

/**
 * 镜像服务端 resolve_proposal 权限。GM 可取消普通付款和多人分摊，但不能代付款人
 * 批准；旧 payer_or_gm_legacy 契约例外，GM 保留批准权。
 */
export function economyProposalPermissions(
  proposal: PendingPayment,
  actorId: string,
  gmUid: string,
): EconomyProposalPermissions {
  if (proposal.status !== 'pending' || !actorId) return { canAccept: false, canReject: false }
  const payerUid = String(proposal.payer_uid || proposal.uid || '')
  // 与服务端 resolver 一致：缺省策略为 payer，只有显式旧策略允许 GM 代批准。
  const policy = String(proposal.approval_policy || 'payer')
  const isGm = actorId === gmUid
  if (policy === 'system') return { canAccept: false, canReject: false }
  if (policy === 'gm') return { canAccept: isGm, canReject: isGm }
  if (policy === 'all_contributors') {
    const isContributor = Boolean(proposal.contributors?.some((item) => item.uid === actorId))
    const alreadyApproved = Boolean(proposal.approvals?.[actorId])
    return {
      canAccept: isContributor && !alreadyApproved,
      canReject: (isContributor && !alreadyApproved) || isGm,
    }
  }
  if (policy === 'payer_or_gm_legacy') {
    const allowed = actorId === payerUid || isGm
    return { canAccept: allowed, canReject: allowed }
  }
  // 服务端 resolver 的兜底分支同样按 payer 处理未知策略。
  return {
    canAccept: actorId === payerUid,
    canReject: actorId === payerUid || isGm,
  }
}

/** 当前身份是否至少能批准或否决该提案。 */
export function isEconomyProposalActionable(
  proposal: PendingPayment,
  actorId: string,
  gmUid: string,
): boolean {
  const permission = economyProposalPermissions(proposal, actorId, gmUid)
  return permission.canAccept || permission.canReject
}

/** 按服务端顺序取下一条未被本地暂时收起的可操作提案。 */
export function nextEconomyProposal(
  proposals: PendingPayment[],
  actorId: string,
  gmUid: string,
  dismissedIds: ReadonlySet<string>,
): PendingPayment | undefined {
  return proposals.find((proposal) => {
    const id = String(proposal.id || '')
    return id
      && !dismissedIds.has(id)
      && isEconomyProposalActionable(proposal, actorId, gmUid)
  })
}

/** 按服务端限制清洗 GM 手工提案，避免端上输入被静默截断成另一份内容。 */
export function buildPaymentProposalPayload(
  payerUid: string,
  recipientUid: string,
  amount: number,
  reason: string,
  itemsText: string,
): PaymentProposalCreatePayload {
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
    throw new RangeError('payment amount must be an integer between 1 and 100000')
  }
  return {
    payer_uid: payerUid,
    recipient_uid: recipientUid || payerUid,
    amount,
    reason: reason.trim().slice(0, 240),
    items: itemsText
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((item) => item.slice(0, 120)),
  }
}

/** 规则可覆盖货币名；缺省复用上游三语 goldCurrency。 */
export function economyCurrencyLabel(ruleMeta?: RuleMeta | null): string {
  const label = ruleMeta?.ui_schema?.currency_label
  if (typeof label === 'string' && label.trim()) return label.trim()
  if (label && typeof label === 'object') {
    const localized = contentLanguage() === 'zh-CN' ? label.zh : label.en
    if (localized?.trim()) return localized.trim()
  }
  return ruleMeta?.currency?.trim() || getT()('goldCurrency')
}
