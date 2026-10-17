/**
 * 行动技能选择（对齐上游 features/play/useActionSkill.ts）：玩家可为本次行动指定角色卡上的技能，
 * 随 POST /action 提交 selected_skill。只决定检定优先用哪项技能，加值仍由服务端按角色卡与
 * 规则计算——它不是加成，也不能指定骰面。
 */
import type { CharacterSheet } from '@/api/types'

/** 与上游同一上限：服务端按名字匹配技能，过长的名字不会是合法技能 */
const MAX_SKILL_NAME = 128

/** 角色卡技能名（去重、去空、去超长），保持卡上顺序。 */
export function actionSkillNames(sheet: CharacterSheet | null | undefined): string[] {
  const names = (sheet?.skills ?? []).map((skill) => (typeof skill === 'string' ? skill : skill?.name))
  return [...new Set(names.filter((name): name is string =>
    typeof name === 'string' && name.length > 0 && name.length <= MAX_SKILL_NAME))]
}

/** 角色卡已加载且技能已不在卡上时清掉选择；卡还没到时保留（避免刷新瞬间误清）。 */
export function reconcileActionSkill(selected: string, sheet: CharacterSheet | null | undefined): string {
  if (!selected || !sheet) return selected
  return actionSkillNames(sheet).includes(selected) ? selected : ''
}
