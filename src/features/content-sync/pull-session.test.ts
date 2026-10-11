import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import { ContentSyncError, SERVER_MISMATCH } from '@/api/content'
import type { ContentExportItem, ContentKind, ContentStatusItem } from '@/api/types'
import { migrateLibrary } from '@/lib/local-library/migrate'
import { LocalLibraryRepository } from '@/lib/local-library/repository'
import { fixtures, schemas } from '@/lib/portable/__fixtures__/content-sync'
import { readCardV3, writeCardV3, type CardBody } from '@/lib/portable/card-v3'
import { cloneJson } from '@/lib/portable/json'
import { readLorebookV3, writeLorebookV3, type LorebookBook } from '@/lib/portable/lorebook-v3'
import { openTestLibraryDb } from '@/test/library-db'

import {
  CANCELLED,
  EMBEDDED_BOOK_LINKED,
  PullSession,
  RULESET_CARD_UNSUPPORTED,
  linkedItemRefs,
  lockedReasonOf,
  type PullDeps,
  type ServerItemRef,
} from './pull-session'
import { localSyncState, pushCandidateOf, pushListStates, statusRefsFor } from './sync-state'

const SRV = 'srv-0123456789abcdef'

interface ServerCopy {
  kind: ContentKind
  document: unknown
  token: string
  provenance?: Record<string, unknown> | null
  warnings?: { code: string; message?: string }[]
  lockedReason?: string
}

/**
 * 假服务端：按契约实现导出（未知 id 整批 404 NOT_FOUND）与 /status。
 * 卡片的内嵌书是服务器上独立的一本书，经 provenance.book_id 指向它。
 */
class FakeServer {
  copies = new Map<string, ServerCopy>()
  tooLarge = new Set<string>()
  exports: string[][] = []
  statusCalls = 0
  private tokens = 0

  put(id: string, copy: Omit<ServerCopy, 'token'>): void {
    this.copies.set(id, { ...copy, token: `t${++this.tokens}` })
  }

  async exportItems(refs: { kind: ContentKind; canonical_id: string }[]): Promise<ContentExportItem[]> {
    this.exports.push(refs.map((ref) => ref.canonical_id))
    if (refs.some((ref) => !this.copies.has(ref.canonical_id))) throw new ApiError('not found', 404, 'NOT_FOUND')
    if (refs.some((ref) => this.tooLarge.has(ref.canonical_id))) throw new ApiError('too large', 413, 'BODY_TOO_LARGE')
    return refs.map((ref) => {
      const copy = this.copies.get(ref.canonical_id)!
      return {
        kind: copy.kind,
        format: copy.kind === 'lorebook' ? 'lorebook_v3' : 'chara_card_v3',
        document: cloneJson(copy.document),
        warnings: copy.warnings,
        origin: {
          server_instance_id: SRV,
          canonical_id: ref.canonical_id,
          state_token: copy.token,
          provenance: copy.provenance ?? null,
          ...(copy.lockedReason ? { locked_reason: copy.lockedReason } : {}),
        },
      }
    })
  }

  async status(refs: { kind: ContentKind; canonical_id: string }[]): Promise<ContentStatusItem[]> {
    this.statusCalls += 1
    return refs.map((ref) => {
      const copy = this.copies.get(ref.canonical_id)
      return { kind: ref.kind, canonical_id: ref.canonical_id, exists: !!copy, state_token: copy?.token ?? '', provenance: copy?.provenance ?? null }
    })
  }
}

function sequence() {
  let n = 0
  return () => `00000000-${String(++n).padStart(4, '0')}-4000-8000-000000000000`
}

async function harness() {
  const { db, raw } = openTestLibraryDb()
  await migrateLibrary(db)
  const library = new LocalLibraryRepository(db, { uuid: sequence() })
  const server = new FakeServer()
  const deps: PullDeps = {
    serverInstanceId: SRV,
    baseUrlHint: 'http://192.168.1.2:8000',
    exportItems: vi.fn((refs) => server.exportItems(refs)),
    status: vi.fn((refs) => server.status(refs)),
    assertServer: vi.fn(),
    library,
    uuid: sequence(),
    sleep: vi.fn(async () => undefined),
    maybeYield: vi.fn(async () => undefined),
  }
  const pull = async (refs: ServerItemRef[]) => {
    const session = new PullSession(deps, refs)
    await session.start()
    return session
  }
  return { raw, library, server, deps, pull }
}

