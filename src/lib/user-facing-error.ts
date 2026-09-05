import type { TKey } from '@/i18n/keyset'

/** 只有客户端明确选定的文案 key 可以直接展示，服务端原文与原生异常不得标记为此类型。 */
export class UserFacingError extends Error {
  constructor(public readonly key: TKey) {
    super(key)
    this.name = 'UserFacingError'
  }
}
