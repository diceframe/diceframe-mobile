import { describe, expect, it } from 'vitest'

import { migrateLibrary } from '@/lib/local-library/migrate'
import { LocalLibraryRepository } from '@/lib/local-library/repository'
import { fixtures } from '@/lib/portable/__fixtures__/content-sync'
import { openTestLibraryDb } from '@/test/library-db'

import type { ServerItemRef, ServerItemSource } from './pull-session'
import { isSelectable, pullListRows, pullProgress } from './pull-view'

const SRV = 'srv-0123456789abcdef'

function sequence() {
  let n = 0
  return () => `00000000-${String(++n).padStart(4, '0')}-4000-8000-000000000000`
}

/** 假列举来源：按 kind 过滤，带 state_token（与 /status 同值） */
function fakeSource(refs: ServerItemRef[]): ServerItemSource {
  return { list: async (kind) => refs.filter((ref) => ref.kind === kind) }
}

async function setup() {
  const { db } = openTestLibraryDb()
  await migrateLibrary(db)
  return new LocalLibraryRepository(db, { uuid: sequence() })
}

describe('拉取选择列表', () => {
  it('每个服务器项相对本机的状态：新、已同步、服务器改过、本机改过、两边都改、内嵌书', async () => {
    const library = await setup()
    const link = (canonicalId: string, token: string, edit = false) => {
      const item = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: fixtures.lorebook, name: canonicalId })
      library.recordSync(SRV, [{ localId: item.localId, canonicalId, stateToken: token, syncedRevision: 1 }])
      if (edit) library.updateDocument(item.localId, { document: fixtures.lorebook })
      return item.localId
    }
    link('b_sync', 't1')
    link('b_server', 't1')
    link('b_local', 't1', true)
    link('b_both', 't1', true)
    const card = library.createItem({ kind: 'character_template', format: 'chara_card_v3', document: fixtures.cardWithBook, name: 'c' })
    library.recordSync(SRV, [{ localId: `${card.localId}.book`, canonicalId: 'b_embedded', stateToken: 't1', syncedRevision: 1 }])
    const source = fakeSource([
      { kind: 'lorebook', canonicalId: 'b_new', stateToken: 't1' },
      { kind: 'lorebook', canonicalId: 'b_sync', stateToken: 't1' },
      { kind: 'lorebook', canonicalId: 'b_server', stateToken: 't2' },
      { kind: 'lorebook', canonicalId: 'b_local', stateToken: 't1' },
      { kind: 'lorebook', canonicalId: 'b_both', stateToken: 't2' },
      { kind: 'lorebook', canonicalId: 'b_embedded', stateToken: 't1' },
      { kind: 'character_template', canonicalId: 'card_x', stateToken: 't1' },
    ])
    const rows = pullListRows(await source.list('lorebook'), library, SRV)
    expect(rows.map((row) => [row.ref.canonicalId, row.state])).toEqual([
      ['b_new', 'new'], ['b_sync', 'in-sync'], ['b_server', 'server-changed'],
      ['b_local', 'local-changes'], ['b_both', 'both-changed'], ['b_embedded', 'embedded'],
    ])
    expect(rows.find((row) => row.state === 'embedded')!.localId).toBe(card.localId)
    expect(rows.filter(isSelectable).map((row) => row.ref.canonicalId)).not.toContain('b_embedded')
  })

  it('列举没带 state_token：只按本机 revision 判断', async () => {
    const library = await setup()
    const item = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: fixtures.lorebook, name: 'b' })
    library.recordSync(SRV, [{ localId: item.localId, canonicalId: 'b_1', stateToken: 't1', syncedRevision: 1 }])
    expect(pullListRows([{ kind: 'lorebook', canonicalId: 'b_1' }], library, SRV)[0].state).toBe('in-sync')
  })

  it('进度按已出结果的项计', () => {
    expect(pullProgress([{ status: 'created' }, { status: 'pending' }, { status: 'unchanged' }])).toEqual({ done: 2, total: 3 })
  })
})
