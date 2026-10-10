/**
 * 本机内容库的迁移：drizzle-kit 生成、随包内联的 SQL（migrations/migrations.js），
 * 在打开数据库时由 Drizzle 官方 expo-sqlite 迁移器执行。
 *
 * 为什么在打开时跑、而不是组件里的 useMigrations：仓储是单例（stores/local-library.ts），
 * 推送/拉取/加入页等多个入口都可能先用到它；迁移挂在打开流程上，任何入口拿到的都是
 * 已迁移的库，也不必让每个界面处理「迁移中」的渲染分支。
 *
 * 新库保护：Drizzle 迁移器只看「库里最后一次迁移的时间」，遇到比本 App 更新的库会
 * 什么都不做、照常打开——随后旧代码就可能误读或写坏新结构。所以迁移前先比对库里已应用
 * 的迁移（__drizzle_migrations.created_at）与随包 journal：库里有本 App 不认识的迁移，
 * 一律拒绝打开，且不改动数据库。
 */
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/expo-sqlite/migrator'
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite'

import bundledMigrations from './migrations/migrations'
import type { LibraryDb } from './repository'

export type MigrationBundle = typeof bundledMigrations

export const MIGRATIONS_TABLE = '__drizzle_migrations'

export class LocalLibrarySchemaError extends Error {
  constructor(message: string, public readonly unknownMigrations: number[]) {
    super(message)
  }
}

/** 库里已应用迁移的时间戳（即 journal 的 when）；迁移表不存在（新库）时为空数组 */
export function appliedMigrations(db: LibraryDb): number[] {
  const table = db.get<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${MIGRATIONS_TABLE}`,
  )
  if (!table) return []
  return db
    .all<{ created_at: number | string }>(sql`SELECT created_at FROM ${sql.identifier(MIGRATIONS_TABLE)}`)
    .map((row) => Number(row.created_at))
}

/** 库里有本 App 不认识的迁移（来自更新版本的 App）就拒绝打开；只读检查，不改库 */
export function assertNoUnknownMigrations(db: LibraryDb, bundle: MigrationBundle = bundledMigrations): void {
  const known = new Set(bundle.journal.entries.map((entry) => entry.when))
  const unknown = appliedMigrations(db).filter((when) => !known.has(when))
  if (unknown.length) {
    throw new LocalLibrarySchemaError(
      'the local library was written by a newer version of the app; update the app to open it',
      unknown,
    )
  }
}

/** 打开时迁移到随包的最新结构；先做新库保护 */
export async function migrateLibrary(db: LibraryDb, bundle: MigrationBundle = bundledMigrations): Promise<void> {
  assertNoUnknownMigrations(db, bundle)
  // 官方迁移器的类型只写了 expo 驱动；它调用的是两种同步驱动共有的 dialect.migrate，
  // 测试里用 better-sqlite3 驱动跑的就是这同一条路径
  await migrate(db as unknown as ExpoSQLiteDatabase, bundle)
}
