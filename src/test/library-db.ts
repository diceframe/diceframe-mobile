/**
 * vitest 专用：better-sqlite3（开发依赖，预编译二进制）+ drizzle-orm/better-sqlite3，
 * 与运行时同一份 schema、同一份随包迁移（migrations.js）和同一个仓储。
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import type { LibraryDb } from '@/lib/local-library/repository'
import { librarySchema } from '@/lib/local-library/schema'

export function openTestLibraryDb(file = ':memory:'): { db: LibraryDb; raw: Database.Database } {
  const raw = new Database(file)
  return { db: drizzle(raw, { schema: librarySchema }), raw }
}
