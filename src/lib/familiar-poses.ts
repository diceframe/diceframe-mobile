/**
 * 骰灵各表情的眼睛 / 身体 / 双手姿态，按上游 AssistantAvatar.vue 的 CSS 换算成比例数据
 * （单位：占骰灵边长的百分比，角度为度）。组件只按表插值，表情设计集中在这里。
 */
import type { AvatarMood } from './assistant-reactions'

/** 眼睛形状：普通胶囊、上弧（笑眼）、X（晕）、尖括号（疼）、菱形闪光（欢呼） */
export type EyeKind = 'pill' | 'arc' | 'cross' | 'chevron' | 'sparkle'

export interface EyePose {
  kind: EyeKind
  w: number
  h: number
  /** 左眼 / 右眼旋转 */
  rotate: [number, number]
  /** 右眼高度倍率（好奇时一大一小） */
  rightScale?: number
  /** 视线偏移（百分比） */
  look?: [number, number]
}

/** 身体一次性 / 循环动作 */
export type BodyMotion = 'none' | 'roll' | 'hop' | 'hop2' | 'wobble' | 'flinch' | 'lean' | 'dart' | 'bob'

export interface BodyPose {
  scale: number
  translateY: number
  rotate: number
  motion: BodyMotion
}

/** 手的位置：相对骰灵中心的偏移（百分比）、旋转、可见 */
export interface HandPose {
  x: number
  y: number
  rotate: number
  visible: boolean
}

export interface FamiliarPose {
  eyes: EyePose
  body: BodyPose
  hands: [HandPose, HandPose]
  /** 欢呼时冒星星 */
  sparks?: boolean
  /** 待确认时的角标 */
  badge?: boolean
  /** 右手是否捏着小骰子摇 */
  shaking?: boolean
}

const EYE_W = 8.5
const EYE_H = 19
const HIDDEN: HandPose = { x: 0, y: 26, rotate: 0, visible: false }
const LEFT_REST: HandPose = { x: -44, y: 30, rotate: -10, visible: false }
const RIGHT_REST: HandPose = { x: 44, y: 30, rotate: 10, visible: false }
const BODY: BodyPose = { scale: 1, translateY: 0, rotate: 0, motion: 'none' }
const PILL: EyePose = { kind: 'pill', w: EYE_W, h: EYE_H, rotate: [0, 0] }

