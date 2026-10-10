import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { openTestLibraryDb } from '@/test/library-db'
import { embeddedBookRef, ensureInstallId, isCanonicalId, newLocalId } from './ids'
import { LocalLibrarySchemaError, MIGRATIONS_TABLE, appliedMigrations, migrateLibrary } from './migrate'
import bundledMigrations from './migrations/migrations'
import {
  LOCAL_ITEM_NOT_FOUND,
  LOCAL_ITEM_READ_ONLY,
  LocalLibraryError,
  LocalLibraryRepository,
  SERVER_LINK_CONFLICT,
} from './repository'
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
  const { db, raw } = openTestLibraryDb()
  await migrateLibrary(db)
  const repo = new LocalLibraryRepository(db, { uuid: sequence('00000000'), now: clock() })
  return { db, raw, repo }
}

function tableNames(raw: ReturnType<typeof openTestLibraryDb>['raw']): string[] {
  return (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[])
    .map((row) => row.name)
}

/** 直接插入指定 id 的本机项（映射测试只关心 id，不关心内容） */
function seedItems(raw: ReturnType<typeof openTestLibraryDb>['raw'], ids: string[]) {
  const now = new Date().toISOString()
  for (const id of ids) {
    raw.prepare(`INSERT INTO items (local_id, kind, format, document, created_at, updated_at)
      VALUES (?, 'character_template', 'chara_card_v3', '{}', ?, ?)`).run(id, now, now)
  }
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

  it('ensureInstallId：合法就沿用，缺失或被破坏才生成', () => {
    let calls = 0
    const uuid = () => { calls += 1; return 'F0F0F0F0-0000-4000-8000-000000000001' }
    expect(ensureInstallId('kept-id', uuid)).toBe('kept-id')
    expect(calls).toBe(0)
    expect(ensureInstallId(undefined, uuid)).toBe('f0f0f0f0-0000-4000-8000-000000000001')
    expect(ensureInstallId('bad id!', uuid)).toBe('f0f0f0f0-0000-4000-8000-000000000001')
    expect(() => ensureInstallId('', () => 'not ok')).toThrow()
  })
})

