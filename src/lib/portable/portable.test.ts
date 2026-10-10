import { describe, expect, it } from 'vitest'

import { buildJoinNewPayload } from '@/lib/join-form'
import { serverBook, serverCardBody, serverCardDocument, serverEntry, serverLorebookDocument } from './__fixtures__/server-export'
import {
  CARD_V3_SPEC,
  PORTRAIT_NOT_PORTABLE,
  cardSummary,
  isPortablePortrait,
  isRulesAwareCard,
  joinCardFromDocument,
  newCardDocument,
  patchCardDocument,
  pushableCardDocument,
  readCardV3,
  withCharacterBook,
  writeCardV3,
  type CardBody,
} from './card-v3'
import { BODY_TOO_LARGE, ENTRY_TOO_LARGE, PortableFormatError, TOO_MANY_ENTRIES, TOO_MANY_ITEMS } from './errors'
import { canonicalJson, cloneJson, localDigest, utf8ByteLength } from './json'
import {
  MAX_BODY_BYTES,
  MAX_ENTRIES_PER_BOOK,
  MAX_ENTRY_BYTES,
  MAX_ITEMS,
  assertWithinLimits,
  bookLimitViolations,
  requestLimitViolations,
} from './limits'
import {
  ensureEntryIds,
  entryIdOf,
  lorebookSummary,
  newLorebookDocument,
  patchBook,
  readLorebookV3,
  removeEntry,
  upsertEntry,
  writeLorebookV3,
} from './lorebook-v3'

function counter(prefix = 'u') {
  let n = 0
  return () => `${prefix}${++n}`
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof PortableFormatError ? error.code : `not-portable:${String(error)}`
  }
  return 'no-error'
}

describe('chara_card_v3：读', () => {
  it('取出卡体与内嵌书（深拷贝，不与原文共享引用）', () => {
    const parsed = readCardV3(serverCardDocument)
    expect(parsed.body).toEqual(serverCardBody)
    expect(parsed.characterBook).toEqual(serverBook)
    parsed.body.character_name = 'changed'
    expect(serverCardDocument.data.extensions.diceframe.character_name).toBe('Mira')
  })

  it('卡体没写名字时回退到 v3 的 data.name（同服务端）', () => {
    const doc = cloneJson(serverCardDocument)
    doc.data.extensions.diceframe = { ...serverCardBody, character_name: '' }
    expect(readCardV3(doc).body.character_name).toBe('Mira')
  })

  it('外形不对一律拒绝（CARD_V3_INVALID）', () => {
    expect(codeOf(() => readCardV3(null))).toBe('CARD_V3_INVALID')
    expect(codeOf(() => readCardV3({ ...serverCardDocument, spec: 'chara_card_v2' }))).toBe('CARD_V3_INVALID')
    expect(codeOf(() => readCardV3({ spec: CARD_V3_SPEC }))).toBe('CARD_V3_INVALID')
    expect(codeOf(() => readCardV3({ spec: CARD_V3_SPEC, data: { name: 'x', extensions: {} } }))).toBe('CARD_V3_INVALID')
    expect(codeOf(() => readCardV3({ spec: CARD_V3_SPEC, data: { extensions: { diceframe: [] } } }))).toBe('CARD_V3_INVALID')
    const badBook = cloneJson(serverCardDocument) as unknown as { data: { character_book: unknown } }
    badBook.data.character_book = 'not an object'
    expect(readCardV3(badBook).characterBook).toBeNull()
  })
})

