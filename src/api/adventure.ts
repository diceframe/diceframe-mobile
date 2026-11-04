import { api } from './client'
import { parseAdventure, type AdventureIntent, type AdventureView } from '@/lib/adventure'

/** 冒险面板：服务端按观看者投影（GM 多拿 AI 完成建议），契约见 lib/adventure */
export async function fetchGameAdventure(gameKey: string, signal?: AbortSignal): Promise<AdventureView> {
  return parseAdventure(await api<unknown>(`/games/${encodeURIComponent(gameKey)}/adventure`, { signal }))
}

/** 冒险指令走通用 /intents；失败时服务端按 code 回 403/409/422，由 client 统一抛 ApiError */
export async function submitAdventureIntent(gameKey: string, intent: AdventureIntent): Promise<void> {
  await api<unknown>(`/games/${encodeURIComponent(gameKey)}/intents`, {
    method: 'POST',
    body: JSON.stringify(intent),
  })
}
