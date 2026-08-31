/**
 * 创建冒险的 payload 组装（对齐 Web CreateView 的 create() 分支逻辑）。
 * 纯函数无副作用：时间戳、AI 生成结果等外部量由调用方注入 state，便于单测。
 */
import type {
  CharacterSheet,
  MapBackgroundSelection,
  SceneImageRef,
} from '@/api/types'

export type GameLanguage = 'zh-CN' | 'en'
export type CreateMode = 'template' | 'custom' | 'ai'
export type NarrativePerspective = 'immersive' | 'third_person'
export type AdvancementMode = 'milestone' | 'xp'
export type AdvancementAuthority = 'ai_gm' | 'gm'
/** '__builtin__' 模板自带 / '__blank__' 空白 / 'copy:<worldId>' 复制自某世界 */
export type LoreChoice = '__builtin__' | '__blank__' | `copy:${string}`

/** players 元素 = 完整角色 sheet + 必填名（对齐 Web 的 CreateCharacter） */
export type CreateCharacter = CharacterSheet & { character_name: string }

export interface CreateFormState {
  seed: string
  gameLanguage: GameLanguage
  mode: CreateMode
  // 模板模式
  worldId: string
  /** 所选模板的显示名，作为冒险名称兜底 */
  worldName: string
  ruleId: string
  name: string
  // 自定义模式
  customName: string
  customDesc: string
  // AI 模式（generate-world / generate-rule 的结果由向导回填）
  aiPrompt: string
  aiRuleId: string
  /** 「按母版生成本局专属规则」开关 */
  aiAutoRule: boolean
  aiGeneratedRuleId: string
  aiWorldId: string
  aiWorldName: string
  // 共用
  description: string
  loreChoice: LoreChoice
  adventureId: string
  showAdventurePackages: boolean
  // 游戏设置
  solo: boolean
  /** 服务端约定为中文枚举：轻松/标准/硬核（与规则模板 difficulty_instructions 键一致） */
  difficulty: string
  narrativePerspective: NarrativePerspective
  supportsAdvancementPolicy: boolean
  advancementMode: AdvancementMode
  advancementAuthority: AdvancementAuthority
  roomPassword: string
  openRoom: boolean
  sceneImage?: SceneImageRef
  mapBackground?: MapBackgroundSelection
  players: CreateCharacter[]
}

/** 游戏语言只有 zh-CN / en 两档（对齐 Web 下拉），兜底词按语言取对 */
export const ADVENTURER_FALLBACK: Record<GameLanguage, string> = { 'zh-CN': '冒险者', en: 'Adventurer' }
const NEW_ADVENTURE_FALLBACK: Record<GameLanguage, string> = { 'zh-CN': '新冒险', en: 'New Adventure' }
const MY_ADVENTURE_FALLBACK: Record<GameLanguage, string> = { 'zh-CN': '我的冒险', en: 'My Adventure' }
const AI_WORLD_FALLBACK: Record<GameLanguage, string> = { 'zh-CN': 'AI 生成的世界', en: 'AI Generated World' }
const BLANK_SUFFIX: Record<GameLanguage, string> = { 'zh-CN': '（空白世界书）', en: ' (Blank Lorebook)' }
const COPY_SUFFIX: Record<GameLanguage, string> = { 'zh-CN': '（复制世界书）', en: ' (Copied Lorebook)' }

const COPY_PREFIX = 'copy:'

export type CreateRequest =
  | { endpoint: 'create'; body: Record<string, unknown> }
  | { endpoint: 'create-from-seed'; body: Record<string, unknown> }

/** AI 模式用生成出的专属规则，其余模式用所选规则（对齐 Web activeRule） */
export function activeRuleIdOf(state: Pick<CreateFormState, 'mode' | 'aiGeneratedRuleId' | 'aiRuleId' | 'ruleId'>): string {
  return state.mode === 'ai' ? state.aiGeneratedRuleId || state.aiRuleId : state.ruleId
}