describe('chara_card_v3：写与往返', () => {
  it('信封字段与服务端 write_card_v3 逐一一致', () => {
    expect(writeCardV3(serverCardBody as CardBody, serverBook)).toEqual(serverCardDocument)
  })

  it('服务端导出的卡 → 读 → 写，得到同一份文档（推回去会是 unchanged）', () => {
    const { body, characterBook } = readCardV3(serverCardDocument)
    expect(writeCardV3(body, characterBook)).toEqual(serverCardDocument)
  })

  it('本机新建卡带 schema_version 2，没有内嵌书', () => {
    const doc = newCardDocument({ character_name: '新角色', rule_id: 'coc7' })
    expect(doc.data.extensions.diceframe).toEqual({ schema_version: 2, character_name: '新角色', rule_id: 'coc7' })
    expect(doc.data).not.toHaveProperty('character_book')
    expect(cardSummary(doc)).toEqual({ name: '新角色', ruleId: 'coc7', readOnly: false })
  })
})

describe('chara_card_v3：按字段打补丁（不重建）', () => {
  const foreign = () => {
    const doc = cloneJson(serverCardDocument) as unknown as {
      data: Record<string, unknown> & { extensions: Record<string, unknown> }
    }
    doc.data.tags = ['冒险', '旧城']
    doc.data.creator_notes = '来自别的工具'
    doc.data.extensions.other_tool = { keep: 'me' }
    return doc
  }

  it('只改给出的字段：未知卡体字段、其他工具的扩展、v3 其余字段、内嵌书都原样保留', () => {
    const doc = foreign()
    const next = patchCardDocument(doc, { race: '精灵', skills: [{ name: '潜行', value: 40 }], gold: undefined })
    const { body, characterBook } = readCardV3(next)
    expect(body).toEqual({ ...serverCardBody, race: '精灵', skills: [{ name: '潜行', value: 40 }] })
    expect(body.custom_future_field).toEqual({ nested: [1, 2, 3] })
    expect(characterBook).toEqual(serverBook)
    expect(next.data.tags).toEqual(['冒险', '旧城'])
    expect(next.data.creator_notes).toBe('来自别的工具')
    expect(next.data.extensions.other_tool).toEqual({ keep: 'me' })
    // 原文不被修改
    expect(readCardV3(doc).body.race).toBe('人类')
  })

  it('改名字 / 背景时同步 v3 的 name / description，别的字段不碰它们', () => {
    const next = patchCardDocument(serverCardDocument, { character_name: 'Mira K.', background: '新背景' })
    expect(next.data.name).toBe('Mira K.')
    expect(next.data.description).toBe('新背景')
    const untouched = patchCardDocument({ ...serverCardDocument, data: { ...serverCardDocument.data, name: 'custom' } }, { race: 'x' })
    expect(untouched.data.name).toBe('custom')
  })

  it('替换或移除内嵌书，卡体不动', () => {
    const replaced = withCharacterBook(serverCardDocument, { name: '新书', entries: [] })
    expect(readCardV3(replaced)).toEqual({ body: serverCardBody, characterBook: { name: '新书', entries: [] } })
    expect(withCharacterBook(serverCardDocument, null).data).not.toHaveProperty('character_book')
  })

  it('规则托管（D&D）卡只读：拒绝编辑，列表标为只读', () => {
    const dnd = writeCardV3({ ...serverCardBody, rule_id: 'dnd5e_2024', ruleset_character: { level: 3 } } as CardBody)
    expect(isRulesAwareCard(readCardV3(dnd).body)).toBe(true)
    expect(isRulesAwareCard({ rule_binding: { rule_id: 'x' } })).toBe(true)
    expect(isRulesAwareCard({ rule_binding: 'not-an-object' })).toBe(false)
    expect(cardSummary(dnd).readOnly).toBe(true)
    expect(codeOf(() => patchCardDocument(dnd, { race: 'x' }))).toBe('CARD_READ_ONLY')
  })
})

