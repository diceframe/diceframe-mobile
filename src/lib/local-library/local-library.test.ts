import { describe, expect, it } from 'vitest'

import { openTestDatabase } from '@/test/better-sqlite-database'
import { embeddedBookRef, ensureInstallId, isCanonicalId, newLocalId } from './ids'
import {
  LOCAL_ITEM_NOT_FOUND,
  LOCAL_ITEM_READ_ONLY,
  LocalLibraryError,
  LocalLibraryRepository,
  SERVER_LINK_CONFLICT,
} from './repository'
import { LATEST_SCHEMA_VERSION, LocalLibrarySchemaError, migrate, schemaVersion } from './schema'
import { SerialQueue } from './sql'
import { needsPush, syncStatusOf } from './sync-status'

const SRV = 'srv-0123456789abcdef'

function sequence(prefix: string) {
  let n = 0
  return () => `${prefix}-${String(++n).padStart(4, '0')}-4000-8000-000000000000`
}

function clock() {
  let n = 0
  return () => new Date(Date.UTC(2026, 9, 10, 0, 0, n++)).toISOString()
}

async function setup() {
  const { db, raw } = openTestDatabase()
  await migrate(db)
  const repo = new LocalLibraryRepository(db, { uuid: sequence('00000000'), now: clock() })
  return { db, raw, repo }
}

const cardDoc = (name: string) => ({
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: { name, extensions: { diceframe: { character_name: name, unknown_field: { keep: true } } } },
})

describe('ids', () => {
  it('规范 id 与服务端同一规则', () => {
    expect(isCanonicalId('card-1')).toBe(true)
    expect(isCanonicalId('a'.repeat(120))).toBe(true)
    expect(isCanonicalId('a'.repeat(121))).toBe(false)
    expect(isCanonicalId('-lead')).toBe(false)
    expect(isCanonicalId('has space')).toBe(false)
    expect(isCanonicalId('../x')).toBe(false)
    expect(isCanonicalId('')).toBe(false)
  })

  it('本机 id 带类型前缀、小写、规范；内嵌书按约定加 .book', () => {
    const id = newLocalId('character_template', 'ABCDEF01-2345-4678-9ABC-DEF012345678')
    expect(id).toBe('card-abcdef01-2345-4678-9abc-def012345678')
    expect(newLocalId('lorebook', 'x1')).toBe('book-x1')
    expect(embeddedBookRef(id)).toBe(`${id}.book`)
    expect(() => newLocalId('lorebook', 'bad id')).toThrow()
  })

  it('install id：合法就沿用（永不改变），缺失或被破坏才生成', () => {
    let calls = 0
    const uuid = () => { calls += 1; return 'F0F0F0F0-0000-4000-8000-000000000001' }
    expect(ensureInstallId('kept-id', uuid)).toBe('kept-id')
    expect(calls).toBe(0)
    expect(ensureInstallId(undefined, uuid)).toBe('f0f0f0f0-0000-4000-8000-000000000001')
    expect(ensureInstallId('bad id!', uuid)).toBe('f0f0f0f0-0000-4000-8000-000000000001')
    expect(() => ensureInstallId('', () => 'not ok')).toThrow()
  })
})

