/**
 * DiceFrame 移动端 API 契约（v1 子集）。
 *
 * 来源：frontend-v2/src/api/types.ts（该文件本身是后端 API 的手写镜像，
 * 后端无 OpenAPI/代码生成）。两端以 Web 端为准做同步：
 * 修改本文件前先核对 Web 端同名接口，反之在后端改字段时两处都要更新。
 * 仅收录移动端 v1 用到的接口；未收录的（插件市场、更新器、P2P 等）后续按需补充。
 */

export type JsonObject = Record<string, unknown>

export interface SecretField {
  configured: boolean
  masked: string
}

// ---------- 角色 ----------

export interface CharacterResource {
  current?: number
  max?: number
  min?: number
}

export interface CharacterIdentity {
  [key: string]: string | number | undefined
}

export interface CharacterSkill {
  name: string
  value?: number
}

export interface CharacterItem {
  name?: string
  type?: string
  damage?: number
  slot?: string
  quality?: string
  qty?: number
  effect?: string
  category?: string
  note?: string
  [key: string]: unknown
}

export interface CharacterPortrait {
  kind: 'builtin' | 'upload' | 'plugin' | 'generated'
  id?: string
  asset_id?: string
  plugin_id?: string
  path?: string
}

export interface SceneImageRef {
  kind: 'builtin' | 'upload' | 'plugin' | 'asset' | 'generated'
  id?: string
  asset_id?: string
  plugin_id?: string
  path?: string
}

export interface MapBackgroundSelection {
  kind: 'auto' | 'none' | 'builtin' | 'upload' | 'plugin' | 'generated'
  id?: string
  asset_id?: string
  map_id?: string
}

export interface CharacterSheet {
  character_name?: string
  race?: string
  class?: string
  level?: number
  xp?: number
  level_up_points?: number
  background?: string
  identity?: CharacterIdentity
  resources?: Record<string, CharacterResource>
  currency?: { amount?: number }
  hp?: number
  max_hp?: number
  gold?: number
  attributes?: Record<string, number>
  skills?: (string | CharacterSkill)[]
  equipment?: CharacterItem[]
  inventory?: CharacterItem[]
  key_items?: CharacterItem[]
  portrait?: CharacterPortrait | null
  [key: string]: unknown
}

export interface Player {
  user_id: string
  character_name: string
  character_sheet?: CharacterSheet
  [key: string]: unknown
}

// ---------- 检定 ----------

export interface CheckRequest {
  check_id?: string
  required?: boolean
  actor_uid?: string
  actor_name?: string
  dice_system: 'd20' | 'd100' | string
  label?: string
  intent?: string
  skill?: string
  attribute?: string
  advantage_mode?: string
  advantage_note?: string | null
  target?: number
  circumstance_modifier?: number
  kind?: 'check' | 'save' | 'attack' | string
  opponent?: string
  opponent_name?: string
  opponent_roll?: number
  opponent_modifier?: number
  opponent_total?: number
  assist?: string[]
  planner_source?: string
}

export interface CheckResult {
  check_id?: string
  label?: string
  actor_uid?: string
  actor_name?: string
  dice?: string
  attribute?: string | null
  skill?: string
  roll?: number
  rolls?: number[]
  modifier?: number
  modifier_breakdown?: string | null
  total?: number
  dc?: number
  threshold?: number
  hard_threshold?: number
  extreme_threshold?: number
  verdict?: string
  luck_spend_available?: boolean
  luck_cost?: number | null
  luck_decision?: 'pending' | 'spent' | 'declined' | string
  luck_spent?: number
  luck_remaining?: number
  original_verdict?: string
  luck_resolved_at?: string
  is_critical?: boolean
  is_fumble?: boolean
  advantage_mode?: string
  advantage_note?: string | null
  kind?: 'check' | 'save' | 'attack' | string
  opponent?: string
  opponent_name?: string
  opponent_roll?: number
  opponent_modifier?: number
  opponent_total?: number
  assist?: string[]
  planner_source?: string
}

export interface PublicAction {
  user_id: string
  character_name?: string
  text: string
  revision_count?: number
  timestamp?: string
  dice_pending?: boolean
  dice_system?: string
  dice_roll_source?: string
  check_request?: CheckRequest
}

// ---------- 游戏 ----------

export interface Multiplayer {
  state?: string
  ready_count?: number
  active_count?: number
  away_count?: number
  player_count?: number
  max_players?: number
  ready_players?: Player[]
  waiting_players?: Player[]
  away_players?: Player[]
  submitted_actions?: PublicAction[]
}

