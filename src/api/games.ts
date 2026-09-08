/**
 * 游戏域 API（路径与 payload 对齐 Web 端 PlayView/JoinView/useGame 的调用方式）。
 */
import type {
  ActionSubmitResponse,
  AdventureSummary,
  BotBindTokenResponse,
  CharacterCard,
  CharacterCardsResponse,
  CharacterListResponse,
  CharacterSheet,
  CommandResponse,
  GameDetail,
  GameLogResponse,
  GamesResponse,
  GameMutationResponse,
  GeneratedImageItem,
  GeneratedRuleResponse,
  GeneratedWorldResponse,
  HealthResponse,
  JsonObject,
  LuckDecisionResponse,
  MapBackgroundSelection,
  MapData,
  PaymentProposalCreatePayload,
  PaymentProposalCreateResponse,
  PaymentResolveResponse,
  PlayerCreateResponse,
  PlayerContextResponse,
  PrivateLogResponse,
  RulesResponse,
  SceneImageRef,
  WorldCandidate,
  WorldTemplatesResponse,
} from './types'
import { contentLanguage, getT } from '@/i18n/t'
import { api, apiBlob } from './client'

function gamePath(gameKey: string, suffix = ''): string {
  return `/games/${encodeURIComponent(gameKey)}${suffix}`
}

export function fetchGames(): Promise<GamesResponse> {
  return api<GamesResponse>('/games')
}

export function fetchGameDetail(gameKey: string): Promise<GameDetail> {
  return api<GameDetail>(gamePath(gameKey))
}

export function fetchCharacters(gameKey: string): Promise<CharacterListResponse> {
  return api<CharacterListResponse>(gamePath(gameKey, '/characters'))
}

export function fetchLog(gameKey: string, page?: number): Promise<GameLogResponse> {
  return api<GameLogResponse>(gamePath(gameKey, '/log'), { query: { page } })
}

export function fetchPrivateLog(gameKey: string): Promise<PrivateLogResponse> {
  return api<PrivateLogResponse>(gamePath(gameKey, '/private-log'))
}

export function fetchMap(gameKey: string): Promise<MapData> {
  return api<MapData>(gamePath(gameKey, '/map'))
}

export async function fetchPlayerContext(gameKey: string): Promise<PlayerContextResponse> {
  try {
    return await api<PlayerContextResponse>(gamePath(gameKey, '/player-context'))
  } catch {
    return { preview: false }
  }
}

