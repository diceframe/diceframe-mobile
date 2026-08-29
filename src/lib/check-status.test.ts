import { describe, expect, it } from 'vitest'

import { checkStatusOf } from './check-status'

describe('checkStatusOf', () => {
  it('is_critical / is_fumble 字段优先', () => {
    expect(checkStatusOf({ is_critical: true, verdict: '失败' })).toBe('critical')
    expect(checkStatusOf({ is_fumble: true, verdict: '成功' })).toBe('fumble')
  })

  it('无字段时按 verdict 文本判定，无法识别视为失败', () => {
    expect(checkStatusOf({ verdict: '检定成功' })).toBe('success')
    expect(checkStatusOf({ verdict: 'Success' })).toBe('success')
    expect(checkStatusOf({ verdict: '检定失败' })).toBe('failure')
    expect(checkStatusOf({})).toBe('failure')
  })
})
