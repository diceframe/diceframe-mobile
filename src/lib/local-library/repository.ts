/**
 * 本机内容库仓储（Drizzle，同步驱动：运行时 expo-sqlite openDatabaseSync，测试 better-sqlite3）。
 *
 * 串行化：两个驱动都是同步 API、同一个连接，每个方法从开始到结束不会让出 JS 线程，
 * 调用之间不可能交错；多步写入包在 Drizzle 事务里，要么全部生效要么全不生效。
 * 代价是大文档读写会占用 JS 线程，单次操作只涉及一项，可接受。
 *
 * **不可重入、事务不可嵌套**：在一次写事务内部再调用仓储的写方法（例如从事务回调里
 * 调另一个公开方法）会被直接拒绝——SQLite 不支持嵌套 BEGIN，内层失败的 ROLLBACK
 * 还会把外层一起回滚。需要组合时在仓储内部写成接收 tx 的私有函数，由最外层包一次。
 *
 * 文档内容的解析/补丁（可移植格式）不在这里，见 lib/portable；这里只存原文。
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import { EMBEDDED_BOOK_SUFFIX, isCanonicalId, isLocalItemKind, newLocalId, type LocalItemKind } from './ids'
import { items, librarySchema, meta, ruleCache, serverLinks } from './schema'

export type LibraryDb = BaseSQLiteDatabase<'sync', unknown, typeof librarySchema>

const INSTALL_ID_KEY = 'install_id'

export const LOCAL_ITEM_READ_ONLY = 'LOCAL_ITEM_READ_ONLY'
export const LOCAL_ITEM_NOT_FOUND = 'LOCAL_ITEM_NOT_FOUND'
export const SERVER_LINK_CONFLICT = 'SERVER_LINK_CONFLICT'

export class LocalLibraryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

/** 拉取来源：这份本机项最初从哪台服务器的哪个 canonical id 导出（展示 + 推送时的 hint） */
export interface LocalItemOrigin {
  server_instance_id: string
  canonical_id: string
  provenance?: Record<string, unknown> | null
}

export interface LocalItemSummary {
  localId: string
  kind: LocalItemKind
  format: string
  name: string
  ruleId: string
  readOnly: boolean
  revision: number
  origin: LocalItemOrigin | null
  createdAt: string
  updatedAt: string
}

export interface LocalItem extends LocalItemSummary {
  /** 可移植文档原文（已解析的 JSON） */
  document: unknown
}

export interface ServerLink {
  serverInstanceId: string
  localId: string
  canonicalId: string
  stateToken: string
  /** 推送/拉取成功时那份文档的 revision；当前 revision 更大即「本机有改动」 */
  syncedRevision: number
  /** 推送/拉取时文档的本地摘要（lib/portable localDigest），识别无实质变化的编辑 */
  syncedDigest: string
  /** 记录时连接的地址，只用于展示，不参与身份 */
  baseUrlHint: string
  updatedAt: string
}

export interface NewLocalItem {
  kind: LocalItemKind
  format: string
  document: unknown
  name?: string
  ruleId?: string
  readOnly?: boolean
  origin?: LocalItemOrigin | null
}

export interface DocumentUpdate {
  document: unknown
  name?: string
  ruleId?: string
}

export interface SyncRecord {
  localId: string
  canonicalId: string
  stateToken: string
  /**
   * **被推送（或拉取写入）那份文档的 revision**，不是写入映射时本机项的当前 revision：
   * 推送进行中用户又改了一次时，当前 revision 已经更大，记成它会把这次改动错标为已同步。
   */
  syncedRevision: number
  syncedDigest?: string
  baseUrlHint?: string
}

type ItemRow = typeof items.$inferSelect
type LinkRow = typeof serverLinks.$inferSelect

function parseOrigin(raw: string | null): LocalItemOrigin | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<LocalItemOrigin>
    if (typeof value?.server_instance_id !== 'string' || typeof value.canonical_id !== 'string') return null
    return {
      server_instance_id: value.server_instance_id,
      canonical_id: value.canonical_id,
      provenance: value.provenance && typeof value.provenance === 'object' ? value.provenance : null,
    }
  } catch {
    return null
  }
}

