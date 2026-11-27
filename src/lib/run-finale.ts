import type { GameDetail, RunFinaleResponse } from '@/api/types'

/** 只有服务端明确投影为当前席位、且确实存在已结算档案时，才显示玩家入口。 */
export function playerFinaleOf(detail: GameDetail | null, userId: string, isGm: boolean) {
  const lifecycle = detail?.run_lifecycle
  if (isGm || !userId || detail?.viewer?.kind !== 'seat' || detail.viewer.uid !== userId
      || lifecycle?.status !== 'ended' || !lifecycle.id || !detail.run_id) return null
  return { runId: detail.run_id, finaleId: lifecycle.id, revision: lifecycle.revision }
}

export type PlayerFinaleIdentity = NonNullable<ReturnType<typeof playerFinaleOf>>

export interface PlayerFinale {
  epilogue: string
  recap: string
  hasCharacter: boolean
}

/** 只保留公开正文与本人角色是否可下载；不持有 GM 草稿、回执或角色快照。 */
export function playerFinaleProjection(response: RunFinaleResponse | null, identity: PlayerFinaleIdentity): PlayerFinale | null {
  const finale = response?.finale
  if (response?.ok !== true || response.run_id !== identity.runId || finale?.id !== identity.finaleId
      || finale.status !== 'ended' || typeof finale.epilogue !== 'string' || typeof finale.recap !== 'string') return null
  return {
    epilogue: finale.epilogue,
    recap: finale.recap,
    hasCharacter: !!finale.character && typeof finale.character === 'object' && !Array.isArray(finale.character),
  }
}

export type RunFinaleExportKind = 'recap' | 'character'

export const RUN_FINALE_FILENAMES: Record<RunFinaleExportKind, string> = {
  recap: 'diceframe-run-recap.json',
  character: 'diceframe-character.json',
}
