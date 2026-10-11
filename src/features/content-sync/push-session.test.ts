import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import { CommitPartialError, ContentSyncError, PlanStaleError, SERVER_MISMATCH } from '@/api/content'
import type {
  ContentCommitResponse,
  ContentCommitRow,
  ContentDecision,
  ContentPlanItem,
  ContentPreviewResponse,
  ContentPushItem,
} from '@/api/types'
import { fixtures } from '@/lib/portable/__fixtures__/content-sync'
import { readCardV3, writeCardV3, type CardBody } from '@/lib/portable/card-v3'
import { canonicalJson } from '@/lib/portable/json'

import { RULESET_CARD_UNSUPPORTED, batchPush, preparePush, type PushCandidate } from './push-prepare'
import { CANCELLED, PushSession, type MappingWrite, type PushDeps } from './push-session'
import { localSyncState, pushAccess, pushCandidateOf, pushListStates, statusRefsFor } from './sync-state'

const SOURCE = { kind: 'device' as const, id: 'install-1' }

function card(localId: string, document: unknown = fixtures.cardFreeform, revision = 1): PushCandidate {
  return { localId, kind: 'character_template', name: localId, revision, readOnly: false, document }
}

function book(localId: string, revision = 1): PushCandidate {
  return { localId, kind: 'lorebook', name: localId, revision, readOnly: false, document: fixtures.lorebook }
}

/**
 * 假服务端：按契约实现预览 / 提交（plan_digest 覆盖每项的草稿与服务端状态；有 existing 的项
 * 必须决策；duplicate 新建并让旧的脱离；提交里有 unsupported 整批拒绝）。
 */
class FakeServer {
  copies = new Map<string, { canonical: string; token: string; digest: string }>()
  unsupported = new Set<string>()
  conflictOnCommit = new Set<string>()
  /** 服务器上已变成规则托管的卡：unchanged 也只允许 duplicate / skip（LOCKED_RULESET_CARD） */
  locked = new Set<string>()
  /** 提交时意外失败的项（500 IMPORT_FAILED，之后的项 not_attempted） */
  failOnCommit = new Set<string>()
  previews = 0
  commits = 0
  private counter = 0

  private rowsFor(item: ContentPushItem): { ref: string; kind: ContentPushItem['kind']; digest: string }[] {
    const rows = [{ ref: item.client_ref, kind: item.kind, digest: canonicalJson(item.document) }]
    if (item.kind === 'character_template') {
      const book = readCardV3(item.document).characterBook
      if (book) rows.push({ ref: `${item.client_ref}.book`, kind: 'lorebook', digest: canonicalJson(book) })
    }
    return rows
  }

  plan(items: ContentPushItem[]): ContentPreviewResponse {
    const planItems: ContentPlanItem[] = items.flatMap((item) => this.rowsFor(item).map(({ ref, kind, digest }) => {
      if (this.unsupported.has(ref)) {
        return { client_ref: ref, kind, action: 'unsupported' as const, allowed: [], reason: 'RULESET_CARD_UNSUPPORTED', existing: null }
      }
      const copy = this.copies.get(ref)
      if (!copy) return { client_ref: ref, kind, action: 'create' as const, allowed: [], existing: null }
      const existing = { canonical_id: copy.canonical, state_token: copy.token, server_modified: false }
      return copy.digest === digest
        ? { client_ref: ref, kind, action: 'unchanged' as const, allowed: (this.locked.has(ref) ? ['duplicate', 'skip'] : ['update', 'duplicate', 'skip']) as ContentDecision[], existing, ...(this.locked.has(ref) ? { reason: 'RULESET_CARD' } : {}) }
        : { client_ref: ref, kind, action: 'update' as const, allowed: ['update', 'duplicate', 'skip'] as ContentDecision[], existing }
    }))
    return { ok: true, plan_digest: `sha256:${canonicalJson(planItems).length}:${canonicalJson(planItems)}`, items: planItems }
  }

  async preview(items: ContentPushItem[]): Promise<ContentPreviewResponse> {
    this.previews += 1
    return this.plan(items)
  }