export function submitAction(gameKey: string, text: string): Promise<ActionSubmitResponse> {
  return api<ActionSubmitResponse>(gamePath(gameKey, '/action'), {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function advanceGame(gameKey: string): Promise<CommandResponse> {
  return api<CommandResponse>(gamePath(gameKey, '/advance'), {
    method: 'POST',
    body: JSON.stringify({ force: true }),
  })
}

export function rollbackGame(gameKey: string): Promise<CommandResponse> {
  return api<CommandResponse>(gamePath(gameKey, '/rollback'), { method: 'POST', body: '{}' })
}

export function gmCommand(gameKey: string, command: string): Promise<CommandResponse> {
  return api<CommandResponse>(gamePath(gameKey, '/gm-command'), {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

/** 切换回合叙事分支（GM 专属）：服务端把选中分支写回 gm_response，调用后需刷新日志 */
export function switchSwipe(gameKey: string, round: number, swipeIndex: number): Promise<{ ok?: boolean }> {
  return api<{ ok?: boolean }>(gamePath(gameKey, `/swipe/${round}`), {
    method: 'POST',
    body: JSON.stringify({ swipe_index: swipeIndex }),
  })
}

/** 重新生成本回合叙事分支（GM 专属，服务端上限 5 条，满额时 narration 返回空且不生效） */
export function regenerateSwipe(gameKey: string, round: number): Promise<{ ok?: boolean; narration?: string | null }> {
  return api<{ ok?: boolean; narration?: string | null }>(gamePath(gameKey, `/swipe/${round}`), {
    method: 'PUT',
    body: '{}',
  })
}

export function resolveLuck(
  gameKey: string,
  checkId: string,
  spend: boolean,
): Promise<LuckDecisionResponse> {
  return api<LuckDecisionResponse>(gamePath(gameKey, `/checks/${encodeURIComponent(checkId)}/luck`), {
    method: 'POST',
    body: JSON.stringify({ spend }),
  })
}

/** POST /players：join_as_new=false 找回既有身份；true 以 sheet 新建 */
export function joinGame(
  gameKey: string,
  payload: { user_id: string; join_as_new: false } | ({ join_as_new: true } & Partial<CharacterSheet> & JsonObject),
): Promise<PlayerCreateResponse> {
  return api<PlayerCreateResponse>(gamePath(gameKey, '/players'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function verifyRoomPassword(gameKey: string, password: string): Promise<string> {
  const result = await api<{ room_token?: string }>(gamePath(gameKey, '/verify-room-password'), {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  if (!result.room_token) throw new Error('房间密码校验未返回令牌')
  return result.room_token
}

/**
 * 把当前会话绑定为存档的 GM 身份（换设备登录 Owner 后恢复房主身份，
 * 对齐 Web loadPlayContext 无 user 参数时的 claim-gm 调用）。
 */
export async function claimGm(gameKey: string): Promise<string | null> {
  const result = await api<{ ok?: boolean; user_id?: string }>(gamePath(gameKey, '/claim-gm'), {
    method: 'POST',
    body: '{}',
  })
  return result.user_id ?? null
}

/** SSE 一次性票据（30s TTL）；票据请求本身走鉴权（Bearer 或分享参数） */
export async function requestSseTicket(gameKey: string): Promise<string> {
  const result = await api<{ ticket?: string }>(gamePath(gameKey, '/sse-ticket'), {
    method: 'POST',
  })
  if (!result.ticket) throw new Error('未能获取实时流票据')
  return result.ticket
}

// ---------- 世界观 / 规则（创建对局选择器） ----------

/** 世界模板列表（language 决定后端 locale overlay，桌面端同样默认传当前语言） */
export function fetchWorldTemplates(language = contentLanguage()): Promise<WorldTemplatesResponse> {
  return api<WorldTemplatesResponse>('/world-templates', { query: { language } })
}

/** 冒险包列表（世界图鉴徽章用它映射 recommended_world_id → 冒险包名；创建向导按规则+世界过滤） */
export function fetchAdventures(
  language = contentLanguage(),
  filter?: { ruleId?: string; worldId?: string },
): Promise<{ adventures?: AdventureSummary[] }> {
  return api<{ adventures?: AdventureSummary[] }>('/adventures', {
    query: { language, rule_id: filter?.ruleId || undefined, world_id: filter?.worldId || undefined },
  })
}

/** 规则列表（language 决定后端 locale overlay，与世界模板列表保持一致） */
export function fetchRules(language = contentLanguage()): Promise<RulesResponse> {
  return api<RulesResponse>('/rules', { query: { language } })
}

// ---------- 对局生命周期（创建/删除/导出/导入/批量） ----------

export async function createGame(payload: JsonObject): Promise<GameMutationResponse & { ok: true }> {
  const result = await api<GameMutationResponse>('/games/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!result.ok) throw new Error(result.error ?? '创建对局失败')
  // 多人自动生成密码 / 种子码要透给创建方展示，不能像旧版只留 game_key
  return { ...result, ok: true }
}

/** 种子码恢复对局（/games/create-from-seed，payload 与 Web CreateView 一致） */
export async function createGameFromSeed(payload: JsonObject): Promise<GameMutationResponse & { ok: true }> {
  const result = await api<GameMutationResponse>('/games/create-from-seed', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!result.ok) throw new Error(result.error ?? '创建对局失败')
  return { ...result, ok: true }
}

/** AI 生成世界（/generate-world），返回可直接用于 create payload 的 world_id */
export async function generateWorld(prompt: string, ruleId: string, language: string): Promise<GeneratedWorldResponse> {
  const result = await api<GeneratedWorldResponse>('/generate-world', {
    method: 'POST',
    body: JSON.stringify({ prompt, rule_id: ruleId, language }),
  })
  if (!result.ok && result.error) throw new Error(result.error)
  if (!result.world_id) throw new Error('生成世界未返回 world_id')
  return result
}

/** 按母版 AI 生成本局专属规则（/generate-rule） */
export async function generateRule(prompt: string, sourceRuleId: string, language: string): Promise<GeneratedRuleResponse> {
  const result = await api<GeneratedRuleResponse>('/generate-rule', {
    method: 'POST',
    body: JSON.stringify({ prompt, source_rule_id: sourceRuleId, language }),
  })
  if (!result.ok && result.error) throw new Error(result.error)
  if (!result.rule_id) throw new Error('生成规则未返回 rule_id')
  return result
}

export async function deleteGame(gameKey: string): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey), {
    method: 'DELETE',
  })
  if (!result.ok) throw new Error(result.error ?? '删除失败')
}

export async function batchDeleteGames(gameKeys: string[]): Promise<{ deleted: string[]; failed: { key: string; error: string }[] }> {
  const result = await api<{ ok?: boolean; deleted?: string[]; failed?: { key: string; error: string }[] }>(
    '/games/batch-delete',
    { method: 'POST', body: JSON.stringify({ game_keys: gameKeys }) },
  )
  return { deleted: result.deleted ?? [], failed: result.failed ?? [] }
}

/** 导出存档 zip（arrayBuffer 原生直读字节，避免 response.blob() 的 native blob store 往返） */
export async function exportGame(gameKey: string): Promise<Uint8Array> {
  const response = await apiBlob(gamePath(gameKey, '/export'))
  return new Uint8Array(await response.arrayBuffer())
}

/** 导入存档 zip（multipart/form-data） */
export async function importGame(fileUri: string, fileName: string): Promise<string> {
  const form = new FormData()
  // RN 的 FormData 接受 { uri, name, type } 作为 append 的 value（Blob 兼容）
  form.append('file', { uri: fileUri, name: fileName, type: 'application/zip' } as unknown as Blob)
  const result = await api<{ ok?: boolean; game_key?: string; error?: string }>('/games/import', {
    method: 'POST',
    body: form,
  })
  if (!result.ok) throw new Error(result.error ?? '导入失败')
  return result.game_key ?? ''
}

// ---------- 健康事件 ----------

export function fetchHealth(gameKey: string, includeResolved = false): Promise<HealthResponse> {
  return api<HealthResponse>(gamePath(gameKey, '/health'), {
    query: { include_resolved: includeResolved || undefined },
  })
}

export async function resolveHealthEvent(gameKey: string, eventId: string, action: 'resolve' | 'ignore'): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(
    gamePath(gameKey, `/health/${encodeURIComponent(eventId)}/${action}`),
    { method: 'POST', body: '{}' },
  )
  if (result.ok === false) throw new Error(result.error ?? '操作失败')
}

// ---------- 故事摘要 ----------

export async function generateStoryRecap(gameKey: string): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, '/story-recap'), {
    method: 'POST',
    body: '{}',
  })
  if (result.ok === false || result.error) throw new Error(result.error ?? '生成摘要失败')
}

// ---------- 机器人绑定 ----------

export async function fetchBotBindToken(gameKey: string): Promise<string> {
  const result = await api<BotBindTokenResponse>(gamePath(gameKey, '/bot-bind-token'), {
    method: 'POST',
    body: JSON.stringify({ rotate: true }),
  })
  if (!result.bind_token) throw new Error(result.error ?? '获取绑定令牌失败')
  return result.bind_token
}

// ---------- 模式 / 访问控制 ----------

export async function setSoloMode(gameKey: string, solo: boolean): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, '/mode'), {
    method: 'POST',
    body: JSON.stringify({ solo }),
  })
  if (result.ok === false || result.error) throw new Error(result.error ?? '切换模式失败')
}

export async function setPlayerAccess(gameKey: string, open: boolean): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, '/player-access'), {
    method: 'POST',
    body: JSON.stringify({ open }),
  })
  if (result.ok === false || result.error) throw new Error(result.error ?? '切换访问控制失败')
}