function toSummary(row: Omit<ItemRow, 'document'>): LocalItemSummary {
  if (!isLocalItemKind(row.kind)) throw new Error(`unknown local item kind in storage: ${row.kind}`)
  return {
    localId: row.localId,
    kind: row.kind,
    format: row.format,
    name: row.name,
    ruleId: row.ruleId,
    readOnly: row.readOnly,
    revision: row.revision,
    origin: parseOrigin(row.origin),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toLink(row: LinkRow): ServerLink {
  return { ...row }
}

function requireCanonical(value: string, field: string): void {
  if (!isCanonicalId(value)) throw new LocalLibraryError('INVALID_ID', `${field} is not a canonical id`)
}

/** 映射所属的本机项 id（内嵌书 `<id>.book` 属于它的父卡） */
function ownerOf(localId: string): string {
  return localId.endsWith(EMBEDDED_BOOK_SUFFIX) ? localId.slice(0, -EMBEDDED_BOOK_SUFFIX.length) : localId
}

const SUMMARY_COLUMNS = {
  localId: items.localId,
  kind: items.kind,
  format: items.format,
  name: items.name,
  ruleId: items.ruleId,
  readOnly: items.readOnly,
  revision: items.revision,
  origin: items.origin,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
}

export interface LocalLibraryDeps {
  /** ISO 时间戳来源，测试可注入 */
  now?: () => string
  /** uuid 来源（运行时 expo-crypto.randomUUID） */
  uuid: () => string
}

export class LocalLibraryRepository {
  private readonly now: () => string
  private readonly uuid: () => string
  private writing = false

  constructor(private readonly db: LibraryDb, deps: LocalLibraryDeps) {
    this.now = deps.now ?? (() => new Date().toISOString())
    this.uuid = deps.uuid
  }

  // ---------- items ----------

  listItems(filter: { kind?: LocalItemKind } = {}): LocalItemSummary[] {
    const query = this.db.select(SUMMARY_COLUMNS).from(items)
    const rows = (filter.kind ? query.where(eq(items.kind, filter.kind)) : query)
      .orderBy(desc(items.updatedAt), items.localId)
      .all()
    return rows.map(toSummary)
  }

  getItem(localId: string): LocalItem | null {
    return this.readItem(this.db, localId)
  }

  createItem(input: NewLocalItem): LocalItem {
    if (!isLocalItemKind(input.kind)) throw new LocalLibraryError('INVALID_KIND', 'unknown local item kind')
    return this.write((tx) => {
      const localId = newLocalId(input.kind, this.uuid())
      const now = this.now()
      tx.insert(items).values({
        localId,
        kind: input.kind,
        format: input.format,
        document: JSON.stringify(input.document),
        name: input.name ?? '',
        ruleId: input.ruleId ?? '',
        readOnly: !!input.readOnly,
        revision: 1,
        origin: input.origin ? JSON.stringify(input.origin) : null,
        createdAt: now,
        updatedAt: now,
      }).run()
      return this.readItem(tx, localId)!
    })
  }

  /** 本地编辑：替换文档原文（调用方已按字段打好补丁），revision +1；只读项拒绝 */
  updateDocument(localId: string, update: DocumentUpdate): LocalItem {
    return this.write((tx) => {
      const current = this.readItem(tx, localId)
      if (!current) throw new LocalLibraryError(LOCAL_ITEM_NOT_FOUND, `local item ${localId} not found`)
      if (current.readOnly) throw new LocalLibraryError(LOCAL_ITEM_READ_ONLY, `local item ${localId} is read-only`)
      tx.update(items).set({
        document: JSON.stringify(update.document),
        name: update.name ?? current.name,
        ruleId: update.ruleId ?? current.ruleId,
        revision: current.revision + 1,
        updatedAt: this.now(),
      }).where(eq(items.localId, localId)).run()
      return this.readItem(tx, localId)!
    })
  }

  /** 删除本机项及其在所有服务器上的映射（含内嵌书 `<id>.book`）；服务器上的内容不受影响 */
  deleteItem(localId: string): boolean {
    return this.write((tx) => {
      tx.delete(serverLinks).where(inArray(serverLinks.localId, [localId, `${localId}${EMBEDDED_BOOK_SUFFIX}`])).run()
      const result = tx.delete(items).where(eq(items.localId, localId)).returning({ localId: items.localId }).all()
      return result.length > 0
    })
  }

  // ---------- server links ----------

  listLinks(serverInstanceId: string): ServerLink[] {
    return this.db.select().from(serverLinks)
      .where(eq(serverLinks.serverInstanceId, serverInstanceId))
      .orderBy(serverLinks.localId)
      .all()
      .map(toLink)
  }

  getLink(serverInstanceId: string, localId: string): ServerLink | null {
    const row = this.db.select().from(serverLinks)
      .where(and(eq(serverLinks.serverInstanceId, serverInstanceId), eq(serverLinks.localId, localId)))
      .get()
    return row ? toLink(row) : null
  }

  findByCanonical(serverInstanceId: string, canonicalId: string): ServerLink | null {
    const row = this.db.select().from(serverLinks)
      .where(and(eq(serverLinks.serverInstanceId, serverInstanceId), eq(serverLinks.canonicalId, canonicalId)))
      .get()
    return row ? toLink(row) : null
  }

  /**
   * 一次提交/拉取的结果整体写入映射与同步基线（单事务）。
   *
   * - 本机项（内嵌书看它的父卡）在推送途中被删掉的记录直接跳过，不写孤儿映射，
   *   返回值的 skipped 列出它们；
   * - 一个 canonical id 在同一服务器上只能对应一个本机项：占着它的若是孤儿映射
   *   （所属本机项已不存在），先清掉；若是另一个仍存在的本机项，说明调用方映射错了，
   *   整批拒绝（SERVER_LINK_CONFLICT），不默默改写别人的映射。
   */
  recordSync(serverInstanceId: string, records: readonly SyncRecord[]): { skipped: string[] } {
    requireCanonical(serverInstanceId, 'server_instance_id')
    for (const record of records) {
      requireCanonical(record.localId, 'local_id')
      if (!record.canonicalId) throw new LocalLibraryError('INVALID_ID', 'canonical_id is required')
    }
    return this.write((tx) => {
      const now = this.now()
      const skipped: string[] = []
      for (const record of records) {
        if (!this.itemExists(tx, ownerOf(record.localId))) {
          skipped.push(record.localId)
          continue
        }
        const holder = tx.select({ localId: serverLinks.localId }).from(serverLinks).where(and(
          eq(serverLinks.serverInstanceId, serverInstanceId),
          eq(serverLinks.canonicalId, record.canonicalId),
          ne(serverLinks.localId, record.localId),
        )).get()
        if (holder) {
          if (this.itemExists(tx, ownerOf(holder.localId))) {
            throw new LocalLibraryError(SERVER_LINK_CONFLICT, `canonical id already mapped to ${holder.localId} on this server`)
          }
          tx.delete(serverLinks).where(and(
            eq(serverLinks.serverInstanceId, serverInstanceId), eq(serverLinks.localId, holder.localId),
          )).run()
        }
        const values = {
          canonicalId: record.canonicalId,
          stateToken: record.stateToken,
          syncedRevision: Math.max(0, Math.trunc(record.syncedRevision)),
          syncedDigest: record.syncedDigest ?? '',
          baseUrlHint: record.baseUrlHint ?? '',
          updatedAt: now,
        }
        tx.insert(serverLinks)
          .values({ serverInstanceId, localId: record.localId, ...values })
          .onConflictDoUpdate({ target: [serverLinks.serverInstanceId, serverLinks.localId], set: values })
          .run()
      }
      return { skipped }
    })
  }

  removeLink(serverInstanceId: string, localId: string): boolean {
    return this.write((tx) => tx.delete(serverLinks)
      .where(and(eq(serverLinks.serverInstanceId, serverInstanceId), eq(serverLinks.localId, localId)))
      .returning({ localId: serverLinks.localId })
      .all().length > 0)
  }

  // ---------- rule cache ----------

  /** 规则缓存：ruleId 为空串表示规则库列表本身 */
  getRuleCache<T = unknown>(serverKey: string, ruleId: string): { payload: T; fetchedAt: string } | null {
    const row = this.db.select().from(ruleCache)
      .where(and(eq(ruleCache.serverKey, serverKey), eq(ruleCache.ruleId, ruleId)))
      .get()
    if (!row) return null
    try {
      return { payload: JSON.parse(row.payload) as T, fetchedAt: row.fetchedAt }
    } catch {
      return null
    }
  }

  putRuleCache(serverKey: string, ruleId: string, payload: unknown): void {
    if (!serverKey) throw new LocalLibraryError('INVALID_ID', 'server key is required')
    const values = { payload: JSON.stringify(payload), fetchedAt: this.now() }
    this.write((tx) => {
      tx.insert(ruleCache).values({ serverKey, ruleId, ...values })
        .onConflictDoUpdate({ target: [ruleCache.serverKey, ruleCache.ruleId], set: values })
        .run()
    })
  }

  // ---------- install id ----------

  /**
   * 本安装的 install id，存在本库的 meta 表里，与内容和映射同生共死（settings 里只是缓存）。
   * 库里有合法值就永远用它；库里没有（或已被破坏）时，收编 settings 里缓存的合法值
   * （seed，一次性迁移），都没有才生成新的。
   */
  ensureInstallId(seed: string): string {
    return this.write((tx) => {
      const row = tx.select().from(meta).where(eq(meta.key, INSTALL_ID_KEY)).get()
      if (row && isCanonicalId(row.value)) return row.value
      const id = isCanonicalId(seed) ? seed : this.uuid().toLowerCase()
      if (!isCanonicalId(id)) throw new LocalLibraryError('INVALID_ID', 'uuid source returned a non-canonical id')
      tx.insert(meta).values({ key: INSTALL_ID_KEY, value: id })
        .onConflictDoUpdate({ target: meta.key, set: { value: id } })
        .run()
      return id
    })
  }

  // ---------- internals ----------

  /** 唯一的写事务入口：拒绝重入/嵌套（见文件头说明） */
  private write<T>(body: (tx: LibraryDb) => T): T {
    if (this.writing) {
      throw new Error('LocalLibraryRepository is not re-entrant: nested write transactions are not supported')
    }
    this.writing = true
    try {
      return this.db.transaction((tx) => body(tx))
    } finally {
      this.writing = false
    }
  }

  private itemExists(q: LibraryDb, localId: string): boolean {
    return !!q.select({ localId: items.localId }).from(items).where(eq(items.localId, localId)).get()
  }

  private readItem(q: LibraryDb, localId: string): LocalItem | null {
    const row = q.select().from(items).where(eq(items.localId, localId)).get()
    if (!row) return null
    return { ...toSummary(row), document: JSON.parse(row.document) as unknown }
  }
}

