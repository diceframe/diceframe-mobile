import { describe, expect, it } from 'vitest'

import { characterAttributeRows } from './characterAttributes'

describe('characterAttributeRows', () => {
  it('优先显示本地化名称，不把兼容用双语 display_name 当主标签', () => {
    expect(
      characterAttributeRows(
        { str: 59 },
        [{ key: 'str', name: '力量', display_name: '力量 (STR)', min: 15, max: 90 }],
      ),
    ).toEqual([{ key: 'str', label: '力量', value: '59' }])
  })

  it('只有 display_name 时去掉尾部 canonical key', () => {
    expect(
      characterAttributeRows(
        { dex: 44 },
        [{ key: 'dex', display_name: '敏捷（DEX）', min: 15, max: 90 }],
      )[0]?.label,
    ).toBe('敏捷')
  })

  it('只显示角色实际拥有的规则属性，并保留旧存档额外属性', () => {
    expect(
      characterAttributeRows(
        { str: 10, luck: { current: 35 } },
        [
          { key: 'str', name: '力量', min: 3, max: 18 },
          { key: 'dex', name: '敏捷', min: 3, max: 18 },
        ],
      ),
    ).toEqual([
      { key: 'str', label: '力量', value: '10' },
      { key: 'luck', label: 'LUCK', value: '35' },
    ])
  })

  it('规则没有属性元数据时仍把常见 canonical key 显示成中文', () => {
    expect(characterAttributeRows({ str: 11, con: 10 }, [])).toEqual([
      { key: 'str', label: '力量', value: '11' },
      { key: 'con', label: '体质', value: '10' },
    ])
  })
})
