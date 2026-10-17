import { describe, expect, it } from 'vitest'

import { FAMILIAR_POSES, IDLE_GESTURES, idleGestureHands } from './familiar-poses'
import { REACTIONS } from './assistant-reactions'

describe('骰灵姿态表', () => {
  it('每种反应用到的表情都有姿态', () => {
    for (const spec of Object.values(REACTIONS)) expect(FAMILIAR_POSES[spec.mood]).toBeDefined()
  })

  it('待机不露手；欢呼两手举高并冒星星；掷骰右手摇骰子；待确认有角标', () => {
    expect(FAMILIAR_POSES.idle.hands.every((hand) => !hand.visible)).toBe(true)
    expect(FAMILIAR_POSES.cheer.hands.every((hand) => hand.visible && hand.y < 0)).toBe(true)
    expect(FAMILIAR_POSES.cheer.sparks).toBe(true)
    expect(FAMILIAR_POSES.rolling.shaking).toBe(true)
    expect(FAMILIAR_POSES.attention.badge).toBe(true)
  })

  it('待机小动作至少露出一只手', () => {
    for (const gesture of IDLE_GESTURES) expect(idleGestureHands(gesture).some((hand) => hand.visible)).toBe(true)
  })
})
