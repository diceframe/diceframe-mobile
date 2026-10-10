/**
 * 本机内容库的运行时入口：打开 expo-sqlite 数据库、跑迁移、交出仓储单例。
 *
 * 业务与测试只依赖 lib/local-library 的 SqlDatabase 接口；这里是唯一引入 expo-sqlite
 * 的地方。Web 端（npm run web）不提供本机库：expo-sqlite 的 Web 支持仍是 alpha，
 * 且需要 COOP/COEP 响应头，返回 null 由界面隐藏入口。
 */
import { randomUUID } from 'expo-crypto'
import { Platform } from 'react-native'
import { openDatabaseAsync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite'

import { LocalLibraryRepository } from '@/lib/local-library/repository'
import { migrate } from '@/lib/local-library/schema'
import type { SqlDatabase, SqlValue } from '@/lib/local-library/sql'

export const LOCAL_LIBRARY_DB_NAME = 'diceframe-library.db'

function bind(params?: readonly SqlValue[]): SQLiteBindValue[] {
  return params ? [...params] : []
}

export function expoSqlDatabase(db: SQLiteDatabase): SqlDatabase {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => {
      const result = await db.runAsync(sql, bind(params))
      return { changes: result.changes }
    },
    get: async <T>(sql: string, params?: readonly SqlValue[]) => (await db.getFirstAsync<T>(sql, bind(params))) ?? undefined,
    all: <T>(sql: string, params?: readonly SqlValue[]) => db.getAllAsync<T>(sql, bind(params)),
  }
}

let opening: Promise<LocalLibraryRepository | null> | null = null

async function open(): Promise<LocalLibraryRepository | null> {
  if (Platform.OS === 'web') return null
  const native = await openDatabaseAsync(LOCAL_LIBRARY_DB_NAME)
  await native.execAsync('PRAGMA journal_mode = WAL')
  const db = expoSqlDatabase(native)
  await migrate(db)
  return new LocalLibraryRepository(db, { uuid: randomUUID })
}

/** 本机内容库仓储（首次调用时打开并迁移）；Web 端返回 null。打开失败下次调用重试。 */
export function localLibrary(): Promise<LocalLibraryRepository | null> {
  if (!opening) {
    opening = open().catch((error: unknown) => {
      opening = null
      throw error
    })
  }
  return opening
}
