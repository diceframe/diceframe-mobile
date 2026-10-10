/**
 * 本机内容库的表结构与迁移（PRAGMA user_version 逐级前进）。
 *
 * - items：一行一个本机内容。document 是完整的可移植文档原文（chara_card_v3 /
 *   lorebook_v3 JSON）；编辑只按字段打补丁、绝不从表单重建，未知字段原样保留
 *   （Lorebook 推送是全量镜像，丢字段 = 删服务端内容）。name / rule_id 是列表冗余。
 *   revision 每次本地编辑 +1；脏标记不单独存，按服务器由 revision 与同步基线推导。
 * - server_links：本机项 × 服务器（按 server_instance_id，不按地址——它跨 IP/隧道
 *   不变）的映射 {client_ref → canonical_id, state_token} 与该服务器的同步基线。
 *   local_id 也可以是卡片内嵌书的 `<卡片 id>.book`，所以不设外键，删除项时一并清理。
 * - rule_cache：离线建卡用的规则库与角色模板缓存，按服务器地址分槽（玩家拿不到
 *   server_instance_id，而规则是公开、可随时重取的缓存）。
 *
 * - meta（v2）：键值表，目前只放 install id。它必须和内容、映射存在同一个文件里、
 *   同生共死：settings 被重置或清空时 install id 若随之改变，已有映射会悄悄推出重复
 *   副本（密码登录）或被拒（配对设备 403 SOURCE_NOT_THIS_DEVICE）。
 *
 * 迁移只增不改；遇到比本 App 更新的 user_version 一律拒绝打开（不降级、不猜）。
 */
import { inTransaction, type SqlDatabase } from './sql'

export class LocalLibrarySchemaError extends Error {
  constructor(message: string, public readonly found: number) {
    super(message)
  }
}

export const MIGRATIONS: readonly string[] = [
  // v1
  `
  CREATE TABLE items (
    local_id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('character_template', 'lorebook')),
    format TEXT NOT NULL,
    document TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    rule_id TEXT NOT NULL DEFAULT '',
    read_only INTEGER NOT NULL DEFAULT 0 CHECK (read_only IN (0, 1)),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    origin TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_items_kind_updated ON items (kind, updated_at DESC);

  CREATE TABLE server_links (
    server_instance_id TEXT NOT NULL,
    local_id TEXT NOT NULL,
    canonical_id TEXT NOT NULL,
    state_token TEXT NOT NULL DEFAULT '',
    synced_revision INTEGER NOT NULL DEFAULT 0,
    synced_digest TEXT NOT NULL DEFAULT '',
    base_url_hint TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (server_instance_id, local_id)
  );
  CREATE UNIQUE INDEX idx_server_links_canonical ON server_links (server_instance_id, canonical_id);

  CREATE TABLE rule_cache (
    server_key TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (server_key, rule_id)
  );
  `,
  // v2
  `
  CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length

export async function schemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version')
  return Number(row?.user_version ?? 0)
}

/**
 * 把库迁到最新版本；每一级在自己的事务里执行并写入 user_version，
 * 中途失败只回滚那一级，下次启动从已完成的版本继续。
 */
export async function migrate(db: SqlDatabase): Promise<number> {
  let version = await schemaVersion(db)
  if (version > LATEST_SCHEMA_VERSION) {
    throw new LocalLibrarySchemaError(
      `local library schema v${version} is newer than this app (v${LATEST_SCHEMA_VERSION})`,
      version,
    )
  }
  while (version < LATEST_SCHEMA_VERSION) {
    const target = version + 1
    await inTransaction(db, async () => {
      await db.exec(MIGRATIONS[version])
      await db.exec(`PRAGMA user_version = ${target}`)
    })
    version = target
  }
  return version
}
