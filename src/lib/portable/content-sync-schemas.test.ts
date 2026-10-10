import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'

import { fixtures, schemas } from './__fixtures__/content-sync'
import {
  newCardDocument,
  patchCardDocument,
  pushableCardDocument,
  readCardV3,
  withCharacterBook,
  writeCardV3,
} from './card-v3'
import { ensureEntryIds, newLorebookDocument, upsertEntry, writeLorebookV3 } from './lorebook-v3'

/**
 * 服务端发布的 JSON Schema（docs/content-sync/schemas）。各 schema 的 $id 以文件名结尾
 * （#502），chara-card-v3 对 lorebook-v3.schema.json 的相对 $ref 按 $id 直接解析。
 */
function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  ajv.addSchema(schemas.lorebookV3Schema)
  ajv.addSchema(schemas.cardBodySchema)
  ajv.addSchema(schemas.charaCardV3Schema)
  const card = ajv.getSchema(schemas.charaCardV3Schema.$id)!
  const body = ajv.getSchema(schemas.cardBodySchema.$id)!
  const book = ajv.getSchema(schemas.lorebookV3Schema.$id)!
  const check = (fn: typeof card, value: unknown) => {
    const ok = fn(value)
    return ok ? 'ok' : ajv.errorsText(fn.errors)
  }
  return {
    card: (value: unknown) => check(card, value),
    body: (value: unknown) => check(body, value),
    book: (value: unknown) => check(book, value),
  }
}

const v = validator()

function counter(prefix = 'u') {
  let n = 0
  return () => `${prefix}${++n}`
}

describe('服务端金样本本身满足服务端 schema（拷贝无误）', () => {
  it.each(['cardCoc', 'cardDnd2024', 'cardFreeform', 'cardWithBook'] as const)('%s', (name) => {
    const document = fixtures[name]
    expect(v.card(document)).toBe('ok')
    expect(v.body(document.data.extensions.diceframe)).toBe('ok')
  })

  it('lorebook', () => {
    expect(v.book(fixtures.lorebook)).toBe('ok')
  })

  it('校验器确实会拒绝坏文档', () => {
    expect(v.card({ spec: 'chara_card_v3', data: { name: 'x' } })).not.toBe('ok')
    expect(v.book({ spec: 'lorebook_v3', data: { lorebook: { name: 'x', entries: [{ content: 'no id' }] } } })).not.toBe('ok')
  })
})

describe('本机生成的文档满足服务端 schema', () => {
  it('新建卡、编辑后的卡、推送前的卡、换内嵌书的卡', () => {
    const fresh = newCardDocument({ character_name: '新角色', rule_id: 'freeform_fantasy', skills: [{ name: '潜行', value: 40 }] })
    expect(v.card(fresh)).toBe('ok')
    expect(v.body(readCardV3(fresh).body)).toBe('ok')

    const edited = patchCardDocument(fixtures.cardWithBook, { race: 'Half-elf', skills: [{ name: 'Archery', value: 60 }] }, { remove: [['identity', 'age']] })
    expect(v.card(edited)).toBe('ok')
    expect(v.body(readCardV3(edited).body)).toBe('ok')

    const { document: pushable } = pushableCardDocument(fixtures.cardWithBook)
    expect(v.card(pushable)).toBe('ok')
    expect(v.body(readCardV3(pushable).body)).toBe('ok')

    const { body } = readCardV3(fixtures.cardFreeform)
    expect(v.card(writeCardV3(body))).toBe('ok')
    expect(v.card(withCharacterBook(fixtures.cardFreeform, fixtures.lorebook.data.lorebook))).toBe('ok')
  })

  it('新建书与新条目；补 id 后的旧数据（只有数字 uid / 数字 id）也有字符串 id', () => {
    const created = upsertEntry(newLorebookDocument('本机书').data.lorebook, '', { name: '条目', keys: ['k'], content: 'c' }, counter())
    expect(v.book(writeLorebookV3(created.book))).toBe('ok')

    const legacy = ensureEntryIds({
      name: '旧书',
      entries: [{ uid: 7, content: 'a', keys: [] }, { id: 5, content: 'b', keys: [] }, { content: 'c', keys: [] }],
    }, counter('n'))
    expect(v.book(writeLorebookV3(legacy))).toBe('ok')
    // 身份不变：服务端按 str(id or uid) 认条目
    expect(legacy.entries.map((entry) => entry.id)).toEqual(['7', '5', 'entry-n1'])
  })
})
