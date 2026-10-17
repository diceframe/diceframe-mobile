import { describe, expect, it } from 'vitest'

import {
  PROTECT_MS,
  REACTIONS,
  playReactionsBetween,
  reactionLabel,
  shouldReplace,
  type PlaySnapshot,
} from './assistant-reactions'

const base: PlaySnapshot = {
  game: 'g', round: 2, scene: '码头', sceneImage: '', state: 'action',
  level: 1, xp: 10, hp: 10, maxHp: 12, items: ['手电'], players: { u1: 'Alice' }, pushes: 0,
}

describe('骰灵反应目录', () => {
  it('26 种反应，覆盖 5 个类别', () => {
    expect(Object.keys(REACTIONS)).toHaveLength(26)
    expect(new Set(Object.values(REACTIONS).map((spec) => spec.category))).toEqual(new Set(['check', 'combat', 'story', 'growth', 'table']))
  })

  it('文案：受伤 / 治疗有数值时显示 HP 变化，带名字的换成带名字文案', () => {
    expect(reactionLabel('hurt', { amount: -3 })).toEqual({ key: 'dfReactHurtAmount', params: { amount: 3 } })
    expect(reactionLabel('hurt', {})).toMatchObject({ key: 'dfReactHurt' })
    expect(reactionLabel('sceneChange', { name: '灯塔' })).toEqual({ key: 'dfReactSceneChangeNamed', params: { name: '灯塔' } })
    expect(reactionLabel('newRound', { amount: 4 })).toEqual({ key: 'dfReactNewRound', params: { amount: 4 } })
  })

  it('刚开始的高优先级反应不被低优先级打断，过了保护期或同级可替换', () => {
    const crit = { kind: 'attackCrit' as const, startedAt: 1000 }
    expect(shouldReplace(crit, 'attackHit', 1000 + PROTECT_MS - 1)).toBe(false)
    expect(shouldReplace(crit, 'attackHit', 1000 + PROTECT_MS)).toBe(true)
    expect(shouldReplace(crit, 'downed', 1001)).toBe(true)
    expect(shouldReplace(null, 'diceRoll', 0)).toBe(true)
  })
})

describe('对局快照比对', () => {
  it('首个快照与换局只建基线，不重放历史', () => {
    expect(playReactionsBetween(null, base)).toEqual([])
    expect(playReactionsBetween({ ...base, game: 'other', round: 1 }, base)).toEqual([])
  })

  it('回合、场景、场景图、结束、成员进出、孤注一掷、物品、经验、升级', () => {
    const next: PlaySnapshot = {
      ...base, round: 3, scene: '灯塔', sceneImage: '{"asset_id":"x"}', state: 'ended',
      level: 2, xp: 30, items: ['手电', '钥匙'], players: { u2: 'Bob' }, pushes: 1,
    }
    expect(playReactionsBetween(base, next).map((item) => item.kind)).toEqual([
      'gameEnded', 'newRound', 'sceneChange', 'sceneImage', 'playerJoin', 'playerLeave', 'pushOffered', 'itemGain', 'xpGain', 'levelUp',
    ])
  })

  it('生命值：倒地 > 跌破四分之一告急 > 普通受伤；回血是治疗', () => {
    expect(playReactionsBetween(base, { ...base, hp: 0 })).toEqual([{ kind: 'downed' }])
    expect(playReactionsBetween(base, { ...base, hp: 3 })).toEqual([{ kind: 'hpLow' }])
    expect(playReactionsBetween(base, { ...base, hp: 7 })).toEqual([{ kind: 'hurt', detail: { amount: 3 } }])
    expect(playReactionsBetween({ ...base, hp: 5 }, { ...base, hp: 8 })).toEqual([{ kind: 'heal', detail: { amount: 3 } }])
    expect(playReactionsBetween(base, { ...base, hp: null })).toEqual([])
  })
})
