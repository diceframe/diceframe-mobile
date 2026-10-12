/**
 * 推送会话（M5）：预览 → 逐项决策 → 提交 → 写映射，按批进行。纯状态机，不含界面；
 * 网络与本机库都经 PushDeps 注入，测试用假服务端驱动。
 *
 * 契约要点（diceframe/diceframe docs/content-sync/CONTRACT.md）：
 * - plan_digest 覆盖整批每一项，提交时发回的必须是预览的同一批文档；提交里只要有一项是
 *   unsupported，服务端就整批拒绝（resolve_decision）。所以预览出 unsupported 的项先从批里
 *   拿掉、对剩下的重新预览，再交给用户决策。
 * - 有 existing 的项都要显式决策（覆盖 update / 保留两份 duplicate / 跳过 skip），没有默认的
 *   「覆盖」；unchanged 项自动答 update（服务端接受且不写任何东西）。保留两份 = 服务端新建
 *   一份并由本安装跟随，旧的那份脱离（detached），映射改指新的 canonical id。
 * - 409 PLAN_STALE 带新预览：只把计划变了的行标出来重新征询，没变的行沿用原决策；绝不自动提交。
 * - 部分失败（409 单项拒绝 / 500 IMPORT_FAILED）：成功的行照常写映射，失败行给出原因；身份冲突类
 *   的失败可以只对这些项重新预览。
 * - 413（服务端按解析后的草稿计条目）：响应带 client_ref 时只把那一项拿掉，其余重新预览。
 * - 429 按 retry_after 等待后重试（有上限）。
 * - 每写一条映射前都要确认连接仍是锁定的那台服务器（assertServer）；不是就立刻停下，
 *   之后一条映射都不写。
 * - 取消：在两次网络步骤之间生效。已经提交成功的那一批一定把映射写完（服务器上已经有了），
 *   其余项保持原样。
 */
import type {
  ContentCommitResponse,
  ContentCommitRow,
  ContentCommitStatus,
  ContentDecision,
  ContentExisting,
  ContentKind,
  ContentPlanAction,
  ContentPlanItem,
  ContentPreviewResponse,
  ContentPushItem,
  ContentWarning,
} from '@/api/types'
import { EMBEDDED_BOOK_SUFFIX } from '@/lib/local-library/ids'
import { localDigest } from '@/lib/portable/json'

import type { ExcludedPush, PreparedPush } from './push-prepare'

/** 429 后最多重试次数与单次最长等待（秒）；超出就把 429 交给界面 */
const RATE_LIMIT_RETRIES = 2
const MAX_RATE_LIMIT_WAIT_SECONDS = 60
/** 预览后剔除 unsupported 再预览的最多轮数 */
const MAX_REPREVIEW_ROUNDS = 3

/** 身份冲突：服务端在提交时发现同一身份被并发占用，重新预览即可 */
export const IDENTITY_CONFLICT_CODES = new Set(['CARD_IDENTITY_CONFLICT', 'LOREBOOK_IDENTITY_CONFLICT'])

/** 写一条映射所需的一切：提交结果 + 推送快照 */
export interface MappingWrite {
  /** 映射的 client_ref（本机 id 或 `<卡片 id>.book`） */
  clientRef: string
  /** 所属本机项 */
  localId: string
  canonicalId: string
  stateToken: string
  /** 推送快照的 revision（不是当前 revision） */
  revision: number
  /** 推送快照的本地摘要 */
  digest: string
}

export interface PushDeps {
  preview(items: ContentPushItem[]): Promise<ContentPreviewResponse>
  commit(items: ContentPushItem[], planDigest: string, decisions: Record<string, ContentDecision>): Promise<ContentCommitResponse>
  /** 连接仍是锁定的那台服务器，否则抛 SERVER_MISMATCH */
  assertServer(): void
  /** 写一条映射（一项一个事务） */
  record(write: MappingWrite): void
  sleep(ms: number): Promise<void>
  /** 按时间预算让出 JS 线程 */
  maybeYield(): Promise<void>
}