export const FAMILIAR_POSES: Record<AvatarMood, FamiliarPose> = {
  idle: { eyes: PILL, body: BODY, hands: [LEFT_REST, RIGHT_REST] },
  happy: {
    eyes: { kind: 'arc', w: EYE_W * 2.1, h: EYE_W * 1.25, rotate: [0, 0] },
    body: { ...BODY, scale: 1.06 },
    hands: [LEFT_REST, { x: 46, y: -30, rotate: 20, visible: true }],
  },
  thinking: {
    eyes: { ...PILL, h: EYE_H * 0.65, look: [2.4, -2.2] },
    body: { ...BODY, motion: 'bob' },
    hands: [LEFT_REST, { x: 20, y: 40, rotate: -30, visible: true }],
  },
  listening: {
    eyes: { ...PILL, w: EYE_W * 1.3, h: EYE_H * 0.88 },
    body: BODY,
    hands: [{ x: -46, y: -22, rotate: -30, visible: true }, { x: 46, y: -22, rotate: 30, visible: true }],
  },
  speaking: {
    eyes: PILL,
    body: { ...BODY, motion: 'bob' },
    hands: [{ x: -40, y: 20, rotate: -14, visible: true }, { x: 40, y: 20, rotate: 14, visible: true }],
  },
  attention: {
    eyes: { ...PILL, h: EYE_H * 0.86 },
    body: BODY,
    hands: [LEFT_REST, { x: 44, y: -40, rotate: 15, visible: true }],
    badge: true,
  },
  surprised: {
    eyes: { kind: 'pill', w: EYE_W * 1.8, h: EYE_W * 1.8, rotate: [0, 0] },
    body: { ...BODY, scale: 1.08 },
    hands: [{ x: -48, y: 0, rotate: -40, visible: true }, { x: 48, y: 0, rotate: 40, visible: true }],
  },
  cheer: {
    eyes: { kind: 'sparkle', w: EYE_W * 1.6, h: EYE_W * 1.6, rotate: [45, 45] },
    body: { ...BODY, motion: 'roll' },
    hands: [{ x: -42, y: -44, rotate: -20, visible: true }, { x: 42, y: -44, rotate: 20, visible: true }],
    sparks: true,
  },
  nod: {
    eyes: { kind: 'arc', w: EYE_W * 2.1, h: EYE_W * 1.25, rotate: [0, 0] },
    body: { ...BODY, motion: 'hop' },
    hands: [LEFT_REST, RIGHT_REST],
  },
  sad: {
    eyes: { kind: 'pill', w: EYE_W * 2.3, h: EYE_W * 0.8, rotate: [-26, 26] },
    body: { ...BODY, scale: 0.97, translateY: 4 },
    hands: [{ x: -30, y: 40, rotate: 0, visible: true }, { x: 30, y: 40, rotate: 0, visible: true }],
  },
  dizzy: {
    eyes: { kind: 'cross', w: EYE_W * 2, h: EYE_W * 2, rotate: [0, 0] },
    body: { ...BODY, motion: 'wobble' },
    hands: [HIDDEN, HIDDEN],
  },
  battle: {
    eyes: { kind: 'pill', w: EYE_W, h: EYE_H * 0.6, rotate: [16, -16] },
    body: { ...BODY, translateY: 1 },
    hands: [{ x: -40, y: 10, rotate: 0, visible: true }, { x: 40, y: 10, rotate: 0, visible: true }],
  },
  hurt: {
    eyes: { kind: 'chevron', w: EYE_W * 1.5, h: EYE_W * 1.5, rotate: [45, -135] },
    body: { ...BODY, motion: 'flinch' },
    hands: [{ x: -40, y: -10, rotate: -40, visible: true }, { x: 40, y: -10, rotate: 40, visible: true }],
  },
  worried: {
    eyes: { kind: 'pill', w: EYE_W * 1.2, h: EYE_W * 1.4, rotate: [0, 0] },
    body: { ...BODY, motion: 'dart' },
    hands: [{ x: -18, y: 38, rotate: -20, visible: true }, { x: 18, y: 38, rotate: 20, visible: true }],
  },
  alert: {
    eyes: { ...PILL, h: EYE_H * 1.12 },
    body: { ...BODY, motion: 'hop2' },
    hands: [LEFT_REST, { x: 46, y: -44, rotate: 20, visible: true }],
  },
  curious: {
    eyes: { ...PILL, h: EYE_H * 0.7, rightScale: 1.05 / 0.7, look: [1.5, -1] },
    body: { ...BODY, rotate: -9 },
    hands: [LEFT_REST, { x: 20, y: 40, rotate: -30, visible: true }],
  },
  rolling: {
    eyes: { ...PILL, h: EYE_H * 0.8, look: [2.5, 1.5] },
    body: { ...BODY, motion: 'lean' },
    hands: [LEFT_REST, { x: 44, y: 18, rotate: 0, visible: true }],
    shaking: true,
  },
}

/** 待机小动作（上游 IDLE_GESTURES）：只改手 */
export type IdleGesture = 'wave' | 'stretch' | 'scratch'
export const IDLE_GESTURES: IdleGesture[] = ['wave', 'stretch', 'scratch']

export function idleGestureHands(gesture: IdleGesture): [HandPose, HandPose] {
  if (gesture === 'wave') return [LEFT_REST, { x: 46, y: -34, rotate: 25, visible: true }]
  if (gesture === 'stretch') return [{ x: -40, y: -50, rotate: -10, visible: true }, { x: 40, y: -50, rotate: 10, visible: true }]
  return [LEFT_REST, { x: 20, y: -52, rotate: -40, visible: true }]
}
