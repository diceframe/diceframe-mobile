import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (name: string) => fs.readFileSync(path.join(__dirname, name), 'utf-8')

/** 只取运行时导出（类型导出不进 bundle） */
function runtimeExports(source: string): string[] {
  const names = [...source.matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gm)].map((match) => match[1])
  return names.sort()
}

describe('stores/local-library.web.ts', () => {
  it('与原生版导出同一组 API，Web bundle 不会因 M3 引入而缺符号', () => {
    expect(runtimeExports(read('local-library.web.ts'))).toEqual(runtimeExports(read('local-library.ts')))
  })

  it('不引入 expo-sqlite / Drizzle（否则 Web bundle 会拖进 wa-sqlite / wasm）', () => {
    const imports = [...read('local-library.web.ts').matchAll(/^import (?!type ).*from '([^']+)'/gm)].map((match) => match[1])
    expect(imports.filter((source) => /expo-sqlite|drizzle/.test(source))).toEqual([])
  })

  it('Web 端没有本机库：仓储与 install id 都是 null', async () => {
    const web = await import('./local-library.web')
    await expect(web.localLibrary()).resolves.toBeNull()
    await expect(web.resolveInstallId()).resolves.toBeNull()
  })
})