describe('Drizzle 迁移（随包的 migrations.js）', () => {
  it('空库迁到最新结构：建出全部表，记录全部随包迁移', async () => {
    const { db, raw } = openTestLibraryDb()
    expect(appliedMigrations(db)).toEqual([])
    await migrateLibrary(db)
    expect(tableNames(raw)).toEqual([MIGRATIONS_TABLE, 'items', 'meta', 'rule_cache', 'server_links'])
    expect(appliedMigrations(db)).toEqual(bundledMigrations.journal.entries.map((entry) => entry.when))
  })

  it('重新打开（再次迁移）是空操作，数据原样保留', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'df-lib-')), 'library.db')
    const first = openTestLibraryDb(file)
    await migrateLibrary(first.db)
    const repo = new LocalLibraryRepository(first.db, { uuid: sequence('11111111') })
    const item = repo.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: { keep: 1 } })
    first.raw.close()

    const second = openTestLibraryDb(file)
    await migrateLibrary(second.db)
    expect(appliedMigrations(second.db)).toHaveLength(bundledMigrations.journal.entries.length)
    expect(new LocalLibraryRepository(second.db, { uuid: sequence('2') }).getItem(item.localId)?.document).toEqual({ keep: 1 })
    second.raw.close()
  })

  it('库里有本 App 不认识的迁移（更新版本写的库）：拒绝打开，且不改动数据库', async () => {
    const { db, raw } = await setup()
    const future = Math.max(...bundledMigrations.journal.entries.map((entry) => entry.when)) + 1000
    raw.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES ('', ?)`).run(future)
    raw.exec('CREATE TABLE future_table (x INTEGER)')
    const before = tableNames(raw)

    const error = await migrateLibrary(db).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(LocalLibrarySchemaError)
    expect((error as LocalLibrarySchemaError).unknownMigrations).toEqual([future])
    expect(tableNames(raw)).toEqual(before)
    expect(appliedMigrations(db)).toContain(future)
  })

  it('迁移后每条随包迁移都必须已应用：并行分支带来的「时间戳更早」的迁移被跳过时拒绝打开', async () => {
    const { db } = openTestLibraryDb()
    const [init] = bundledMigrations.journal.entries
    const onlyInit = { journal: { entries: [init] }, migrations: { m0000: bundledMigrations.migrations.m0000 } }
    await migrateLibrary(db, onlyInit)
    // 另一条分支合进来的迁移，时间戳比已应用的 init 还早：Drizzle 迁移器会静默跳过它
    const older = { idx: 1, when: init.when - 1000, tag: '0001_parallel', breakpoints: true }
    const withOlder = {
      journal: { entries: [init, older] },
      migrations: { ...onlyInit.migrations, m0001: 'CREATE TABLE parallel_branch (x INTEGER);' },
    }
    const error = await migrateLibrary(db, withOlder).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(LocalLibrarySchemaError)
    expect((error as LocalLibrarySchemaError).message).toMatch(/not applied/)
  })

  it('打开一个从未建过表的库时，新库保护本身不建任何表', () => {
    const { db, raw } = openTestLibraryDb()
    expect(appliedMigrations(db)).toEqual([])
    expect(tableNames(raw)).toEqual([])
  })
})

describe('LocalLibraryRepository：items', () => {
  it('新建项从 revision 1 开始，文档原文（含未知字段）原样保存', async () => {
    const { repo } = await setup()
    const item = repo.createItem({
      kind: 'character_template', format: 'chara_card_v3', document: cardDoc('Mira'), name: 'Mira', ruleId: 'coc7',
    })
    expect(item.localId).toBe('card-00000000-0001-4000-8000-000000000000')
    expect(item).toMatchObject({ revision: 1, readOnly: false, name: 'Mira', ruleId: 'coc7', origin: null })
    expect(item.document).toEqual(cardDoc('Mira'))
    expect(repo.getItem(item.localId)).toEqual(item)
    expect(repo.getItem('card-missing')).toBeNull()
  })

  it('列表不带文档、按更新时间倒序，可按类型过滤', async () => {
    const { repo } = await setup()
    const a = repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('A'), name: 'A' })
    const b = repo.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: { spec: 'lorebook_v3' }, name: 'B' })
    repo.updateDocument(a.localId, { document: cardDoc('A2'), name: 'A2' })
    const all = repo.listItems()
    expect(all.map((item) => item.localId)).toEqual([a.localId, b.localId])
    expect(all[0]).not.toHaveProperty('document')
    expect(repo.listItems({ kind: 'lorebook' }).map((item) => item.localId)).toEqual([b.localId])
  })

  it('本地编辑 revision +1；只读项与不存在的项拒绝编辑', async () => {
    const { repo } = await setup()
    const item = repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('A') })
    const edited = repo.updateDocument(item.localId, { document: cardDoc('B'), name: 'B' })
    expect(edited.revision).toBe(2)
    expect(edited.document).toEqual(cardDoc('B'))

    const dnd = repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('D'), readOnly: true })
    expect(() => repo.updateDocument(dnd.localId, { document: cardDoc('X') })).toThrow(expect.objectContaining({ code: LOCAL_ITEM_READ_ONLY }))
    expect(repo.getItem(dnd.localId)?.revision).toBe(1)
    expect(() => repo.updateDocument('card-none', { document: {} })).toThrow(expect.objectContaining({ code: LOCAL_ITEM_NOT_FOUND }))
  })

  it('origin 记录拉取来源；损坏的 origin 读成 null 而不是抛错', async () => {
    const { repo, raw } = await setup()
    const origin = { server_instance_id: SRV, canonical_id: 'card_abc', provenance: { link: 'tracked' } }
    const item = repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('O'), origin })
    expect(item.origin).toEqual(origin)
    raw.prepare('UPDATE items SET origin = ? WHERE local_id = ?').run('{broken', item.localId)
    expect(repo.getItem(item.localId)?.origin).toBeNull()
  })

  it('删除项连同它（及内嵌书）在所有服务器上的映射，别的项不受影响', async () => {
    const { repo } = await setup()
    const card = repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('C') })
    const other = repo.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: {} })
    repo.recordSync(SRV, [
      { localId: card.localId, canonicalId: 'card_1', stateToken: 't1', syncedRevision: 1 },
      { localId: embeddedBookRef(card.localId), canonicalId: 'import:device:x', stateToken: '3', syncedRevision: 1 },
      { localId: other.localId, canonicalId: 'book_1', stateToken: '1', syncedRevision: 1 },
    ])
    repo.recordSync('srv-other', [{ localId: card.localId, canonicalId: 'card_9', stateToken: 't', syncedRevision: 1 }])

    expect(repo.deleteItem(card.localId)).toBe(true)
    expect(repo.getItem(card.localId)).toBeNull()
    expect(repo.listLinks(SRV).map((link) => link.localId)).toEqual([other.localId])
    expect(repo.listLinks('srv-other')).toEqual([])
    expect(repo.deleteItem(card.localId)).toBe(false)
  })
})

describe('LocalLibraryRepository：server links', () => {
  it('按 server_instance_id 分开记录映射与同步基线，重复记录是更新', async () => {
    const { repo } = await setup()
    const card = repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('C') })
    repo.recordSync(SRV, [{
      localId: card.localId, canonicalId: 'card_1', stateToken: 'sha256:a', syncedRevision: 1,
      syncedDigest: 'd1', baseUrlHint: 'http://192.168.1.5:18000',
    }])
    expect(repo.getLink(SRV, card.localId)).toMatchObject({
      canonicalId: 'card_1', stateToken: 'sha256:a', syncedRevision: 1, syncedDigest: 'd1',
      baseUrlHint: 'http://192.168.1.5:18000',
    })
    expect(repo.getLink('srv-other', card.localId)).toBeNull()

    // duplicate 之后映射改指新的 canonical id
    repo.recordSync(SRV, [{ localId: card.localId, canonicalId: 'card_2', stateToken: 'sha256:b', syncedRevision: 3 }])
    expect(repo.getLink(SRV, card.localId)).toMatchObject({ canonicalId: 'card_2', syncedRevision: 3 })
    expect(repo.findByCanonical(SRV, 'card_2')).toMatchObject({ localId: card.localId })
    expect(repo.findByCanonical(SRV, 'card_1')).toBeNull()
  })

  it('同一服务器上一个 canonical id 只能映射一个仍存在的本机项：冲突整批回滚', async () => {
    const { repo, raw } = await setup()
    seedItems(raw, ['card-a', 'card-b', 'card-c'])
    repo.recordSync(SRV, [{ localId: 'card-a', canonicalId: 'card_1', stateToken: 't', syncedRevision: 1 }])
    let error: unknown
    try {
      repo.recordSync(SRV, [
        { localId: 'card-b', canonicalId: 'card_2', stateToken: 't', syncedRevision: 1 },
        { localId: 'card-c', canonicalId: 'card_1', stateToken: 't', syncedRevision: 1 },
      ])
    } catch (cause) {
      error = cause
    }
    expect(error).toBeInstanceOf(LocalLibraryError)
    expect((error as LocalLibraryError).code).toBe(SERVER_LINK_CONFLICT)
    // 第一条也没有写进去
    expect(repo.listLinks(SRV).map((link) => link.localId)).toEqual(['card-a'])
    // 别的服务器上同名 canonical id 互不影响
    expect(repo.recordSync('srv-other', [{ localId: 'card-c', canonicalId: 'card_1', stateToken: 't', syncedRevision: 1 }]))
      .toEqual({ skipped: [] })
  })

  it('非规范的服务器 id / 本机 id 拒绝写入', async () => {
    const { repo } = await setup()
    expect(() => repo.recordSync('bad id', [])).toThrow(expect.objectContaining({ code: 'INVALID_ID' }))
    expect(() => repo.recordSync(SRV, [{ localId: '../x', canonicalId: 'c', stateToken: '', syncedRevision: 0 }]))
      .toThrow(expect.objectContaining({ code: 'INVALID_ID' }))
  })

  it('removeLink 只删这台服务器的映射', async () => {
    const { repo, raw } = await setup()
    seedItems(raw, ['card-a'])
    repo.recordSync(SRV, [{ localId: 'card-a', canonicalId: 'c1', stateToken: '', syncedRevision: 1 }])
    repo.recordSync('srv-other', [{ localId: 'card-a', canonicalId: 'c1', stateToken: '', syncedRevision: 1 }])
    expect(repo.removeLink(SRV, 'card-a')).toBe(true)
    expect(repo.getLink(SRV, 'card-a')).toBeNull()
    expect(repo.getLink('srv-other', 'card-a')).not.toBeNull()
  })

  it('推送途中被删除的项（或内嵌书的父卡）不写孤儿映射，其余照常写入', async () => {
    const { repo } = await setup()
    const kept = repo.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: {} })
    const gone = repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('G') })
    repo.deleteItem(gone.localId)
    const result = repo.recordSync(SRV, [
      { localId: gone.localId, canonicalId: 'card_gone', stateToken: 't', syncedRevision: 1 },
      { localId: embeddedBookRef(gone.localId), canonicalId: 'book_gone', stateToken: '1', syncedRevision: 1 },
      { localId: kept.localId, canonicalId: 'book_kept', stateToken: '1', syncedRevision: 1 },
    ])
    expect(result.skipped).toEqual([gone.localId, embeddedBookRef(gone.localId)])
    expect(repo.listLinks(SRV).map((link) => link.localId)).toEqual([kept.localId])
  })

  it('已有的孤儿映射占着 canonical id 时被清掉，之后的拉取/推送不再永久冲突', async () => {
    const { repo, raw } = await setup()
    raw.prepare(`INSERT INTO server_links (server_instance_id, local_id, canonical_id, state_token, synced_revision,
      synced_digest, base_url_hint, updated_at) VALUES (?, 'card-orphan', 'card_1', 't', 1, '', '', ?)`).run(SRV, new Date().toISOString())
    const item = repo.createItem({ kind: 'character_template', format: 'chara_card_v3', document: cardDoc('N') })
    repo.recordSync(SRV, [{ localId: item.localId, canonicalId: 'card_1', stateToken: 't2', syncedRevision: 1 }])
    expect(repo.findByCanonical(SRV, 'card_1')).toMatchObject({ localId: item.localId })
    expect(repo.getLink(SRV, 'card-orphan')).toBeNull()
  })
})

describe('LocalLibraryRepository：规则缓存', () => {
  it('规则缓存按服务器地址分槽，可覆盖更新', async () => {
    const { repo } = await setup()
    expect(repo.getRuleCache('http://a:18000', '')).toBeNull()
    repo.putRuleCache('http://a:18000', '', { rules: [{ rule_id: 'coc7' }] })
    repo.putRuleCache('http://a:18000', 'coc7', { attributes: ['str'] })
    repo.putRuleCache('http://a:18000', 'coc7', { attributes: ['str', 'dex'] })
    expect(repo.getRuleCache('http://a:18000', 'coc7')).toMatchObject({ payload: { attributes: ['str', 'dex'] } })
    expect(repo.getRuleCache('http://b:18000', 'coc7')).toBeNull()
    expect(() => repo.putRuleCache('', 'coc7', {})).toThrow(expect.objectContaining({ code: 'INVALID_ID' }))
  })
})

describe('install id 与内容库同生共死（meta 表）', () => {
  it('存在同一个 SQLite 文件里：settings 缓存丢失、换新仓储实例都拿回同一个', async () => {
    const { db } = await setup()
    const first = new LocalLibraryRepository(db, { uuid: () => 'AAAAAAAA-0000-4000-8000-000000000001' })
    const id = first.ensureInstallId('')
    expect(id).toBe('aaaaaaaa-0000-4000-8000-000000000001')
    const second = new LocalLibraryRepository(db, { uuid: () => 'bbbbbbbb-0000-4000-8000-000000000002' })
    expect(second.ensureInstallId('')).toBe(id)
    expect(second.ensureInstallId('cccccccc-0000-4000-8000-000000000003')).toBe(id)
  })

  it('库里还没有时，一次性收编 settings 里已有的合法 install id', async () => {
    const { repo } = await setup()
    expect(repo.ensureInstallId('legacy-settings-id')).toBe('legacy-settings-id')
    expect(repo.ensureInstallId('')).toBe('legacy-settings-id')
  })

  it('meta 里的值被破坏时重新生成并落库', async () => {
    const { repo, raw } = await setup()
    const id = repo.ensureInstallId('')
    raw.prepare("UPDATE meta SET value = 'bad id!' WHERE key = 'install_id'").run()
    const fresh = repo.ensureInstallId('')
    expect(fresh).not.toBe(id)
    expect(isCanonicalId(fresh)).toBe(true)
    expect(repo.ensureInstallId('')).toBe(fresh)
  })
})

describe('事务：同步、不可重入', () => {
  it('写事务里再调用仓储写方法直接拒绝，外层事务完整回滚而不是被内层破坏', async () => {
    const { db, raw } = await setup()
    let repo!: LocalLibraryRepository
    const uuid = sequence('22222222')
    repo = new LocalLibraryRepository(db, {
      uuid: () => {
        // createItem 的事务里取 uuid 时重入另一个写方法
        repo.putRuleCache('s', 'r', {})
        return uuid()
      },
    })
    expect(() => repo.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: {} })).toThrow(/re-entrant/)
    expect(raw.prepare('SELECT count(*) AS n FROM items').get()).toEqual({ n: 0 })
    expect(raw.prepare('SELECT count(*) AS n FROM rule_cache').get()).toEqual({ n: 0 })
    // 之后仓储照常可用（重入标记已复位）
    expect(new LocalLibraryRepository(db, { uuid }).createItem({ kind: 'lorebook', format: 'lorebook_v3', document: {} }).revision).toBe(1)
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
