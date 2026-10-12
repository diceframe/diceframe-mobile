/**
 * 对局页与「当前注入的玩家身份」的作用域。
 *
 * 玩家模式的请求不带房主凭据（见 api/client 的 playerMode），而 settings 里的
 * activeShareGame 一旦留着，之后的大厅 / 房主自己的对局请求也会被当成那一局的玩家请求。
 * 所以：
 * - 进入一局时，若注入的是别的局的玩家身份，这一局按房主（GM）进入，先清掉注入；
 * - 设备上登录了房主时，离开玩家身份那一局的对局页后清掉注入，房主页面恢复房主身份。
 *   延后到下一轮检查：同一局的对局页紧接着重新挂载（开发模式的双挂载、路由替换）时不清。
 *   纯玩家（没有房主凭据）保持原行为：身份留着，回到对局仍按该身份。
 */
export interface ShareActivation {
  activeShareGame(): string | null
  ownerLoggedIn(): boolean
  activate(gameKey: string | null): void
}

export function createPlayShareScope(
  settings: ShareActivation,
  defer: (task: () => void) => void = (task) => { setTimeout(task, 0) },
) {
  const mounted = new Map<string, number>()
  return {
    enter(gameKey: string): void {
      const active = settings.activeShareGame()
      if (active && active !== gameKey) settings.activate(null)
      mounted.set(gameKey, (mounted.get(gameKey) ?? 0) + 1)
    },
    leave(gameKey: string): void {
      mounted.set(gameKey, Math.max(0, (mounted.get(gameKey) ?? 1) - 1))
      defer(() => {
        if (mounted.get(gameKey)) return
        if (settings.ownerLoggedIn() && settings.activeShareGame() === gameKey) settings.activate(null)
      })
    },
  }
}
