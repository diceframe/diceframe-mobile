/**
 * 骰灵（DF Agent 形象）对跑团事件的反应，对齐上游 PR #549 的 features/assistant/reactions.ts
 * 与 features/play/usePlayReactions.ts。
 *
 * 产生方只报「发生了什么」（kind + 可选数值 / 名字），这张表决定长什么样、持续多久、谁更重要。
 * 反应纯属表现层：不回流规则，也不进 Agent 对话。
 */
import type { TKey } from '@/i18n/keyset'

export type AvatarMood =
  | 'idle' | 'happy' | 'thinking' | 'listening' | 'speaking' | 'attention' | 'surprised'
  | 'cheer' | 'nod' | 'sad' | 'dizzy'
  | 'battle' | 'hurt' | 'worried' | 'alert' | 'curious' | 'rolling'

export type ReactionCategory = 'check' | 'combat' | 'story' | 'growth' | 'table'
export const REACTION_CATEGORIES: ReactionCategory[] = ['check', 'combat', 'story', 'growth', 'table']

export type ReactionKind =
  | 'diceRoll' | 'critical' | 'success' | 'failure' | 'fumble'
  | 'combatStart' | 'combatEnd' | 'yourTurn' | 'attackCrit' | 'attackHit' | 'attackMiss'
  | 'hurt' | 'heal' | 'downed' | 'deathSave'
  | 'newRound' | 'sceneChange' | 'sceneImage' | 'gameEnded'
  | 'levelUp' | 'xpGain' | 'itemGain' | 'hpLow'
  | 'playerJoin' | 'playerLeave' | 'pushOffered'

export interface ReactionDetail {
  amount?: number
  name?: string
}

export interface ReactionSpec {
  category: ReactionCategory
  mood: AvatarMood
  /** 同时到达时数值大的赢 */
  priority: number
  durationMs: number
  tone?: 'good' | 'bad' | 'great'
  /** 文案 key；带 amount / name 的插值见 reactionLabelParams */
  label: TKey
  /** 有名字时换用带名字的文案 */
  namedLabel?: TKey
}

export const REACTIONS: Record<ReactionKind, ReactionSpec> = {
  diceRoll: { category: 'check', mood: 'rolling', priority: 10, durationMs: 1400, label: 'dfReactDiceRoll' },
  critical: { category: 'check', mood: 'cheer', priority: 80, durationMs: 3200, tone: 'great', label: 'dfReactCritical' },
  success: { category: 'check', mood: 'nod', priority: 50, durationMs: 2200, tone: 'good', label: 'dfReactSuccess' },
  failure: { category: 'check', mood: 'sad', priority: 50, durationMs: 2400, tone: 'bad', label: 'dfReactFailure' },
  fumble: { category: 'check', mood: 'dizzy', priority: 80, durationMs: 3200, tone: 'bad', label: 'dfReactFumble' },

  combatStart: { category: 'combat', mood: 'battle', priority: 70, durationMs: 2800, tone: 'bad', label: 'dfReactCombatStart' },
  combatEnd: { category: 'combat', mood: 'happy', priority: 70, durationMs: 2800, tone: 'good', label: 'dfReactCombatEnd' },
  yourTurn: { category: 'combat', mood: 'alert', priority: 75, durationMs: 3000, label: 'dfReactYourTurn' },
  attackCrit: { category: 'combat', mood: 'cheer', priority: 80, durationMs: 3000, tone: 'great', label: 'dfReactAttackCrit' },
  attackHit: { category: 'combat', mood: 'nod', priority: 55, durationMs: 2000, tone: 'good', label: 'dfReactAttackHit' },
  attackMiss: { category: 'combat', mood: 'sad', priority: 45, durationMs: 2000, tone: 'bad', label: 'dfReactAttackMiss' },
  hurt: { category: 'combat', mood: 'hurt', priority: 65, durationMs: 2400, tone: 'bad', label: 'dfReactHurt', namedLabel: 'dfReactHurtAmount' },
  heal: { category: 'combat', mood: 'happy', priority: 55, durationMs: 2200, tone: 'good', label: 'dfReactHeal', namedLabel: 'dfReactHealAmount' },
  downed: { category: 'combat', mood: 'dizzy', priority: 90, durationMs: 3600, tone: 'bad', label: 'dfReactDowned' },
  deathSave: { category: 'combat', mood: 'worried', priority: 85, durationMs: 3000, tone: 'bad', label: 'dfReactDeathSave' },

  newRound: { category: 'story', mood: 'curious', priority: 20, durationMs: 1800, label: 'dfReactNewRound' },
  sceneChange: { category: 'story', mood: 'curious', priority: 40, durationMs: 2800, label: 'dfReactSceneChange', namedLabel: 'dfReactSceneChangeNamed' },
  sceneImage: { category: 'story', mood: 'surprised', priority: 30, durationMs: 2200, label: 'dfReactSceneImage' },
  gameEnded: { category: 'story', mood: 'cheer', priority: 90, durationMs: 3600, tone: 'great', label: 'dfReactGameEnded' },

  levelUp: { category: 'growth', mood: 'cheer', priority: 85, durationMs: 3400, tone: 'great', label: 'dfReactLevelUp' },
  xpGain: { category: 'growth', mood: 'nod', priority: 35, durationMs: 2200, tone: 'good', label: 'dfReactXpGain' },
  itemGain: { category: 'growth', mood: 'happy', priority: 40, durationMs: 2600, tone: 'good', label: 'dfReactItemGain', namedLabel: 'dfReactItemGainNamed' },
  hpLow: { category: 'growth', mood: 'worried', priority: 70, durationMs: 3000, tone: 'bad', label: 'dfReactHpLow' },

  playerJoin: { category: 'table', mood: 'happy', priority: 30, durationMs: 2400, label: 'dfReactPlayerJoin', namedLabel: 'dfReactPlayerJoinNamed' },
  playerLeave: { category: 'table', mood: 'sad', priority: 25, durationMs: 2200, label: 'dfReactPlayerLeave', namedLabel: 'dfReactPlayerLeaveNamed' },
  pushOffered: { category: 'table', mood: 'worried', priority: 60, durationMs: 3000, label: 'dfReactPushOffered' },
}

