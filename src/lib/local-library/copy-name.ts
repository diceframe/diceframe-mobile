/**
 * 「副本」名：在本机同类项里找一个没被占用的名字（`名字（副本）`、`名字（副本 2）`…）。
 * 后缀由调用方给（界面语言），这里只负责找空位。
 */
export function uniqueCopyName(base: string, taken: ReadonlySet<string>, suffix: (n: number) => string): string {
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${base}${suffix(n)}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}${suffix(1000)}`
}
