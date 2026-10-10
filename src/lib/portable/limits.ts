/**
 * 推送前的本地限额预检（对齐服务端 /api/content/* 的 413：diceframe/diceframe#494「Limits」）。
 *
 * 服务端才是权威：它按解析后的草稿计条目大小，与本机按原始 JSON 计会有出入，
 * 所以这里只做「明显超限就别发了」的提前拦截，并沿用服务端错误码便于统一提示。
 * 服务端仍可能返回 413，调用方照常处理。
 */
import {
  BODY_TOO_LARGE,
  ENTRY_TOO_LARGE,
  PortableFormatError,
  TOO_MANY_ENTRIES,
  TOO_MANY_ITEMS,
} from './errors'
import { utf8ByteLength } from './json'
import type { LorebookBook } from './lorebook-v3'

export const MAX_BODY_BYTES = 8 * 1024 * 1024
export const MAX_ITEMS = 50
export const MAX_ENTRIES_PER_BOOK = 2000
export const MAX_ENTRY_BYTES = 32 * 1024

export interface LimitViolation {
  code: string
  /** 违规的本机项（client_ref）；请求级违规为空 */
  clientRef: string
  /** 违规的条目 id（ENTRY_TOO_LARGE 时） */
  entryId?: string
}

/** 一本书（独立书或卡片内嵌书）的条目数与单条大小 */
export function bookLimitViolations(book: LorebookBook, clientRef: string): LimitViolation[] {
  const violations: LimitViolation[] = []
  if (book.entries.length > MAX_ENTRIES_PER_BOOK) violations.push({ code: TOO_MANY_ENTRIES, clientRef })
  for (const entry of book.entries) {
    if (utf8ByteLength(JSON.stringify(entry)) > MAX_ENTRY_BYTES) {
      violations.push({ code: ENTRY_TOO_LARGE, clientRef, entryId: String(entry.id ?? entry.uid ?? '') })
    }
  }
  return violations
}

/** 整个请求：条目数上限与请求体字节数（body 为即将发送的 JSON 对象） */
export function requestLimitViolations(itemCount: number, body: unknown): LimitViolation[] {
  const violations: LimitViolation[] = []
  if (itemCount > MAX_ITEMS) violations.push({ code: TOO_MANY_ITEMS, clientRef: '' })
  if (utf8ByteLength(JSON.stringify(body)) > MAX_BODY_BYTES) violations.push({ code: BODY_TOO_LARGE, clientRef: '' })
  return violations
}

/** 有违规就抛出第一条（PortableFormatError，code 同服务端） */
export function assertWithinLimits(violations: readonly LimitViolation[]): void {
  const first = violations[0]
  if (first) throw new PortableFormatError(first.code, `content exceeds the server limit: ${first.code}`)
}
