/**
 * 本机内容库的标识（对齐服务端内容同步契约 diceframe/diceframe#494「Identity」）。
 *
 * - install id：每个安装生成一次、永不改变、跨服务器共用；推送时作为
 *   `source = {kind: "device", id: <install id>}` 声明，配对时随 /api/pairing/claim 上报。
 * - client_ref：本机内容 id（即 items.local_id），在该项的整个生命周期内稳定；
 *   卡片内嵌书的 client_ref 由服务端约定为 `<卡片 client_ref>.book`。
 * - 两者都必须是服务端认可的规范 id：`[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}`。
 */

const CANONICAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/

export type LocalItemKind = 'character_template' | 'lorebook'

export const LOCAL_ITEM_KINDS: readonly LocalItemKind[] = ['character_template', 'lorebook']

/** 内嵌书的 client_ref 后缀（服务端 G2c 约定） */
export const EMBEDDED_BOOK_SUFFIX = '.book'

export function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_ID_RE.test(value)
}

export function isLocalItemKind(value: unknown): value is LocalItemKind {
  return value === 'character_template' || value === 'lorebook'
}

const KIND_PREFIX: Record<LocalItemKind, string> = {
  character_template: 'card',
  lorebook: 'book',
}

/**
 * 新本机项 id：`card-<uuid>` / `book-<uuid>`。前缀只为排查时一眼看出类型，
 * 身份比较一律按整串；uuid 由调用方注入（运行时 expo-crypto.randomUUID），便于测试。
 */
export function newLocalId(kind: LocalItemKind, uuid: string): string {
  const id = `${KIND_PREFIX[kind]}-${uuid.toLowerCase()}`
  if (!isCanonicalId(id) || id.endsWith(EMBEDDED_BOOK_SUFFIX)) {
    throw new Error(`invalid local id generated: ${id}`)
  }
  return id
}

/** 卡片内嵌书的 client_ref */
export function embeddedBookRef(cardLocalId: string): string {
  return `${cardLocalId}${EMBEDDED_BOOK_SUFFIX}`
}

/**
 * 已保存的 install id 合法就沿用（绝不因为换服务器、换版本而改变），
 * 缺失或被破坏时才生成新的。返回值总是规范 id。
 */
export function ensureInstallId(stored: unknown, uuid: () => string): string {
  if (isCanonicalId(stored)) return stored
  const fresh = uuid().toLowerCase()
  if (!isCanonicalId(fresh)) throw new Error('uuid source returned a non-canonical id')
  return fresh
}
