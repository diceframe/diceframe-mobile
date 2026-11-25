import { describe, expect, it } from 'vitest'

import type { CheckResult } from '@/api/types'
import i18n from '@/i18n'
import type { T } from '@/i18n/t'

import { cocCheckEvidenceOf } from './coc-check-evidence'
import { checkStatusOf } from './check-status'

const en = i18n.getFixedT('en') as unknown as T
const zh = i18n.getFixedT('zh-CN') as unknown as T

describe('CoC 7e 检定证据', () => {
  it('骰面达成普通成功仍可能判失败；展示服务端要求的困难阈值和真实档位', () => {
    const check: CheckResult = {
      difficulty: 'hard', roll: 33, threshold: 50, required_threshold: 25,
      verdict: '失败', achieved_verdict: '普通成功',
    }
    expect(checkStatusOf(check)).toBe('failure')
    expect(cocCheckEvidenceOf(check, zh)).toEqual([
      { kind: 'required', text: '本次需要困难成功（≤ 25）' },
      { kind: 'achieved', text: '骰面等级：普通成功' },
    ])
    expect(cocCheckEvidenceOf({ ...check, difficulty: 'extreme', required_threshold: 10 }, en)[0])
      .toEqual({ kind: 'required', text: 'This roll needs an Extreme success (≤ 10)' })
    expect(cocCheckEvidenceOf({ difficulty: 'regular', required_threshold: 50 }, en))
      .toEqual([{ kind: 'required', text: 'This roll needs a Regular success (≤ 50)' }])
  })

  it('对抗展示对手名称、技能、出目与等级；结局采用服务端结果，不另加难度阈值', () => {
    const check: CheckResult = {
      threshold: 40, roll: 18, verdict: '失败', achieved_verdict: '困难成功', difficulty: 'extreme', required_threshold: 8,
      opponent_name: 'The guard',
      opposed: { opponent_skill: 'Spot Hidden', opponent_roll: 14, opponent_threshold: 40, opponent_verdict: '困难成功', outcome: 'tie' },
    }
    expect(cocCheckEvidenceOf(check, en)).toEqual([
      { kind: 'achieved', text: 'Rolled level: Hard success' },
      { kind: 'opponent', text: 'Opposed: The guard rolled Hard success' },
      { kind: 'opponentDice', text: 'Spot Hidden · d100=14 / 40%' },
      { kind: 'outcome', text: 'Opposed result: tie' },
    ])
  })

  it('胜负提示使用明确结局；缺阈值或未知结局不补造结果', () => {
    expect(cocCheckEvidenceOf({ opposed: { outcome: 'win', opponent_roll: 100 } }, en)).toEqual([
      { kind: 'opponentDice', text: 'Opponent · d100=100' },
      { kind: 'outcome', text: 'Opposed result: won' },
    ])
    expect(cocCheckEvidenceOf({ opposed: { opponent_verdict: '大失败', outcome: 'lose' } }, zh)).toEqual([
      { kind: 'opponent', text: '对抗：对手 掷出 大失败' },
      { kind: 'outcome', text: '对抗结果：落败' },
    ])
    expect(cocCheckEvidenceOf({ difficulty: 'hard', opposed: { outcome: 'unknown' } }, en)).toEqual([])
  })

  it('正常成功可显示细分档位，但花幸运后的最终结论不是原出目的等级', () => {
    const check: CheckResult = { threshold: 50, verdict: '极难成功' }
    expect(cocCheckEvidenceOf(check, en)).toEqual([{ kind: 'achieved', text: 'Rolled level: Extreme success' }])
    expect(cocCheckEvidenceOf({ ...check, luck_decision: 'spent' }, en)).toEqual([])
    expect(cocCheckEvidenceOf({ ...check, luck_decision: 'spent', achieved_verdict: '普通成功' }, en))
      .toEqual([{ kind: 'achieved', text: 'Rolled level: Regular success' }])
  })

  it('旧 d100 与 d20 投影没有新字段时，不显示不相关的证据行', () => {
    expect(cocCheckEvidenceOf({ dice: 'd100', threshold: 50, verdict: '失败' }, en)).toEqual([])
    expect(cocCheckEvidenceOf({ dice: 'd20', dc: 12, verdict: '成功', opponent_roll: 9, opponent_total: 12 }, en))
      .toEqual([])
    expect(cocCheckEvidenceOf({ difficulty: 'extreme', required_threshold: Number.NaN }, en)).toEqual([])
  })
})