describe('推送前的卡片：剥服务端字段与不可移植头像', () => {
  it('剥掉服务端从不接受的字段（含 character_sheet 里的），本机文档不变', () => {
    const local = writeCardV3({
      ...serverCardBody,
      id: 'card_server', card_id: 'card_server', provenance: { link: 'tracked' }, source_plugin: 'p',
      plugin_content_id: 'c', raw_sillytavern: { huge: true }, ruleset_revision: 3, ruleset_operation_log: [],
      ruleset_runtime: { id: 'r' }, character_sheet: { hp: 10, provenance: {}, id: 'x' },
    } as unknown as CardBody)
    const { document, warnings } = pushableCardDocument(local)
    const body = readCardV3(document).body
    for (const key of ['id', 'card_id', 'provenance', 'source_plugin', 'plugin_content_id', 'raw_sillytavern',
      'ruleset_revision', 'ruleset_operation_log', 'ruleset_runtime']) {
      expect(body).not.toHaveProperty(key)
    }
    expect(body.character_sheet).toEqual({ hp: 10 })
    expect(body.portrait).toEqual({ kind: 'builtin', id: 'coc/realistic-3' })
    expect(warnings).toEqual([])
    expect(readCardV3(local).body.raw_sillytavern).toEqual({ huge: true })
  })

  it('upload / generated 头像换成空对象并给 PORTRAIT_NOT_PORTABLE；没有头像不警告', () => {
    for (const portrait of [{ kind: 'upload', asset_id: 'a1' }, { kind: 'generated', asset_id: 'g1' }, { kind: 'builtin' }]) {
      const { document, warnings } = pushableCardDocument(writeCardV3({ ...serverCardBody, portrait } as CardBody))
      expect(readCardV3(document).body.portrait).toEqual({})
      expect(warnings.map((warning) => warning.code)).toEqual([PORTRAIT_NOT_PORTABLE])
    }
    for (const portrait of [undefined, null, {}]) {
      const { warnings } = pushableCardDocument(writeCardV3({ ...serverCardBody, portrait } as CardBody))
      expect(warnings).toEqual([])
    }
    expect(isPortablePortrait({ kind: 'builtin', id: 'x'.repeat(101) })).toBe(false)
  })
})

describe('玩家用本机卡加入对局', () => {
  it('卡体交给现有 join payload：sheet 字段透传，元数据与服务端字段不进 payload', () => {
    const local = writeCardV3({ ...serverCardBody, id: 'card_x', provenance: { link: 'tracked' } } as CardBody, serverBook)
    const card = joinCardFromDocument(local)
    expect(card).not.toHaveProperty('id')
    expect(card).not.toHaveProperty('provenance')
    const payload = buildJoinNewPayload({ characterName: 'Mira', background: card.background ?? '', portrait: card.portrait }, card)
    expect(payload).toMatchObject({
      join_as_new: true, character_name: 'Mira', race: '人类', class: '调查员', attributes: { str: 50, dex: 60 },
      skills: [{ name: '侦查', value: 60, effect: '擅长发现线索' }], portrait: { kind: 'builtin', id: 'coc/realistic-3' },
    })
    expect(payload).not.toHaveProperty('rule_id')
    expect(payload).not.toHaveProperty('schema_version')
  })

  it('不可移植头像不带；规则托管卡不能用于移动端加入', () => {
    const uploaded = writeCardV3({ ...serverCardBody, portrait: { kind: 'upload', asset_id: 'a' } } as CardBody)
    expect(joinCardFromDocument(uploaded)).not.toHaveProperty('portrait')
    const dnd = writeCardV3({ ...serverCardBody, ruleset_character: {} } as CardBody)
    expect(codeOf(() => joinCardFromDocument(dnd))).toBe('CARD_READ_ONLY')
  })
})

