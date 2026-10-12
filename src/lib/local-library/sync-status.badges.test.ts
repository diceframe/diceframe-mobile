import { describe, expect, it } from 'vitest'

import { openTestLibraryDb } from '@/test/library-db'
import { migrateLibrary } from './migrate'
import { LocalLibraryRepository } from './repository'
import { localItemBadges } from './sync-status'

function sequence() {
  let n = 0
  return () => `00000000-${String(++n).padStart(4, '0')}-4000-8000-000000000000`
}

describe('本机列表状态标记（只看本机映射）', () => {
  it('未推送改动 / 服务器已删除 / 服务器锁定，跨服务器汇总；内嵌书映射不算在卡上', async () => {
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
    const links = library.listAllLinks()
    expect(links.map((link) => link.serverInstanceId).sort()).toEqual(['srv-a', 'srv-a', 'srv-a', 'srv-b'])
    const badgesOf = (id: string) => localItemBadges(library.listItems().find((item) => item.localId === id)!, links)
    expect(badgesOf(plain.localId)).toEqual([])
    expect(badgesOf(edited.localId)).toEqual(['unpushed'])
    expect(badgesOf(gone.localId)).toEqual(['server-deleted'])
    expect(badgesOf(locked.localId)).toEqual(['locked'])
    // 卡的 .book 映射被标为已删除不算到卡上
    expect(localItemBadges({ localId: 'card-1', revision: 1, readOnly: false, origin: null }, [
      { localId: 'card-1.book', syncedRevision: 1, remoteDeletedAt: 'x' },
    ])).toEqual([])
  })
})
