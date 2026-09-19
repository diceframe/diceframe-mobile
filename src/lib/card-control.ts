/**
 * 创建对局时的逐卡控制方式（对齐上游 features/create/cardControl.ts）。
 *
 * 控制语义由服务端 Player Control Contract 定义（human / ai / unclaimed），这里只把它
 * 映射成「角色」步骤上的一个三态按钮。与上游的区别：控制方式直接写在角色对象的
 * `control` 字段上，而不是另存一份按下标对齐的平行数组——删角色时不会出现控制方式
 * 错位（删掉 A(human) 之后 B 继承 human）这类问题，而且这个字段本身就是创建 payload
 * 里服务端要读的那一个（`players[i].control`，与对局内的 `players[uid].control.mode`
 * 同名不同形，一个是字符串一个是对象）。
 *
 * 服务端对不带 control 的请求按 human 处理（老客户端兼容），所以这里补齐只是为了让
 * 用户看到和最终生效一致的值，不是协议要求。
 */

export const CARD_CONTROL_MODES = ['human', 'ai', 'unclaimed'] as const
export type CardControlMode = (typeof CARD_CONTROL_MODES)[number]

/** 三态对应的上游文案 key：角色步骤与确认页摘要必须用同一份，否则两处显示会对不上。 */
export const CARD_CONTROL_LABEL_KEYS = {
  human: 'controlHuman',
  ai: 'controlAi',
  unclaimed: 'controlUnclaimed',
} as const

/** 角色对象只有 control 这一个字段与本模块有关，其余形状一概不关心。 */
function controlOf(card: object | undefined): unknown {
  return (card as { control?: unknown } | undefined)?.control
}

/**
 * 第 1 张默认「玩家」、其余默认「等待认领」。
 *
 * 其余不默认 `ai`：`unclaimed` 是「席位在、暂时没人负责」，角色不会自动行动；
 * `ai` 是服务端 AI 真的替这个角色行动。开房常见做法是先建好几张卡等朋友认领，
 * 默认成 `ai` 会直接改变游戏行为。
 */
export function defaultCardControl(index: number): CardControlMode {
  return index === 0 ? 'human' : 'unclaimed'
}

/** 把任意值（旧草稿、导入数据、用户输入）收敛成合法控制方式。 */
export function normalizeCardControl(value: unknown, index: number): CardControlMode {
  const text = String(value ?? '')
  return (CARD_CONTROL_MODES as readonly string[]).includes(text)
    ? (text as CardControlMode)
    : defaultCardControl(index)
}

/** 读某张卡当前生效的控制方式：角色步骤与确认页摘要必须用同一个答案。 */
export function cardControlAt(players: readonly object[], index: number): CardControlMode {
  return normalizeCardControl(controlOf(players[index]), index)
}

/**
 * 三态循环：human → ai → unclaimed → human，顺序即契约顺序，循环长度取自
 * CARD_CONTROL_MODES，契约变了不用改这里的魔法数。先归一化再取下一个，
 * 所以坏值被点到时会先落回合法模式而不是被跳过。越界不写入。
 */
export function cycleCardControl<T extends object>(players: readonly T[], index: number): T[] {
  const next = withCardControls(players)
  if (index < 0 || index >= next.length) return next
  const position = CARD_CONTROL_MODES.indexOf(cardControlAt(next, index))
  next[index] = { ...next[index], control: CARD_CONTROL_MODES[(position + 1) % CARD_CONTROL_MODES.length] }
  return next
}

/**
 * 给所有缺控制方式的角色补默认值。
 * 卡库选择、快速建卡、导入、专业建卡都走同一条补齐逻辑，不会出现「导入的角色没有控制方式」。
 */
export function withCardControls<T extends object>(players: readonly T[]): T[] {
  return players.map((player, index) => ({ ...player, control: cardControlAt(players, index) }))
}
