import { describe, expect, it } from 'vitest'

import { openTestLibraryDb } from '@/test/library-db'
import { fixtures } from '@/lib/portable/__fixtures__/content-sync'
import { cloneJson } from '@/lib/portable/json'
import { readLorebookV3, writeLorebookV3, type LorebookEntry } from '@/lib/portable/lorebook-v3'

import { INVALID_INTEGER, entryEditOf, entryFormOf, entryRows, hasEdits, newEntryEditOf, splitKeys } from './lorebook-edit'
import {
  createLocalLorebook,
  deleteLocalLorebookEntry,
  duplicateLocalLorebook,
  openLocalLorebook,
  renameLocalLorebook,
  saveLocalLorebookEntry,
} from './lorebook-library'
import { migrateLibrary } from './migrate'
import { LocalLibraryRepository } from './repository'

function sequence(prefix = '00000000') {
  let n = 0
  return () => `${prefix}-${String(++n).padStart(4, '0')}-4000-8000-000000000000`
}

async function setup() {
  const { db } = openTestLibraryDb()
  await migrateLibrary(db)
  return new LocalLibraryRepository(db, { uuid: sequence() })
}

/** 带未知字段的书：书级 / 条目级都有服务端认识但界面不编辑的字段与扩展 */
function richDocument() {
  const doc = cloneJson(fixtures.lorebook) as unknown as { data: { lorebook: { entries: LorebookEntry[] } & Record<string, unknown> } } & Record<string, unknown>
  doc.data.lorebook.extensions = { diceframe: { world_id: 'w1' } }
  doc.data.lorebook.entries[0].extensions = { diceframe: { tier: 'core', visible_to: ['*'] }, other_tool: { x: 1 } }
  doc.data.lorebook.entries[0].unknown_field = 'keep me'
  doc.extra_root = { keep: true }
  return doc
}

describe('条目表单 ↔ 补丁', () => {
  const entry = readLorebookV3(fixtures.lorebook).entries[0]

  it('没改任何东西：补丁为空', () => {
    const snapshot = entryFormOf(entry)
    expect(entryEditOf(snapshot, { ...snapshot })).toEqual({})
    expect(hasEdits(entryEditOf(snapshot, { ...snapshot }))).toBe(false)
  })

  it('只改内容：补丁只含 content', () => {
    const snapshot = entryFormOf(entry)
    expect(entryEditOf(snapshot, { ...snapshot, content: 'new' })).toEqual({ content: 'new' })
  })

  it('关键词只改了分隔与空白：不算改动；真改了才写回', () => {
    const snapshot = entryFormOf({ id: 'e', keys: ['a', 'b'] })
    expect(entryEditOf(snapshot, { ...snapshot, keysText: 'a，b\n' })).toEqual({})
    expect(entryEditOf(snapshot, { ...snapshot, keysText: 'a, c' })).toEqual({ keys: ['a', 'c'] })
    expect(splitKeys('x、y,\nz')).toEqual(['x', 'y', 'z'])
  })

  it('整数字段：改了才写，非整数报错，清空保持原值', () => {
    const snapshot = entryFormOf({ id: 'e', insertion_order: 5, priority: 2 })
    expect(snapshot.insertionOrder).toBe('5')
    expect(entryEditOf(snapshot, { ...snapshot, insertionOrder: '-3' })).toEqual({ insertion_order: -3 })
    expect(entryEditOf(snapshot, { ...snapshot, priority: '' })).toEqual({})
    expect(() => entryEditOf(snapshot, { ...snapshot, priority: '1.5' })).toThrow(expect.objectContaining({ code: INVALID_INTEGER }))
  })

  it('新条目：表单值全写，默认启用', () => {
    const edit = newEntryEditOf({ ...entryFormOf(null), name: ' N ', keysText: 'k1, k2', content: 'c', constant: true, priority: '4' })
    expect(edit).toEqual({ name: 'N', keys: ['k1', 'k2'], content: 'c', enabled: true, constant: true, priority: 4 })
  })

  it('行 key 用稳定条目 id', () => {
    expect(entryRows(readLorebookV3(fixtures.lorebook)).map((row) => row.key)).toEqual(['town-cinder', 'keep-ash', 'lore-basics'])
  })
})