describe('lorebook_v3', () => {
  it('读服务端导出的书：两种外形都认，缺 entries 视为空书，坏外形拒绝', () => {
    expect(readLorebookV3(serverLorebookDocument)).toEqual(serverBook)
    expect(readLorebookV3({ lorebook: serverBook })).toEqual(serverBook)
    expect(readLorebookV3({ spec: 'lorebook_v3', data: { lorebook: { name: 'x' } } })).toEqual({ name: 'x', entries: [] })
    expect(codeOf(() => readLorebookV3({ spec: 'other', data: { lorebook: serverBook } }))).toBe('LOREBOOK_V3_INVALID')
    expect(codeOf(() => readLorebookV3({ spec: 'lorebook_v3', data: {} }))).toBe('LOREBOOK_V3_INVALID')
    expect(readLorebookV3({ lorebook: { entries: [1, 2] } })).toEqual({ entries: [{}, {}] })
    expect(codeOf(() => readLorebookV3('x'))).toBe('LOREBOOK_V3_INVALID')
  })

  it('读 → 写往返不丢任何字段（含激活设置、extensions.diceframe、provenance）', () => {
    expect(writeLorebookV3(readLorebookV3(serverLorebookDocument))).toEqual(serverLorebookDocument)
    expect(lorebookSummary(serverLorebookDocument)).toEqual({ name: '米拉的回忆', ruleId: '', readOnly: false })
    expect(newLorebookDocument('空书')).toEqual({ spec: 'lorebook_v3', data: { lorebook: { name: '空书', description: '', entries: [] } } })
  })

  it('补稳定 id：已有 id 不动（含数字 uid），缺失或重复的换新 id；无变化返回原引用', () => {
    const book = { name: 'b', entries: [{ id: 'keep' }, { uid: 7 }, { name: 'no id' }, { id: 'keep' }] }
    const fixed = ensureEntryIds(book, counter('U'))
    expect(fixed.entries.map(entryIdOf)).toEqual(['keep', '7', 'entry-u1', 'entry-u2'])
    expect(ensureEntryIds(fixed, counter())).toBe(fixed)
  })

  it('编辑条目只改开放字段，其余（激活设置、扩展、provenance）原样保留', () => {
    const book = readLorebookV3(serverLorebookDocument)
    const { book: next, entryId } = upsertEntry(book, 'entry-aaaa', { content: '新内容', keys: [' 旧城 ', '', '夜'], enabled: false }, counter())
    expect(entryId).toBe('entry-aaaa')
    expect(next.entries[0]).toEqual({ ...serverEntry, content: '新内容', keys: ['旧城', '夜'], enabled: false })
    expect(next.entries[1]).toEqual(book.entries[1])
    expect(book.entries[0].content).toBe(serverEntry.content)
  })

  it('新建条目生成稳定 id、默认启用；删除按 id；找不到的 id 报错', () => {
    const book = readLorebookV3(serverLorebookDocument)
    const { book: added, entryId } = upsertEntry(book, '', { name: '新条目', keys: ['k'], content: 'c' }, counter('N'))
    expect(entryId).toBe('entry-n1')
    expect(added.entries.at(-1)).toEqual({ id: 'entry-n1', name: '新条目', keys: ['k'], content: 'c', enabled: true })
    const removed = removeEntry(added, 'entry-aaaa')
    expect(removed.entries.map(entryIdOf)).toEqual(['lb_entry_server_made', 'entry-n1'])
    expect(codeOf(() => removeEntry(book, 'missing'))).toBe('LOREBOOK_ENTRY_NOT_FOUND')
    expect(codeOf(() => upsertEntry(book, 'missing', { name: 'x' }, counter()))).toBe('LOREBOOK_ENTRY_NOT_FOUND')
  })

  it('改书名 / 描述保留设置与条目', () => {
    const book = readLorebookV3(serverLorebookDocument)
    expect(patchBook(book, { name: '改名' })).toEqual({ ...serverBook, name: '改名' })
  })
})

