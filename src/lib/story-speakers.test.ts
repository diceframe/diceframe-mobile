import { describe, expect, it } from 'vitest'

import { filterStorySpeakers, mergeTargetsOf, parseStorySpeakers, speakerShortId } from './story-speakers'

const seat = { id: 's_00000000000000000001', name: 'Alice', first_round: 1 }
const guestA = { id: 'g_0000000000000000000a', name: '守夜人', first_round: 2 }
const guestB = { id: 'g_0000000000000000000b', name: '守夜人', first_round: 5 }
const guestAlice = { id: 'g_0000000000000000000c', name: 'Alice', first_round: 6 }

describe('剧情说话人名册', () => {
  it('解析时丢弃缺 id / name 的记录', () => {
    expect(parseStorySpeakers({ speakers: [seat, { id: '', name: 'x' }, { id: 'g_1' }, null] })).toEqual([seat])
    expect(parseStorySpeakers({})).toEqual([])
  })

  it('只有临时人物能合并到同名的其它记录', () => {
    const all = [seat, guestA, guestB, guestAlice]
    expect(mergeTargetsOf(guestA, all)).toEqual([guestB])
    expect(mergeTargetsOf(guestAlice, all)).toEqual([seat])
    expect(mergeTargetsOf(seat, all)).toEqual([])
  })

  it('按名字或 id 搜索，短编号取末 6 位', () => {
    expect(filterStorySpeakers([seat, guestA], 'alice')).toEqual([seat])
    expect(filterStorySpeakers([seat, guestA], '00a')).toEqual([guestA])
    expect(filterStorySpeakers([seat, guestA], ' ')).toEqual([seat, guestA])
    expect(speakerShortId(guestA)).toBe('00000a')
  })
})
