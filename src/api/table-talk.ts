import { api, ApiError, type ShareIdentity } from './client'
import type { KpQuestionResponse, Player, TableTalkExchange, TableTalkResponse } from './types'

export type KpQuestionVisibility = KpQuestionResponse['visibility']

/** 与 Web 输入上限保持一致；提问独立于行动端点。 */
export const MAX_KP_QUESTION_LENGTH = 1000

export function canAskKpQuestion(
  gameKey: string,
  userId: string,
  players: Pick<Player, 'user_id'>[],
  share: ShareIdentity | null,
  ownerAuthenticated: boolean,
): boolean {
  if (!gameKey || !userId || !players.some((player) => player.user_id === userId)) return false
  if (!share) return true
  if (share.game !== gameKey || share.user !== userId) return false
  // Owner 携分享身份属于预览；客户端无法证明原会话等于此角色时，要求明确代操作。
  return !ownerAuthenticated || ['1', 'true', 'yes'].includes(share.delegate ?? '')
}

/** 缺端点可降级；游戏不存在、权限错误、限流、模型/网络错误都不是缺功能。 */
export function isTableTalkUnsupported(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status === 405 || error.status === 501) return true
  return error.status === 404 && (!error.code || ['NOT_FOUND', 'ENDPOINT_NOT_FOUND'].includes(error.code.toUpperCase()))
}

function isExchange(value: unknown): value is TableTalkExchange {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<TableTalkExchange>
  return item.visibility === 'party'
    && typeof item.id === 'string' && !!item.id
    && typeof item.actor_uid === 'string'
    && typeof item.actor_name === 'string'
    && typeof item.question === 'string'
    && typeof item.answer === 'string'
    && typeof item.round === 'number' && Number.isFinite(item.round)
    && typeof item.created_at === 'string'
}

/** 只接受明确标为 party 的记录，不把意外私密投影渲染到全队面板。 */
export function parseTableTalkResponse(value: unknown): TableTalkResponse {
  const response = value as Partial<TableTalkResponse> | null
  if (!response || response.ok !== true || !Array.isArray(response.exchanges)) {
    throw new ApiError('Invalid table-talk response', 502, 'INVALID_RESPONSE')
  }
  return { ok: true, exchanges: response.exchanges.filter(isExchange) }
}

export async function fetchTableTalk(gameKey: string): Promise<TableTalkResponse> {
  return parseTableTalkResponse(await api(`/games/${encodeURIComponent(gameKey)}/table-talk`))
}

export async function askKpQuestion(
  gameKey: string,
  question: string,
  visibility: KpQuestionVisibility = 'private',
): Promise<KpQuestionResponse> {
  const text = question.trim()
  if (!text || text.length > MAX_KP_QUESTION_LENGTH) {
    throw new ApiError('Invalid question', 400, text ? 'QUESTION_TOO_LONG' : 'EMPTY_QUESTION')
  }
  const response = await api<KpQuestionResponse>(`/games/${encodeURIComponent(gameKey)}/kp-question`, {
    method: 'POST',
    body: JSON.stringify({ question: text, visibility }),
  })
  if (response.ok !== true || response.kind !== 'kp_table_talk'
    || typeof response.answer !== 'string' || !response.answer.trim()
    || response.visibility !== visibility || response.advanced !== false || response.action_consumed !== false) {
    throw new ApiError('Invalid KP question response', 502, 'INVALID_RESPONSE')
  }
  return response
}
