/**
 * 世界书条目的纯逻辑：分类全集、tier 归一化、visible_to 可见性模型。
 *
 * 语义对齐上游 frontend-v2：
 * - 分类 = LorebookView.vue 的 loreTypeOrder（9 类）；未知/缺省折叠为 other，
 *   但 puzzle/spell/class 是独立分类，绝不能折叠（否则编辑保存会静默改写条目类型）。
 * - tier 与 visible_to 是两个独立维度：tier（core/background/archived）只表示
 *   条目重要度，与「谁能看到」无关；可见性唯一事实来源是 visible_to
 *   （[] = 仅 GM；['*'] = 全队公开；具体 id/名字列表 = 指定成员）。
 * - 可见性档位判定/清洗 = features/lorebook/visibility.ts 的同款语义，
 *   canonical 公开标记是语言无关的 '*'，其余中英文写法只是历史数据的识别别名。
 */

/** 服务端条目中本模块消费的字段；visible_to 在 api 契约里走索引签名，按 unknown 读入后归一化 */
export interface LoreEntryLike {
  id?: unknown
  name?: unknown
  type?: unknown
  tier?: unknown
  content?: unknown
  visible_to?: unknown
}

// ---------------------------------------------------------------------------
// 分类（type）
// ---------------------------------------------------------------------------

/** 与上游 loreTypeOrder 全集一致，顺序即筛选条顺序 */
export const LORE_TYPE_ORDER = ['npc', 'location', 'faction', 'item', 'event', 'puzzle', 'spell', 'class', 'other'] as const

export type LoreType = (typeof LORE_TYPE_ORDER)[number]

/**
 * 条目类型归一化：只认 9 类全集，未知/缺省归 other。
 * 注意 history 数据里的 other 保持 other，不得反向猜测具体分类。
 */
export function normalizeLoreType(type: unknown): LoreType {
  const text = String(type ?? '').trim()
  return (LORE_TYPE_ORDER as readonly string[]).includes(text) ? (text as LoreType) : 'other'
}

// ---------------------------------------------------------------------------
// 层级（tier）
// ---------------------------------------------------------------------------

/** tier 三档：条目重要度维度，与可见性无关（对齐 Web 编辑表单的 tier 下拉） */
export const LORE_TIERS = ['core', 'background', 'archived'] as const

export type LoreTier = (typeof LORE_TIERS)[number]

/** tier 归一化：非法/缺省回落 background（与上游新建条目默认档一致） */
export function normalizeTier(tier: unknown): LoreTier {
  const text = String(tier ?? '').trim()
  return (LORE_TIERS as readonly string[]).includes(text) ? (text as LoreTier) : 'background'
}

// ---------------------------------------------------------------------------
// 可见性（visible_to）
// ---------------------------------------------------------------------------

/** 历史数据里代表「全队公开」的写法；canonical 是 '*'，其余只是识别别名 */
export const LORE_PUBLIC_VISIBILITY_MARKERS = [
  '*', 'all', 'everyone', 'public', 'party', 'players',
  '公开', '所有人', '全体玩家',
] as const

/** 编辑表单的可见性三档：仅 GM / 全队公开 / 指定成员 */
export type LoreVisibilityMode = 'gm' | 'public' | 'characters'

/**
 * visible_to 归一化为 string[]。历史数据可能是 JSON 字符串（'["u1"]'）或
 * 逗号分隔字符串（'u1,u2'），也可能是「公开」这类原始标记——统一拆开Trim去空。
 */
export function normalizeVisibilityValues(value: unknown): string[] {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean)
      }
    } catch {
      // 不是合法 JSON：按逗号分隔字符串处理
    }
    return text.split(/[,，、]/).map((item) => item.trim()).filter(Boolean)
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  return []
}

/**
 * 由 visible_to 派生档位（徽章与编辑表单初值同源，保证展示 = 实际权限）：
 * 空/缺省 = 仅 GM；含公开标记 = 全队；其余 = 指定成员。
 * 标记判定大小写不敏感（后端 casefold，历史 'PUBLIC' 必须归入全队档，
 * 否则再次保存时会被 sanitizer 剥掉而静默变成仅 GM）。
 */
export function visibilityModeOf(value: unknown): LoreVisibilityMode {
  const list = normalizeVisibilityValues(value)
  if (!list.length) return 'gm'
  const markers = new Set(LORE_PUBLIC_VISIBILITY_MARKERS.map((marker) => marker.toLowerCase()))
  return list.some((item) => markers.has(item.toLowerCase())) ? 'public' : 'characters'
}

/** 「指定成员」档的清洗：剥掉公开标记、trim、去空、大小写不敏感去重 */
export function sanitizeCharacterVisibility(values: unknown): string[] {
  const markers = new Set(LORE_PUBLIC_VISIBILITY_MARKERS.map((marker) => marker.toLowerCase()))
  const out: string[] = []
  for (const value of normalizeVisibilityValues(values)) {
    if (markers.has(value.toLowerCase())) continue
    if (out.some((existing) => existing.toLowerCase() === value.toLowerCase())) continue
    out.push(value)
  }
  return out
}

/**
 * 编辑档位 -> 应写入的 visible_to（对齐上游 setVisibilityMode 语义）：
 * gm 写 []，public 写 ['*']，characters 保留点名并过 sanitize。
 * 保存前统一走这里，UI 怎么改都不会让档位与落库数据漂移。
 */
export function visibilityForMode(mode: LoreVisibilityMode, current: unknown): string[] {
  if (mode === 'public') return ['*']
  if (mode === 'gm') return []
  return sanitizeCharacterVisibility(current)
}

/** 手输点名文本（逗号/顿号分隔）解析为候选名单，再做 characters 档清洗 */
export function parseVisibilityTargets(text: string): string[] {
  return sanitizeCharacterVisibility(String(text ?? '').split(/[,，、]/))
}

// ---------------------------------------------------------------------------
// 服务端条目 -> 移动端视图模型
// ---------------------------------------------------------------------------

/** 世界书条目的移动端视图模型：无损保留 type/tier/visible_to，徽章与表单全部由此派生 */
export interface LorebookEntryView {
  id: string
  title: string
  content: string
  type: LoreType
  tier: LoreTier
  /** 可见性档位（由 visible_to 派生），编辑表单初值 */
  visibility: LoreVisibilityMode
  /** 归一化后的 visible_to，characters 档回显点名用 */
  visibleTo: string[]
}

/** 服务端条目 -> 视图模型；无 id 的脏数据丢弃（列表 key 与编辑/删除都依赖 id） */
export function toLoreEntryView(entry: LoreEntryLike): LorebookEntryView | null {
  const id = String(entry?.id ?? '').trim()
  if (!id) return null
  const visibleTo = normalizeVisibilityValues(entry.visible_to)
  return {
    id,
    title: String(entry?.name ?? ''),
    content: String(entry?.content ?? ''),
    type: normalizeLoreType(entry.type),
    tier: normalizeTier(entry.tier),
    visibility: visibilityModeOf(entry.visible_to),
    visibleTo,
  }
}
