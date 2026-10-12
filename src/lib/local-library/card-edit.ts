/**
 * 角色卡编辑器（CharacterCardEditor）→ 本机卡文档的补丁。
 *
 * 编辑器是按服务端 CRUD 设计的：技能经 normalizeSkillList 归一（值 0 变 20、effect 截断并
 * 字符串化、纯字符串技能变对象），buildCardPatch 再做兜底（空出身/职业填默认值、去掉空名
 * 技能、总是写 gold）。这些对本机文档都是「用户没改却被改写」，推送 update 时还会改到服务端。
 * 所以本机编辑只把**用户真正改过的字段**放进补丁：
 * - 标量字段（名字、出身、职业、背景、金钱、头像）与编辑器打开时显示的值比较，没变就不写；
 * - 技能行带着打开表单时记下的来源下标（SKILL_SOURCE），按它对回存着的那一项：
 *   行与「该项的归一形态」相同 → 原样保留存着的那一项（一个字节都不动）；
 *   改过 → 以存着的那一项为基底（保留编辑器不认识的字段），只改 name / value / effect；
 *   编辑器里新增的行没有来源，按编辑器给出的值新建。
 *   所有行都原样保留、顺序与数量也没变时，补丁里根本不出现 skills。
 * - 头像清空 → 删除路径 ['portrait']（不写 null）。
 */
import type { CharacterCard, CharacterPortrait, CharacterSkill } from '@/api/types'
import { normalizeSkillList, type CharacterCardPatch } from '@/lib/character-card'
import type { CardBody, CardFieldPath } from '@/lib/portable/card-v3'
import { canonicalJson, cloneJson, isJsonObject, type JsonObject } from '@/lib/portable/json'

/**
 * 技能行的来源下标：编辑器打开表单时把每一行在存着的 skills 数组里的位置记在这里。
 * 用 Symbol 作键：对象展开会带着它（SkillRowsEditor 改行时 `{ ...skill, ...patch }`），
 * 而 JSON 序列化与发给服务端的 buildCardPatch 都不会带出去。
 */
export const SKILL_SOURCE: unique symbol = Symbol('dfSkillSource')

export type EditorSkillRow = CharacterSkill & { [SKILL_SOURCE]?: number }

/** 编辑器打开时的技能行：归一后的值 + 来源下标 */
export function editorSkillRows(stored: unknown): EditorSkillRow[] {
  const list = Array.isArray(stored) ? stored : []
  return normalizeSkillList(list).map((row, index) => ({ ...row, [SKILL_SOURCE]: index }))
}

/** 编辑器保存时交出的原始表单状态（本机编辑据此判断用户改了哪些字段） */
export interface EditorSnapshot {
  character_name: string
  race: string
  class: string
  background: string
  /** 用户动过金钱输入框才有值（已解析为 canonical 整数） */
  gold?: number
  skills: EditorSkillRow[]
  portrait: CharacterPortrait | null
}

export interface LocalCardEdit {
  patch: Partial<CardBody>
  remove: CardFieldPath[]
}

function editorView(row: CharacterSkill): JsonObject {
  return { name: row.name ?? '', value: row.value, ...(row.effect ? { effect: row.effect } : {}) }
}

/**
 * 把编辑后的技能行写回存着的数组（详见文件头）。返回 null 表示技能完全没变。
 */
export function mergeEditedSkills(stored: unknown, rows: readonly EditorSkillRow[]): unknown[] | null {
  const pool = Array.isArray(stored) ? stored : []
  const normalized = normalizeSkillList(pool)
  let unchanged = rows.length === pool.length
  const merged = rows.flatMap((row, position): unknown[] => {
    const source = row[SKILL_SOURCE]
    const hasSource = typeof source === 'number' && source >= 0 && source < pool.length
    if (hasSource && canonicalJson(editorView(row)) === canonicalJson(editorView(normalized[source]))) {
      if (source !== position) unchanged = false
      return [cloneJson(pool[source])]
    }
    unchanged = false
    // 改成空名的行与编辑器语义一致：丢弃（buildCardPatch 同样去掉空名技能）
    if (!String(row.name ?? '').trim()) return []
    if (!hasSource) return [newSkill(row)]
    return [editedSkill(pool[source], normalized[source], row)]
  })
  return unchanged ? null : merged
}