const cardRef = (id: string): ServerItemRef => ({ kind: 'character_template', canonicalId: id })
const bookRef = (id: string): ServerItemRef => ({ kind: 'lorebook', canonicalId: id })
const outcome = (session: PullSession, id: string) => session.getState().outcomes.find((entry) => entry.canonicalId === id)!

const freeformBody = fixtures.cardFreeform.data.extensions.diceframe as unknown as CardBody
const lorebookWith = (patch: (book: LorebookBook) => void) => {
  const book = readLorebookV3(fixtures.lorebook)
  patch(book)
  return writeLorebookV3(book)
}

describe('拉取状态机（假服务端）', () => {
  it('首次拉取：卡（含内嵌书）与书写入本机，来源带 state_token，映射即同步基线', async () => {
    const h = await harness()
    h.server.put('book_1', { kind: 'lorebook', document: fixtures.lorebook })
    h.server.put('book_embedded', { kind: 'lorebook', document: fixtures.lorebook })
    h.server.put('card_1', { kind: 'character_template', document: fixtures.cardWithBook, provenance: { book_id: 'book_embedded' } })
    const s = await h.pull([cardRef('card_1'), bookRef('book_1')])
    expect(s.getState().phase).toBe('done')
    const cardOut = outcome(s, 'card_1')
    const bookOut = outcome(s, 'book_1')
    expect(cardOut.status).toBe('created')
    expect(bookOut.status).toBe('created')
    const card = h.library.getItem(cardOut.localId!)!
    expect(card.origin).toMatchObject({ server_instance_id: SRV, canonical_id: 'card_1', state_token: 't3' })
    expect(card.readOnly).toBe(false)
    const cardLink = h.library.getLink(SRV, card.localId)!
    expect(cardLink).toMatchObject({ canonicalId: 'card_1', stateToken: 't3', syncedRevision: card.revision, remoteDeletedAt: null })
    // 内嵌书：经 /status 按 provenance.book_id 取到服务器上那本书的 state_token
    expect(h.library.getLink(SRV, `${card.localId}.book`)).toMatchObject({ canonicalId: 'book_embedded', stateToken: 't2' })
    expect(h.server.statusCalls).toBe(1)
    // 拉下来的项一开始就是已同步；推送状态把书一起折叠
    const statuses = await h.server.status(statusRefsFor(h.library.listItems(), h.library.listLinks(SRV)).map((ref) => ({ ...ref })))
    const states = pushListStates(h.library.listItems(), h.library.listLinks(SRV), new Map(statuses.map((x) => [x.canonical_id, x])))
    expect(Object.values(states)).toEqual(['in-sync', 'in-sync'])
  })

  it('再次拉取、服务器没变：不写入（revision 不动）', async () => {
    const h = await harness()
    h.server.put('book_1', { kind: 'lorebook', document: fixtures.lorebook })
    const first = await h.pull([bookRef('book_1')])
    const localId = outcome(first, 'book_1').localId!
    const again = await h.pull([bookRef('book_1')])
    expect(outcome(again, 'book_1')).toMatchObject({ status: 'unchanged', localId })
    expect(h.library.getItem(localId)!.revision).toBe(1)
    expect(h.library.listItems()).toHaveLength(1)
  })

  it('服务器改过、本机没改：原地更新，书全量镜像（服务器删掉的条目本机也删）', async () => {
    const h = await harness()
    h.server.put('book_1', { kind: 'lorebook', document: fixtures.lorebook })
    const localId = outcome(await h.pull([bookRef('book_1')]), 'book_1').localId!
    h.server.put('book_1', { kind: 'lorebook', document: lorebookWith((book) => { book.entries = book.entries.slice(0, 1) }) })
    const s = await h.pull([bookRef('book_1')])
    expect(outcome(s, 'book_1')).toMatchObject({ status: 'updated', localId })
    const item = h.library.getItem(localId)!
    expect(item.revision).toBe(2)
    expect(readLorebookV3(item.document).entries.map((entry) => entry.id)).toEqual(['town-cinder'])
    expect(h.library.getLink(SRV, localId)).toMatchObject({ stateToken: 't2', syncedRevision: 2 })
  })

  it('服务器只改了卡的内嵌书：也算服务器变了，原地更新并刷新 .book 映射', async () => {
    const h = await harness()
    h.server.put('book_embedded', { kind: 'lorebook', document: fixtures.lorebook })
    h.server.put('card_1', { kind: 'character_template', document: fixtures.cardWithBook, provenance: { book_id: 'book_embedded' } })
    const localId = outcome(await h.pull([cardRef('card_1')]), 'card_1').localId!
    h.server.put('book_embedded', { kind: 'lorebook', document: fixtures.lorebook })
    const s = await h.pull([cardRef('card_1')])
    expect(outcome(s, 'card_1').status).toBe('updated')
    expect(h.library.getLink(SRV, `${localId}.book`)!.stateToken).toBe('t3')
  })

  it('本机改过、服务器也变了：保留两份——服务器版本另存，改过的那份解除映射与来源，内容不动', async () => {
    const h = await harness()
    h.server.put('book_embedded', { kind: 'lorebook', document: fixtures.lorebook })
    h.server.put('card_1', { kind: 'character_template', document: fixtures.cardWithBook, provenance: { book_id: 'book_embedded' } })
    const localId = outcome(await h.pull([cardRef('card_1')]), 'card_1').localId!
    const edited = writeCardV3({ ...freeformBody, character_name: 'Local edit' })
    h.library.updateDocument(localId, { document: edited, name: 'Local edit', ruleId: '' })
    h.server.put('card_1', { kind: 'character_template', document: writeCardV3({ ...freeformBody, character_name: 'Server edit' }) })
    const s = await h.pull([cardRef('card_1')])
    const out = outcome(s, 'card_1')
    expect(out.status).toBe('kept-both')
    expect(out.localId).not.toBe(localId)
    // 改过的那份：内容不动、不再跟随服务器项（推送时作为新项，不带 canonical_hint）
    const mine = h.library.getItem(localId)!
    expect(mine.name).toBe('Local edit')
    expect(mine.origin).toBeNull()
    expect(h.library.getLink(SRV, localId)).toBeNull()
    expect(h.library.getLink(SRV, `${localId}.book`)).toBeNull()
    expect(pushCandidateOf(mine, null, SRV).canonicalHint).toBeUndefined()
    // 服务器版本：新本机项跟随 card_1；这一版没有内嵌书，不留 .book 映射
    const theirs = h.library.getItem(out.localId!)!
    expect(theirs.name).toBe('Server edit')
    expect(h.library.getLink(SRV, theirs.localId)).toMatchObject({ canonicalId: 'card_1', syncedRevision: 1 })
    expect(h.library.getLink(SRV, `${theirs.localId}.book`)).toBeNull()
  })

  it('本机改过、服务器没变：不写入，本机改动留待推送', async () => {
    const h = await harness()
    h.server.put('card_1', { kind: 'character_template', document: fixtures.cardFreeform })
    const localId = outcome(await h.pull([cardRef('card_1')]), 'card_1').localId!
    h.library.updateDocument(localId, { document: writeCardV3({ ...freeformBody, race: 'Z' }), name: 'x', ruleId: '' })
    const s = await h.pull([cardRef('card_1')])
    expect(outcome(s, 'card_1')).toMatchObject({ status: 'unchanged', localId })
    expect(h.library.listItems()).toHaveLength(1)
    expect(localSyncState(h.library.getItem(localId)!, h.library.getLink(SRV, localId), null)).toBe('local-changes')
  })

  it('服务器上已删除：二分找出缺失项，本机有映射的只标记、绝不删除；没有映射的记为未找到', async () => {
    const h = await harness()
    h.server.put('book_a', { kind: 'lorebook', document: fixtures.lorebook })
    h.server.put('book_gone', { kind: 'lorebook', document: fixtures.lorebook })
    h.server.put('book_b', { kind: 'lorebook', document: fixtures.lorebook })
    const goneLocal = outcome(await h.pull([bookRef('book_gone')]), 'book_gone').localId!
    h.server.copies.delete('book_gone')
    const s = await h.pull([bookRef('book_a'), bookRef('book_gone'), bookRef('book_b'), bookRef('book_never')])
    expect(outcome(s, 'book_a').status).toBe('created')
    expect(outcome(s, 'book_b').status).toBe('created')
    expect(outcome(s, 'book_gone')).toMatchObject({ status: 'server-deleted', localId: goneLocal })
    expect(outcome(s, 'book_never')).toMatchObject({ status: 'not-found' })
    expect(h.library.getItem(goneLocal)).not.toBeNull()
    expect(h.library.getLink(SRV, goneLocal)!.remoteDeletedAt).toBeTruthy()
    expect(localSyncState(h.library.getItem(goneLocal)!, h.library.getLink(SRV, goneLocal), { exists: false, state_token: '' })).toBe('server-deleted')
  })

  it('服务器身份中途变了：立刻停下，之后一项都不写', async () => {
    const h = await harness()
    for (const id of ['book_a', 'book_b', 'book_c']) h.server.put(id, { kind: 'lorebook', document: fixtures.lorebook })
    let calls = 0
    h.deps.assertServer = vi.fn(() => {
      calls += 1
      if (calls === 2) throw new ContentSyncError(SERVER_MISMATCH, 'moved')
    })
    const s = await h.pull([bookRef('book_a'), bookRef('book_b'), bookRef('book_c')])
    expect(s.getState()).toMatchObject({ phase: 'stopped', stopCode: SERVER_MISMATCH })
    expect(s.getState().outcomes.map((entry) => entry.status)).toEqual(['created', 'not_attempted', 'not_attempted'])
    expect(h.library.listItems()).toHaveLength(1)
  })

  it('取消：在两项之间生效，已写入的保留，其余标为已取消', async () => {
    const h = await harness()
    for (const id of ['book_a', 'book_b', 'book_c']) h.server.put(id, { kind: 'lorebook', document: fixtures.lorebook })
    const session = new PullSession(h.deps, [bookRef('book_a'), bookRef('book_b'), bookRef('book_c')])
    h.deps.maybeYield = vi.fn(async () => session.cancel())
    await session.start()
    expect(session.getState()).toMatchObject({ phase: 'stopped', stopCode: CANCELLED })
    expect(session.getState().outcomes.map((entry) => entry.status)).toEqual(['created', 'cancelled', 'cancelled'])
    expect(h.library.listItems()).toHaveLength(1)
  })

  it('429：retry_after 在上限内等待后重试；超出上限停下并交出错误码', async () => {
    const h = await harness()
    h.server.put('book_a', { kind: 'lorebook', document: fixtures.lorebook })
    let calls = 0
    h.deps.exportItems = vi.fn(async (refs) => {
      calls += 1
      if (calls === 1) throw new ApiError('slow down', 429, 'RATE_LIMITED', 7)
      return h.server.exportItems(refs)
    })
    const s = await h.pull([bookRef('book_a')])
    expect(h.deps.sleep).toHaveBeenCalledWith(7000)
    expect(outcome(s, 'book_a').status).toBe('created')

    const h2 = await harness()
    h2.server.put('book_a', { kind: 'lorebook', document: fixtures.lorebook })
    h2.deps.exportItems = vi.fn(async () => { throw new ApiError('slow down', 429, 'RATE_LIMITED', 600) })
    const s2 = await h2.pull([bookRef('book_a')])
    expect(s2.getState()).toMatchObject({ phase: 'stopped', stopCode: 'RATE_LIMITED' })
    expect(outcome(s2, 'book_a').status).toBe('not_attempted')
    expect(h2.deps.sleep).not.toHaveBeenCalled()
  })

  it('413：二分到单项，只把那一项记为被拒，其余照常拉取', async () => {
    const h = await harness()
    for (const id of ['book_a', 'book_big', 'book_c']) h.server.put(id, { kind: 'lorebook', document: fixtures.lorebook })
    h.server.tooLarge.add('book_big')
    const s = await h.pull([bookRef('book_a'), bookRef('book_big'), bookRef('book_c')])
    expect(s.getState().phase).toBe('done')
    expect(s.getState().outcomes.map((entry) => [entry.canonicalId, entry.status, entry.code])).toEqual([
      ['book_a', 'created', undefined], ['book_big', 'rejected', 'BODY_TOO_LARGE'], ['book_c', 'created', undefined],
    ])
  })

  it('超过 50 项分批导出', async () => {
    const h = await harness()
    const refs = Array.from({ length: 51 }, (_, index) => {
      h.server.put(`book_${index}`, { kind: 'lorebook', document: fixtures.lorebook })
      return bookRef(`book_${index}`)
    })
    await h.pull(refs)
    expect(h.server.exports.map((batch) => batch.length)).toEqual([50, 1])
  })

  it('规则托管卡显示为不支持且不导入；服务器本地图片头像丢弃并警告', async () => {
    const h = await harness()
    h.server.put('card_dnd', { kind: 'character_template', document: fixtures.cardDnd2024 })
    h.server.put('card_up', { kind: 'character_template', document: writeCardV3({ ...freeformBody, portrait: { kind: 'upload', asset_id: 'a' } }) })
    const s = await h.pull([cardRef('card_dnd'), cardRef('card_up')])
    expect(outcome(s, 'card_dnd')).toMatchObject({ status: 'unsupported', code: RULESET_CARD_UNSUPPORTED })
    const up = outcome(s, 'card_up')
    expect(up.status).toBe('created')
    expect(up.warnings.map((warning) => warning.code)).toEqual(['PORTRAIT_NOT_PORTABLE'])
    expect(readCardV3(h.library.getItem(up.localId!)!.document).body.portrait).toEqual({})
    expect(h.library.listItems()).toHaveLength(1)
  })

  it('服务端已带的警告不重复', async () => {
    const h = await harness()
    h.server.put('card_up', {
      kind: 'character_template',
      document: writeCardV3({ ...freeformBody, portrait: { kind: 'upload', asset_id: 'a' } }),
      warnings: [{ code: 'PORTRAIT_NOT_PORTABLE', message: 'server' }],
    })
    const s = await h.pull([cardRef('card_up')])
    expect(outcome(s, 'card_up').warnings).toEqual([{ code: 'PORTRAIT_NOT_PORTABLE', message: 'server' }])
  })

  it('ensureEntryIds：没有 id 的条目补上稳定 id 并存回；再次拉取同一版本不改 id', async () => {
    const h = await harness()
    const legacy = lorebookWith((book) => {
      delete book.entries[0].id
      book.entries[1] = { ...book.entries[1], id: undefined, uid: 7 }
      delete book.entries[1].id
    })
    h.server.put('book_1', { kind: 'lorebook', document: legacy })
    h.server.put('book_embedded', { kind: 'lorebook', document: fixtures.lorebook })
    const cardDoc = cloneJson(fixtures.cardWithBook) as unknown as { data: { character_book: LorebookBook } }
    delete cardDoc.data.character_book.entries[0].id
    h.server.put('card_1', { kind: 'character_template', document: cardDoc, provenance: { book_id: 'book_embedded' } })
    const s = await h.pull([bookRef('book_1'), cardRef('card_1')])
    const stored = readLorebookV3(h.library.getItem(outcome(s, 'book_1').localId!)!.document)
    const ids = stored.entries.map((entry) => entry.id)
    expect(ids[0]).toMatch(/^entry-/)
    expect(ids[1]).toBe('7')
    expect(ids[2]).toBe('lore-basics')
    // 存的是外形完整的 lorebook_v3 文档，书级设置原样保留
    expect(stored.scan_depth).toBe((fixtures.lorebook.data.lorebook as Record<string, unknown>).scan_depth)
    const embedded = readCardV3(h.library.getItem(outcome(s, 'card_1').localId!)!.document).characterBook!
    expect(embedded.entries.every((entry) => typeof entry.id === 'string' && entry.id)).toBe(true)
    const again = await h.pull([bookRef('book_1')])
    expect(outcome(again, 'book_1').status).toBe('unchanged')
    expect(readLorebookV3(h.library.getItem(outcome(s, 'book_1').localId!)!.document).entries.map((entry) => entry.id)).toEqual(ids)
  })

  it('超出条目数 / 单条大小限额的书不导入', async () => {
    const h = await harness()
    h.server.put('book_many', { kind: 'lorebook', document: lorebookWith((book) => {
      book.entries = Array.from({ length: 2001 }, (_, index) => ({ id: `e${index}`, content: '' }))
    }) })
    h.server.put('book_big', { kind: 'lorebook', document: lorebookWith((book) => {
      book.entries = [{ id: 'huge', content: 'x'.repeat(33 * 1024) }]
    }) })
    const s = await h.pull([bookRef('book_many'), bookRef('book_big')])
    expect(outcome(s, 'book_many')).toMatchObject({ status: 'rejected', code: 'TOO_MANY_ENTRIES' })
    expect(outcome(s, 'book_big')).toMatchObject({ status: 'rejected', code: 'ENTRY_TOO_LARGE', entryId: 'huge' })
    expect(h.library.listItems()).toHaveLength(0)
  })

  it('locked_reason（#508）：PLUGIN_BOOK 的书也本机只读；RULESET_CARD / RULESET_CARD_UNSUPPORTED 的卡不导入', async () => {
    const h = await harness()
    h.server.put('book_plugin', { kind: 'lorebook', document: fixtures.lorebook, lockedReason: 'PLUGIN_BOOK' })
    h.server.put('card_ruleset', { kind: 'character_template', document: fixtures.cardFreeform, lockedReason: 'RULESET_CARD' })
    h.server.put('card_ruleset_u', { kind: 'character_template', document: fixtures.cardFreeform, lockedReason: 'RULESET_CARD_UNSUPPORTED' })
    const s = await h.pull([bookRef('book_plugin'), cardRef('card_ruleset'), cardRef('card_ruleset_u')])
    const book = h.library.getItem(outcome(s, 'book_plugin').localId!)!
    expect(book.readOnly).toBe(true)
    expect(book.origin?.locked_reason).toBe('PLUGIN_BOOK')
    expect(outcome(s, 'card_ruleset')).toMatchObject({ status: 'unsupported', code: RULESET_CARD_UNSUPPORTED })
    expect(outcome(s, 'card_ruleset_u')).toMatchObject({ status: 'unsupported', code: RULESET_CARD_UNSUPPORTED })
    expect(h.library.listItems()).toHaveLength(1)
  })

  it('locked_reason：导出 origin 带它时拉下来的项本机只读；不带时可编辑（插件卡靠推送时的 PLUGIN_CARD）', async () => {
    const h = await harness()
    h.server.put('card_plugin', { kind: 'character_template', document: fixtures.cardFreeform, lockedReason: 'PLUGIN_CARD' })
    h.server.put('card_plain', { kind: 'character_template', document: fixtures.cardFreeform })
    const s = await h.pull([cardRef('card_plugin'), cardRef('card_plain')])
    const locked = h.library.getItem(outcome(s, 'card_plugin').localId!)!
    expect(locked.readOnly).toBe(true)
    expect(locked.origin?.locked_reason).toBe('PLUGIN_CARD')
    expect(h.library.getItem(outcome(s, 'card_plain').localId!)!.readOnly).toBe(false)
    expect(lockedReasonOf(undefined)).toBeUndefined()
  })

  it('已作为卡片内嵌书跟随的书单独拉取：跳过，不另存一份', async () => {
    const h = await harness()
    h.server.put('book_embedded', { kind: 'lorebook', document: fixtures.lorebook })
    h.server.put('card_1', { kind: 'character_template', document: fixtures.cardWithBook, provenance: { book_id: 'book_embedded' } })
    await h.pull([cardRef('card_1')])
    const s = await h.pull([bookRef('book_embedded')])
    expect(outcome(s, 'book_embedded')).toMatchObject({ status: 'skipped', code: EMBEDDED_BOOK_LINKED })
    expect(h.library.listItems()).toHaveLength(1)
  })

  it('重新拉取已跟随的项：linkedItemRefs 只取独立项映射', async () => {
    const h = await harness()
    h.server.put('book_embedded', { kind: 'lorebook', document: fixtures.lorebook })
    h.server.put('card_1', { kind: 'character_template', document: fixtures.cardWithBook, provenance: { book_id: 'book_embedded' } })
    await h.pull([cardRef('card_1')])
    expect(linkedItemRefs(h.library.listItems(), h.library.listLinks(SRV)).map((ref) => ref.canonicalId)).toEqual(['card_1'])
  })
})

