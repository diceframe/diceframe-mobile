/**
 * GM 输出文本解析（移植自 frontend-v2/src/utils/renderer.ts 的 v1 子集）。
 *
 * GM 文本三段式：叙事正文（markdown 段落）+ 【状态卡】行 + `---` 后的协议标签行
 * （HP:..、GOLD:..、LOOT:.. 等）。移动端不做 lore 关键词高亮与节奏切分，
 * 保留状态卡抽取、协议分隔与标签徽章。
 */

export interface StateCard {
  title: string
  body: string
  tone: 'good' | 'warn'
}

export interface TagBadge {
  tone: string
  text: string
}

export interface GMBlock {
  paragraphs: string[]
  states: StateCard[]
  tags: TagBadge[]
}

const PROTOCOL_HEADING_RE =
  /^[\s#>*_`【[]*(?:状态[\s*_`]*(?:变更|变化|更新)|state[\s*_`-]*changes?)[\s#>*_`】\]:：-]*$/i
const PROTOCOL_TAG_RE =
  /^(?:HP|GOLD|PAY|SCENE|NPC|LOOT|KEY_ITEM|DECISION|QUEST|USE|WEAPON|EQUIP|PRIVATE|XP|SAN|SAN_CHECK|LUCK|SKILL_GROWTH|PUSH|PUZZLE|MANA|SPELL|QUICK_ACTIONS|COMBAT|REVIVE|CONFIRMED|MEMORY|NONE|ROLL)\s*(?::|$)/i

/** 协议段前若无 `---` 分隔线则补一条，保证叙事与标签不会混排 */
export function normalizeProtocolSuffix(text: string): string {
  const source = String(text || '')
  if (source.includes('---')) return source
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const headingIndex = lines.findIndex(
    (line, index) =>
      PROTOCOL_HEADING_RE.test(line.trim()) &&
      lines.slice(index + 1).some((next) => PROTOCOL_TAG_RE.test(next.trim())),
  )
  if (headingIndex >= 0) {
    return [...lines.slice(0, headingIndex), '---', ...lines.slice(headingIndex + 1)].join('\n')
  }
  for (let index = 0; index < lines.length; index++) {
    const suffix = lines.slice(index).filter((line) => line.trim())
    if (suffix.length >= 2 && suffix.every((line) => PROTOCOL_TAG_RE.test(line.trim()))) {
      return [...lines.slice(0, index), '---', ...lines.slice(index)].join('\n')
    }
  }
  return source
}

const STATE_KEYWORDS =
  '系统检定|任务更新|状态变化|状态变动|状态更新|玩家状态|资源变化|资源变动|资源更新|关系变化|关系变动|属性变化|属性变动|属性更新|线索更新|记忆更新|检定结果|战斗结算|奖励|代价|system check|quest update|status change|status update|player status|resource change|resource update|relationship change|attribute change|attribute update|clue update|memory update|check result|combat resolution|reward|cost|buff|debuff'
const STATE_TITLE_RE = new RegExp('^(?:' + STATE_KEYWORDS + ')$', 'i')
const STATE_CUE_RE = /变化|变动|更新|结算|检定|奖励|代价|change|update|resolution|check|reward|cost/i

function isStateTitle(title: string): boolean {
  return STATE_TITLE_RE.test(title) || STATE_CUE_RE.test(title)
}

function stateTone(title: string, body: string): 'good' | 'warn' {
  return /失败|警惕|受伤|扣除|失去|消耗|危险|倒地|中毒|拒绝|伤害|惩罚|代价|fail|failure|alert|injured|damage|lose|lost|spend|spent|consume|danger|poison|reject|penalty|cost|[－-]\s*\d+/i.test(
    title + body,
  )
    ? 'warn'
    : 'good'
}

export function extractStateLines(text: string): { narration: string; states: StateCard[] } {
  const states: StateCard[] = []
  const narration: string[] = []
  String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .forEach((line) => {
      const t = line.trim()
      if (!t) return
      const bracket = t.match(/^【([^】]+)】\s*(.*)$/)
      if (bracket && isStateTitle(bracket[1])) {
        states.push({ title: bracket[1], body: bracket[2] || '', tone: stateTone(bracket[1], bracket[2] || '') })
        return
      }
      const labeled = t.match(/^([^【】\[:：]+)[:：]\s*(.*)$/)
      if (labeled && labeled[1].length <= 12 && STATE_TITLE_RE.test(labeled[1])) {
        states.push({ title: labeled[1], body: labeled[2] || '', tone: stateTone(labeled[1], labeled[2] || '') })
        return
      }
      narration.push(line)
    })
  return { narration: narration.join('\n').trim(), states }
}

export function formatTagLine(tagBlock: string): TagBadge[] {
  const badges: TagBadge[] = []
  String(tagBlock || '')
    .split('\n')
    .forEach((raw) => {
      const line = raw.trim()
      if (!line) return
      const p = line.split(':')
      if (p.length < 2) return
      const tag = p[0].toUpperCase()
      const uid = p[1] || ''
      const val = p.slice(2).join(':').trim()
      const count = parseInt(val, 10)
      if (tag === 'HP' && !Number.isNaN(count)) {
        badges.push({ tone: count < 0 ? 'hp-dn' : 'hp-up', text: `HP ${count < 0 ? String(count) : `+${count}`}` })
      } else if (tag === 'GOLD' && !Number.isNaN(count)) {
        badges.push({ tone: 'gold', text: `金币 ${count < 0 ? String(count) : `+${count}`}` })
      } else if (tag === 'PAY' && !Number.isNaN(count)) {
        badges.push({ tone: 'pay', text: `金币 ${-Math.abs(count)}` })
      } else if (tag === 'LOOT' && val) {
        badges.push({ tone: 'loot', text: val })
      } else if (tag === 'KEY_ITEM' && val) {
        badges.push({ tone: 'loot', text: `🔑 ${val}` })
      } else if (tag === 'WEAPON' && val) {
        badges.push({ tone: 'loot', text: `⚔ ${val}` })
      } else if (tag === 'EQUIP' && val) {
        badges.push({ tone: 'loot', text: `🛡 ${val}` })
      } else if (tag === 'NPC' && val) {
        badges.push({ tone: 'npc', text: `NPC ${val || uid}` })
      } else if (tag === 'SCENE' && val) {
        badges.push({ tone: 'scene', text: val })
      } else if (tag === 'QUEST' && val) {
        badges.push({ tone: 'quest', text: val })
      } else if (tag === 'DECISION') {
        badges.push({ tone: 'decision', text: val || '关键决策' })
      } else if (tag === 'XP' && val) {
        badges.push({ tone: 'gold', text: `XP +${val}` })
      } else if (tag === 'ROLL' && val) {
        badges.push({ tone: 'roll', text: val })
      }
    })
  return badges
}

export function parseGMText(text: string): GMBlock {
  const extracted = extractStateLines(normalizeProtocolSuffix(text))
  let narration = extracted.narration
  let tagBlock = ''
  const dash = narration.indexOf('---')
  if (dash >= 0) {
    tagBlock = narration.substring(dash + 3).trim()
    narration = narration.substring(0, dash)
  }
  const paragraphs = narration
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return { paragraphs, states: extracted.states, tags: formatTagLine(tagBlock) }
}
