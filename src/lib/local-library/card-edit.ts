/**
 * 角色卡编辑器（CharacterCardEditor 的 CharacterCardPatch）→ 本机卡文档的补丁。
 *
 * 编辑器是按服务端 CRUD 设计的：技能是从表单重建的 {name, value, effect?} 数组，清空头像
 * 发 portrait: null。直接合并进本机文档会丢东西（每个技能里编辑器不认识的字段），推送
 * update 时服务端也会随之删掉。这里把编辑器输出翻译成「按字段的补丁 + 显式删除路径」：
 * - 标量字段（名字、出身、职业、背景、金钱）直接覆盖；
 * - 技能从**存着的数组出发**：按技能名把编辑后的行对回原来那一项，保留它的未知字段，
 *   只改编辑器管的 name / value / effect；effect 被清空就从那一项里删掉；
 * - 头像清空 → 删除路径 ['portrait']（不写 null）。
 */
import type { CharacterCard, CharacterSkill } from '@/api/types'
import type { CharacterCardPatch } from '@/lib/character-card'
import type { CardBody, CardFieldPath } from '@/lib/portable/card-v3'
import { cloneJson, isJsonObject, type JsonObject } from '@/lib/portable/json'

/** 编辑器管的技能字段；其余字段原样保留 */
const EDITOR_SKILL_FIELDS = ['name', 'value', 'effect'] as const

export interface LocalCardEdit {
  patch: Partial<CardBody>
  remove: CardFieldPath[]
}

function skillName(skill: unknown): string {
  if (typeof skill === 'string') return skill
  return isJsonObject(skill) ? String(skill.name ?? '') : ''
}

/**
 * 把编辑后的技能行对回原数组：同名的第一项未被占用的原技能作为基底（保留未知字段），
 * 编辑器管的字段按编辑结果设置或删除。新增的技能没有基底。
 */
export function mergeEditedSkills(original: unknown, edited: readonly CharacterSkill[]): (string | CharacterSkill)[] {
  const pool = Array.isArray(original) ? original : []
  const used = new Set<number>()
  return edited.map((row) => {
    const index = pool.findIndex((skill, at) => !used.has(at) && skillName(skill) === row.name)
    if (index >= 0) used.add(index)
    const base: JsonObject = index >= 0 && isJsonObject(pool[index]) ? cloneJson(pool[index] as JsonObject) : {}
    for (const field of EDITOR_SKILL_FIELDS) delete base[field]
    const next: JsonObject = { ...base, name: row.name, value: row.value }
    if (row.effect !== undefined && row.effect !== '') next.effect = row.effect
    return next as unknown as CharacterSkill
  })
}

/** 编辑已有本机卡：编辑器补丁 → 按字段补丁 + 删除路径（交给 patchCardDocument） */
export function localCardEdit(originalBody: CharacterCard, editor: CharacterCardPatch): LocalCardEdit {
  const patch: Partial<CardBody> = {
    character_name: editor.character_name,
    race: editor.race,
    class: editor.class,
    background: editor.background,
    gold: editor.gold,
    skills: mergeEditedSkills(originalBody.skills, editor.skills),
  }
  const remove: CardFieldPath[] = []
  if (editor.portrait) patch.portrait = cloneJson(editor.portrait)
  else if (originalBody.portrait !== undefined) remove.push(['portrait'])
  return { patch, remove }
}

/** 新建本机卡：编辑器补丁 → 卡体（清空的头像不写字段） */
export function newLocalCardBody(editor: CharacterCardPatch): CardBody {
  const body = cloneJson(editor) as unknown as JsonObject
  if (!editor.portrait) delete body.portrait
  return body as CardBody
}