  async commit(items: ContentPushItem[], digest: string, decisions: Record<string, ContentDecision>): Promise<ContentCommitResponse> {
    this.commits += 1
    const fresh = this.plan(items)
    if (fresh.plan_digest !== digest) throw new PlanStaleError(fresh)
    for (const row of fresh.items) {
      if (row.action === 'unsupported') throw new ApiError('unsupported', 400, row.reason)
      if (row.existing && !decisions[row.client_ref]) throw new ApiError('decision', 400, 'DECISION_REQUIRED')
      if (row.existing && !row.allowed.includes(decisions[row.client_ref])) {
        const error = new ApiError('decision not allowed', 400, 'DECISION_NOT_ALLOWED')
        error.body = { ok: false, error_code: 'DECISION_NOT_ALLOWED', client_ref: row.client_ref }
        throw error
      }
    }
    const results: ContentCommitRow[] = []
    let failed = false
    let aborted = false
    for (const item of items) {
      for (const { ref, kind, digest: draft } of this.rowsFor(item)) {
        if (aborted) {
          results.push({ client_ref: ref, kind, status: 'not_attempted' })
          continue
        }
        if (this.failOnCommit.has(ref)) {
          failed = true
          aborted = true
          results.push({ client_ref: ref, kind, status: 'error', error_code: 'IMPORT_FAILED' })
          continue
        }
        if (this.conflictOnCommit.has(ref)) {
          failed = true
          results.push({ client_ref: ref, kind, status: 'error', error_code: 'CARD_IDENTITY_CONFLICT' })
          continue
        }
        const decision = decisions[ref]
        const copy = this.copies.get(ref)
        if (!copy) {
          const created = { canonical: `srv_${++this.counter}`, token: `t${this.counter}`, digest: draft }
          this.copies.set(ref, created)
          results.push({ client_ref: ref, kind, status: 'created', canonical_id: created.canonical, state_token: created.token })
        } else if (decision === 'skip') {
          results.push({ client_ref: ref, kind, status: 'skipped', canonical_id: copy.canonical })
        } else if (decision === 'duplicate') {
          const created = { canonical: `srv_${++this.counter}`, token: `t${this.counter}`, digest: draft }
          this.copies.set(ref, created)
          results.push({ client_ref: ref, kind, status: 'duplicated', canonical_id: created.canonical, detached_id: copy.canonical, state_token: created.token })
        } else if (copy.digest === draft) {
          results.push({ client_ref: ref, kind, status: 'unchanged', canonical_id: copy.canonical, state_token: copy.token })
        } else {
          copy.digest = draft
          copy.token = `t${++this.counter}`
          results.push({ client_ref: ref, kind, status: 'updated', canonical_id: copy.canonical, state_token: copy.token })
        }
      }
    }
    if (aborted) throw new CommitPartialError('IMPORT_FAILED', 500, results)
    if (failed) throw new CommitPartialError('CARD_IDENTITY_CONFLICT', 409, results)
    return { ok: true, items: results }
  }

  /** 模拟别人在服务器上改了这一份 */
  editOnServer(ref: string): void {
    const copy = this.copies.get(ref)!
    copy.digest = `${copy.digest}-edited`
    copy.token = `t${++this.counter}`
  }
}

function harness(server = new FakeServer()) {
  const writes: MappingWrite[] = []
  let serverOk = true
  const deps: PushDeps = {
    preview: vi.fn((items) => server.preview(items)),
    commit: vi.fn((items, digest, decisions) => server.commit(items, digest, decisions)),
    assertServer: () => {
      if (!serverOk) throw new ContentSyncError(SERVER_MISMATCH, 'moved')
    },
    record: (write) => { writes.push(write) },
    sleep: vi.fn(async () => undefined),
    maybeYield: async () => undefined,
  }
  const session = (candidates: PushCandidate[]) => {
    const { prepared, excluded } = preparePush(candidates)
    return new PushSession(deps, batchPush(prepared, SOURCE), excluded)
  }
  return { server, deps, writes, session, breakServer: () => { serverOk = false } }
}

const outcomeOf = (s: PushSession, id: string) => s.getState().outcomes.find((o) => o.localId === id)