describe('schema 迁移', () => {
  it('新库迁到最新版本，建出三张表；重复迁移是空操作', async () => {
    const { db, raw } = openTestDatabase()
    expect(await schemaVersion(db)).toBe(0)
    await expect(migrate(db)).resolves.toBe(LATEST_SCHEMA_VERSION)
    await expect(migrate(db)).resolves.toBe(LATEST_SCHEMA_VERSION)
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
    expect(tables).toEqual([{ name: 'items' }, { name: 'rule_cache' }, { name: 'server_links' }])
  })

  it('比本 App 新的库拒绝打开，且不改动它', async () => {
    const { db, raw } = openTestDatabase()
    raw.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`)
    await expect(migrate(db)).rejects.toBeInstanceOf(LocalLibrarySchemaError)
    expect(await schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION + 1)
    expect(raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get()).toEqual({ n: 0 })
  })

  it('迁移失败整级回滚：版本号不前进、不留半张表', async () => {
    const { db, raw } = openTestDatabase()
    raw.exec('CREATE TABLE rule_cache (x INTEGER)') // 让 v1 的 CREATE TABLE rule_cache 失败
    await expect(migrate(db)).rejects.toThrow()
    expect(await schemaVersion(db)).toBe(0)
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'items'").get()).toBeUndefined()
  })
})

describe('LocalLibraryRepository：items', () => {
  it('新建项从 revision 1 开始，文档原文（含未知字段）原样保存', async () => {
    const { repo } = await setup()
    const item = await repo.createItem({
      kind: 'character_template', format: 'chara_card_v3', document: cardDoc('Mira'), name: 'Mira', ruleId: 'coc7',
    })
    expect(item.localId).toBe('card-00000000-0001-4000-8000-000000000000')
    expect(item).toMatchObject({ revision: 1, readOnly: false, name: 'Mira', ruleId: 'coc7', origin: null })
    expect(item.document).toEqual(cardDoc('Mira'))
    expect(await repo.getItem(item.localId)).toEqual(item)
    expect(await repo.getItem('card-missing')).toBeNull()
  })

  it('列表不带文档、按更新时间倒序，可按类型过滤', async () => {
    const { repo } = await setup()
    const a = await repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('A'), name: 'A' })
    const b = await repo.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: { spec: 'lorebook_v3' }, name: 'B' })
    await repo.updateDocument(a.localId, { document: cardDoc('A2'), name: 'A2' })
    const all = await repo.listItems()
    expect(all.map((item) => item.localId)).toEqual([a.localId, b.localId])
    expect(all[0]).not.toHaveProperty('document')
    expect((await repo.listItems({ kind: 'lorebook' })).map((item) => item.localId)).toEqual([b.localId])
  })

  it('本地编辑 revision +1；只读项与不存在的项拒绝编辑', async () => {
    const { repo } = await setup()
    const item = await repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('A') })
    const edited = await repo.updateDocument(item.localId, { document: cardDoc('B'), name: 'B' })
    expect(edited.revision).toBe(2)
    expect(edited.document).toEqual(cardDoc('B'))

    const dnd = await repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('D'), readOnly: true })
    await expect(repo.updateDocument(dnd.localId, { document: cardDoc('X') })).rejects.toMatchObject({ code: LOCAL_ITEM_READ_ONLY })
    expect((await repo.getItem(dnd.localId))?.revision).toBe(1)
    await expect(repo.updateDocument('card-none', { document: {} })).rejects.toMatchObject({ code: LOCAL_ITEM_NOT_FOUND })
  })

  it('origin 记录拉取来源；损坏的 origin 读成 null 而不是抛错', async () => {
    const { repo, raw } = await setup()
    const origin = { server_instance_id: SRV, canonical_id: 'card_abc', provenance: { link: 'tracked' } }
    const item = await repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('O'), origin })
    expect(item.origin).toEqual(origin)
    raw.prepare('UPDATE items SET origin = ? WHERE local_id = ?').run('{broken', item.localId)
    expect((await repo.getItem(item.localId))?.origin).toBeNull()
  })

  it('删除项连同它（及内嵌书）在所有服务器上的映射，别的项不受影响', async () => {
    const { repo } = await setup()
    const card = await repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('C') })
    const other = await repo.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: {} })
    await repo.recordSync(SRV, [
      { localId: card.localId, canonicalId: 'card_1', stateToken: 't1', syncedRevision: 1 },
      { localId: embeddedBookRef(card.localId), canonicalId: 'import:device:x', stateToken: '3', syncedRevision: 1 },
      { localId: other.localId, canonicalId: 'book_1', stateToken: '1', syncedRevision: 1 },
    ])
    await repo.recordSync('srv-other', [{ localId: card.localId, canonicalId: 'card_9', stateToken: 't', syncedRevision: 1 }])

    expect(await repo.deleteItem(card.localId)).toBe(true)
    expect(await repo.getItem(card.localId)).toBeNull()
    expect((await repo.listLinks(SRV)).map((link) => link.localId)).toEqual([other.localId])
    expect(await repo.listLinks('srv-other')).toEqual([])
    expect(await repo.deleteItem(card.localId)).toBe(false)
  })
})

describe('LocalLibraryRepository：server links', () => {
  it('按 server_instance_id 分开记录映射与同步基线，重复记录是更新', async () => {
    const { repo } = await setup()
    const card = await repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('C') })
    await repo.recordSync(SRV, [{
      localId: card.localId, canonicalId: 'card_1', stateToken: 'sha256:a', syncedRevision: 1,
      syncedDigest: 'd1', baseUrlHint: 'http://192.168.1.5:18000',
    }])
    expect(await repo.getLink(SRV, card.localId)).toMatchObject({
      canonicalId: 'card_1', stateToken: 'sha256:a', syncedRevision: 1, syncedDigest: 'd1',
      baseUrlHint: 'http://192.168.1.5:18000',
    })
    expect(await repo.getLink('srv-other', card.localId)).toBeNull()

    // duplicate 之后映射改指新的 canonical id
    await repo.recordSync(SRV, [{ localId: card.localId, canonicalId: 'card_2', stateToken: 'sha256:b', syncedRevision: 3 }])
    expect(await repo.getLink(SRV, card.localId)).toMatchObject({ canonicalId: 'card_2', syncedRevision: 3 })
    expect(await repo.findByCanonical(SRV, 'card_2')).toMatchObject({ localId: card.localId })
    expect(await repo.findByCanonical(SRV, 'card_1')).toBeNull()
  })

  it('同一服务器上一个 canonical id 只能映射一个本机项：冲突整批回滚', async () => {
    const { repo } = await setup()
    await repo.recordSync(SRV, [{ localId: 'card-a', canonicalId: 'card_1', stateToken: 't', syncedRevision: 1 }])
    const error = await repo.recordSync(SRV, [
      { localId: 'card-b', canonicalId: 'card_2', stateToken: 't', syncedRevision: 1 },
      { localId: 'card-c', canonicalId: 'card_1', stateToken: 't', syncedRevision: 1 },
    ]).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(LocalLibraryError)
    expect((error as LocalLibraryError).code).toBe(SERVER_LINK_CONFLICT)
    // 第一条也没有写进去
    expect((await repo.listLinks(SRV)).map((link) => link.localId)).toEqual(['card-a'])
    // 别的服务器上同名 canonical id 互不影响
    await expect(repo.recordSync('srv-other', [{ localId: 'card-c', canonicalId: 'card_1', stateToken: 't', syncedRevision: 1 }])).resolves.toBeUndefined()
  })

  it('非规范的服务器 id / 本机 id 拒绝写入', async () => {
    const { repo } = await setup()
    await expect(repo.recordSync('bad id', [])).rejects.toMatchObject({ code: 'INVALID_ID' })
    await expect(repo.recordSync(SRV, [{ localId: '../x', canonicalId: 'c', stateToken: '', syncedRevision: 0 }]))
      .rejects.toMatchObject({ code: 'INVALID_ID' })
  })

  it('removeLink 只删这台服务器的映射', async () => {
    const { repo } = await setup()
    await repo.recordSync(SRV, [{ localId: 'card-a', canonicalId: 'c1', stateToken: '', syncedRevision: 1 }])
    await repo.recordSync('srv-other', [{ localId: 'card-a', canonicalId: 'c1', stateToken: '', syncedRevision: 1 }])
    expect(await repo.removeLink(SRV, 'card-a')).toBe(true)
    expect(await repo.getLink(SRV, 'card-a')).toBeNull()
    expect(await repo.getLink('srv-other', 'card-a')).not.toBeNull()
  })
})

describe('LocalLibraryRepository：规则缓存与并发', () => {
  it('规则缓存按服务器地址分槽，可覆盖更新', async () => {
    const { repo } = await setup()
    expect(await repo.getRuleCache('http://a:18000', '')).toBeNull()
    await repo.putRuleCache('http://a:18000', '', { rules: [{ rule_id: 'coc7' }] })
    await repo.putRuleCache('http://a:18000', 'coc7', { attributes: ['str'] })
    await repo.putRuleCache('http://a:18000', 'coc7', { attributes: ['str', 'dex'] })
    expect(await repo.getRuleCache('http://a:18000', 'coc7')).toMatchObject({ payload: { attributes: ['str', 'dex'] } })
    expect(await repo.getRuleCache('http://b:18000', 'coc7')).toBeNull()
    await expect(repo.putRuleCache('', 'coc7', {})).rejects.toMatchObject({ code: 'INVALID_ID' })
  })

  it('并发调用按序执行：事务不会被别的语句插队', async () => {
    const { repo } = await setup()
    const card = await repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('C') })
    await Promise.all([
      repo.recordSync(SRV, [{ localId: card.localId, canonicalId: 'c1', stateToken: '1', syncedRevision: 1 }]),
      repo.updateDocument(card.localId, { document: cardDoc('C2') }),
      repo.deleteItem('card-none'),
      repo.recordSync(SRV, [{ localId: card.localId, canonicalId: 'c1', stateToken: '2', syncedRevision: 2 }]),
    ])
    expect(await repo.getLink(SRV, card.localId)).toMatchObject({ stateToken: '2', syncedRevision: 2 })
    expect((await repo.getItem(card.localId))?.revision).toBe(2)
  })

  it('SerialQueue：前一个任务失败不阻塞后续任务', async () => {
    const queue = new SerialQueue()
    const order: string[] = []
    const failing = queue.run(async () => { order.push('a'); throw new Error('boom') })
    const next = queue.run(async () => { order.push('b'); return 'ok' })
    await expect(failing).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
    expect(order).toEqual(['a', 'b'])
  })
})

describe('同步状态推导', () => {
  it('按服务器基线判断：未映射 / 已同步 / 本机改过；只读项永不推送', () => {
    expect(syncStatusOf({ revision: 1 }, null)).toBe('local-only')
    expect(syncStatusOf({ revision: 3 }, { syncedRevision: 3 })).toBe('synced')
    expect(syncStatusOf({ revision: 4 }, { syncedRevision: 3 })).toBe('modified')
    expect(needsPush({ revision: 1, readOnly: false }, null)).toBe(true)
    expect(needsPush({ revision: 3, readOnly: false }, { syncedRevision: 3 })).toBe(false)
    expect(needsPush({ revision: 4, readOnly: true }, { syncedRevision: 3 })).toBe(false)
  })
})
