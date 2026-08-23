import { describe, expect, it } from 'vitest'

import { extractStateLines, formatTagLine, normalizeProtocolSuffix, parseGMText } from './gmText'

describe('normalizeProtocolSuffix', () => {
  it('协议标题行替换为 --- 分隔线（对齐 Web：标题行被丢弃）', () => {
    const result = normalizeProtocolSuffix('你推开了门。\n状态更新\nHP: web_user: -3\nGOLD: web_user: 10')
    expect(result).toBe('你推开了门。\n---\nHP: web_user: -3\nGOLD: web_user: 10')
  })

  it('连续协议标签行前补 ---（无标题行）', () => {
    const result = normalizeProtocolSuffix('寒风呼啸。\nHP: web_user: -1\nSCENE: 雪原')
    expect(result).toBe('寒风呼啸。\n---\nHP: web_user: -1\nSCENE: 雪原')
  })

  it('已有 --- 不重复处理', () => {
    const source = '正文。\n---\nHP: web_user: -1'
    expect(normalizeProtocolSuffix(source)).toBe(source)
  })
})

describe('extractStateLines', () => {
  it('【状态变化】行抽为状态卡', () => {
    const { narration, states } = extractStateLines('叙述一行。\n【状态变化】HP -3')
    expect(states).toEqual([{ title: '状态变化', body: 'HP -3', tone: 'warn' }])
    expect(narration).toBe('叙述一行。')
  })

  it('负面语义判定 tone=warn，正面为 good', () => {
    expect(extractStateLines('【奖励】获得长剑').states[0].tone).toBe('good')
    expect(extractStateLines('【代价】HP -5').states[0].tone).toBe('warn')
  })
})

describe('formatTagLine', () => {
  it('HP/GOLD 带符号（TAG: uid: value 三段式）', () => {
    const badges = formatTagLine('HP: web_user: -3\nGOLD: web_user: 10')
    expect(badges).toEqual([
      { tone: 'hp-dn', text: 'HP -3' },
      { tone: 'gold', text: '金币 +10' },
    ])
  })

  it('LOOT/QUEST 等取值（uid 段可为空）', () => {
    expect(formatTagLine('LOOT: : 银钥匙')).toEqual([{ tone: 'loot', text: '银钥匙' }])
    expect(formatTagLine('QUEST: : 寻找失踪的商人')).toEqual([
      { tone: 'quest', text: '寻找失踪的商人' },
    ])
  })
})

describe('parseGMText', () => {
  it('完整三段式：段落 + 状态卡 + 标签', () => {
    const block = parseGMText('你小心翼翼地推开石门。\n\n尘埃簌簌落下。\n【状态变化】HP -2\n---\nHP: web_user: -2\nLOOT: : 古代铜币')
    expect(block.paragraphs).toEqual(['你小心翼翼地推开石门。', '尘埃簌簌落下。'])
    expect(block.states).toHaveLength(1)
    expect(block.tags.map((t) => t.text)).toEqual(['HP -2', '古代铜币'])
  })

  it('纯叙事文本不受影响', () => {
    const block = parseGMText('夜色温柔，酒馆里灯火通明。')
    expect(block.paragraphs).toEqual(['夜色温柔，酒馆里灯火通明。'])
    expect(block.states).toEqual([])
    expect(block.tags).toEqual([])
  })
})