export interface PendingPayment {
  id?: string
  payment_id?: string
  uid?: string
  amount?: number
  recipient_uid?: string
  rewards?: { name: string; category?: string }[]
  round?: number
  item?: string
  description?: string
  reason?: string
  status?: string
  [key: string]: unknown
}

export interface GameDetail {
  game_key: string
  world_name?: string
  world_id?: string
  rule_id?: string
  scene_image?: SceneImageRef
  map_background?: MapBackgroundSelection
  gm_uid?: string
  scene?: string
  round_number?: number
  state?: string
  language?: string
  solo_mode?: boolean
  player_access_open?: boolean
  has_room_password?: boolean
  multiplayer?: Multiplayer
  quick_actions?: string[]
  pending_payments?: PendingPayment[]
  pending_luck_decisions?: CheckResult[]
  round_check_results?: CheckResult[]
  total_tokens?: number
  plot_tracker?: PlotTracker
  [key: string]: unknown
}

export interface GameSummary {
  game_key: string
  world_name?: string
  world_id?: string
  rule_id?: string
  scene_image?: SceneImageRef
  map_background?: MapBackgroundSelection
  scene?: string
  state?: string
  language?: string
  solo_mode?: boolean
  gm_uid?: string
  round_number?: number
  player_count?: number
  max_players?: number
  total_llm_calls?: number
  total_tokens?: number
  started_at?: string
  last_activity?: string
  seed_code?: string
  [key: string]: unknown
}

export interface GamesResponse {
  games?: GameSummary[]
}

export interface PlayerCreateResponse {
  ok?: boolean
  error?: string
  user_id: string
  [key: string]: unknown
}

// ---------- 日志 ----------

export interface StoryRecap {
  id?: string
  text: string
  from_round?: number
  to_round?: number
  created_at?: string
}

export interface RoundSceneImage {
  reference?: SceneImageRef
  prompt?: string
  revised_prompt?: string
  status?: 'ready' | 'failed' | string
  swipe_index?: number
}

export interface LogTagsSummary {
  has_tags?: boolean
  count?: number
  tags?: string[]
  [key: string]: unknown
}

export interface LogEntry {
  round?: number
  gm_response?: string
  player_actions?: unknown
  actions?: unknown
  swipes?: unknown[]
  current_swipe?: number
  tags_summary?: LogTagsSummary
  check_results?: CheckResult[]
  story_recaps?: StoryRecap[]
  scene_image?: RoundSceneImage
  [key: string]: unknown
}

export interface GameLogResponse {
  log?: LogEntry[]
  total?: number
  total_pages?: number
  page?: number
}

export interface PrivateMessage {
  text?: string
  user_id?: string
  round?: number
  character_name?: string
  [key: string]: unknown
}

export interface PrivateLogResponse {
  messages?: PrivateMessage[]
  private_log?: PrivateMessage[]
}

export interface HealthEvent {
  id: string
  title?: string
  message?: string
  code?: string
  component?: string
  severity?: string
  round?: number
  resolved?: boolean
  ignored?: boolean
  [key: string]: unknown
}

export interface HealthResponse {
  events: HealthEvent[]
  [key: string]: unknown
}

// ---------- 行动 / GM ----------

export interface CommandResponse {
  ok?: boolean
  error?: string
  narration?: string
  quick_actions?: string[]
  forced_waiting?: string[]
  [key: string]: unknown
}

export interface ActionSubmitResponse {
  phase?: 'dice' | string
  message?: string
  narration?: string
  check_request?: CheckRequest
  check_result?: CheckResult
  check_results?: CheckResult[]
  pending_luck_decisions?: CheckResult[]
  advanced?: boolean
  roll?: {
    ok?: boolean
    dice_system?: string
    value?: number
    rolls?: number[]
    critical?: boolean
    fumble?: boolean
  }
  [key: string]: unknown
}

export interface LuckDecisionResponse extends ActionSubmitResponse {
  ok?: boolean
  error?: string
  ready_to_resolve?: boolean
  already_resolved?: boolean
}

// ---------- 角色面板规则元数据 ----------

export interface RuleAttribute {
  key: string
  min: number
  max: number
  name?: string
  name_en?: string
  display_name?: string
  [key: string]: unknown
}

export interface SkillSpec {
  key?: string
  name?: string
  value?: number
  [key: string]: unknown
}