describe('本地限额预检（与服务端 413 同码）', () => {
  it('条目数与单条大小', () => {
    const many = { entries: Array.from({ length: MAX_ENTRIES_PER_BOOK + 1 }, (_, index) => ({ id: `e${index}` })) }
    expect(bookLimitViolations(many, 'book-1').map((v) => v.code)).toEqual([TOO_MANY_ENTRIES])
    const exact = { entries: Array.from({ length: MAX_ENTRIES_PER_BOOK }, (_, index) => ({ id: `e${index}` })) }
    expect(bookLimitViolations(exact, 'book-1')).toEqual([])
    const big = { entries: [{ id: 'big', content: '字'.repeat(Math.ceil(MAX_ENTRY_BYTES / 3) + 1) }, { id: 'ok', content: 'x' }] }
    expect(bookLimitViolations(big, 'book-2')).toEqual([{ code: ENTRY_TOO_LARGE, clientRef: 'book-2', entryId: 'big' }])
  })

  it('请求条目数与请求体字节数；assertWithinLimits 抛出第一条', () => {
    expect(requestLimitViolations(MAX_ITEMS, {})).toEqual([])
    expect(requestLimitViolations(MAX_ITEMS + 1, {}).map((v) => v.code)).toEqual([TOO_MANY_ITEMS])
    const body = { blob: 'é'.repeat(MAX_BODY_BYTES / 2) }
    expect(requestLimitViolations(1, body).map((v) => v.code)).toEqual([BODY_TOO_LARGE])
    expect(() => assertWithinLimits([])).not.toThrow()
    expect(codeOf(() => assertWithinLimits(requestLimitViolations(MAX_ITEMS + 1, body)))).toBe(TOO_MANY_ITEMS)
  })
})

describe('json 工具', () => {
  it('UTF-8 字节数与 Node 的 Buffer.byteLength 一致（含代理对与孤立代理项）', () => {
    for (const text of ['', 'abc', 'é', '旧城', '🎲 骰子', 'a\uD83Db', '\uDC00']) {
      expect(utf8ByteLength(text)).toBe(Buffer.byteLength(text, 'utf8'))
    }
  })

  it('规范化 JSON 与本地摘要：键序无关、内容敏感', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe('{"a":[2,{"d":3}],"b":1}')
    expect(localDigest({ a: 1, b: 2 })).toBe(localDigest({ b: 2, a: 1 }))
    expect(localDigest({ a: 1 })).not.toBe(localDigest({ a: 2 }))
    expect(localDigest(serverCardDocument)).toMatch(/^local:[0-9a-f]{14}$/)
  })
})

describe('评审修复：嵌套对象按字段合并', () => {
  it('表单重建 character_sheet 时，未知的嵌套键（任意深度）不丢', () => {
    const doc = writeCardV3({
      ...serverCardBody,
      character_sheet: { hp: 10, unknown_x: { a: 1 }, resources: { mp: { current: 1, extra: true } } },
      identity: { age: 30, hometown: '旧城' },
    } as unknown as CardBody)
    const next = patchCardDocument(doc, {
      character_sheet: { hp: 12, resources: { mp: { current: 2 } } },
      identity: { age: 31 },
    } as Partial<CardBody>)
    const body = readCardV3(next).body
    expect(body.character_sheet).toEqual({ hp: 12, unknown_x: { a: 1 }, resources: { mp: { current: 2, extra: true } } })
    expect(body.identity).toEqual({ age: 31, hometown: '旧城' })
  })

  it('头像、技能等「整体值」仍是替换：不会把旧头像的字段混进新头像', () => {
    const doc = writeCardV3({ ...serverCardBody, portrait: { kind: 'upload', asset_id: 'a1' } } as CardBody)
    const next = patchCardDocument(doc, { portrait: { kind: 'builtin', id: 'coc/1' }, skills: [{ name: 'x', value: 1 }] })
    expect(readCardV3(next).body.portrait).toEqual({ kind: 'builtin', id: 'coc/1' })
    expect(readCardV3(next).body.skills).toEqual([{ name: 'x', value: 1 }])
  })
})

describe('评审修复：条目 id 边界（与服务端 str(id or "") 同语义）', () => {
  it('id 键存在但为 null / 空串 / 0 时视为没有 id，即使有 uid 也补新的稳定 id', () => {
    const book = { entries: [{ id: null, uid: 7 }, { id: '' }, { id: 0 }, { uid: 9 }, { id: '0' }] }
    const fixed = ensureEntryIds(book as never, counter('Z'))
    expect(fixed.entries.map(entryIdOf)).toEqual(['entry-z1', 'entry-z2', 'entry-z3', '9', '0'])
    expect(entryIdOf({ id: null, uid: 7 } as never)).toBe('')
  })
})