export interface PlanRow {
  clientRef: string
  /** 所属本机项（内嵌书行指向它的卡） */
  localId: string
  kind: ContentKind
  action: ContentPlanAction
  allowed: ContentDecision[]
  reason?: string
  existing: ContentExisting | null
  warnings: ContentWarning[]
  decision?: ContentDecision
  /** PLAN_STALE 后计划变了、需要重新确认的行 */
  changed: boolean
}

export interface BatchPlan {
  planDigest: string
  rows: PlanRow[]
}

export type ItemStatus =
  | 'pending'
  | 'excluded'
  | 'unsupported'
  | 'rejected'
  | 'cancelled'
  | ContentCommitStatus

export interface ItemOutcome {
  localId: string
  name: string
  kind: ContentKind
  status: ItemStatus
  code?: string
  entryId?: string
  canonicalId?: string
  warnings: ContentWarning[]
}

export type PushPhase = 'idle' | 'previewing' | 'review' | 'committing' | 'paused' | 'done' | 'stopped'

export interface PushState {
  phase: PushPhase
  batchIndex: number
  batchCount: number
  plan: BatchPlan | null
  outcomes: ItemOutcome[]
  /** 停止原因（错误码；用户取消为 CANCELLED） */
  stopCode?: string
  /** 刚经历 PLAN_STALE，界面提示「部分项目在服务器上变了」 */
  stale: boolean
  /** 上一次提交里身份冲突的项（paused 时可只对它们重新预览） */
  retryable: string[]
}

export const CANCELLED = 'CANCELLED'

function ownerOf(clientRef: string): string {
  return clientRef.endsWith(EMBEDDED_BOOK_SUFFIX) ? clientRef.slice(0, -EMBEDDED_BOOK_SUFFIX.length) : clientRef
}

/**
 * 是否需要用户决策：有 existing 的项都要答；unchanged 只有在允许 update 时才自动答 update
 * （服务端接受且不写）。服务端也可能对 unchanged 只给 duplicate / skip——例如跟随的卡在
 * 服务器上已变成规则托管（LOCKED_RULESET_CARD）——这时必须由用户选。
 */
function autoUpdates(row: Pick<PlanRow, 'existing' | 'action' | 'allowed'>): boolean {
  return !!row.existing && row.action === 'unchanged' && row.allowed.includes('update')
}

function needsDecision(row: Pick<PlanRow, 'existing' | 'action' | 'allowed'>): boolean {
  return !!row.existing && row.action !== 'unsupported' && !autoUpdates(row)
}

function planSignature(item: ContentPlanItem): string {
  return JSON.stringify([
    item.action, item.allowed, item.reason ?? '',
    item.existing?.canonical_id ?? '', item.existing?.state_token ?? '', item.existing?.server_modified ?? null,
  ])
}

const SUCCESS: ReadonlySet<ContentCommitStatus> = new Set(['created', 'updated', 'duplicated', 'unchanged'])

export class PushSession {
  private state: PushState
  private readonly listeners = new Set<(state: PushState) => void>()
  private readonly batches: PreparedPush[][]
  private current: PreparedPush[] = []
  private cancelRequested = false
  private readonly byLocalId = new Map<string, PreparedPush>()
  /** 上一次预览每行的计划签名（PLAN_STALE 时判断哪些行变了） */
  private lastSignatures = new Map<string, string>()

  constructor(private readonly deps: PushDeps, batches: PreparedPush[][], excluded: ExcludedPush[]) {
    this.batches = batches.map((batch) => [...batch])
    const outcomes: ItemOutcome[] = []
    for (const batch of batches) {
      for (const entry of batch) {
        this.byLocalId.set(entry.candidate.localId, entry)
        outcomes.push({
          localId: entry.candidate.localId, name: entry.candidate.name, kind: entry.candidate.kind,
          status: 'pending', warnings: [...entry.warnings],
        })
      }
    }
    for (const entry of excluded) {
      outcomes.push({
        localId: entry.candidate.localId, name: entry.candidate.name, kind: entry.candidate.kind,
        status: 'excluded', code: entry.code, entryId: entry.entryId, warnings: [],
      })
    }
    this.state = { phase: 'idle', batchIndex: 0, batchCount: this.batches.length, plan: null, outcomes, stale: false, retryable: [] }
  }

