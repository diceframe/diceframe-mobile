/**
 * GM「快速调整」的补丁构造：对局里纠正 AI 漏记的 HP、余额、物品。
 *
 * 契约（上游 webui/services/characters.update_character）：PUT /games/{key}/character/{uid}，
 * 只有经典规则局可用（专业规则局返回 RULESET_CHARACTER_OPERATION_REQUIRED），GM 字段白名单里
 * 有 hp / max_hp / resources / gold / currency / inventory。服务端用 `cs.update(updates)`
 * 整字段覆盖——所以 resources、currency、inventory 都要基于当前角色卡合并后整体提交，
 * 只发一部分会把同字段里别的内容（理智、其它资源、其余物品）清掉。
 */
import type { CharacterItem, CharacterSheet } from '@/api/types'
import { characterCurrencyAmount } from './currency'

export interface HpState {
  hp: number
  max: number
}

export function hpOf(sheet: CharacterSheet | null | undefined): HpState {
  const resource = sheet?.resources?.hp
  const max = Number(sheet?.max_hp ?? resource?.max ?? 0) || 0
  const hp = Number(sheet?.hp ?? resource?.current ?? 0) || 0
  return { hp, max }
}

/** HP 夹在 [0, 上限]；上限不小于 0。倒地（0）合法 */
export function clampHp(hp: number, max: number): HpState {
  const safeMax = Math.max(0, Math.round(max))
  return { hp: Math.max(0, Math.min(safeMax, Math.round(hp))), max: safeMax }
}

/** 同上游 Web 编辑器：hp / max_hp 与 resources.hp 一并写，resources 其余项原样保留 */
export function hpPatch(sheet: CharacterSheet, next: HpState): Record<string, unknown> {
  const { hp, max } = clampHp(next.hp, next.max)
  const resources = { ...(sheet.resources ?? {}) }
  resources.hp = { ...(resources.hp ?? {}), current: hp, max, min: 0 }
  return { hp, max_hp: max, resources }
}

/** 余额是 canonical 整数（同 lib/currency）：gold 与 currency.amount 同写，currency 其余字段保留 */
export function currencyPatch(sheet: CharacterSheet, amount: number): Record<string, unknown> {
  const value = Math.max(0, Math.round(amount))
  return { gold: value, currency: { ...(sheet.currency ?? {}), amount: value } }
}

export function currencyOf(sheet: CharacterSheet | null | undefined): number {
  return characterCurrencyAmount(sheet ?? null)
}

/** 新增物品：同名的叠加数量，否则追加 {name, qty, effect}（同上游 Web 物品行格式） */
export function inventoryWithAdded(sheet: CharacterSheet, name: string, qty = 1): CharacterItem[] {
  const trimmed = name.trim()
  const items = [...(sheet.inventory ?? [])]
  if (!trimmed) return items
  const amount = Math.max(1, Math.round(qty))
  const index = items.findIndex((item) => String(item.name ?? '').trim() === trimmed)
  if (index >= 0) {
    items[index] = { ...items[index], qty: (Number(items[index].qty) || 1) + amount }
    return items
  }
  return [...items, { name: trimmed, qty: amount, effect: '' }]
}

/** 移除一件：数量大于 1 时减一，否则整行删除 */
export function inventoryWithRemoved(sheet: CharacterSheet, index: number): CharacterItem[] {
  const items = [...(sheet.inventory ?? [])]
  const item = items[index]
  if (!item) return items
  const qty = Number(item.qty) || 1
  if (qty > 1) items[index] = { ...item, qty: qty - 1 }
  else items.splice(index, 1)
  return items
}
