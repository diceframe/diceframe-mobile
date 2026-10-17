import type { TKey } from '@/i18n/keyset'
import type { T } from '@/i18n/t'

const TOOL_KEYS: Record<string, TKey> = {
  read_catalog: 'dfAgentToolReadCatalog',
  read_game: 'dfAgentToolReadGame',
  navigate: 'dfAgentToolNavigate',
  draft_content: 'dfAgentToolDraftContent',
  save_content: 'dfAgentToolSaveContent',
  create_game: 'dfAgentToolCreateGame',
  set_player_control: 'dfAgentToolSetPlayerControl',
  submit_action: 'dfAgentToolSubmitAction',
  create_rule: 'dfAgentToolCreateRule',
  generate_image: 'dfAgentToolGenerateImage',
  invoke_plugin_tool: 'dfAgentToolInvokePluginTool',
  set_plugin_enabled: 'dfAgentToolSetPluginEnabled',
  diagnose_runtime: 'dfAgentToolDiagnoseRuntime',
  read_content: 'dfAgentToolReadContent',
  edit_world: 'dfAgentToolEditWorld',
  write_lorebook_entries: 'dfAgentToolWriteLorebookEntries',
  edit_character_card: 'dfAgentToolEditCharacterCard',
  search_documentation: 'dfAgentToolSearchDocumentation',
}

/** 工具名本地化；服务端新加、本端还没登记的工具原样显示 id */
export function agentToolLabel(t: T, tool: unknown): string {
  const key = TOOL_KEYS[String(tool ?? '')]
  return key ? t(key) : String(tool ?? '')
}

const KIND_KEYS: Record<string, TKey> = {
  world: 'dfAgentTargetWorld',
  lorebook: 'dfAgentTargetLorebook',
  character: 'dfAgentTargetCharacter',
  character_template: 'dfAgentTargetCharacter',
  adventure: 'dfAgentTargetAdventure',
}

/** 草稿种类 / 写入目标的名称；不认识的种类按「创作内容」显示 */
export function agentKindLabel(t: T, kind: unknown): string {
  const key = KIND_KEYS[String(kind ?? '').trim().toLowerCase()]
  return key ? t(key) : t('dfAgentCreate')
}

/** 服务端 status 事件的常见取值本地化，其余原样 */
export function agentStatusLabel(t: T, status: string): string {
  if (status === 'idle') return t('dfAgentStatusIdle')
  if (status === 'approval_required') return t('dfAgentStatusApproval')
  return status
}

const ROUTE_KEYS: Record<string, TKey> = {
  overview: 'dfAgentRouteOverview',
  create: 'dfAgentRouteCreate',
  play: 'dfAgentRoutePlay',
  characters: 'dfAgentRouteCharacters',
  library: 'dfAgentRouteLibrary',
  creator: 'dfAgentRouteCreator',
  map: 'dfAgentRouteMap',
  lorebook: 'dfAgentRouteLorebook',
  worlds: 'dfAgentRouteWorlds',
  adventures: 'dfAgentRouteAdventures',
  modules: 'dfAgentRouteModules',
  memory: 'dfAgentRouteMemory',
  logs: 'dfAgentRouteLogs',
  rules: 'dfAgentRouteRules',
  settings: 'dfAgentRouteSettings',
  plugins: 'dfAgentRoutePlugins',
}

/** Agent 页面名的显示名（上游 workspaceCopy.routes），不认识的原样 */
export function agentRouteLabel(t: T, route: string): string {
  const key = ROUTE_KEYS[route]
  return key ? t(key) : route
}
