/** AI 生图端点；跨对局角色卡库不绑定对局，固定全局路由（Web 无对局时同款）。 */
import { api } from './client'

export interface GenerateImageInput {
  prompt: string
  name?: string
  ruleId?: string
}

/** purpose=avatar、1:1，返回 asset_id 供 portrait { kind: 'generated' } 引用 */
export async function generateAvatarImage(input: GenerateImageInput): Promise<string> {
  const result = await api<{ ok?: boolean; error?: string; asset_id?: string }>('/generated-images', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'avatar',
      prompt: input.prompt,
      aspect_ratio: '1:1',
      style: '',
      context: { character_name: input.name || '', rule_id: input.ruleId || '' },
    }),
  })
  if (!result.ok || !result.asset_id) throw new Error(result.error || '生成头像失败')
  return result.asset_id
}
