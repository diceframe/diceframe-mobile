/**
 * 本机内容库的表结构（Drizzle）。改动后运行 `npx drizzle-kit generate` 生成迁移并提交。
 *
 * - items：一行一个本机内容。document 是完整的可移植文档原文（chara_card_v3 /
 *   lorebook_v3 JSON）；编辑只按字段打补丁、绝不从表单重建，未知字段原样保留
 *   （Lorebook 推送是全量镜像，丢字段 = 删服务端内容）。name / rule_id 是列表冗余。
 *   revision 每次本地编辑 +1；脏标记不单独存，按服务器由 revision 与同步基线推导。
 * - server_links：本机项 × 服务器（按 server_instance_id，不按地址——它跨 IP/隧道
 *   不变）的映射 {client_ref → canonical_id, state_token} 与该服务器的同步基线。
 *   local_id 也可以是卡片内嵌书的 `<卡片 id>.book`，所以不设外键，删除项时一并清理；
 *   同一服务器上一个 canonical id 只能对应一个本机项。
 * - rule_cache：离线建卡用的规则库与角色模板缓存，按服务器地址分槽（玩家拿不到
 *   server_instance_id，而规则是公开、可随时重取的缓存）。
 * - meta：键值表，目前只放 install id。它必须和内容、映射存在同一个文件里、同生共死：
 *   settings 被重置或清空时 install id 若随之改变，已有映射会悄悄推出重复副本
 *   （密码登录）或被拒（配对设备 403 SOURCE_NOT_THIS_DEVICE）。
 */
import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const items = sqliteTable('items', {
  localId: text('local_id').primaryKey().notNull(),
  kind: text('kind', { enum: ['character_template', 'lorebook'] }).notNull(),
  format: text('format').notNull(),
  document: text('document').notNull(),
  name: text('name').notNull().default(''),
  ruleId: text('rule_id').notNull().default(''),
  readOnly: integer('read_only', { mode: 'boolean' }).notNull().default(false),
  revision: integer('revision').notNull().default(1),
  origin: text('origin'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_items_kind_updated').on(table.kind, table.updatedAt),
  check('items_kind_check', sql`${table.kind} IN ('character_template', 'lorebook')`),
  check('items_revision_check', sql`${table.revision} >= 1`),
])

export const serverLinks = sqliteTable('server_links', {
  serverInstanceId: text('server_instance_id').notNull(),
  localId: text('local_id').notNull(),
  canonicalId: text('canonical_id').notNull(),
  stateToken: text('state_token').notNull().default(''),
  syncedRevision: integer('synced_revision').notNull().default(0),
  syncedDigest: text('synced_digest').notNull().default(''),
  baseUrlHint: text('base_url_hint').notNull().default(''),
  /** 服务器上的副本已被删除时记下的时间（拉取 / 状态查询发现）；本机项保留不删，再次同步成功时清空 */
  remoteDeletedAt: text('remote_deleted_at'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.serverInstanceId, table.localId] }),
  uniqueIndex('idx_server_links_canonical').on(table.serverInstanceId, table.canonicalId),
])

export const ruleCache = sqliteTable('rule_cache', {
  serverKey: text('server_key').notNull(),
  ruleId: text('rule_id').notNull(),
  payload: text('payload').notNull(),
  fetchedAt: text('fetched_at').notNull(),
}, (table) => [primaryKey({ columns: [table.serverKey, table.ruleId] })])

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull(),
})

export const librarySchema = { items, serverLinks, ruleCache, meta }