// ---------- 玩家管理 ----------

export async function setPlayerAway(gameKey: string, userId: string, away: boolean): Promise<string> {
  const result = await api<{ ok?: boolean; error?: string; character_name?: string }>(
    gamePath(gameKey, `/players/${encodeURIComponent(userId)}/away`),
    { method: 'POST', body: JSON.stringify({ away }) },
  )
  if (result.ok === false || result.error) throw new Error(result.error ?? '切换暂离状态失败')
  return result.character_name ?? userId
}

export async function kickPlayer(gameKey: string, userId: string): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, `/character/${encodeURIComponent(userId)}`), {
    method: 'DELETE',
  })
  if (result.ok === false) throw new Error(result.error ?? '移除玩家失败')
}

// ---------- 房间密码 ----------

export async function setGameRoomPassword(gameKey: string, password: string): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, '/room-password'), {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  if (result.ok === false || result.error) throw new Error(result.error ?? '设置房间密码失败')
}

// ---------- 世界观切换 ----------

export async function switchGameWorld(gameKey: string, worldId: string): Promise<string> {
  const result = await api<{ ok?: boolean; error?: string; world_name?: string }>(
    gamePath(gameKey, '/switch-world'),
    { method: 'POST', body: JSON.stringify({ world_id: worldId }) },
  )
  if (result.ok === false || result.error) throw new Error(result.error ?? '切换世界观失败')
  return result.world_name ?? worldId
}

