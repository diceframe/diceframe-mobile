/**
 * 检定模式（优势 / 劣势申请与 GM 授予）的契约解析，对齐上游 features/play/check-modes。
 *
 * GET  /games/{key}/check-modes                         —— GM 看全部席位，玩家只拿到自己的
 * POST /games/{key}/check-modes/seats/{uid}/{operation} —— 玩家只能 request 自己；GM 四种都可以
 *   body: { expected_revision, run_id, context_id, mode?, reason? }，返回同 GET 的整份状态
 *
 * CoC 的 kind 是 coc_bonus_penalty：同一套优势/劣势在界面上叫奖励骰/惩罚骰。
 * 申请本身不改骰制；GM 授予与规则自动来源合并后，优势和劣势互相抵消。
 */
export type CheckMode = 'advantage' | 'disadvantage'
export type CheckModeOperation = 'request' | 'grant' | 'reject' | 'clear'

export interface CheckModeEntry {
  mode: CheckMode
  reason: string
  status: string
  decision_reason?: string
}

export interface CheckModeSource {
  code: string
  mode: CheckMode
  reason?: string
}

export interface CheckModeSeat {
  uid: string
  name: string
  kind: string
  scope: string
  context_id: string
  blocked_reason: string
  request: CheckModeEntry | null
  grant: CheckModeEntry | null
  previews: { label: string; mode: CheckMode | ''; sources: CheckModeSource[] }[]
}

export interface CheckModeState {
  ok: true
  revision: number
  run_id: string
  is_gm: boolean
  seats: CheckModeSeat[]
}

export interface CheckModeRequestBody {
  expected_revision: number
  run_id: string
  context_id: string
  mode?: CheckMode
  reason?: string
}

const MODES = ['advantage', 'disadvantage']

function validEntry(entry: unknown): boolean {
  if (entry === null) return true
  const value = entry as Partial<CheckModeEntry> | undefined
  return !!value && MODES.includes(String(value.mode)) && typeof value.reason === 'string' && typeof value.status === 'string'
}

function validSeat(raw: unknown): boolean {
  const seat = raw as Partial<CheckModeSeat> | null
  return !!seat && typeof seat.uid === 'string' && typeof seat.name === 'string'
    && typeof seat.kind === 'string' && typeof seat.scope === 'string' && typeof seat.context_id === 'string'
    && typeof seat.blocked_reason === 'string' && Array.isArray(seat.previews)
    && validEntry(seat.request) && validEntry(seat.grant)
    && seat.previews.every((preview) => !!preview && typeof preview.label === 'string'
      && ['', ...MODES].includes(String(preview.mode)) && Array.isArray(preview.sources)
      && preview.sources.every((source) => !!source && typeof source.code === 'string' && MODES.includes(String(source.mode))))
}

/** 严格校验（同上游 parseModeResponse）；任何字段不合契约都返回 null，不展示半份状态。 */
export function parseCheckModeState(raw: unknown): CheckModeState | null {
  const value = raw as Partial<CheckModeState> | null
  if (!value || value.ok !== true || !Number.isInteger(value.revision) || typeof value.run_id !== 'string'
    || typeof value.is_gm !== 'boolean' || !Array.isArray(value.seats) || !value.seats.every(validSeat)) return null
  return value as CheckModeState
}

/** 面板里该列出的席位：去掉无 kind 与规则不支持的；玩家只看自己。 */
export function visibleCheckModeSeats(state: CheckModeState | null, actorId: string, isGm: boolean): CheckModeSeat[] {
  const seats = (state?.seats ?? []).filter((seat) => seat.kind && seat.blocked_reason !== 'unsupported')
  return (state?.is_gm ?? isGm) ? seats : seats.filter((seat) => seat.uid === actorId)
}

export function pendingCheckModeSeats(seats: CheckModeSeat[]): CheckModeSeat[] {
  return seats.filter((seat) => seat.request?.status === 'pending')
}

export function checkModeRequestBody(
  state: CheckModeState,
  seat: CheckModeSeat,
  draft: { mode?: CheckMode; reason?: string } = {},
): CheckModeRequestBody {
  return {
    expected_revision: state.revision,
    run_id: state.run_id,
    context_id: seat.context_id,
    ...(draft.mode ? { mode: draft.mode } : {}),
    ...(draft.reason ? { reason: draft.reason } : {}),
  }
}