describe('推送准备：本地排除与分批（用服务端金样本）', () => {
  it('规则托管卡在本地就标为不支持；只读项、坏文档排除；不可移植头像给警告', () => {
    const uploaded = writeCardV3({ ...(fixtures.cardFreeform.data.extensions.diceframe as unknown as CardBody), portrait: { kind: 'upload', asset_id: 'a' } })
    const { prepared, excluded } = preparePush([
      card('card-dnd', fixtures.cardDnd2024),
      { ...card('card-ro'), readOnly: true },
      card('card-bad', { spec: 'nope' }),
      card('card-up', uploaded),
      card('card-ok', fixtures.cardWithBook),
      book('book-1'),
    ])
    expect(excluded.map((e) => [e.candidate.localId, e.code])).toEqual([
      ['card-dnd', RULESET_CARD_UNSUPPORTED], ['card-ro', 'LOCAL_ITEM_READ_ONLY'], ['card-bad', 'CARD_V3_INVALID'],
    ])
    expect(prepared.map((p) => p.candidate.localId)).toEqual(['card-up', 'card-ok', 'book-1'])
    expect(prepared[0].warnings.map((w) => w.code)).toEqual(['PORTRAIT_NOT_PORTABLE'])
    expect(readCardV3(prepared[0].item.document).body.portrait).toEqual({})
  })

  it('超限的书（条目数 / 单条大小）按项给出原因，不进请求', () => {
    const bigEntry = { id: 'big', content: 'x'.repeat(40 * 1024), keys: [] }
    const bigBook = { spec: 'lorebook_v3', data: { lorebook: { name: 'b', entries: [bigEntry] } } }
    const manyBook = { spec: 'lorebook_v3', data: { lorebook: { name: 'b', entries: Array.from({ length: 2001 }, (_, i) => ({ id: `e${i}`, content: '', keys: [] })) } } }
    const { excluded } = preparePush([{ ...book('book-big'), document: bigBook }, { ...book('book-many'), document: manyBook }])
    expect(excluded.map((e) => [e.code, e.entryId])).toEqual([['ENTRY_TOO_LARGE', 'big'], ['TOO_MANY_ENTRIES', undefined]])
  })

  it('每批不超过 50 项、请求体不超过 8MB', () => {
    const { prepared } = preparePush(Array.from({ length: 120 }, (_, i) => card(`card-${i}`)))
    expect(batchPush(prepared, SOURCE).map((batch) => batch.length)).toEqual([50, 50, 20])
    const heavy = Array.from({ length: 6 }, (_, i) => ({ ...prepared[i], bytes: 2 * 1024 * 1024 }))
    expect(batchPush(heavy, SOURCE).map((batch) => batch.length)).toEqual([3, 3])
  })
})

