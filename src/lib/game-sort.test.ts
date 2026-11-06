import { describe, expect, it } from 'vitest'

import type { GameSummary } from '@/api/types'

import { featuredGame, sortGames } from './game-sort'

const games: GameSummary[] = [
  { game_key: 'a', world_name: '灯塔', last_activity: '2026-11-01T10:00:00Z', round_number: 3 },
  { game_key: 'b', world_name: '阿卡姆', last_activity: '2026-11-05T10:00:00Z', round_number: 51 },
  { game_key: 'c', world_name: '没开始', round_number: 0 },
  { game_key: 'd', world_name: '只有开始时间', started_at: '2026-11-03T10:00:00Z', round_number: 9 },
]

describe('sortGames', () => {
  it('最近：按最后活动时间倒序，缺失时间退回开始时间，都没有的排最后', () => {
    expect(sortGames(games, 'recent').map((g) => g.game_key)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('最早：正序，没有时间的仍排最后', () => {
    expect(sortGames(games, 'oldest').map((g) => g.game_key)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('轮次：轮次多的在前', () => {
    expect(sortGames(games, 'round').map((g) => g.game_key)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('不改动传入的数组', () => {
    const input = [...games]
    sortGames(input, 'name')
    expect(input.map((g) => g.game_key)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('featuredGame', () => {
  it('取最近活动的一局', () => {
    expect(featuredGame(games)?.game_key).toBe('b')
  })

  it('没有存档时为 null', () => {
    expect(featuredGame([])).toBeNull()
  })

  it('都没有时间时按名字取第一个', () => {
    expect(featuredGame([{ game_key: 'z', world_name: 'B' }, { game_key: 'y', world_name: 'A' }])?.game_key).toBe('y')
  })
})
