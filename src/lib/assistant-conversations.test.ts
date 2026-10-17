import { describe, expect, it } from 'vitest'

import {
  MAX_CONVERSATIONS,
  conversationTitle,
  parseArchive,
  removeConversation,
  renameConversation,
  syncConversation,
  type ConversationArchive,
} from './assistant-conversations'

const user = (content: string) => ({ role: 'user' as const, content })
const empty: ConversationArchive = { activeId: '', items: [] }

describe('DF Agent 会话存档', () => {
  it('标题取首条用户消息，压空白并截断', () => {
    expect(conversationTitle([{ role: 'assistant', content: 'hi' }, user('  帮我\n写一本   世界书  ')], '新对话')).toBe('帮我 写一本 世界书')
    expect(conversationTitle([user('x'.repeat(40))], '')).toBe(`${'x'.repeat(28)}…`)
    expect(conversationTitle([], '新对话')).toBe('新对话')
  })

  it('写回当前会话：空会话不保留，内容不变不刷新时间，按更新时间排序', () => {
    let archive = syncConversation(empty, { id: 'a', messages: [user('A')], sessionId: 's1' }, 100)
    archive = syncConversation(archive, { id: 'b', messages: [user('B')], sessionId: null }, 200)
    expect(archive.items.map((item) => item.id)).toEqual(['b', 'a'])
    archive = syncConversation(archive, { id: 'a', messages: [user('A')], sessionId: 's1' }, 300)
    expect(archive.items.find((item) => item.id === 'a')?.updatedAt).toBe(100)
    archive = syncConversation(archive, { id: 'a', messages: [user('A'), user('A2')], sessionId: 's1' }, 400)
    expect(archive.items[0]).toMatchObject({ id: 'a', updatedAt: 400, createdAt: 100, title: 'A' })
    expect(syncConversation(archive, { id: 'b', messages: [], sessionId: null }).items.map((item) => item.id)).toEqual(['a'])
  })

  it('最多保留 30 段', () => {
    let archive = empty
    for (let index = 0; index < MAX_CONVERSATIONS + 3; index += 1) {
      archive = syncConversation(archive, { id: `c${index}`, messages: [user(String(index))], sessionId: null }, index)
    }
    expect(archive.items).toHaveLength(MAX_CONVERSATIONS)
    expect(archive.items.at(-1)?.id).toBe('c3')
  })

  it('重命名后标题固定；空名不改；删除只动目标', () => {
    let archive = syncConversation(empty, { id: 'a', messages: [user('原始')], sessionId: null }, 1)
    expect(renameConversation(archive, 'a', '   ')).toBe(archive)
    archive = renameConversation(archive, 'a', '  我的  世界书 ')
    archive = syncConversation(archive, { id: 'a', messages: [user('原始'), user('追加')], sessionId: null }, 2)
    expect(archive.items[0]).toMatchObject({ title: '我的 世界书', customTitle: true })
    expect(removeConversation(archive, 'a').items).toEqual([])
  })

  it('解析存档丢弃不合形的条目与消息', () => {
    const raw = JSON.stringify({ activeId: 'a', items: [
      { id: 'a', title: 't', createdAt: 1, updatedAt: 1, sessionId: null, messages: [user('ok'), { bad: 1 }] },
      { id: 'b', title: 't' },
    ] })
    expect(parseArchive(raw)).toEqual({ activeId: 'a', items: [{ id: 'a', title: 't', createdAt: 1, updatedAt: 1, sessionId: null, messages: [user('ok')] }] })
    expect(parseArchive('not json')).toEqual(empty)
  })
})
