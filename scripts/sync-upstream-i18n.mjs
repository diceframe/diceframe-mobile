#!/usr/bin/env node
/**
 * 上游文案镜像同步：node scripts/sync-upstream-i18n.mjs
 * 路径相对本脚本定位（上游默认在 ../diceframe/frontend-v2），可从任意目录运行。
 *
 * 把 frontend-v2/src/i18n/messages/*.ts 重拷为 src/i18n/messages/web/*.ts，
 * 机械替换固定三步（与各镜像文件头注释一致）：
 * 1. vue-i18n 命名插值 {x} → i18next 的 {{x}}；
 * 2. 上游唯一的嵌套对象 apiErrors 拍平为 'apiErrors.xxx'（移动端 keySeparator:false）；
 * 3. 上游某语言漏译的 key 以英文值补齐——messages.test.ts 要求四语 key 集合一致
 *    （这是同步被截断的探针，不能因上游漏译而放宽），而 i18next 运行时本就回退英文，
 *    补齐只是把回退提前到构建期；上游补上翻译后下次重拷会自然消失。
 *
 * 只动镜像段：移动端自有文案在 messages/mobile/，本脚本不碰。
 * 跑完照例 npm run typecheck && npm test && npm run lint。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LANGS = ['zh-CN', 'en', 'ja', 'de']
const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstreamDir = path.resolve(mobileRoot, '../diceframe/frontend-v2/src/i18n/messages')
const mirrorDir = path.join(mobileRoot, 'src/i18n/messages/web')

const header = (file, patched) => `/**
 * 上游翻译镜像 —— 拷贝自 frontend-v2/src/i18n/messages/${file}。
 * 机械差异仅两处：
 * 1. vue-i18n 命名插值 {x} 已转换为 i18next 的 {{x}}
 *   （正则 /(?<!{){([a-zA-Z_][a-zA-Z0-9_]*)}(?!})/g → {{$1}}）；
 * 2. 上游唯一的嵌套对象 apiErrors 已拍平为 'apiErrors.xxx' 扁平 key
 *   （移动端 i18next 配置 keySeparator:false，嵌套 key 无法命中）。
 * 同步方式：node scripts/sync-upstream-i18n.mjs（重拷上游文件后机械替换，其余逐字保留）。
${patched ? ' *\n * 本语言另有上游漏译的 key，文末以英文值补齐（见该段注释）。\n' : ''} */
`

/** 第 1、2 步：插值改写 + apiErrors 拍平。 */
function transform(text) {
  const converted = text
    .replace(/\r\n/g, '\n')
    .replace(/(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})/g, '{{$1}}')
  const out = []
  let inApiErrors = false
  for (const line of converted.split('\n')) {
    if (!inApiErrors && /^ {2}apiErrors: \{\s*$/.test(line)) { inApiErrors = true; continue }
    if (inApiErrors) {
      if (/^ {2}\},\s*$/.test(line)) { inApiErrors = false; continue }
      const entry = line.match(/^ {4}([A-Za-z_][A-Za-z0-9_]*): (.*)$/)
      // 非 key 行（注释、空行）只退一级缩进，保留上游原样。
      out.push(entry ? `  'apiErrors.${entry[1]}': ${entry[2]}` : line.replace(/^ {4}/, '  '))
      continue
    }
    out.push(line)
  }
  if (inApiErrors) throw new Error('apiErrors 块未闭合，上游结构变了，先核对再同步')
  return out.join('\n')
}

/** 把转换后的字典当对象字面量求值：比对 key 集合、取英文兜底值。上游字典是纯静态字面量。 */
function evaluate(body) {
  const start = body.indexOf('= {')
  const end = body.lastIndexOf('} as const')
  if (start < 0 || end < 0) throw new Error('未找到 `export const x = { … } as const` 结构')
  return new Function(`return ${body.slice(start + 2, end + 1)}`)()
}

const BACKSLASH = String.fromCharCode(92)
const quote = (value) => `'${String(value)
  .split(BACKSLASH).join(BACKSLASH + BACKSLASH)
  .split("'").join(BACKSLASH + "'")}'`

const bodies = Object.fromEntries(
  LANGS.map((lang) => [lang, transform(fs.readFileSync(path.join(upstreamDir, `${lang}.ts`), 'utf8'))]),
)
const dicts = Object.fromEntries(LANGS.map((lang) => [lang, evaluate(bodies[lang])]))
// 以中文字典为准：上游以中文为源语言，keyset.ts 也取 web/zh-CN 做 key 全集。
const baseKeys = Object.keys(dicts['zh-CN'])

for (const lang of LANGS) {
  const missing = baseKeys.filter((key) => !(key in dicts[lang]))
  let body = bodies[lang]
  if (missing.length) {
    const patch = [
      `  // ---- 上游 ${lang}.ts 漏译，以英文值补齐（保持四语 key 集合一致，运行时本就回退英文）----`,
      ...missing.map((key) => {
        const name = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : quote(key)
        return `  ${name}: ${quote(dicts.en[key])},`
      }),
      '} as const',
      '',
    ]
    body = body.slice(0, body.lastIndexOf('} as const')) + patch.join('\n')
  }
  fs.writeFileSync(path.join(mirrorDir, `${lang}.ts`), header(`${lang}.ts`, missing.length > 0) + body, 'utf8')
  console.log(`${lang}: ${baseKeys.length} key，其中上游漏译补英文 ${missing.length} 个`)
}
