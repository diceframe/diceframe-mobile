import { describe, expect, it } from 'vitest'

import { worldGmStyleUpdate } from './gm-style'

describe('worldGmStyleUpdate', () => {
  it('编辑其它字段时保留已有叙事节奏', () => {
    expect(worldGmStyleUpdate(
      { tone: 'dark', verbosity: 'detailed', pace: 'slow', custom_instructions: 'old' },
      { tone: 'direct', verbosity: 'brief', custom_instructions: 'new' },
    )).toEqual({ tone: 'direct', verbosity: 'brief', pace: 'slow', custom_instructions: 'new' })
  })

  it('没有已有值时使用中性节奏', () => {
    expect(worldGmStyleUpdate(null, {})).toEqual({
      tone: '', verbosity: 'normal', pace: 'normal', custom_instructions: '',
    })
  })
})
