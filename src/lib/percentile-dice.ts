/**
 * CoC 奖励/惩罚骰的百分骰投影（上游 features/play/dice/presentation.ts 的 validPercentileDice）。
 * 服务端 dice_rules_coc.project_percentile_dice：个位共享，每颗十位骰与之组成一个候选，
 * 00 + 0 记作 100。字段任何一处对不上就整体不展示，不拿残缺数据拼明细。
 */
import type { PercentileDice } from '@/api/types'

export function validPercentileDice(dice: PercentileDice | undefined | null): dice is PercentileDice {
  return Boolean(dice && Number.isInteger(dice.units) && dice.units >= 0 && dice.units <= 9
    && Array.isArray(dice.tens) && Array.isArray(dice.candidates) && dice.tens.length === dice.candidates.length
    && dice.tens.length > 0 && Number.isInteger(dice.taken_index) && dice.taken_index >= 0 && dice.taken_index < dice.tens.length
    && dice.tens.every((ten, i) => Number.isInteger(ten) && ten >= 0 && ten <= 90 && ten % 10 === 0
      && (ten + dice.units || 100) === dice.candidates[i]))
}

/** 十位骰按两位显示（00、10…90），与实体百分骰的读法一致 */
export function tensLabel(ten: number): string {
  return String(ten).padStart(2, '0')
}