describe('契约：拉取后存进本机的文档满足服务端发布的 schema', () => {
  it('卡片（内嵌书补齐 id）与 Lorebook', async () => {
    const { default: Ajv2020 } = await import('ajv/dist/2020')
    const ajv = new Ajv2020({ strict: false })
    ajv.addSchema(schemas.lorebookV3Schema)
    ajv.addSchema(schemas.cardBodySchema)
    ajv.addSchema(schemas.charaCardV3Schema)
    const envelope = ajv.getSchema(schemas.charaCardV3Schema.$id)!
    const body = ajv.getSchema(schemas.cardBodySchema.$id)!
    const lorebook = ajv.getSchema(schemas.lorebookV3Schema.$id)!
    const h = await harness()
    const cardDoc = cloneJson(fixtures.cardWithBook) as unknown as { data: { character_book: LorebookBook } }
    delete cardDoc.data.character_book.entries[0].id
    h.server.put('card_1', { kind: 'character_template', document: cardDoc })
    h.server.put('card_2', { kind: 'character_template', document: fixtures.cardCoc })
    h.server.put('book_1', { kind: 'lorebook', document: lorebookWith((book) => { delete book.entries[0].id }) })
    await h.pull([cardRef('card_1'), cardRef('card_2'), bookRef('book_1')])
    const items = h.library.listItems().map((summary) => h.library.getItem(summary.localId)!)
    expect(items).toHaveLength(3)
    for (const item of items) {
      if (item.kind === 'lorebook') {
        expect(lorebook(item.document)).toBe(true)
      } else {
        expect(envelope(item.document)).toBe(true)
        expect(body(readCardV3(item.document).body)).toBe(true)
      }
    }
  })
})

describe('server_links.remote_deleted_at', () => {
  it('追加迁移建出该列；标记后再次同步成功（推送记录 / 拉取写入）时清空', async () => {
    const h = await harness()
    const columns = (h.raw.prepare('PRAGMA table_info(server_links)').all() as { name: string }[]).map((column) => column.name)
    expect(columns).toContain('remote_deleted_at')
    const item = h.library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: fixtures.lorebook, name: 'b' })
    h.library.recordSync(SRV, [{ localId: item.localId, canonicalId: 'book_1', stateToken: 't', syncedRevision: 1 }])
    expect(h.library.markRemoteDeleted(SRV, [item.localId])).toBe(1)
    expect(h.library.getLink(SRV, item.localId)!.remoteDeletedAt).toBeTruthy()
    h.library.recordSync(SRV, [{ localId: item.localId, canonicalId: 'book_1', stateToken: 't2', syncedRevision: 1 }])
    expect(h.library.getLink(SRV, item.localId)!.remoteDeletedAt).toBeNull()
    expect(h.library.markRemoteDeleted('srv-other-0123456789', [item.localId])).toBe(0)
  })
})