export interface SpecialStatSpec {
  key: string
  name?: string
  max?: number
  [key: string]: unknown
}

export interface RuleMeta {
  rule_id?: string
  rule_name?: string
  rule_version?: string
  dice_system?: string
  skill_hint?: string
  skill_hint_en?: string
  hp_formula?: string
  mechanics?: string
  currency?: string
  auto_hp?: boolean
  max_skills?: number
  skill_pool?: SkillSpec[]
  skills?: SkillSpec[]
  rule_special_stats?: SpecialStatSpec[]
  [key: string]: unknown
}

export interface CharacterListResponse {
  players?: Player[]
  npcs?: CharacterCardSummary[]
  rule_attrs?: RuleAttribute[]
  rule_attrs_total?: number
  rule_meta?: RuleMeta
  rule_special_stats?: SpecialStatSpec[]
  [key: string]: unknown
}

/** 移动端只读 NPC 列表时需要的卡面字段（完整 CharacterCard 不引入） */
export interface CharacterCardSummary extends CharacterSheet {
  id?: string
  card_id?: string
  source?: string
  rule_id?: string
  rule_name?: string
  [key: string]: unknown
}

// ---------- 地图 ----------

export interface MapLocation {
  id?: string
  name: string
  connected_to?: string[]
  content?: string
  keywords?: string[]
  source?: 'lorebook' | 'plugin' | string
  plugin_id?: string
  plugin_name?: string
  x?: number
  y?: number
  icon_url?: string
  image_url?: string
  [key: string]: unknown
}

export interface MapAsset {
  id: string
  ref?: string
  name?: string
  description?: string
  plugin_id?: string
  plugin_name?: string
  path?: string
  url?: string
  [key: string]: unknown
}

export interface MapDefinition {
  id: string
  source_id?: string
  name: string
  description?: string
  mode: 'graph' | string
  plugin_id?: string
  plugin_name?: string
  background?: MapAsset | null
  default_view?: { x?: number; y?: number; zoom?: number }
  [key: string]: unknown
}

export interface MapData {
  schema_version?: number
  map_mode?: 'graph' | string
  locations: MapLocation[]
  current_scene?: string
  current_location_id?: string
  active_map?: MapDefinition | null
  assets?: {
    icons?: MapAsset[]
    scenes?: MapAsset[]
  }
  [key: string]: unknown
}

// ---------- 配置 / 语音 ----------

export interface AppConfig {
  public_base_url?: string
  access_password?: SecretField
  tts_provider?: 'browser' | 'openai-compatible' | 'gpt-sovits' | 'edge-tts'
  tts_default_voice?: string
  tts_gm_voice?: string
  tts_player_voice?: string
  asr_provider?: 'disabled' | 'openai-compatible'
  asr_base_url?: string
  asr_model?: string
  [key: string]: unknown
}

export interface TtsSpeechRequest {
  text: string
  voice?: string
  language?: string
  speed?: number
}

export interface TranscriptionResponse {
  ok?: boolean
  text?: string
  error?: string
  [key: string]: unknown
}

export interface PlayerContextResponse {
  preview?: boolean
  [key: string]: unknown
}

// ---------- 世界观模板 / 规则（创建对局选择器） ----------

export interface WorldTemplateSummary {
  id?: string
  world_id?: string
  name?: string
  world_name?: string
  description?: string
  default_rule?: string
  recommended_rules?: string[]
  scene_image?: SceneImageRef
  language?: string
  [key: string]: unknown
}

export interface WorldTemplatesResponse {
  templates?: WorldTemplateSummary[]
}

export interface RuleSummary {
  rule_id: string
  rule_name?: string
  rule_name_en?: string
  description?: string
  dice_system?: string
  combat_model?: string
  attr_count?: number
  custom?: boolean
  file?: string
  source_rule_id?: string
  scene_image?: SceneImageRef
  [key: string]: unknown
}

export interface RulesResponse {
  rules?: RuleSummary[]
  total?: number
}

// ---------- 剧情追踪（GameDetail.plot_tracker） ----------

export interface PlotQuest {
  title?: string
  progress?: string
  status?: string
}

export interface PlotRelation {
  npc_name?: string
  tier?: string
}

export interface PlotDecision {
  title?: string
  summary?: string
  description?: string
  round_number?: number
}

export interface PlotTracker {
  quests?: Record<string, PlotQuest>
  relations?: Record<string, PlotRelation>
  decisions?: (PlotDecision | string)[]
}
