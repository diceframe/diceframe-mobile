/**
 * 本机内容库仓储：items / server_links / rule_cache 的读写（纯 TS，只依赖 SqlDatabase）。
 *
 * 每个公开方法都经 SerialQueue 排队，多步写入包在事务里，所以「提交后更新映射与
 * 同步基线」「删除项连同映射」这类操作要么全部生效要么全不生效。
 * 文档内容的解析/补丁（可移植格式）不在这里，见 M2 的格式模块；这里只存原文。
 */
import { EMBEDDED_BOOK_SUFFIX, isCanonicalId, isLocalItemKind, newLocalId, type LocalItemKind } from './ids'
import { SerialQueue, inTransaction, type SqlDatabase } from './sql'

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
  /** 推送/拉取成功时本机项的 revision；当前 revision 更大即「本机有改动」 */
  syncedRevision: number
  /** 推送/拉取时文档的摘要（M2 定义算法），用于识别无实质变化的编辑 */
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
  syncedRevision: number
  syncedDigest?: string
  baseUrlHint?: string
}

interface ItemRow {
  local_id: string
  kind: string
  format: string
  document?: string
  name: string
  rule_id: string
  read_only: number
  revision: number
  origin: string | null
  created_at: string
  updated_at: string
}

interface LinkRow {
  server_instance_id: string
  local_id: string
  canonical_id: string
  state_token: string
  synced_revision: number
  synced_digest: string
  base_url_hint: string
  updated_at: string
}

const SUMMARY_COLUMNS = 'local_id, kind, format, name, rule_id, read_only, revision, origin, created_at, updated_at'

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