/** 空白冒险者占位卡：非专业规则下保证极速创建也能满足「至少 1 名角色」的后端约束 */
export function blankAdventurer(lang: GameLanguage): CreateCharacter {
  return {
    character_name: ADVENTURER_FALLBACK[lang],
    background: '',
    identity: {},
    attributes: {},
    skills: [],
  }
}

/**
 * 世界书复制源失效时回退模板自带（语言切换/目录刷新后源可能被过滤掉）。
 * 纯函数：向导在提交前清洗，避免 effect 内同步 setState。
 */
export function sanitizeLoreChoice(
  choice: LoreChoice,
  loreWorlds: { worldId: string; language: string }[],
  gameLanguage: GameLanguage,
): LoreChoice {
  if (!choice.startsWith('copy:')) return choice
  const selected = choice.slice('copy:'.length)
  const prefix = gameLanguage.split('-')[0]
  const exists = loreWorlds.some(
    (world) => world.worldId === selected && String(world.language || '').toLowerCase().startsWith(prefix),
  )
  return exists ? choice : '__builtin__'
}

export function buildCreateRequest(state: CreateFormState, now = Date.now()): CreateRequest {
  const seed = state.seed.trim()
  if (seed) {
    // 种子恢复：世界/规则等全部由种子码决定，只带对局级设置
    const body: Record<string, unknown> = {
      seed_code: seed,
      solo: state.solo,
      players: state.players,
      language: state.gameLanguage,
      narrative_perspective: state.narrativePerspective,
    }
    if (state.sceneImage) body.scene_image = state.sceneImage
    return { endpoint: 'create-from-seed', body }
  }

  const lang = state.gameLanguage
  const body: Record<string, unknown> = {
    solo: state.solo,
    difficulty: state.difficulty,
    rule_id: activeRuleIdOf(state),
    adventure_id: state.showAdventurePackages ? state.adventureId : '',
    description: state.description,
    // 三态：开放房空串；留空 null 由服务端对多人自动生成；非空为自定义密码
    room_password: state.openRoom ? '' : state.roomPassword.trim() || null,
    players: state.players,
    language: lang,
    narrative_perspective: state.narrativePerspective,
    advancement_mode: state.supportsAdvancementPolicy ? state.advancementMode : 'milestone',
    advancement_authority: state.supportsAdvancementPolicy ? state.advancementAuthority : 'ai_gm',
  }
  if (state.sceneImage) body.scene_image = state.sceneImage
  if (state.mapBackground) body.map_background = state.mapBackground

  let worldId = ''
  if (state.mode === 'template') {
    worldId = state.worldId
    body.world_id = worldId
    body.game_name = state.name.trim() || state.worldName || NEW_ADVENTURE_FALLBACK[lang]
  } else if (state.mode === 'custom') {
    worldId = `custom_${now}`
    body.world_id = worldId
    body.world_name = state.customName.trim() || MY_ADVENTURE_FALLBACK[lang]
    body.custom_world = true
    // 自定义模式下世界描述取代「背景补充」（对齐 Web）
    body.description = state.customDesc
  } else {
    worldId = state.aiWorldId
    body.world_id = worldId
    body.game_name = state.aiWorldName || AI_WORLD_FALLBACK[lang]
  }

  if (state.loreChoice === '__builtin__') {
    body.create_lorebook = false
  } else if (state.loreChoice === '__blank__') {
    // 派生新 world_id 建空白世界书，模板世界本身不被写入（对齐 Web）
    body.source_world_id = worldId
    body.world_id = `${worldId}_blank_${now}`
    body.game_name = String(body.game_name ?? '') + BLANK_SUFFIX[lang]
    body.create_lorebook = true
    body.blank_lorebook = true
  } else {
    const source = state.loreChoice.startsWith(COPY_PREFIX) ? state.loreChoice.slice(COPY_PREFIX.length) : ''
    body.source_world_id = worldId
    body.world_id = `${worldId}_copy_${now}`
    body.game_name = String(body.game_name ?? '') + COPY_SUFFIX[lang]
    body.create_lorebook = true
    body.lorebook_world_id = source
  }

  return { endpoint: 'create', body }
}