/** 文案 key 与插值参数：数值类反应（受伤 / 治疗）有数值时换成「-3 HP」这种写法 */
export function reactionLabel(kind: ReactionKind, detail: ReactionDetail): { key: TKey; params: Record<string, string | number> } {
  const spec = REACTIONS[kind]
  const amount = Math.abs(Number(detail.amount || 0))
  if ((kind === 'hurt' || kind === 'heal') && amount && spec.namedLabel) return { key: spec.namedLabel, params: { amount } }
  if (detail.name && spec.namedLabel && kind !== 'hurt' && kind !== 'heal') return { key: spec.namedLabel, params: { name: detail.name } }
  return { key: spec.label, params: { amount: kind === 'newRound' || kind === 'levelUp' ? detail.amount ?? '' : amount } }
}

/** 刚开始不到 900ms 的高优先级反应，不被低优先级的打断（如「暴击！」紧跟「命中！」） */
export const PROTECT_MS = 900

export function shouldReplace(
  active: { kind: ReactionKind; startedAt: number } | null,
  next: ReactionKind,
  now: number,
): boolean {
  if (!active) return true
  return !(now - active.startedAt < PROTECT_MS && REACTIONS[active.kind].priority > REACTIONS[next].priority)
}

/** 对局快照：只取反应关心的字段。每局以首个快照为基线，进局不会把历史重放成反应 */
export interface PlaySnapshot {
  game: string
  round: number
  scene: string
  sceneImage: string
  state: string
  level: number
  xp: number
  hp: number | null
  maxHp: number
  items: string[]
  players: Record<string, string>
  pushes: number
}

const LOW_HP_RATIO = 0.25

/** 两次快照之间的事件（顺序即上报顺序，由反应 store 按优先级取舍） */
export function playReactionsBetween(before: PlaySnapshot | null, next: PlaySnapshot): { kind: ReactionKind; detail?: ReactionDetail }[] {
  if (!before || before.game !== next.game) return []
  const out: { kind: ReactionKind; detail?: ReactionDetail }[] = []
  if (next.state === 'ended' && before.state !== 'ended') out.push({ kind: 'gameEnded' })
  if (next.round > before.round && before.round > 0) out.push({ kind: 'newRound', detail: { amount: next.round } })
  if (next.scene && before.scene && next.scene !== before.scene) out.push({ kind: 'sceneChange', detail: { name: next.scene } })
  if (next.sceneImage && next.sceneImage !== before.sceneImage) out.push({ kind: 'sceneImage' })

  for (const [id, name] of Object.entries(next.players)) if (!(id in before.players)) out.push({ kind: 'playerJoin', detail: { name } })
  for (const [id, name] of Object.entries(before.players)) if (!(id in next.players)) out.push({ kind: 'playerLeave', detail: { name } })
  if (next.pushes > before.pushes) out.push({ kind: 'pushOffered' })

  const gained = next.items.filter((item) => !before.items.includes(item))
  if (gained.length) out.push({ kind: 'itemGain', detail: { name: gained[0] } })
  if (next.xp > before.xp) out.push({ kind: 'xpGain', detail: { amount: next.xp - before.xp } })
  if (next.level > before.level && before.level > 0) out.push({ kind: 'levelUp', detail: { amount: next.level } })

  if (next.hp !== null && before.hp !== null && next.hp !== before.hp) {
    const max = next.maxHp
    if (next.hp <= 0 && before.hp > 0) out.push({ kind: 'downed' })
    else if (next.hp < before.hp && max > 0 && next.hp <= max * LOW_HP_RATIO && before.hp > max * LOW_HP_RATIO) out.push({ kind: 'hpLow' })
    else if (next.hp < before.hp) out.push({ kind: 'hurt', detail: { amount: before.hp - next.hp } })
    else out.push({ kind: 'heal', detail: { amount: next.hp - before.hp } })
  }
  return out
}

/** 检定结论 → 反应（揭示时上报；历史检定不上报） */
export function checkReaction(status: 'critical' | 'success' | 'failure' | 'fumble'): ReactionKind {
  return status
}