describe('推送会话：预览 → 决策 → 提交 → 映射', () => {
  it('首次推送：无需决策，提交后按快照 revision 写映射（含内嵌书 .book）', async () => {
    const h = harness()
    const s = h.session([card('card-a', fixtures.cardWithBook, 3), book('book-1', 5)])
    await s.start()
    expect(s.getState().phase).toBe('review')
    expect(s.undecided()).toEqual([])
    await s.commit()
    expect(s.getState().phase).toBe('done')
    expect(h.writes.map((w) => [w.clientRef, w.localId, w.revision])).toEqual([
      ['card-a', 'card-a', 3], ['card-a.book', 'card-a', 3], ['book-1', 'book-1', 5],
    ])
    expect(outcomeOf(s, 'card-a')).toMatchObject({ status: 'created' })
  })

  it('服务器已有副本：必须逐项决策才能提交；保留两份 → 映射改指新的 canonical id', async () => {
    const h = harness()
    const first = h.session([card('card-a')])
    await first.start()
    await first.commit()
    const firstCanonical = h.writes[0].canonicalId

    const edited = writeCardV3({ ...(fixtures.cardFreeform.data.extensions.diceframe as unknown as CardBody), race: 'Half-elf' })
    const s = h.session([card('card-a', edited, 2)])
    await s.start()
    expect(s.undecided().map((row) => row.clientRef)).toEqual(['card-a'])
    await s.commit()
    expect(h.server.commits).toBe(1)
    s.setDecision('card-a', 'duplicate')
    await s.commit()
    expect(outcomeOf(s, 'card-a')).toMatchObject({ status: 'duplicated' })
    expect(h.writes.at(-1)).toMatchObject({ clientRef: 'card-a', revision: 2 })
    expect(h.writes.at(-1)!.canonicalId).not.toBe(firstCanonical)
  })

  it('unchanged 项自动答 update（服务端不写），映射照常记下', async () => {
    const h = harness()
    const a = h.session([card('card-a')])
    await a.start()
    await a.commit()
    const s = h.session([card('card-a')])
    await s.start()
    expect(s.undecided()).toEqual([])
    await s.commit()
    expect(outcomeOf(s, 'card-a')).toMatchObject({ status: 'unchanged' })
  })

  it('PLAN_STALE：只把变了的行标出来重新征询，没变的沿用决策；绝不自动提交', async () => {
    const h = harness()
    const seed = h.session([card('card-a'), card('card-b')])
    await seed.start()
    await seed.commit()
    const edited = writeCardV3({ ...(fixtures.cardFreeform.data.extensions.diceframe as unknown as CardBody), race: 'X' })
    const s = h.session([card('card-a', edited, 2), card('card-b', edited, 2)])
    await s.start()
    s.setDecision('card-a', 'update')
    s.setDecision('card-b', 'update')
    h.server.editOnServer('card-b')
    await s.commit()
    const state = s.getState()
    expect(state.phase).toBe('review')
    expect(state.stale).toBe(true)
    expect(h.server.commits).toBe(2)
    expect(state.plan!.rows.find((r) => r.clientRef === 'card-a')).toMatchObject({ decision: 'update', changed: false })
    const rowB = state.plan!.rows.find((r) => r.clientRef === 'card-b')!
    expect(rowB.changed).toBe(true)
    expect(rowB.decision).toBeUndefined()
    expect(s.undecided().map((r) => r.clientRef)).toEqual(['card-b'])
    s.setDecision('card-b', 'skip')
    await s.commit()
    expect(s.getState().phase).toBe('done')
    expect(outcomeOf(s, 'card-b')).toMatchObject({ status: 'skipped' })
  })

  it('预览里服务端判为 unsupported 的项：拿掉后对其余重新预览，提交里绝不带它', async () => {
    const h = harness()
    h.server.unsupported.add('card-x')
    const s = h.session([card('card-x'), card('card-y')])
    await s.start()
    expect(h.server.previews).toBe(2)
    expect(s.getState().plan!.rows.map((r) => r.clientRef)).toEqual(['card-y'])
    await s.commit()
    expect(outcomeOf(s, 'card-x')).toMatchObject({ status: 'unsupported', code: 'RULESET_CARD_UNSUPPORTED' })
    expect(outcomeOf(s, 'card-y')).toMatchObject({ status: 'created' })
  })
})

