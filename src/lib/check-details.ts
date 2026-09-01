/**
 * 检定卡纯逻辑：运气决议来源归并、算式与明细字段派生。
 *
 * 与 Web CheckRevealCard.vue 的展示口径一一对应（算式/骰面/成功线/修正明细/
 * 优势说明/协助），字段缺失时不硬造内容，只返回空值让组件跳过对应行。
 */
import type { CheckResult } from '@/api/types'
import type { CheckStatus } from '@/lib/check-status'

/** 稳定标识一条检定：check_id 缺失时回退到参与者+检定名+出目（旧存档兜底） */
export function checkKeyOf(check: CheckResult): string {
  if (check.check_id) return String(check.check_id)
  return [check.actor_uid || check.actor_name || '', check.label || check.skill || '', check.roll ?? '']
    .join('|')
}

/**
 * 本端能否对这条检定做运气决议（对齐 Web CheckRevealCard 的 canDecideLuck）：
 * GM 永远可以；玩家只认 actor_uid 与会话用户严格相等，actor_uid 缺失的旧数据
 * 无法确认归属，一律不许决议。
 */
export function canDecideLuckOf(
  check: CheckResult,
  currentUserId: string,
  isGm?: boolean,
): boolean {
  if (isGm) return true
  if (!currentUserId) return false
  return !!check.actor_uid && check.actor_uid === currentUserId
}

/**
 * 待运气决议的统一来源：pending_luck_decisions + round_check_results 内 pending 项。
 * 服务端两处同源（都出自 last_checks），但 state 离开结算阶段后 round_check_results
 * 会被清空，且旧存档可能只有其中一处，故取并集并按 checkKeyOf 去重，谁先谁为准。
 */
export function mergePendingLuck(
  primary: CheckResult[],
  secondary: CheckResult[],
): CheckResult[] {
  const merged: CheckResult[] = []
  const seen = new Set<string>()
  for (const check of [...primary, ...secondary]) {
    if (check.luck_decision !== 'pending') continue
    const key = checkKeyOf(check)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(check)
  }
  return merged
}

/** 骰面明细：rolls 优先，缺失时退回单一 roll（与 Web diceFaces 同口径） */
export function diceFacesOf(check: CheckResult): number[] {
  const rolls = check.rolls?.length ? check.rolls : [check.roll]
  return rolls.filter((value): value is number => typeof value === 'number')
}

/**
 * 检定算式（对齐 Web CheckRevealCard.math）：
 * - d100 阈值检定（CoC）：d100=roll / threshold%
 * - 对抗检定：附对手出目与加值
 * - 其余 d20：d20=roll ± modifier = total / DC n
 */
export function checkMathOf(check: CheckResult, opponentFallback: string): string {
  if (typeof check.threshold === 'number') {
    return `${check.dice || 'd100'}=${check.roll} / ${check.threshold}%`
  }
  const modifier = Number(check.modifier || 0)
  const modifierText = modifier ? ` ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)}` : ''
  const total = typeof check.total === 'number' ? ` = ${check.total}` : ''
  if (typeof check.opponent_total === 'number') {
    const opponentModifier = Number(check.opponent_modifier || 0)
    return `${check.dice || 'd20'}=${check.roll}${modifierText}${total} / ${
      check.opponent_name || opponentFallback
    } d20=${check.opponent_roll} ${opponentModifier >= 0 ? '+' : '-'} ${Math.abs(
      opponentModifier,
    )} = ${check.opponent_total}`
  }
  const dc = typeof check.dc === 'number' ? ` / DC ${check.dc}` : ''
  return `${check.dice || 'd20'}=${check.roll}${modifierText}${total}${dc}`
}

export interface CheckDetail {
  /** 算式行（明细「计算」与卡面主行共用） */
  math: string
  /** 骰面列表（可能多颗，优势/劣势时 rolls 有两项） */
  diceFaces: number[]
  /** 困难/极难成功线：仅服务端给出 hard_threshold 才展示（threshold 缺失按 0 兜底） */
  successLevels: { normal: number; hard: number; extreme: number } | null
  /** 加值分解（服务端自由文本） */
  modifierBreakdown: string
  /** 优势/劣势说明 */
  advantageNote: string
  /** 协助玩家名单（已 join 成展示串） */
  assists: string
}

/** 检定明细派生：只取类型里真实存在的字段，缺什么组件就少渲染哪行 */
export function checkDetailOf(check: CheckResult, opponentFallback: string): CheckDetail {
  return {
    math: checkMathOf(check, opponentFallback),
    diceFaces: diceFacesOf(check),
    successLevels:
      typeof check.hard_threshold === 'number'
        ? {
            normal: check.threshold ?? 0,
            hard: check.hard_threshold ?? 0,
            extreme: check.extreme_threshold ?? 0,
          }
        : null,
    modifierBreakdown: check.modifier_breakdown || '',
    advantageNote: check.advantage_note || '',
    assists: check.assist?.length ? check.assist.join(', ') : '',
  }
}

/** 检定卡左边框色（对齐 Web：默认危险红，成功绿、大成功鎏金） */
export function checkAccentOf(status: CheckStatus): 'gold-strong' | 'success' | 'destructive' {
  if (status === 'critical') return 'gold-strong'
  if (status === 'success') return 'success'
  return 'destructive'
}

/** 检定结论 → 文案 key：成功/失败复用上游 key，大成功/大失败是移动端 df key */
export function statusLabelKeyOf(
  status: CheckStatus,
): 'dfCheckCritical' | 'dfCheckFumble' | 'checkSuccess' | 'checkFailure' {
  if (status === 'critical') return 'dfCheckCritical'
  if (status === 'fumble') return 'dfCheckFumble'
  return status === 'success' ? 'checkSuccess' : 'checkFailure'
}