describe('评审修复：保真', () => {
  it('写卡时内嵌书原样拷贝，不补 entries 等字段', () => {
    const rawBook = { name: '只有名字', custom: 1 }
    expect(writeCardV3(serverCardBody as CardBody, rawBook as never).data.character_book).toEqual(rawBook)
    expect(withCharacterBook(serverCardDocument, rawBook as never).data.character_book).toEqual(rawBook)
  })

  it('内嵌书 entries 不是数组 / 含非对象行：忽略坏条目，不拒绝整张卡（同服务端）', () => {
    const doc = cloneJson(serverCardDocument) as unknown as { data: { character_book: unknown } }
    doc.data.character_book = { name: 'b', entries: 'nope' }
    expect(readCardV3(doc).characterBook).toEqual({ name: 'b', entries: [] })
    doc.data.character_book = { name: 'b', entries: [serverEntry, 3, null, 'x'] }
    expect(readCardV3(doc).characterBook?.entries).toEqual([serverEntry, {}, {}, {}])
    expect(readLorebookV3({ lorebook: { entries: [1, serverEntry] } }).entries).toEqual([{}, serverEntry])
  })

  it('假值与 Python 的 or 对齐：character_name 为 0/false/空串时回退 data.name；name 写出时同理', () => {
    for (const falsy of [0, false, '', null]) {
      const doc = cloneJson(serverCardDocument) as unknown as { data: { extensions: { diceframe: Record<string, unknown> } } }
      doc.data.extensions.diceframe.character_name = falsy
      expect(readCardV3(doc).body.character_name).toBe('Mira')
    }
    expect(writeCardV3({ character_name: 0, background: false } as unknown as CardBody).data).toMatchObject({ name: '', description: '' })
    expect(isPortablePortrait({ kind: 'builtin', id: 0 })).toBe(false)
  })
})

describe('跟进：显式删除与条目位置', () => {
  it('patchCardDocument 支持按路径显式删除：自定义属性、嵌套键、数组项', () => {
    const doc = writeCardV3({
      ...serverCardBody,
      attributes: { str: 50, dex: 60, custom_luck: 7 },
      character_sheet: { hp: 10, homebrew: { a: 1, b: 2 } },
      skills: [{ name: '侦查', value: 60 }, { name: '自定义', value: 5 }],
    } as unknown as CardBody)
    const next = patchCardDocument(doc, { race: '精灵' }, {
      remove: [['attributes', 'custom_luck'], ['character_sheet', 'homebrew', 'b'], ['skills', '1'], ['custom_future_field']],
    })
    const body = readCardV3(next).body
    expect(body.attributes).toEqual({ str: 50, dex: 60 })
    expect(body.character_sheet).toEqual({ hp: 10, homebrew: { a: 1 } })
    expect(body.skills).toEqual([{ name: '侦查', value: 60 }])
    expect(body).not.toHaveProperty('custom_future_field')
    expect(body.race).toBe('精灵')
  })

  it('删除路径不存在时什么也不做；空路径拒绝', () => {
    const next = patchCardDocument(serverCardDocument, {}, { remove: [['nope', 'deeper'], ['skills', '9']] })
    expect(readCardV3(next).body).toEqual(serverCardBody)
    expect(() => patchCardDocument(serverCardDocument, {}, { remove: [[]] })).toThrow()
  })

  it('内嵌书里的非对象条目变成空条目（与服务端一样），条目位置不错位', () => {
    const doc = cloneJson(serverCardDocument) as unknown as { data: { character_book: unknown } }
    doc.data.character_book = { name: 'b', entries: [serverEntry, 3, null, 'x', serverEntry] }
    expect(readCardV3(doc).characterBook?.entries).toEqual([serverEntry, {}, {}, {}, serverEntry])
  })
})
