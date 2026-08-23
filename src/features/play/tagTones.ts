/**
 * 游戏域专用色 —— 对齐 Web frontend-v2/src/styles/styles.css 的标签徽章/状态卡配色。
 * 采用"强色文字 + 同色 12% 底"的形式（Web 暗色模式的做法），明暗两种模式下均可读，
 * 无需为亮色单独维护一套。仅用于 inline style（原生组件/非 token 场景）。
 */
export interface TagTone {
  /** 文字色 */
  color: string
  /** 背景色（同色半透明） */
  bg: string
  /** 描边色（状态卡用） */
  border?: string
}

export const TAG_TONES: Record<string, TagTone> = {
  'hp-up': { color: '#6bff8a', bg: 'rgba(107,255,138,0.12)' },
  'hp-dn': { color: '#ff6b6b', bg: 'rgba(255,107,107,0.12)' },
  gold: { color: '#f5c842', bg: 'rgba(245,200,66,0.12)' },
  pay: { color: '#f5a442', bg: 'rgba(245,164,66,0.12)' },
  loot: { color: '#6bffe8', bg: 'rgba(107,255,232,0.12)' },
  npc: { color: '#6bb5ff', bg: 'rgba(107,181,255,0.12)' },
  scene: { color: '#c06bff', bg: 'rgba(192,107,255,0.12)' },
  quest: { color: '#ff9f43', bg: 'rgba(255,159,67,0.12)' },
  decision: { color: '#ff7ab6', bg: 'rgba(255,122,182,0.12)' },
}

/** 状态卡：good=增益 / warn=减益（Web --df-success / --df-danger 的暗色值） */
export const STATE_TONES: Record<'good' | 'warn', TagTone> = {
  good: {
    color: '#75c58f',
    bg: 'rgba(77,145,105,0.12)',
    border: 'rgba(77,145,105,0.45)',
  },
  warn: {
    color: '#ec7770',
    bg: 'rgba(169,79,77,0.12)',
    border: 'rgba(169,79,77,0.45)',
  },
}
