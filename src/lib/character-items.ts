/**
 * 角色面板物品条目的纯逻辑派生（对齐 Web CharacterPanel 的 item* 函数族）。
 *
 * CharacterItem 是宽松契约（带索引签名），image 等扩展字段不在镜像声明里，
 * 这里一律做运行时形状判断后再取值，避免脏数据把面板打崩。
 */
import type { CharacterItem, CharacterSheet } from '@/api/types'

export type CharacterItemGroup = 'equipment' | 'inventory' | 'key_items'

/** 物品详情里需要本地化的词（组件层经 t() 组装，纯函数保持可测） */
export interface CharacterItemLabels {
  weapon: string
  armor: string
  item: string
  mainHand: string
  offHand: string
  armorSlot: string
  head: string
  noSlot: string
  damage: string
  effect: string
}

/** 无名条目的展示兜底（Web 端回退 JSON 序列化，移动端换成占位符更可读） */
export const ITEM_NAME_FALLBACK = '—'

export function characterItemName(item: CharacterItem): string {
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  return name || ITEM_NAME_FALLBACK
}

/** 数量仅在 >1 时展示（与 Web itemQty 一致，单件不挂 ×1 尾巴） */
export function characterItemQty(item: CharacterItem): number | undefined {
  const qty = item.qty
  return typeof qty === 'number' && Number.isFinite(qty) && qty > 1 ? qty : undefined
}

/** 条目生成图资源 id：契约里 image 为 `{ asset_id }` 形状的扩展字段 */
export function characterItemImageAssetId(item: CharacterItem): string {
  const image = item.image
  if (!image || typeof image !== 'object') return ''
  const assetId = (image as Record<string, unknown>).asset_id
  return typeof assetId === 'string' ? assetId.trim() : ''
}

function typeLabel(type: unknown, labels: CharacterItemLabels): string {
  if (type === 'weapon') return labels.weapon
  if (type === 'armor') return labels.armor
  if (type === 'item') return labels.item
  return ''
}

function slotLabel(slot: unknown, labels: CharacterItemLabels): string {
  if (slot === 'main_hand') return labels.mainHand
  if (slot === 'off_hand') return labels.offHand
  if (slot === 'armor') return labels.armorSlot
  if (slot === 'head') return labels.head
  if (slot === 'none') return labels.noSlot
  return ''
}

/** 装备详情：类型 · 槽位 · 伤害 · 品质（对齐 Web equipmentDetail；'none' 槽位不展示） */
function equipmentDetail(item: CharacterItem, labels: CharacterItemLabels): string {
  const parts: string[] = []
  const type = typeLabel(item.type, labels)
  if (type) parts.push(type)
  if (item.slot && item.slot !== 'none') {
    const slot = slotLabel(item.slot, labels)
    if (slot) parts.push(slot)
  }
  if (typeof item.damage === 'number' && Number.isFinite(item.damage) && item.damage !== 0) {
    parts.push(`${labels.damage} ${item.damage}`)
  }
  const quality = typeof item.quality === 'string' ? item.quality.trim() : ''
  if (quality) parts.push(quality)
  return parts.join(' · ')
}

/** 背包详情：效果文本（对齐 Web inventoryDetail） */
function inventoryDetail(item: CharacterItem, labels: CharacterItemLabels): string {
  const effect = typeof item.effect === 'string' ? item.effect.trim() : ''
  return effect ? `${labels.effect}: ${effect}` : ''
}

/** 关键物品详情：分类 · 备注（原始文本，不本地化，对齐 Web keyItemDetail） */
function keyItemDetail(item: CharacterItem): string {
  const category = typeof item.category === 'string' ? item.category.trim() : ''
  const note = typeof item.note === 'string' ? item.note.trim() : ''
  return [category, note].filter(Boolean).join(' · ')
}

/** 按分组派生条目详情行；无信息时返回空串（组件据此隐藏详情区） */
export function characterItemDetail(
  item: CharacterItem,
  group: CharacterItemGroup,
  labels: CharacterItemLabels,
): string {
  if (group === 'equipment') return equipmentDetail(item, labels)
  if (group === 'inventory') return inventoryDetail(item, labels)
  return keyItemDetail(item)
}

export interface CharacterItemGroups {
  equipment: CharacterItem[]
  inventory: CharacterItem[]
  keyItems: CharacterItem[]
}

/** 三组分栏（对齐 Web 的 equipment/inventory/key_items 切片，空数组兜底） */
export function characterItemGroups(sheet: CharacterSheet | null): CharacterItemGroups {
  const equipment = sheet?.equipment
  const inventory = sheet?.inventory
  const keyItems = sheet?.key_items
  return {
    equipment: Array.isArray(equipment) ? equipment : [],
    inventory: Array.isArray(inventory) ? inventory : [],
    keyItems: Array.isArray(keyItems) ? keyItems : [],
  }
}