describe('本机 Lorebook 库操作', () => {
  it('编辑器往返：只改一个字段，其余字段（含未知字段、书级设置、文档外层）原样保留', async () => {
    const library = await setup()
    const item = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: richDocument(), name: 'b' })
    const { book } = openLocalLorebook(library, item.localId, sequence('11111111'))
    const target = book.entries[0]
    const snapshot = entryFormOf(target)
    saveLocalLorebookEntry(library, item.localId, 'town-cinder', entryEditOf(snapshot, { ...snapshot, content: 'edited' }), sequence())
    const saved = library.getItem(item.localId)!.document as ReturnType<typeof richDocument>
    const expected = richDocument()
    expected.data.lorebook.entries[0].content = 'edited'
    expect(saved).toEqual(expected)
    // 不改就保存：文档不变（补丁为空时界面不写；即便写，结果也相同）
    saveLocalLorebookEntry(library, item.localId, 'keep-ash', entryEditOf(entryFormOf(book.entries[1]), entryFormOf(book.entries[1])), sequence())
    expect(library.getItem(item.localId)!.document).toEqual(expected)
    // 激活设置（服务端 schema 接受的整数 / 布尔字段）同样只写改过的
    const ash = entryFormOf(book.entries[1])
    saveLocalLorebookEntry(library, item.localId, 'keep-ash', entryEditOf(ash, { ...ash, priority: '7', insertionOrder: '3', constant: true }), sequence())
    const ashSaved = readLorebookV3(library.getItem(item.localId)!.document).entries[1]
    expect(ashSaved).toEqual({ ...expected.data.lorebook.entries[1], priority: 7, insertion_order: 3, constant: true })
    // 清空整数框 = 不改：存着的值原样保留（不写 0、不删字段）
    const cleared = entryFormOf(ashSaved)
    saveLocalLorebookEntry(library, item.localId, 'keep-ash', entryEditOf(cleared, { ...cleared, priority: '', insertionOrder: ' ' }), sequence())
    expect(readLorebookV3(library.getItem(item.localId)!.document).entries[1]).toMatchObject({ priority: 7, insertion_order: 3 })
  })

  it('新建、删除条目按 id；重命名保留书级设置；复制得到没有来源的新书', async () => {
    const library = await setup()
    const item = library.createItem({
      kind: 'lorebook', format: 'lorebook_v3', document: richDocument(), name: 'b',
      origin: { server_instance_id: 'srv-0123456789abcdef', canonical_id: 'book_1' },
    })
    const entryId = saveLocalLorebookEntry(library, item.localId, '', newEntryEditOf({ ...entryFormOf(null), content: 'x' }), sequence('22222222'))
    expect(entryId).toMatch(/^entry-/)
    deleteLocalLorebookEntry(library, item.localId, 'keep-ash')
    const renamed = renameLocalLorebook(library, item.localId, { name: ' Renamed ' })
    expect(renamed.name).toBe('Renamed')
    const book = readLorebookV3(renamed.document)
    expect(book.entries.map((entry) => entry.id)).toEqual(['town-cinder', 'lore-basics', entryId])
    expect(book.scan_depth).toBe(readLorebookV3(fixtures.lorebook).scan_depth)
    expect(book.extensions).toEqual({ diceframe: { world_id: 'w1' } })
    const copy = duplicateLocalLorebook(library, item.localId, 'Renamed (copy)')
    expect(copy.localId).not.toBe(item.localId)
    expect(copy.origin).toBeNull()
    expect(copy.name).toBe('Renamed (copy)')
    expect(readLorebookV3(copy.document).entries).toEqual(book.entries)
    const created = createLocalLorebook(library, ' New ')
    expect(created.name).toBe('New')
    expect(readLorebookV3(created.document).entries).toEqual([])
  })

  it('ensureEntryIds：打开缺 id 的书时补齐并存回，再次打开 id 不变、不再写', async () => {
    const library = await setup()
    const legacy = readLorebookV3(fixtures.lorebook)
    delete legacy.entries[0].id
    legacy.entries[1] = { ...legacy.entries[1], uid: 9 }
    delete legacy.entries[1].id
    const item = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: writeLorebookV3(legacy), name: 'old' })
    const first = openLocalLorebook(library, item.localId, sequence('33333333'))
    const ids = first.book.entries.map((entry) => entry.id)
    expect(ids[0]).toMatch(/^entry-33333333/)
    expect(ids[1]).toBe('9')
    expect(readLorebookV3(library.getItem(item.localId)!.document).entries.map((entry) => entry.id)).toEqual(ids)
    expect(first.item.revision).toBe(2)
    const second = openLocalLorebook(library, item.localId, sequence('44444444'))
    expect(second.book.entries.map((entry) => entry.id)).toEqual(ids)
    expect(second.item.revision).toBe(2)
  })

  it('只读的书打开时不写（只给补齐后的视图）', async () => {
    const library = await setup()
    const legacy = readLorebookV3(fixtures.lorebook)
    delete legacy.entries[0].id
    const item = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: writeLorebookV3(legacy), name: 'ro', readOnly: true })
    const opened = openLocalLorebook(library, item.localId, sequence())
    expect(opened.book.entries[0].id).toMatch(/^entry-/)
    expect(library.getItem(item.localId)!.revision).toBe(1)
  })
})