  getState(): PushState {
    return this.state
  }

  subscribe(listener: (state: PushState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 开始：预览第一批 */
  async start(): Promise<void> {
    if (this.state.phase !== 'idle') return
    await this.previewBatch(0)
  }

  setDecision(clientRef: string, decision: ContentDecision): void {
    const plan = this.state.plan
    if (this.state.phase !== 'review' || !plan) return
    const rows = plan.rows.map((row) =>
      row.clientRef === clientRef && row.allowed.includes(decision) ? { ...row, decision, changed: false } : row)
    this.update({ plan: { ...plan, rows } })
  }

  /** 还没给出决策的行 */
  undecided(): PlanRow[] {
    return (this.state.plan?.rows ?? []).filter((row) => needsDecision(row) && !row.decision)
  }

  /** 请求取消：评审中立即停止；网络步骤进行中则在下一步之前停止 */
  cancel(): void {
    this.cancelRequested = true
    if (this.state.phase === 'review' || this.state.phase === 'paused' || this.state.phase === 'idle') this.stop(CANCELLED)
  }

  /** 提交当前批（用户确认后调用；绝不自动调用） */
  async commit(): Promise<void> {
    const plan = this.state.plan
    if (this.state.phase !== 'review' || !plan) return
    if (this.undecided().length) return
    if (this.stopIfCancelled()) return
    try {
      this.deps.assertServer()
    } catch (error) {
      this.stop(codeOf(error))
      return
    }
    const decisions: Record<string, ContentDecision> = {}
    for (const row of plan.rows) if (row.decision) decisions[row.clientRef] = row.decision
    this.update({ phase: 'committing', stale: false })
    let response: ContentCommitResponse
    try {
      response = await this.withRateLimit(() => this.deps.commit(this.items(), plan.planDigest, decisions))
    } catch (error) {
      await this.handleCommitError(error)
      return
    }
    if (!(await this.recordRows(response.items ?? []))) return
    await this.advance()
  }

  /** paused 时：只对身份冲突的项重新预览（作为当前批） */
  async retryFailed(): Promise<void> {
    if (this.state.phase !== 'paused') return
    const refs = new Set(this.state.retryable)
    this.current = [...refs].map((ref) => this.byLocalId.get(ref)).filter((entry): entry is PreparedPush => !!entry)
    for (const ref of refs) this.setOutcome(ref, { status: 'pending', code: undefined })
    this.update({ retryable: [] })
    await this.previewCurrent()
  }

  /** paused 时：放弃失败项，继续下一批 */
  async continueWithNext(): Promise<void> {
    if (this.state.phase !== 'paused') return
    this.update({ retryable: [] })
    await this.advance()
  }

  // ---------- internals ----------

  private items(): ContentPushItem[] {
    return this.current.map((entry) => entry.item)
  }

  private async advance(): Promise<void> {
    const next = this.state.batchIndex + 1
    if (next >= this.batches.length) {
      this.update({ phase: 'done', plan: null })
      return
    }
    await this.previewBatch(next)
  }

  private async previewBatch(index: number): Promise<void> {
    this.current = [...this.batches[index]]
    this.update({ batchIndex: index })
    await this.previewCurrent()
  }

  /** 预览当前批；剔除 unsupported 的项后对剩下的重新预览 */
  private async previewCurrent(): Promise<void> {
    for (let round = 0; round < MAX_REPREVIEW_ROUNDS; round += 1) {
      if (this.stopIfCancelled()) return
      if (!this.current.length) {
        await this.advance()
        return
      }
      this.update({ phase: 'previewing', plan: null })
      let preview: ContentPreviewResponse
      try {
        preview = await this.withRateLimit(() => this.deps.preview(this.items()))
      } catch (error) {
        if (this.rejectSingleItem(error)) continue
        this.stop(codeOf(error))
        return
      }
      if (this.stopIfCancelled()) return
      if (this.dropUnsupported(preview.items ?? [])) continue
      this.update({ phase: 'review', plan: this.toPlan(preview, null) })
      return
    }
    this.stop('REQUEST_INVALID')
  }

  /** 把 unsupported 的项（含内嵌书 unsupported 的卡）从当前批拿掉；返回是否拿掉了 */
  private dropUnsupported(items: ContentPlanItem[]): boolean {
    const dropped = new Map<string, string>()
    for (const item of items) {
      if (item.action === 'unsupported') dropped.set(ownerOf(item.client_ref), item.reason || 'KIND_NOT_SUPPORTED')
    }
    if (!dropped.size) return false
    this.current = this.current.filter((entry) => !dropped.has(entry.candidate.localId))
    for (const [localId, code] of dropped) this.setOutcome(localId, { status: 'unsupported', code })
    return true
  }

  /** 413 / 单项请求错误带 client_ref 时只拿掉那一项；返回是否处理了 */
  private rejectSingleItem(error: unknown): boolean {
    const status = (error as { status?: number } | null)?.status
    const body = (error as { body?: Record<string, unknown> } | null)?.body
    const clientRef = typeof body?.client_ref === 'string' ? ownerOf(body.client_ref) : ''
    if (!clientRef || (status !== 413 && status !== 400)) return false
    // 决策类错误不是「这一项推不了」，交给重新评审
    if (codeOf(error).startsWith('DECISION_')) return false
    if (!this.current.some((entry) => entry.candidate.localId === clientRef)) return false
    this.current = this.current.filter((entry) => entry.candidate.localId !== clientRef)
    this.setOutcome(clientRef, { status: 'rejected', code: codeOf(error) })
    return true
  }

  private toPlan(preview: ContentPreviewResponse, previous: BatchPlan | null): BatchPlan {
    const before = new Map((previous?.rows ?? []).map((row) => [row.clientRef, row]))
    const signatures = previous ? this.lastSignatures : new Map<string, string>()
    const rows: PlanRow[] = (preview.items ?? []).map((item) => {
      const old = before.get(item.client_ref)
      const sameAsBefore = !!old && signatures.get(item.client_ref) === planSignature(item)
      const base: PlanRow = {
        clientRef: item.client_ref,
        localId: ownerOf(item.client_ref),
        kind: item.kind,
        action: item.action,
        allowed: item.allowed ?? [],
        reason: item.reason || undefined,
        existing: item.existing ?? null,
        warnings: item.warnings ?? [],
        changed: !!previous && !sameAsBefore
          && needsDecision({ existing: item.existing ?? null, action: item.action, allowed: item.allowed ?? [] }),
      }
      if (autoUpdates(base)) base.decision = 'update'
      else if (sameAsBefore && old?.decision) base.decision = old.decision
      return base
    })
    this.lastSignatures = new Map((preview.items ?? []).map((item) => [item.client_ref, planSignature(item)]))
    for (const row of rows) {
      if (row.warnings.length && row.clientRef === row.localId) {
        const outcome = this.outcome(row.localId)
        const codes = new Set(outcome?.warnings.map((warning) => warning.code))
        this.setOutcome(row.localId, { warnings: [...(outcome?.warnings ?? []), ...row.warnings.filter((w) => !codes.has(w.code))] })
      }
    }
    return { planDigest: preview.plan_digest, rows }
  }


  private async handleCommitError(error: unknown): Promise<void> {
    const code = codeOf(error)
    const stalePreview = (error as { preview?: ContentPreviewResponse } | null)?.preview
    if (code === 'PLAN_STALE' && stalePreview) {
      // 新预览里冒出 unsupported 的项：拿掉后重新预览（没有新计划可沿用）
      if (this.dropUnsupported(stalePreview.items ?? [])) {
        await this.previewCurrent()
        this.update({ stale: true })
        return
      }
      this.update({ phase: 'review', plan: this.toPlan(stalePreview, this.state.plan), stale: true })
      return
    }
    // 决策被服务端拒绝（DECISION_REQUIRED / DECISION_NOT_ALLOWED）：允许的答案在预览后变了，
    // 重新预览、回到评审让用户重选；绝不把那一项悄悄丢掉
    if (code.startsWith('DECISION_')) {
      await this.previewCurrent()
      this.update({ stale: true })
      return
    }
    const rows = (error as { rows?: ContentCommitRow[] } | null)?.rows
    if (Array.isArray(rows)) {
      if (!(await this.recordRows(rows))) return
      // 身份冲突可重新预览；意外失败（IMPORT_FAILED）后服务端停在那里，之后的项 not_attempted：
      // 暂停交给用户决定重试还是继续，不自动去预览下一批
      const retryable = rows
        .filter((row) => (row.status === 'error'
          && (IDENTITY_CONFLICT_CODES.has(row.error_code ?? '') || row.error_code === 'IMPORT_FAILED'))
          || row.status === 'not_attempted')
        .map((row) => ownerOf(row.client_ref))
      if (retryable.length) {
        this.update({ phase: 'paused', plan: null, retryable: [...new Set(retryable)] })
        return
      }
      await this.advance()
      return
    }
    if (this.rejectSingleItem(error)) {
      await this.previewCurrent()
      return
    }
    this.stop(code)
  }

  /**
   * 按提交结果写映射：成功的行逐条写（每条前确认服务器、写后按预算让出线程），并更新各项结果。
   * 服务器身份变了就立刻停下，不再写任何映射；返回是否继续。
   */
  private async recordRows(rows: ContentCommitRow[]): Promise<boolean> {
    for (const row of rows) {
      const localId = ownerOf(row.client_ref)
      const entry = this.byLocalId.get(localId)
      if (row.client_ref === localId) {
        this.setOutcome(localId, {
          status: row.status,
          code: row.error_code || undefined,
          canonicalId: row.canonical_id,
        })
      }
      if (!entry || !SUCCESS.has(row.status) || !row.canonical_id) continue
      try {
        this.deps.assertServer()
      } catch (error) {
        this.stop(codeOf(error))
        return false
      }
      this.deps.record({
        clientRef: row.client_ref,
        localId,
        canonicalId: row.canonical_id,
        stateToken: row.state_token ?? '',
        revision: entry.candidate.revision,
        digest: localDigest(entry.candidate.document),
      })
      await this.deps.maybeYield()
    }
    return true
  }

  private async withRateLimit<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await request()
      } catch (error) {
        const status = (error as { status?: number } | null)?.status
        const wait = Number((error as { retryAfter?: number } | null)?.retryAfter || 0)
        if (status !== 429 || !wait || wait > MAX_RATE_LIMIT_WAIT_SECONDS || attempt >= RATE_LIMIT_RETRIES) throw error
        await this.deps.sleep(wait * 1000)
        if (this.cancelRequested) throw Object.assign(new Error('cancelled'), { code: CANCELLED })
      }
    }
  }

  private stopIfCancelled(): boolean {
    if (!this.cancelRequested) return false
    this.stop(CANCELLED)
    return true
  }

  private stop(code: string): void {
    const outcomes = this.state.outcomes.map((outcome) =>
      outcome.status === 'pending' ? { ...outcome, status: code === CANCELLED ? 'cancelled' as const : 'not_attempted' as const } : outcome)
    this.update({ phase: 'stopped', stopCode: code, plan: null, outcomes })
  }

  private outcome(localId: string): ItemOutcome | undefined {
    return this.state.outcomes.find((outcome) => outcome.localId === localId)
  }

  private setOutcome(localId: string, patch: Partial<ItemOutcome>): void {
    this.state = {
      ...this.state,
      outcomes: this.state.outcomes.map((outcome) => (outcome.localId === localId ? { ...outcome, ...patch } : outcome)),
    }
  }

  private update(patch: Partial<PushState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }
}

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && code ? code : 'IMPORT_FAILED'
}
