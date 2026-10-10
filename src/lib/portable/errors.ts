/** 可移植格式的错误：code 与服务端同名的沿用服务端错误码，便于统一提示 */
export class PortableFormatError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

export const CARD_V3_INVALID = 'CARD_V3_INVALID'
export const LOREBOOK_V3_INVALID = 'LOREBOOK_V3_INVALID'
export const LOREBOOK_ENTRY_NOT_FOUND = 'LOREBOOK_ENTRY_NOT_FOUND'
export const CARD_READ_ONLY = 'CARD_READ_ONLY'
/** 以下与服务端 /api/content/* 的 413 错误码一致 */
export const BODY_TOO_LARGE = 'BODY_TOO_LARGE'
export const TOO_MANY_ITEMS = 'TOO_MANY_ITEMS'
export const TOO_MANY_ENTRIES = 'TOO_MANY_ENTRIES'
export const ENTRY_TOO_LARGE = 'ENTRY_TOO_LARGE'
