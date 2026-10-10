/**
 * vitest 专用：用 better-sqlite3（开发依赖，预编译二进制）实现 SqlDatabase，
 * 让本机内容库的迁移与仓储 SQL 在 node 里对真实 SQLite 运行。运行时不会引用本文件。
 */
import Database from 'better-sqlite3'

import type { SqlDatabase, SqlValue } from '@/lib/local-library/sql'

export function openTestDatabase(file = ':memory:'): { db: SqlDatabase; raw: Database.Database } {
  const raw = new Database(file)
  const db: SqlDatabase = {
    exec: async (sql) => {
      raw.exec(sql)
    },
    run: async (sql, params: readonly SqlValue[] = []) => ({ changes: raw.prepare(sql).run(...params).changes }),
    get: async <T>(sql: string, params: readonly SqlValue[] = []) => raw.prepare(sql).get(...params) as T | undefined,
    all: async <T>(sql: string, params: readonly SqlValue[] = []) => raw.prepare(sql).all(...params) as T[],
  }
  return { db, raw }
}
