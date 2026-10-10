/**
 * 本机内容库的运行时入口：打开 expo-sqlite（同步 API，Drizzle expo 驱动只支持它）、
 * 开 WAL、新库保护 + 迁移、交出仓储单例。
 *
 * 业务与测试只依赖 lib/local-library（Drizzle schema + 仓储）；这里是唯一引入
 * expo-sqlite 的地方。Web 端（npm run web）不提供本机库：expo-sqlite 的 Web 支持
 * 仍是 alpha，且需要 COOP/COEP 响应头，返回 null 由界面隐藏入口。
 */
import { randomUUID } from 'expo-crypto'
import { Platform } from 'react-native'
import { openDatabaseSync } from 'expo-sqlite'
import { drizzle } from 'drizzle-orm/expo-sqlite'

import { migrateLibrary } from '@/lib/local-library/migrate'
import { LocalLibraryRepository, type LibraryDb } from '@/lib/local-library/repository'
import { librarySchema } from '@/lib/local-library/schema'
import { useSettingsStore } from '@/stores/settings'

export const LOCAL_LIBRARY_DB_NAME = 'diceframe-library.db'

let opening: Promise<LocalLibraryRepository | null> | null = null

async function open(): Promise<LocalLibraryRepository | null> {
  if (Platform.OS === 'web') return null
  const native = openDatabaseSync(LOCAL_LIBRARY_DB_NAME)
  native.execSync('PRAGMA journal_mode = WAL')
  const db: LibraryDb = drizzle(native, { schema: librarySchema })
  await migrateLibrary(db)
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

/**
 * 本安装的 install id（内容同步与配对上报都用它）：以本机库 meta 表为准，
 * 首次调用时收编 settings 里的缓存值，并把权威值回写到 settings 缓存。
 * Web 端没有本机库，返回 null（不参与内容同步）。
 */
export async function resolveInstallId(): Promise<string | null> {
  const library = await localLibrary()
  if (!library) return null
  const cached = useSettingsStore.getState().installId
  const installId = library.ensureInstallId(cached)
  if (installId !== cached) useSettingsStore.setState({ installId })
  return installId
}
