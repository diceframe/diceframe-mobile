/**
 * 角色卡表单 → character-cards 接口补丁的归一化（对齐 Web 端 saveCardEdit 的字段
 * 约束：空名兜底、技能去空、数值解析失败回退默认）。
 */
import type { CharacterCard, CharacterPortrait, CharacterSkill, RuleMeta, SkillSpec } from '@/api/types'
import { creationSkillValue } from '@/lib/character-creation'

/**
 * 与服务端 `MAX_SKILL_EFFECT_CHARS` 一致：超长说明会被服务端静默截断，
 * 客户端先截，避免"保存后内容和我填的不一样"。
 */
export const SKILL_EFFECT_MAX_CHARS = 500

/**
 * effect 是玩家自填的技能说明：只做展示与 AI 上下文，**不是规则权威**，
 * 客户端不得据它改判定。空说明不写字段，免得老卡被塞进一个空 effect。
 */
function normalizeSkillEffect(effect: unknown): { effect?: string } {
  const text = String(effect ?? '').trim().slice(0, SKILL_EFFECT_MAX_CHARS)
  return text ? { effect: text } : {}
}

/** 旧式纯字符串技能没有数值；留到规则和属性已知时再取缺省，不能把显式的 0 当成缺省。 */
export function normalizeSkillList(input?: (string | CharacterSkill)[]): CharacterSkill[] {
  return (input || []).map((skill) => {
    if (typeof skill === 'string') return { name: skill }
    const value = skill?.value == null ? undefined : Number(skill.value)
    return {
      name: typeof skill?.name === 'string' ? skill.name : '',
      ...(value !== undefined && Number.isFinite(value) ? { value } : {}),
      ...normalizeSkillEffect(skill?.effect),
    }
  })
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
  /** canonical base-unit 整数：输入框文本由 `parseCurrencyInput` 解析后才进表单 */
  gold: number
  skills: CharacterSkill[]
  portrait: CharacterPortrait | null
  /** 只在新建完整角色或显式修改属性时下发 */
  attributes?: CharacterCard['attributes']
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

export function buildCardPatch(form: CharacterCardForm, meta?: RuleMeta | null, attributes = form.attributes): CharacterCardPatch {
  return {
    character_name: form.character_name.trim() || '未命名',
    race: form.race.trim() || '人类',
    class: form.class.trim() || '冒险者',
    ...(form.attributes !== undefined ? { attributes: form.attributes } : {}),
    skills: form.skills
      .filter((skill) => skill.name?.trim())
      .map((skill) => ({
        name: skill.name.trim(),
        value: skill.value === undefined ? creationSkillValue(skill, meta, attributes) : Number(skill.value) || 0,
        ...normalizeSkillEffect(skill.effect),
      })),
    background: form.background.trim(),
    gold: Math.round(Number(form.gold)) || 0,
    portrait: form.portrait ? { ...form.portrait } : null,
  }
}
