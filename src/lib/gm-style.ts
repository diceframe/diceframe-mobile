import type { GmStyle } from '@/api/types'

/** 世界编辑页不展示节奏选项；更新其它字段时必须保留服务端已有 pace。 */
export function worldGmStyleUpdate(current: GmStyle | null, draft: GmStyle): GmStyle {
  return {
    tone: draft.tone ?? '',
    verbosity: draft.verbosity ?? 'normal',
    pace: draft.pace ?? current?.pace ?? 'normal',
    custom_instructions: draft.custom_instructions ?? '',
  }
}
