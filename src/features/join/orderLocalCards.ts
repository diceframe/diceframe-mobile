import type { CharacterCard } from '@/api/types'

/**
 * 本机卡相对本局规则排序：规则一致的在前；规则不同或没绑规则的标为不匹配（仍可选，
 * 与 Web 选库卡一样允许跨规则带入，由玩家自行确认）。本局规则未知时不做标记。
 */
export function orderLocalCardsForGame(
  cards: readonly CharacterCard[],
  gameRuleId: string | undefined,
): { card: CharacterCard; matches: boolean }[] {
  const rows = cards.map((card) => ({ card, matches: !gameRuleId || String(card.rule_id || '') === gameRuleId }))
  return [...rows.filter((row) => row.matches), ...rows.filter((row) => !row.matches)]
}