/** 获取可切换的世界观候选列表（模板 + 已有 lorebook） */
export async function fetchWorldCandidates(gameKey: string, language = contentLanguage()): Promise<WorldCandidate[]> {
  const [templateData, worldData] = await Promise.all([
    fetchWorldTemplates(),
    api<{ worlds?: { id?: string; world_id?: string; name?: string; world_name?: string; description?: string; entry_count?: number }[] }>('/worlds'),
  ])
  const candidates: WorldCandidate[] = []
  const seen = new Set<string>()
  for (const template of templateData.templates ?? []) {
    const id = String(template.id || template.world_id || '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    candidates.push({
      id,
      name: template.name || template.world_name || id,
      description: template.description ?? '',
      source: '模板',
      default_rule: template.default_rule ?? '',
    })
  }
  for (const world of worldData.worlds ?? []) {
    const id = String(world.id || world.world_id || '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    candidates.push({
      id,
      name: world.name || world.world_name || id,
      description: world.description ?? '',
      source: '世界书',
      default_rule: '',
      entry_count: world.entry_count,
    })
  }
  return candidates
}

// ---------- 对局生命周期 ----------

export async function resetGame(gameKey: string): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, '/reset'), {
    method: 'POST',
    body: '{}',
  })
  if (result.ok === false || result.error) throw new Error(result.error ?? '重置进度失败')
}

export async function restartGame(gameKey: string): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, '/restart'), {
    method: 'POST',
    body: '{}',
  })
  if (result.ok === false || result.error) throw new Error(result.error ?? '重启对局失败')
}

// ---------- 私信 ----------

export async function sendPrivateMessage(gameKey: string, userId: string, text: string): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, '/private-message'), {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, text }),
  })
  if (result.ok === false || result.error) throw new Error(result.error ?? '发送私信失败')
}

// ---------- 角色卡 ----------

export function fetchCharacterCards(gameKey: string): Promise<CharacterCardsResponse> {
  return api<CharacterCardsResponse>(gamePath(gameKey, '/character-cards'))
}

export async function selectCharacterCard(gameKey: string, userId: string, card: CharacterCard): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, `/character/${encodeURIComponent(userId)}`), {
    method: 'PUT',
    body: JSON.stringify(card),
  })
  if (result.ok === false) throw new Error(result.error ?? '应用角色卡失败')
}

// ---------- 权威经济提案 ----------

