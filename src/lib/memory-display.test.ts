import { describe, expect, it } from 'vitest'

import { formatDateTime } from './datetime'
import { memoryDisplayText } from './memory-display'

describe('formatDateTime', () => {
  it('formats Python isoformat timestamps in the local timezone', () => {
    // UTC 03:45:35 → 本地时区由系统决定，只断言格式与无 T/微秒/偏移残留
    const formatted = formatDateTime('2026-08-31T03:45:35.398423+00:00')
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(formatted).not.toContain('T')
    expect(formatted).not.toContain('.')
  })

  it('normalizes space-separated server timestamps', () => {
    expect(formatDateTime('2026-08-21 10:30:06')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('returns empty for missing values and passthrough for unparseable ones', () => {
    expect(formatDateTime()).toBe('')
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('不是时间')).toBe('不是时间')
  })
})

describe('memoryDisplayText', () => {
  it('joins entity, relation and value', () => {
    expect(
      memoryDisplayText({ id: 1, entity: '沃尔珀', relation: '出售', value: '医疗包' }),
    ).toBe('沃尔珀 · 出售 · 医疗包')
  })

  it('drops entity that is contained in value (server extraction duplication)', () => {
    const text = memoryDisplayText({
      id: 1,
      entity: '；装备改造室基础附魔200、进阶附魔500',
      relation: '记录',
      value: '物资供应站医疗包50；装备改造室基础附魔200、进阶附魔500',
    })
    // 被包含的 entity 由更完整的 value 替位，片段顺序不变
    expect(text).toBe('物资供应站医疗包50；装备改造室基础附魔200、进阶附魔500 · 记录')
  })

  it('falls back through content/text/summary when value is missing', () => {
    expect(memoryDisplayText({ id: 1, content: ' fallback ' }).trim()).toBe('fallback')
  })
})
