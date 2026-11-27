import type { CheckResult } from '@/api/types'
import type { TKey } from '@/i18n/keyset'
import type { T } from '@/i18n/t'

const REQUIRED_LABEL = {
  regular: 'dfCheckRequiredRegular',
  hard: 'checkRequiredHard',
  extreme: 'checkRequiredExtreme',
} as const satisfies Record<string, TKey>

const OPPOSED_OUTCOME_LABEL = {
  win: 'dfCheckOpposedWon',
  lose: 'dfCheckOpposedLost',
  tie: 'dfCheckOpposedTied',
} as const satisfies Record<string, TKey>

const VERDICT_LABEL = {
  大成功: 'dfCheckCritical',
  极难成功: 'dfCheckExtremeSuccess',
  困难成功: 'dfCheckHardSuccess',
  普通成功: 'dfCheckRegularSuccess',
  成功: 'checkSuccess',
  失败: 'checkFailure',
  大失败: 'dfCheckFumble',
} as const satisfies Record<string, TKey>

function lookupLabel<K extends string>(labels: Record<K, TKey>, value: string | undefined): TKey | undefined {
  return value && Object.hasOwn(labels, value) ? labels[value as K] : undefined
}

export function cocVerdictText(verdict: string, t: T): string {
  const key = lookupLabel(VERDICT_LABEL, verdict)
  return key ? t(key) : verdict
}

/** 本次要求的阈值由服务端给出；缺字段不在端上拿技能值重算。 */
export function cocRequiredThresholdOf(check: CheckResult): number | undefined {
  const threshold = check.required_threshold
  if (!check.opposed && lookupLabel(REQUIRED_LABEL, check.difficulty)
    && typeof threshold === 'number' && Number.isFinite(threshold)) return threshold
}

export interface CocEvidenceRow {
  kind: 'required' | 'achieved' | 'opponent' | 'opponentDice' | 'outcome'
  text: string
}

/** 服务端区分骰面等级、所需等级与最终裁决；本端只展示，不参与比较或改判。 */
export function cocCheckEvidenceOf(check: CheckResult, t: T): CocEvidenceRow[] {
  const rows: CocEvidenceRow[] = []
  const threshold = cocRequiredThresholdOf(check)
  const requiredLabel = lookupLabel(REQUIRED_LABEL, check.difficulty)
  if (requiredLabel && threshold !== undefined) {
    rows.push({ kind: 'required', text: t(requiredLabel, { max: threshold }) })
  }

  // 成功时服务端省略 achieved_verdict；但花幸运后 verdict 是改判，不是原始骰面等级。
  const naturalVerdict = check.achieved_verdict || (
    typeof check.threshold === 'number' && check.luck_decision !== 'spent'
      && (check.verdict === '普通成功' || check.verdict === '困难成功' || check.verdict === '极难成功')
      ? check.verdict : ''
  )
  if (naturalVerdict) {
    rows.push({ kind: 'achieved', text: t('checkAchievedVerdict', { verdict: cocVerdictText(naturalVerdict, t) }) })
  }

  const opponent = check.opposed
  if (!opponent) return rows
  const name = check.opponent_name?.trim() || t('checkOpponent')
  if (opponent.opponent_verdict) {
    rows.push({ kind: 'opponent', text: t('checkOpposedDetail', { name, verdict: cocVerdictText(opponent.opponent_verdict, t) }) })
  }
  if (typeof opponent.opponent_roll === 'number' && Number.isFinite(opponent.opponent_roll)) {
    const max = typeof opponent.opponent_threshold === 'number' && Number.isFinite(opponent.opponent_threshold)
      ? ` / ${opponent.opponent_threshold}%` : ''
    const dice = [opponent.opponent_verdict ? '' : name, opponent.opponent_skill, `d100=${opponent.opponent_roll}${max}`]
    rows.push({ kind: 'opponentDice', text: dice.filter(Boolean).join(' · ') })
  }
  const outcome = lookupLabel(OPPOSED_OUTCOME_LABEL, opponent.outcome)
  if (outcome) rows.push({ kind: 'outcome', text: t(outcome) })
  return rows
}