describe('推送会话：取消、服务器变化、限额与限流', () => {
  it('批与批之间取消：已提交的一批映射写完，其余项不动', async () => {
    const h = harness()
    const candidates = Array.from({ length: 55 }, (_, i) => card(`card-${i}`))
    const s = h.session(candidates)
    await s.start()
    const commit = s.commit()
    s.cancel()
    await commit
    const state = s.getState()
    expect(state.phase).toBe('stopped')
    expect(state.stopCode).toBe(CANCELLED)
    expect(h.writes).toHaveLength(50)
    expect(h.server.previews).toBe(1)
    expect(state.outcomes.filter((o) => o.status === 'cancelled')).toHaveLength(5)
  })

  it('预览进行中取消：预览返回后直接停止，不进入评审', async () => {
    const h = harness()
    const s = h.session([card('card-a')])
    const started = s.start()
    s.cancel()
    await started
    expect(s.getState()).toMatchObject({ phase: 'stopped', stopCode: CANCELLED })
    expect(h.server.commits).toBe(0)
  })

  it('评审中取消：立即停止，不提交', async () => {
    const h = harness()
    const s = h.session([card('card-a')])
    await s.start()
    s.cancel()
    expect(s.getState()).toMatchObject({ phase: 'stopped', stopCode: CANCELLED })
    await s.commit()
    expect(h.server.commits).toBe(0)
    expect(h.writes).toEqual([])
  })

  it('预览与提交之间连接换了服务器：硬停，不提交、不写映射', async () => {
    const h = harness()
    const s = h.session([card('card-a')])
    await s.start()
    h.breakServer()
    await s.commit()
    expect(s.getState()).toMatchObject({ phase: 'stopped', stopCode: SERVER_MISMATCH })
    expect(h.server.commits).toBe(0)
    expect(h.writes).toEqual([])
  })

  it('写映射途中服务器身份变了：已写的保留，之后一条都不写', async () => {
    const h = harness()
    const s = h.session([card('card-a'), card('card-b')])
    await s.start()
    const record = h.deps.record
    h.deps.record = (write) => {
      record(write)
      h.breakServer()
    }
    await s.commit()
    expect(h.writes.map((w) => w.clientRef)).toEqual(['card-a'])
    expect(s.getState()).toMatchObject({ phase: 'stopped', stopCode: SERVER_MISMATCH })
  })

  it('413 带 client_ref：只拿掉那一项，其余重新预览', async () => {
    const h = harness()
    const preview = h.deps.preview
    let first = true
    h.deps.preview = vi.fn(async (items) => {
      if (first) {
        first = false
        const error = new ApiError('too many entries', 413, 'TOO_MANY_ENTRIES')
        error.body = { error_code: 'TOO_MANY_ENTRIES', client_ref: 'book-1' }
        throw error
      }
      return preview(items)
    })
    const s = h.session([book('book-1'), card('card-a')])
    await s.start()
    expect(outcomeOf(s, 'book-1')).toMatchObject({ status: 'rejected', code: 'TOO_MANY_ENTRIES' })
    expect(s.getState().plan!.rows.map((r) => r.clientRef)).toEqual(['card-a'])
  })

  it('429：retry_after 在上限内就等待后重试；超出上限交给界面', async () => {
    const h = harness()
    const commit = h.deps.commit
    let calls = 0
    h.deps.commit = vi.fn(async (...args: Parameters<PushDeps['commit']>) => {
      calls += 1
      if (calls === 1) throw new ApiError('slow down', 429, undefined, 7)
      return commit(...args)
    })
    const s = h.session([card('card-a')])
    await s.start()
    await s.commit()
    expect(h.deps.sleep).toHaveBeenCalledWith(7000)
    expect(s.getState().phase).toBe('done')

    const h2 = harness()
    h2.deps.commit = vi.fn(async () => { throw new ApiError('slow down', 429, undefined, 600) })
    const s2 = h2.session([card('card-a')])
    await s2.start()
    await s2.commit()
    expect(h2.deps.sleep).not.toHaveBeenCalled()
    expect(s2.getState().phase).toBe('stopped')
    expect(h2.writes).toEqual([])
  })

  it('提交部分失败（身份冲突）：成功的照常写映射，冲突项可只对它们重新预览', async () => {
    const h = harness()
    h.server.conflictOnCommit.add('card-b')
    const s = h.session([card('card-a'), card('card-b')])
    await s.start()
    await s.commit()
    expect(h.writes.map((w) => w.clientRef)).toEqual(['card-a'])
    expect(s.getState()).toMatchObject({ phase: 'paused', retryable: ['card-b'] })
    expect(outcomeOf(s, 'card-b')).toMatchObject({ status: 'error', code: 'CARD_IDENTITY_CONFLICT' })
    h.server.conflictOnCommit.clear()
    await s.retryFailed()
    expect(s.getState().plan!.rows.map((r) => r.clientRef)).toEqual(['card-b'])
    await s.commit()
    expect(outcomeOf(s, 'card-b')).toMatchObject({ status: 'created' })
  })
})

