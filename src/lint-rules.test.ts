import path from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/** 用仓库自己的 eslint.config.js 检查一段代码，只看 no-restricted-syntax */
async function restrictedHits(code: string): Promise<number> {
  const eslint = new ESLint({ cwd: path.resolve(__dirname, '..') })
  const [result] = await eslint.lintText(code, { filePath: path.resolve(__dirname, 'lib/__lint_probe__.ts') })
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').length
}

describe('install id 唯一来源的 lint 规则', () => {
  it.each([
    ['属性访问', 'export const a = (s: { installId: string }) => s.installId'],
    ['字符串计算访问', "export const a = (s: { installId: string }) => s['installId']"],
    ['解构', 'export const a = ({ installId }: { installId: string }) => installId'],
    ['解构改名', 'export const a = (s: { installId: string }) => { const { installId: id } = s; return id }'],
    ['字符串键解构', "export const a = (s: { installId: string }) => { const { 'installId': id } = s; return id }"],
  ])('拦下%s', async (_label, code) => {
    expect(await restrictedHits(code)).toBeGreaterThan(0)
  }, 30000)

  it('不误伤无关代码', async () => {
    expect(await restrictedHits('export const a = (s: { other: string }) => s.other')).toBe(0)
  }, 30000)
})