function editedName(row: CharacterSkill): string {
  return String(row.name).trim()
}

function editedEffect(row: CharacterSkill): string {
  return typeof row.effect === 'string' ? row.effect.trim() : ''
}

/** 编辑器里新增的行：按编辑器的值新建 */
function newSkill(row: CharacterSkill): JsonObject {
  const next: JsonObject = { name: editedName(row), value: Number(row.value) || 0 }
  const effect = editedEffect(row)
  if (effect) next.effect = effect
  return next
}

/**
 * 改过的、有来源的行：以存着的那一项为基底，name / value / effect 逐个与来源项的归一形态
 * 比较，只写用户改了的那几个，没改的保留存着的原值（值 0 不会变 20，对象 effect 不会被
 * 字符串化）。纯字符串的技能被改时只能变成对象，它没有存着的 value，用编辑器显示的值。
 */
function editedSkill(stored: unknown, shown: CharacterSkill, row: CharacterSkill): JsonObject {
  const next: JsonObject = isJsonObject(stored) ? cloneJson(stored) : { name: String(stored ?? ''), value: shown.value }
  if ((row.name ?? '') !== (shown.name ?? '')) next.name = editedName(row)
  if (Number(row.value) !== Number(shown.value)) next.value = Number(row.value) || 0
  if ((row.effect ?? '') !== (shown.effect ?? '')) {
    const effect = editedEffect(row)
    if (effect) next.effect = effect
    else delete next.effect
  }
  return next
}

/**
 * 编辑器改某一行（SkillRowsEditor 用）：必须用对象展开更新，SKILL_SOURCE 才会跟着行走；
 * 经 JSON 或 structuredClone 拷贝会丢掉 Symbol 键，那一行就会被当成新增、丢掉未知字段。
 */
export function updateSkillRow<T extends CharacterSkill>(rows: readonly T[], index: number, patch: Partial<CharacterSkill>): T[] {
  return rows.map((row, at) => (at === index ? { ...row, ...patch } : row))
}

/** 编辑器打开时各标量字段显示的值（与 CharacterCardEditor 的 state 初值一致） */
function initialText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

/**
 * 编辑已有本机卡：只把用户改过的字段放进补丁。changed 的字段取 buildCardPatch 的结果
 * （与服务端编辑同一套校验与兜底），没改的字段不出现。
 */
export function localCardEdit(original: CharacterCard, editor: CharacterCardPatch, snapshot: EditorSnapshot): LocalCardEdit {
  const patch: Partial<CardBody> = {}
  const remove: CardFieldPath[] = []
  if (snapshot.character_name !== initialText(original.character_name)) patch.character_name = editor.character_name
  if (snapshot.race !== initialText(original.race)) patch.race = editor.race
  if (snapshot.class !== initialText(original.class)) patch.class = editor.class
  if (snapshot.background !== initialText(original.background)) patch.background = editor.background
  if (snapshot.gold !== undefined && snapshot.gold !== original.gold) patch.gold = snapshot.gold
  const skills = mergeEditedSkills(original.skills, snapshot.skills)
  if (skills) patch.skills = skills as CharacterSkill[]
  const before = original.portrait ?? null
  if (canonicalJson(snapshot.portrait) !== canonicalJson(before)) {
    if (snapshot.portrait) patch.portrait = cloneJson(snapshot.portrait)
    else remove.push(['portrait'])
  }
  return { patch, remove }
}

/** 新建本机卡：编辑器补丁 → 卡体（清空的头像不写字段） */
export function newLocalCardBody(editor: CharacterCardPatch): CardBody {
  const body = cloneJson(editor) as unknown as JsonObject
  if (!editor.portrait) delete body.portrait
  return body as CardBody
}