describe('推送入口与同步状态', () => {
  it('只有房主能推送；没设访问密码的服务器可推但需警告；其余不给入口', () => {
    expect(pushAccess(true, 'login-required')).toBe('owner')
    expect(pushAccess(false, 'allowed')).toBe('passwordless')
    expect(pushAccess(false, 'login-required')).toBe('denied')
    expect(pushAccess(false, 'unavailable')).toBe('denied')
  })

  it('同步状态：从未推送 / 一致 / 本机改过 / 服务器改过 / 都改过 / 服务器已删', () => {
    const link = { syncedRevision: 3, stateToken: 't1' }
    expect(localSyncState({ revision: 1 }, null, null)).toBe('never')
    expect(localSyncState({ revision: 3 }, link, { exists: true, state_token: 't1' })).toBe('in-sync')
    expect(localSyncState({ revision: 4 }, link, { exists: true, state_token: 't1' })).toBe('local-changes')
    expect(localSyncState({ revision: 3 }, link, { exists: true, state_token: 't2' })).toBe('server-changed')
    expect(localSyncState({ revision: 4 }, link, { exists: true, state_token: 't2' })).toBe('both-changed')
    expect(localSyncState({ revision: 3 }, link, { exists: false, state_token: '' })).toBe('server-deleted')
    expect(localSyncState({ revision: 4 }, link, null)).toBe('local-changes')
  })

  it('拉取来源就是这台服务器且尚无映射：带 canonical_hint；其余不带', () => {
    const item = {
      localId: 'card-a', kind: 'character_template' as const, format: 'chara_card_v3', name: 'a', ruleId: '', readOnly: false,
      revision: 1, origin: { server_instance_id: 'srv-1', canonical_id: 'card_x' }, createdAt: '', updatedAt: '', document: {},
    }
    expect(pushCandidateOf(item, null, 'srv-1').canonicalHint).toBe('card_x')
    expect(pushCandidateOf(item, null, 'srv-2').canonicalHint).toBeUndefined()
    expect(pushCandidateOf(item, { serverInstanceId: 'srv-1', localId: 'card-a', canonicalId: 'c', stateToken: '', syncedRevision: 1, syncedDigest: '', baseUrlHint: '', remoteDeletedAt: null, updatedAt: '' }, 'srv-1').canonicalHint).toBeUndefined()
  })
})

describe('契约：推送请求里的文档满足服务端发布的 schema', () => {
  it('卡片（含内嵌书、头像被剥的卡）与 Lorebook', async () => {
    const { default: Ajv2020 } = await import('ajv/dist/2020')
    const { schemas } = await import('@/lib/portable/__fixtures__/content-sync')
    const ajv = new Ajv2020({ strict: false })
    ajv.addSchema(schemas.lorebookV3Schema)
    ajv.addSchema(schemas.cardBodySchema)
    ajv.addSchema(schemas.charaCardV3Schema)
    const envelope = ajv.getSchema(schemas.charaCardV3Schema.$id)!
    const body = ajv.getSchema(schemas.cardBodySchema.$id)!
    const lorebook = ajv.getSchema(schemas.lorebookV3Schema.$id)!
    const uploaded = writeCardV3({ ...(fixtures.cardFreeform.data.extensions.diceframe as unknown as CardBody), portrait: { kind: 'upload', asset_id: 'a' } })
    const { prepared } = preparePush([card('c1', fixtures.cardWithBook), card('c2', fixtures.cardCoc), card('c3', uploaded), book('b1')])
    for (const { item } of prepared) {
      if (item.kind === 'lorebook') {
        expect(lorebook(item.document)).toBe(true)
      } else {
        expect(envelope(item.document)).toBe(true)
        expect(body(readCardV3(item.document).body)).toBe(true)
      }
    }
  })
})