function toSummary(row: ItemRow): LocalItemSummary {
  if (!isLocalItemKind(row.kind)) throw new Error(`unknown local item kind in storage: ${row.kind}`)
  return {
    localId: row.local_id,
    kind: row.kind,
    format: row.format,
    name: row.name,
    ruleId: row.rule_id,
    readOnly: row.read_only === 1,
    revision: Number(row.revision),
    origin: parseOrigin(row.origin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toLink(row: LinkRow): ServerLink {
  return {
    serverInstanceId: row.server_instance_id,
    localId: row.local_id,
    canonicalId: row.canonical_id,
    stateToken: row.state_token,
    syncedRevision: Number(row.synced_revision),
    syncedDigest: row.synced_digest,
    baseUrlHint: row.base_url_hint,
    updatedAt: row.updated_at,
  }
}

function requireCanonical(value: string, field: string): void {
  if (!isCanonicalId(value)) throw new LocalLibraryError('INVALID_ID', `${field} is not a canonical id`)
}

export interface LocalLibraryDeps {
  /** ISO 时间戳来源，测试可注入 */
  now?: () => string
  /** uuid 来源（运行时 expo-crypto.randomUUID） */
  uuid: () => string
}

export class LocalLibraryRepository {
  private readonly queue = new SerialQueue()
  private readonly now: () => string
  private readonly uuid: () => string

  constructor(private readonly db: SqlDatabase, deps: LocalLibraryDeps) {
    this.now = deps.now ?? (() => new Date().toISOString())
    this.uuid = deps.uuid
  }

  // ---------- items ----------

  listItems(filter: { kind?: LocalItemKind } = {}): Promise<LocalItemSummary[]> {
    return this.queue.run(async () => {
      const rows = filter.kind
        ? await this.db.all<ItemRow>(
          `SELECT ${SUMMARY_COLUMNS} FROM items WHERE kind = ? ORDER BY updated_at DESC, local_id`, [filter.kind])
        : await this.db.all<ItemRow>(`SELECT ${SUMMARY_COLUMNS} FROM items ORDER BY updated_at DESC, local_id`)
      return rows.map(toSummary)
    })
  }

  getItem(localId: string): Promise<LocalItem | null> {
    return this.queue.run(() => this.readItem(localId))
  }

  createItem(input: NewLocalItem): Promise<LocalItem> {
    return this.queue.run(async () => {
      if (!isLocalItemKind(input.kind)) throw new LocalLibraryError('INVALID_KIND', 'unknown local item kind')
      const localId = newLocalId(input.kind, this.uuid())
      const now = this.now()
      await this.db.run(
        `INSERT INTO items (local_id, kind, format, document, name, rule_id, read_only, revision, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          localId, input.kind, input.format, JSON.stringify(input.document),
          input.name ?? '', input.ruleId ?? '', input.readOnly ? 1 : 0,
          input.origin ? JSON.stringify(input.origin) : null, now, now,
        ],
      )
      return (await this.readItem(localId))!
    })
  }

  /** 本地编辑：替换文档原文（调用方已按字段打好补丁），revision +1；只读项拒绝 */
  updateDocument(localId: string, update: DocumentUpdate): Promise<LocalItem> {
    return this.queue.run(async () => {
      const current = await this.readItem(localId)
      if (!current) throw new LocalLibraryError(LOCAL_ITEM_NOT_FOUND, `local item ${localId} not found`)
      if (current.readOnly) throw new LocalLibraryError(LOCAL_ITEM_READ_ONLY, `local item ${localId} is read-only`)
      await this.db.run(
        `UPDATE items SET document = ?, name = ?, rule_id = ?, revision = revision + 1, updated_at = ? WHERE local_id = ?`,
        [
          JSON.stringify(update.document), update.name ?? current.name, update.ruleId ?? current.ruleId,
          this.now(), localId,
        ],
      )
      return (await this.readItem(localId))!
    })
  }

  /** 删除本机项及其在所有服务器上的映射（含内嵌书 `<id>.book`）；服务器上的内容不受影响 */
  deleteItem(localId: string): Promise<boolean> {
    return this.queue.run(() => inTransaction(this.db, async () => {
      await this.db.run('DELETE FROM server_links WHERE local_id = ? OR local_id = ?', [localId, `${localId}${EMBEDDED_BOOK_SUFFIX}`])
      const result = await this.db.run('DELETE FROM items WHERE local_id = ?', [localId])
      return result.changes > 0
    }))
  }

  // ---------- server links ----------

  listLinks(serverInstanceId: string): Promise<ServerLink[]> {
    return this.queue.run(async () => {
      const rows = await this.db.all<LinkRow>(
        'SELECT * FROM server_links WHERE server_instance_id = ? ORDER BY local_id', [serverInstanceId])
      return rows.map(toLink)
    })
  }

  getLink(serverInstanceId: string, localId: string): Promise<ServerLink | null> {
    return this.queue.run(async () => {
      const row = await this.db.get<LinkRow>(
        'SELECT * FROM server_links WHERE server_instance_id = ? AND local_id = ?', [serverInstanceId, localId])
      return row ? toLink(row) : null
    })
  }

  findByCanonical(serverInstanceId: string, canonicalId: string): Promise<ServerLink | null> {
    return this.queue.run(async () => {
      const row = await this.db.get<LinkRow>(
        'SELECT * FROM server_links WHERE server_instance_id = ? AND canonical_id = ?', [serverInstanceId, canonicalId])
      return row ? toLink(row) : null
    })
  }

  /**
   * 一次提交/拉取的结果整体写入映射与同步基线（单事务）。
   * 一个 canonical id 在同一服务器上只能对应一个本机项：冲突说明调用方映射错了，
   * 整批拒绝（SERVER_LINK_CONFLICT），不默默改写别人的映射。
   */
  recordSync(serverInstanceId: string, records: readonly SyncRecord[]): Promise<void> {
    return this.queue.run(() => inTransaction(this.db, async () => {
      requireCanonical(serverInstanceId, 'server_instance_id')
      const now = this.now()
      for (const record of records) {
        requireCanonical(record.localId, 'local_id')
        if (!record.canonicalId) throw new LocalLibraryError('INVALID_ID', 'canonical_id is required')
        const holder = await this.db.get<{ local_id: string }>(
          'SELECT local_id FROM server_links WHERE server_instance_id = ? AND canonical_id = ? AND local_id <> ?',
          [serverInstanceId, record.canonicalId, record.localId],
        )
        if (holder) {
          throw new LocalLibraryError(
            SERVER_LINK_CONFLICT,
            `canonical id already mapped to ${holder.local_id} on this server`,
          )
        }
        await this.db.run(
          `INSERT INTO server_links (server_instance_id, local_id, canonical_id, state_token, synced_revision,
                                     synced_digest, base_url_hint, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (server_instance_id, local_id) DO UPDATE SET
             canonical_id = excluded.canonical_id,
             state_token = excluded.state_token,
             synced_revision = excluded.synced_revision,
             synced_digest = excluded.synced_digest,
             base_url_hint = excluded.base_url_hint,
             updated_at = excluded.updated_at`,
          [
            serverInstanceId, record.localId, record.canonicalId, record.stateToken,
            Math.max(0, Math.trunc(record.syncedRevision)), record.syncedDigest ?? '', record.baseUrlHint ?? '', now,
          ],
        )
      }
    }))
  }

  removeLink(serverInstanceId: string, localId: string): Promise<boolean> {
    return this.queue.run(async () => {
      const result = await this.db.run(
        'DELETE FROM server_links WHERE server_instance_id = ? AND local_id = ?', [serverInstanceId, localId])
      return result.changes > 0
    })
  }

  // ---------- rule cache ----------

  /** 规则缓存：ruleId 为空串表示规则库列表本身 */
  getRuleCache<T = unknown>(serverKey: string, ruleId: string): Promise<{ payload: T; fetchedAt: string } | null> {
    return this.queue.run(async () => {
      const row = await this.db.get<{ payload: string; fetched_at: string }>(
        'SELECT payload, fetched_at FROM rule_cache WHERE server_key = ? AND rule_id = ?', [serverKey, ruleId])
      if (!row) return null
      try {
        return { payload: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at }
      } catch {
        return null
      }
    })
  }

  putRuleCache(serverKey: string, ruleId: string, payload: unknown): Promise<void> {
    return this.queue.run(async () => {
      if (!serverKey) throw new LocalLibraryError('INVALID_ID', 'server key is required')
      await this.db.run(
        `INSERT INTO rule_cache (server_key, rule_id, payload, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (server_key, rule_id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
        [serverKey, ruleId, JSON.stringify(payload), this.now()],
      )
    })
  }

  // ---------- internals ----------

  private async readItem(localId: string): Promise<LocalItem | null> {
    const row = await this.db.get<ItemRow>(`SELECT ${SUMMARY_COLUMNS}, document FROM items WHERE local_id = ?`, [localId])
    if (!row) return null
    return { ...toSummary(row), document: JSON.parse(row.document ?? 'null') as unknown }
  }
}
