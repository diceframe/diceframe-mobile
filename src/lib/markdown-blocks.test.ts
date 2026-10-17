import { describe, expect, it } from 'vitest'

import { markdownBlocks } from './markdown-blocks'

describe('markdown 分块', () => {
  it('标题、段落、无序 / 有序列表与代码块', () => {
    const text = [
      '## 步骤',
      '先准备世界。',
      '然后建局。',
      '',
      '- 写世界书',
      '* 选规则',
      '1. 打开设置',
      '2) 填密码',
      '```json',
      '{"a": 1}',
      '```',
      '结尾',
    ].join('\r\n')
    expect(markdownBlocks(text)).toEqual([
      { kind: 'heading', text: '步骤' },
      { kind: 'paragraph', text: '先准备世界。\n然后建局。' },
      { kind: 'list', ordered: false, items: ['写世界书', '选规则'] },
      { kind: 'list', ordered: true, items: ['打开设置', '填密码'] },
      { kind: 'code', text: '{"a": 1}' },
      { kind: 'paragraph', text: '结尾' },
    ])
  })

  it('未闭合的代码块吃到文末；空输入没有块', () => {
    expect(markdownBlocks('```\nx\ny')).toEqual([{ kind: 'code', text: 'x\ny' }])
    expect(markdownBlocks('')).toEqual([])
  })
})

describe('markdown 表格', () => {
  it('表头 + 分隔行起头，连续的管道行为数据行；缺分隔行时按段落', () => {
    const text = '| ID | 名称 |\n|---|:---:|\n| coc_horror | 克苏鲁 |\n| jp_isekai | 异世界 |\n之后'
    expect(markdownBlocks(text)).toEqual([
      { kind: 'table', header: ['ID', '名称'], rows: [['coc_horror', '克苏鲁'], ['jp_isekai', '异世界']] },
      { kind: 'paragraph', text: '之后' },
    ])
    expect(markdownBlocks('| a | b |\n| c | d |')).toEqual([{ kind: 'paragraph', text: '| a | b |\n| c | d |' }])
  })
})
