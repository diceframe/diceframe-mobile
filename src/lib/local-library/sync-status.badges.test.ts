import { describe, expect, it } from 'vitest'

import { openTestLibraryDb } from '@/test/library-db'
import { migrateLibrary } from './migrate'
import { LocalLibraryRepository } from './repository'
import { uniqueCopyName } from './copy-name'
import { groupLinksByLocalId, localItemBadges } from './sync-status'

function sequence() {
  let n = 0
  return () => `00000000-${String(++n).padStart(4, '0')}-4000-8000-000000000000`
}

describe('本机列表状态标记（只看本机映射）', () => {
  it('未推送改动 / 服务器已删除 / 服务器锁定，跨服务器汇总', async () => {
    const { db } = openTestLibraryDb()
    await migrateLibrary(db)
    const library = new LocalLibraryRepository(db, { uuid: sequence() })
    const doc = { spec: 'lorebook_v3', data: { lorebook: { name: 'b', entries: [] } } }
    const plain = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: doc, name: 'plain' })
    const edited = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: doc, name: 'edited' })
    const gone = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: doc, name: 'gone' })
    const locked = library.createItem({
      kind: 'lorebook', format: 'lorebook_v3', document: doc, name: 'locked', readOnly: true,
      origin: { server_instance_id: 'srv-a', canonical_id: 'book_l', locked_reason: 'PLUGIN_BOOK' },
    })
    library.recordSync('srv-a', [
      { localId: edited.localId, canonicalId: 'book_e', stateToken: 't', syncedRevision: 1 },
      { localId: gone.localId, canonicalId: 'book_g', stateToken: 't', syncedRevision: 1 },
      { localId: locked.localId, canonicalId: 'book_l', stateToken: 't', syncedRevision: 1 },
    ])
    library.recordSync('srv-b', [{ localId: plain.localId, canonicalId: 'book_p', stateToken: 't', syncedRevision: 1 }])
    library.updateDocument(edited.localId, { document: doc })
    library.markRemoteDeleted('srv-a', [gone.localId])
    const links = groupLinksByLocalId(library.listAllLinks())
    expect(library.listAllLinks().map((link) => link.serverInstanceId).sort()).toEqual(['srv-a', 'srv-a', 'srv-a', 'srv-b'])
    const badgesOf = (id: string) => localItemBadges(library.listItems().find((item) => item.localId === id)!, links)
    expect(badgesOf(plain.localId)).toEqual([])
    expect(badgesOf(edited.localId)).toEqual(['unpushed'])
    expect(badgesOf(gone.localId)).toEqual(['server-deleted'])
    expect(badgesOf(locked.localId)).toEqual(['locked'])
  })
})

describe('M7 后续：状态标记按本机 id 预先分组；卡的内嵌书在服务器上被删也标在卡上', () => {
  it('内嵌书（.book 映射）被标为已删除：卡显示「服务器上已删除」', () => {
    const grouped = groupLinksByLocalId([
      { localId: 'card-1', syncedRevision: 1, remoteDeletedAt: null },
      { localId: 'card-1.book', syncedRevision: 1, remoteDeletedAt: '2026-10-12T00:00:00Z' },
      { localId: 'card-2', syncedRevision: 1, remoteDeletedAt: null },
    ])
    expect(localItemBadges({ localId: 'card-1', revision: 1, readOnly: false, origin: null }, grouped)).toEqual(['server-deleted'])
    expect(localItemBadges({ localId: 'card-2', revision: 2, readOnly: false, origin: null }, grouped)).toEqual(['unpushed'])
    expect(localItemBadges({ localId: 'card-3', revision: 2, readOnly: false, origin: null }, grouped)).toEqual([])
  })

  it('分组一次：每个本机 id 只取自己的映射与内嵌书映射', () => {
    const grouped = groupLinksByLocalId([
      { localId: 'a', syncedRevision: 1, remoteDeletedAt: null },
      { localId: 'a.book', syncedRevision: 1, remoteDeletedAt: null },
      { localId: 'a', syncedRevision: 2, remoteDeletedAt: null },
    ])
    expect(grouped.get('a')).toHaveLength(2)
    expect(grouped.get('a.book')).toHaveLength(1)
    expect(grouped.get('b')).toBeUndefined()
  })
})

describe('副本名', () => {
  it('找第一个没被占用的名字', () => {
    const suffix = (n: number) => (n === 1 ? '（副本）' : `（副本 ${n}）`)
    expect(uniqueCopyName('A', new Set(), suffix)).toBe('A（副本）')
    expect(uniqueCopyName('A', new Set(['A（副本）', 'A（副本 2）']), suffix)).toBe('A（副本 3）')
  })
})