export async function createPaymentProposal(
  gameKey: string,
  payload: PaymentProposalCreatePayload,
): Promise<PaymentProposalCreateResponse> {
  const result = await api<PaymentProposalCreateResponse>(gamePath(gameKey, '/payments'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (result.ok === false) throw new Error(result.error ?? '创建支付提案失败')
  return result
}

export async function resolvePayment(
  gameKey: string,
  paymentId: string,
  accepted: boolean,
): Promise<PaymentResolveResponse> {
  const result = await api<PaymentResolveResponse>(
    gamePath(gameKey, `/payments/${encodeURIComponent(paymentId)}`),
    {
      method: 'POST',
      body: JSON.stringify({ accepted }),
    },
  )
  if (result.ok === false) throw new Error(result.error ?? '支付决议失败')
  return result
}

// ---------- 升级属性点 ----------

export async function allocateCharacterPoints(
  gameKey: string,
  userId: string,
  attributes: Record<string, number>,
): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(
    gamePath(gameKey, `/character/${encodeURIComponent(userId)}`),
    { method: 'PUT', body: JSON.stringify({ attributes }) },
  )
  // 点数扣减与衍生资源由服务端计算，客户端只提交属性目标值。
  if (result.ok === false || result.error) throw new Error(result.error || getT()('saveFailed'))
}

// ---------- 角色肖像 ----------

export async function updateCharacterPortrait(gameKey: string, userId: string, portrait: CharacterSheet['portrait']): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, `/character/${encodeURIComponent(userId)}`), {
    method: 'PUT',
    body: JSON.stringify({ portrait }),
  })
  if (result.ok === false) throw new Error(result.error ?? '更新肖像失败')
}

/**
 * rules-aware 局的角色资料补丁（PATCH /character/{uid}/profile）：
 * 角色由规则集托管，PUT 整卡会被拒，portrait 这类非机械字段只能走 profile 端点
 * （对齐 Web savePortrait 的 hasRulesAwareCharacters 分支）。
 */
export async function updateRulesetCharacterProfile(gameKey: string, userId: string, portrait: CharacterSheet['portrait']): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(
    gamePath(gameKey, `/character/${encodeURIComponent(userId)}/profile`),
    {
      method: 'PATCH',
      body: JSON.stringify({ portrait }),
    },
  )
  if (result.ok === false) throw new Error(result.error ?? '更新肖像失败')
}

// ---------- 场景图 ----------

export async function updateSceneImage(gameKey: string, fileData?: string, fileName?: string): Promise<void> {
  const body: Record<string, unknown> = fileData && fileName
    ? { file_data: fileData, file_name: fileName }
    : { use_default: true }
  const result = await api<{ ok?: boolean; error?: string }>(gamePath(gameKey, '/scene-image'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (result.ok === false || result.error) throw new Error(result.error ?? '更新场景图失败')
}

/** 创建流程的全局场景图上传（对齐 Web POST /scene-images，body 为 base64 JSON） */
export async function uploadSceneImage(fileName: string, fileData: string): Promise<SceneImageRef> {
  const result = await api<{ ok?: boolean; error?: string; scene_image?: SceneImageRef }>('/scene-images', {
    method: 'POST',
    body: JSON.stringify({ file_data: fileData, file_name: fileName }),
  })
  if (!result.ok || !result.scene_image) throw new Error(result.error ?? '上传场景图失败')
  return result.scene_image
}

/** 创建流程的地图后台上传（对齐 Web POST /map-backgrounds） */
export async function uploadMapBackground(fileName: string, fileData: string): Promise<MapBackgroundSelection> {
  const result = await api<{ ok?: boolean; error?: string; map_background?: MapBackgroundSelection }>('/map-backgrounds', {
    method: 'POST',
    body: JSON.stringify({ file_data: fileData, file_name: fileName }),
  })
  if (!result.ok || !result.map_background) throw new Error(result.error ?? '上传地图背景失败')
  return result.map_background
}

// ---------- 生成图画廊 ----------

export function fetchGeneratedImages(gameKey: string, purpose = 'scene'): Promise<{ images?: GeneratedImageItem[] }> {
  return api<{ images?: GeneratedImageItem[] }>(gamePath(gameKey, '/generated-images'), {
    query: { purpose },
  })
}
