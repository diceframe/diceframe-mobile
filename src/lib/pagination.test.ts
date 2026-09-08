import { describe, expect, it } from 'vitest'
import { parsePageNumber } from './pagination'

describe('页码跳转', () => {
  it.each([['1', 1], ['2', 2], [' 10 ', 10], ['002', 2]])('接受范围内页码 %s', (input, expected) => {
    expect(parsePageNumber(input, 10)).toBe(expected)
  })
  it.each(['', ' ', '0', '-1', '11', '1.5', '1e1', 'abc', 'Infinity', '9007199254740993'])('拒绝无效页码 %s', (input) => {
    expect(parsePageNumber(input, 10)).toBeNull()
  })
  it('总页数缩小时不允许跳到旧末页', () => {
    expect(parsePageNumber('3', 2)).toBeNull()
  })
})
