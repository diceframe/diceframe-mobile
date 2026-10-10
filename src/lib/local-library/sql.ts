/**
 * 本机内容库的最小 SQL 接口。
 *
 * 运行时由 expo-sqlite 实现（stores/local-library.ts），单测由 better-sqlite3 实现
 * （src/test/better-sqlite-database.ts）。业务代码只依赖这个接口，所以迁移与仓储
 * 逻辑能在 node 里对真实 SQLite 跑测试，Web 端也可以换实现或直接不提供。
 */

export type SqlValue = string | number | null

export interface SqlRunResult {
  changes: number
}

export interface SqlDatabase {
  exec(sql: string): Promise<void>
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>
  get<T>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>
}

/**
 * 串行执行器：同一连接上的 BEGIN…COMMIT 不能和别的语句交错（两个 await 之间
 * 可能插进另一个调用）。仓储的每个公开操作都经它排队，事务因此天然隔离。
 *
 * **不可重入**：排队中的任务里再调用同一队列（例如在仓储方法内部调用另一个公开
 * 方法）会等待自己完成而永久挂起。仓储内部复用逻辑一律调用私有的未排队实现。
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task)
    // 队列只关心顺序，不传播上一个任务的失败
    this.tail = next.catch(() => undefined)
    return next
  }
}

const activeTransactions = new WeakSet<SqlDatabase>()

/**
 * 在已排队的上下文里执行事务：失败回滚并原样抛出。
 *
 * **不可嵌套**：SQLite 不支持嵌套 BEGIN，而内层失败时的 ROLLBACK 会把外层事务一并
 * 回滚。所以同一连接上嵌套调用直接拒绝，外层事务不受影响；需要组合时把内层逻辑
 * 写成不带事务的私有函数，由最外层包一次。
 */
export async function inTransaction<T>(db: SqlDatabase, body: () => Promise<T>): Promise<T> {
  if (activeTransactions.has(db)) throw new Error('nested inTransaction on the same connection is not supported')
  activeTransactions.add(db)
  try {
    return await runTransaction(db, body)
  } finally {
    activeTransactions.delete(db)
  }
}

async function runTransaction<T>(db: SqlDatabase, body: () => Promise<T>): Promise<T> {
  await db.exec('BEGIN IMMEDIATE')
  try {
    const result = await body()
    await db.exec('COMMIT')
    return result
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => undefined)
    throw error
  }
}