describe('#6 评审修复', () => {
  it('unchanged 但只允许 duplicate / skip（服务端已变成规则托管）：不自动答 update，必须由用户选', async () => {
    const h = harness()
    const seed = h.session([card('card-a')])
    await seed.start()
    await seed.commit()
    h.server.locked.add('card-a')
    const s = h.session([card('card-a')])
    await s.start()
    const row = s.getState().plan!.rows[0]
    expect(row.action).toBe('unchanged')
    expect(row.decision).toBeUndefined()
    expect(s.undecided().map((r) => r.clientRef)).toEqual(['card-a'])
    s.setDecision('card-a', 'skip')
    await s.commit()
    expect(outcomeOf(s, 'card-a')).toMatchObject({ status: 'skipped' })
  })

  it('提交 400 DECISION_*（带 client_ref）：重新预览、回到评审，不把那一项丢掉', async () => {
    const h = harness()
    const seed = h.session([card('card-a'), card('card-b')])
    await seed.start()
    await seed.commit()
    const edited = writeCardV3({ ...(fixtures.cardFreeform.data.extensions.diceframe as unknown as CardBody), race: 'Z' })
    const s = h.session([card('card-a', edited, 2), card('card-b', edited, 2)])
    await s.start()
    s.setDecision('card-a', 'update')
    s.setDecision('card-b', 'update')
    // 预览之后服务端把 card-a 锁成只能 duplicate / skip，但计划摘要不变（模拟 digest 未覆盖的决策约束变化）
    const commit = h.deps.commit
    h.deps.commit = vi.fn(async (...args: Parameters<PushDeps['commit']>) => {
      const error = new ApiError('decision not allowed', 400, 'DECISION_NOT_ALLOWED')
      error.body = { ok: false, error_code: 'DECISION_NOT_ALLOWED', client_ref: 'card-a' }
      h.deps.commit = commit
      throw error
    })
    await s.commit()
    const state = s.getState()
    expect(state.phase).toBe('review')
    expect(state.plan!.rows.map((r) => r.clientRef)).toEqual(['card-a', 'card-b'])
    expect(outcomeOf(s, 'card-a')!.status).toBe('pending')
  })

  it('跳过的行不写映射', async () => {
    const h = harness()
    const seed = h.session([card('card-a')])
    await seed.start()
    await seed.commit()
    const before = h.writes.length
    const edited = writeCardV3({ ...(fixtures.cardFreeform.data.extensions.diceframe as unknown as CardBody), race: 'Y' })
    const s = h.session([card('card-a', edited, 2)])
    await s.start()
    s.setDecision('card-a', 'skip')
    await s.commit()
    expect(outcomeOf(s, 'card-a')).toMatchObject({ status: 'skipped' })
    expect(h.writes.length).toBe(before)
  })

  it('500 IMPORT_FAILED 且有 not_attempted：写完成功的映射后暂停，不自动预览下一批', async () => {
    const h = harness()
    h.server.failOnCommit.add('card-1')
    const candidates = Array.from({ length: 52 }, (_, i) => card(`card-${i}`))
    const s = h.session(candidates)
    await s.start()
    await s.commit()
    const state = s.getState()
    expect(state.phase).toBe('paused')
    expect(h.writes.map((w) => w.clientRef)).toEqual(['card-0'])
    expect(h.server.previews).toBe(1)
    expect(state.retryable).toContain('card-1')
    expect(state.retryable).toContain('card-2')
    expect(outcomeOf(s, 'card-2')).toMatchObject({ status: 'not_attempted' })
  })
})

describe('#6 评审修复：内嵌书的状态并入卡片', () => {
  it('/status 也查 <卡片>.book 的映射；书在服务器上被改或被删，卡片显示服务器有改动', () => {
    const summaries = [
      { localId: 'card-a', kind: 'character_template' as const, revision: 2 },
      { localId: 'book-1', kind: 'lorebook' as const, revision: 1 },
    ]
    const links = [
      { localId: 'card-a', canonicalId: 'c1', syncedRevision: 2, stateToken: 't1' },
      { localId: 'card-a.book', canonicalId: 'b1', syncedRevision: 2, stateToken: 'bt1' },
      { localId: 'book-1', canonicalId: 'b2', syncedRevision: 1, stateToken: 'x' },
    ]
    expect(statusRefsFor(summaries, links)).toEqual([
      { kind: 'character_template', canonical_id: 'c1' },
      { kind: 'lorebook', canonical_id: 'b1' },
      { kind: 'lorebook', canonical_id: 'b2' },
    ])
    const statuses = (book: { exists: boolean; state_token: string }) => new Map([
      ['c1', { exists: true, state_token: 't1' }],
      ['b1', book],
      ['b2', { exists: true, state_token: 'x' }],
    ])
    expect(pushListStates(summaries, links, statuses({ exists: true, state_token: 'bt1' }))).toEqual({ 'card-a': 'in-sync', 'book-1': 'in-sync' })
    expect(pushListStates(summaries, links, statuses({ exists: true, state_token: 'bt2' }))['card-a']).toBe('server-changed')
    expect(pushListStates(summaries, links, statuses({ exists: false, state_token: '' }))['card-a']).toBe('server-changed')
  })
})
