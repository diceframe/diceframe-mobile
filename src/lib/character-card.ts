/**
 * 角色卡表单 → character-cards 接口补丁的归一化（对齐 Web 端 saveCardEdit 的字段
 * 约束：空名兜底、技能去空、数值解析失败回退默认）。
 */
import type { CharacterCard, CharacterPortrait, CharacterSkill, SkillSpec } from '@/api/types'

/** 服务端技能是 {name,value}[]；历史数据可能有纯字符串项（缺省 20，同 Web toSkillList） */
export function normalizeSkillList(input?: (string | CharacterSkill)[]): CharacterSkill[] {
  return (input || []).map((skill) =>
    typeof skill === 'string'
      ? { name: skill, value: 20 }
      : { name: skill.name || '', value: Number(skill.value) || 20 },
  )
}

export function skillPoolNames(pool?: (string | SkillSpec)[]): string[] {
  return (pool || []).map((item) => (typeof item === 'string' ? item : item.name || item.key || ''))
    .filter(Boolean)
}

export interface CharacterCardForm {
  character_name: string
  race: string
  class: string
  background: string
  gold: string
  skills: CharacterSkill[]
  portrait: CharacterPortrait | null
}

export interface CharacterCardPatch extends Partial<CharacterCard> {
  character_name: string
  race: string
  class: string
  skills: CharacterSkill[]
  background: string
  gold: number
  portrait: CharacterPortrait | null
}

export function buildCardPatch(form: CharacterCardForm): CharacterCardPatch {
  return {
    character_name: form.character_name.trim() || '未命名',
    race: form.race.trim() || '人类',
    class: form.class.trim() || '冒险者',
    skills: form.skills
      .filter((skill) => skill.name?.trim())
      .map((skill) => ({ name: skill.name.trim(), value: Number(skill.value) || 0 })),
    background: form.background.trim(),
    gold: parseInt(form.gold, 10) || 0,
    portrait: form.portrait ? { ...form.portrait } : null,
  }
}