describe('M7 后续：次要关键词（secondary_keys）与关键词同样编辑', () => {
  it('表单回显、只写改过的、清空写成空数组、新条目可带', async () => {
    const entry = readLorebookV3(fixtures.lorebook).entries[0]
    const snapshot = entryFormOf(entry)
    expect(snapshot.secondaryKeysText).toBe((entry.secondary_keys as string[]).join(', '))
    expect(entryEditOf(snapshot, { ...snapshot })).toEqual({})
    expect(entryEditOf(snapshot, { ...snapshot, secondaryKeysText: 'x，y' })).toEqual({ secondary_keys: ['x', 'y'] })
    const withSecondary = entryFormOf({ id: 'e', keys: ['k'], secondary_keys: ['s1', 's2'], content: '' })
    expect(withSecondary.secondaryKeysText).toBe('s1, s2')
    expect(entryEditOf(withSecondary, { ...withSecondary, secondaryKeysText: '' })).toEqual({ secondary_keys: [] })
    expect(entryEditOf(withSecondary, { ...withSecondary, secondaryKeysText: 's1，s2 ' })).toEqual({})
    expect(newEntryEditOf({ ...entryFormOf(null), content: 'c', secondaryKeysText: 's1' })).toMatchObject({ secondary_keys: ['s1'] })
    expect(newEntryEditOf({ ...entryFormOf(null), content: 'c' })).not.toHaveProperty('secondary_keys')

    const library = await setup()
    const item = library.createItem({ kind: 'lorebook', format: 'lorebook_v3', document: richDocument(), name: 'b' })
    saveLocalLorebookEntry(library, item.localId, 'town-cinder', entryEditOf(snapshot, { ...snapshot, secondaryKeysText: ' a , b ' }), sequence())
    const saved = readLorebookV3(library.getItem(item.localId)!.document).entries[0]
    const expected = richDocument().data.lorebook.entries[0]
    expect(saved).toEqual({ ...expected, secondary_keys: ['a', 'b'] })
  })
})

describe('#9 评审：次要关键词兼容 Tavern 别名 keysecondary', () => {
  it('没有 secondary_keys 时回退读 keysecondary；两者都有以 secondary_keys 为准', () => {
    expect(entryFormOf({ id: 'e', keys: ['k'], keysecondary: ['a', 'b'], content: '' }).secondaryKeysText).toBe('a, b')
    expect(entryFormOf({ id: 'e', keys: ['k'], secondary_keys: ['x'], keysecondary: ['a'], content: '' }).secondaryKeysText).toBe('x')
  })
})
