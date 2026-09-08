#!/usr/bin/env node
/**
 * 只读审计：node scripts/audit-upstream-i18n.mjs [--json]
 * 路径相对本脚本定位，可从任意目录运行；不执行翻译模块、不写文件。
 * 静态字面量只能作为引用线索，动态 key 和不同文案实现都不能据此判为缺功能。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstreamRoot = path.resolve(mobileRoot, '../diceframe/frontend-v2')
const slash = (value) => value.split(path.sep).join('/')
const sorted = (values) => [...values].sort()
const difference = (left, right) => sorted(left).filter((key) => !right.has(key))

function unwrap(node) {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression
  }
  return node
}

function parse(filename, text, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, kind)
}

function checkSyntax(source) {
  if (source.parseDiagnostics.length) {
    const diagnostic = source.parseDiagnostics[0]
    const position = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
    throw new Error(`${source.fileName}:${position.line + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
  }
}

function dictionary(filename) {
  const source = parse(filename, fs.readFileSync(filename, 'utf8'))
  checkSyntax(source)
  let initializer
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'zhCN') initializer = declaration.initializer
    }
  }
  if (!initializer) throw new Error(`${filename}: 未找到 zhCN 字典`)
  const keys = new Set()
  function collect(expression, prefix = '') {
    const object = unwrap(expression)
    if (!ts.isObjectLiteralExpression(object)) throw new Error(`${filename}: ${prefix || 'zhCN'} 必须为对象字面量`)
    for (const property of object.properties) {
      // 对新增字典语法显式报错，避免扩展、计算属性等被悄悄漏计。
      if (!ts.isPropertyAssignment(property) || !(
        ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)
      )) throw new Error(`${filename}: 不支持的字典属性 ${property.getText(source).slice(0, 100)}`)
      const key = `${prefix}${property.name.text}`
      const value = unwrap(property.initializer)
      if (ts.isObjectLiteralExpression(value)) collect(value, `${key}.`)
      else {
        if (!ts.isStringLiteralLike(value)) throw new Error(`${filename}: ${key} 不是静态字符串`)
        if (keys.has(key)) throw new Error(`${filename}: 扁平化后 key 重复：${key}`)
        keys.add(key)
      }
    }
  }
  collect(initializer)
  return keys
}

const excludedDirectories = new Set(['messages', 'tests', 'test', '__tests__', '__mocks__', '__fixtures__', 'node_modules', 'dist', 'coverage'])
function sourceFiles(root) {
  const result = []
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) walk(filename)
      } else if (entry.isFile() && /\.(?:ts|tsx|vue)$/.test(entry.name) && !/(?:\.d\.ts|\.(?:test|spec)\.(?:ts|tsx|vue))$/.test(entry.name)) {
        const relative = slash(path.relative(root, filename))
        if (relative !== 'src/api/types.ts' && relative !== 'src/i18n/keyset.ts') result.push(filename)
      }
    }
  }
  walk(path.join(root, 'src'))
  return result
}

function decodeAttribute(text) {
  return text.replace(/&(?:quot|apos|lt|gt|amp|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' }
    if (named[entity]) return named[entity]
    return String.fromCodePoint(entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10))
  })
}

// 无需 Vue 新依赖：脚本交给 TS AST，模板仅提取插值和指令表达式；不解析完整 Vue 语义。
function fragments(filename, text) {
  if (!filename.endsWith('.vue')) return [{ text, offset: 0, kind: filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS, expression: false }]
  const result = []
  let template = text.replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\r\n]/g, ' '))
  template = template.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (match, tag, body, offset) => {
    if (tag.toLowerCase() === 'script') result.push({ text: body, offset: offset + match.indexOf('>') + 1, kind: ts.ScriptKind.TS, expression: false })
    return match.replace(/[^\r\n]/g, ' ')
  })
  // 先移除标签，避免属性里的引号、花括号被当成正文插值重复扫描。
  template = template.replace(/<\/?[a-zA-Z](?:[^<>"']|"[^"]*"|'[^']*')*>/g, (tag, offset) => {
    const attributes = /([^\s=<>]+)\s*=\s*("[^"]*"|'[^']*')/g
    for (const match of tag.matchAll(attributes)) {
      const name = match[1]
      const value = decodeAttribute(match[2].slice(1, -1))
      const attributeOffset = offset + match.index + match[0].indexOf(match[2]) + 1
      if (/^(?:[:@#]|v-)/.test(name)) {
        // v-for 左侧是绑定模式，只有 in/of 右侧才是表达式。
        const expression = name === 'v-for' ? value.replace(/^[\s\S]*?\s+(?:in|of)\s+/, '') : value
        result.push({ text: expression, offset: attributeOffset, kind: ts.ScriptKind.TS, expression: true })
      } else if (name === 'keypath' && /^<i18n-t\b/.test(tag)) {
        result.push({ text: `t(${JSON.stringify(value)})`, offset: attributeOffset, kind: ts.ScriptKind.TS, expression: true })
      }
    }
    return tag.replace(/[^\r\n]/g, ' ')
  })
  for (const match of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    result.push({ text: match[1], offset: match.index + 2, kind: ts.ScriptKind.TS, expression: true })
  }
  return result
}

function scan(root, universe) {
  const files = sourceFiles(root)
  const references = new Map()
  const dynamicCalls = []
  const templateParseWarnings = []
  for (const filename of files) {
    const text = fs.readFileSync(filename, 'utf8')
    const original = parse(filename, text)
    const relative = slash(path.relative(root, filename))
    const pieces = fragments(filename, text)
    const translatorNames = new Set(['t', '$t'])
    const parsed = pieces.map((piece) => ({ ...piece, source: parse(filename, piece.expression ? `(${piece.text})` : piece.text, piece.kind) }))
    // 识别常见别名；不做跨文件符号和数据流分析。
    for (const { source } of parsed) {
      function aliases(node) {
        if (ts.isVariableDeclaration(node) && node.initializer) {
          const init = unwrap(node.initializer)
          if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
            if (ts.isIdentifier(node.name) && ['useT', 'getT'].includes(init.expression.text)) translatorNames.add(node.name.text)
            if (ts.isObjectBindingPattern(node.name) && ['useI18n', 'useTranslation'].includes(init.expression.text)) {
              for (const item of node.name.elements) {
                if ((item.propertyName ?? item.name).getText(source) === 't' && ts.isIdentifier(item.name)) translatorNames.add(item.name.text)
              }
            }
          }
        }
        ts.forEachChild(node, aliases)
      }
      aliases(source)
    }
    for (const piece of parsed) {
      const { source } = piece
      const location = (node) => {
        const offset = piece.offset + Math.max(0, node.getStart(source) - (piece.expression ? 1 : 0))
        return `${relative}:${original.getLineAndCharacterOfPosition(Math.min(offset, text.length)).line + 1}`
      }
      if (!piece.expression) checkSyntax(source)
      else if (source.parseDiagnostics.length) templateParseWarnings.push({ location: location(source), expression: piece.text })
      const isTranslator = (expression) => {
        expression = unwrap(expression)
        return (ts.isIdentifier(expression) && translatorNames.has(expression.text)) ||
          (ts.isPropertyAccessExpression(expression) && ['t', '$t'].includes(expression.name.text)) ||
          (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'getT')
      }
      const directNodes = new Set()
      function staticArguments(node) {
        node = unwrap(node)
        if (ts.isStringLiteralLike(node)) { directNodes.add(node); return true }
        if (ts.isConditionalExpression(node)) {
          const yes = staticArguments(node.whenTrue)
          const no = staticArguments(node.whenFalse)
          return yes && no
        }
        return false
      }
      function calls(node) {
        if (ts.isTypeNode(node)) return
        if (ts.isCallExpression(node) && isTranslator(node.expression) && node.arguments.length) {
          if (!staticArguments(node.arguments[0])) dynamicCalls.push({ location: location(node), expression: node.arguments[0].getText(source) })
        }
        ts.forEachChild(node, calls)
      }
      calls(source)
      function visit(node) {
        // 排除类型、导入路径、属性名和注释，保留配置表、错误包装器等间接 key 字面量。
        if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
        if (ts.isStringLiteralLike(node) && universe.has(node.text)) {
          const parent = node.parent
          if (!((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node)) {
            const kind = directNodes.has(node) ? 'direct' : 'literal'
            const evidence = { location: location(node), kind }
            const existing = references.get(node.text) ?? []
            if (!existing.some((item) => item.location === evidence.location && item.kind === kind)) existing.push(evidence)
            references.set(node.text, existing)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  return {
    files: files.length,
    referencedKeys: sorted(references.keys()),
    directKeys: sorted([...references].filter(([, evidence]) => evidence.some((item) => item.kind === 'direct')).map(([key]) => key)),
    evidence: Object.fromEntries(sorted(references.keys()).map((key) => [key, references.get(key)])),
    dynamicCalls,
    templateParseWarnings,
  }
}

function audit() {
  const upstreamDictionary = path.join(upstreamRoot, 'src/i18n/messages/zh-CN.ts')
  const mirrorDictionary = path.join(mobileRoot, 'src/i18n/messages/web/zh-CN.ts')
  const upstreamKeys = dictionary(upstreamDictionary)
  const mirrorKeys = dictionary(mirrorDictionary)
  const universe = new Set([...upstreamKeys, ...mirrorKeys])
  const upstream = scan(upstreamRoot, universe)
  const mobile = scan(mobileRoot, universe)
  const mirrorAdditions = difference(upstreamKeys, mirrorKeys)
  const mirrorObsolete = difference(mirrorKeys, upstreamKeys)
  const candidates = difference(new Set(upstream.referencedKeys), new Set(mobile.referencedKeys)).map((key) => ({
    key,
    status: 'candidate-only-not-a-feature-gap',
    upstreamEvidence: upstream.evidence[key],
  }))
  return {
    schemaVersion: 1,
    notice: '仅候选，非功能缺失。无静态引用不能推断缺功能；字面量命中也不证明运行时使用。',
    scope: { upstreamRoot: slash(upstreamRoot), mobileRoot: slash(mobileRoot), upstreamDictionary: slash(upstreamDictionary), mirrorDictionary: slash(mirrorDictionary) },
    methodology: [
      '字典通过 TypeScript AST 提取所有字符串叶子 key，嵌套对象递归以点号扁平化（包括 apiErrors）。',
      '全局 key 集合为上游中文字典与移动端 web 中文镜像的并集；不统计移动端 df 自有文案。',
      '扫描两端 src 下 .ts/.tsx/.vue；排除 messages、tests/test/__tests__/__mocks__/__fixtures__、*.test.*、*.spec.*、*.d.ts、src/api/types.ts、src/i18n/keyset.ts。',
      'direct 为 t/$t、属性 t/$t、getT() 和常见 hook 别名的静态参数；literal 为其余值字面量命中，可能是间接 key 或普通同名业务字符串。引用集合包含二者。',
      '候选 = 上游静态字面量引用集合减移动端静态字面量引用集合；mirrorAdditions 为待补入镜像的上游 key，mirrorObsolete 为仅镜像存在的 key。',
      '不解析跨文件数据流、运行时拼接、动态模板 key、服务端内容、语义等价文案或完整别名/作用域；dynamicCalls 仅列识别到的非静态翻译参数，不展开推定引用。',
      'Vue 模板仅提取插值、指令和 i18n-t keypath，非完整 SFC 编译；模板解析告警单列，告警片段仍尽力扫描。实体解码或 v-for 转换后的证据行号可能近似。',
      '本脚本不检查其他语言、翻译值差异、页面可达性或功能覆盖；所有结论均需结合动态调用与业务实现人工核查。',
    ],
    summary: {
      upstreamKeyCount: upstreamKeys.size,
      mirrorKeyCount: mirrorKeys.size,
      unionKeyCount: universe.size,
      mirrorAdditionCount: mirrorAdditions.length,
      mirrorObsoleteCount: mirrorObsolete.length,
      upstreamFiles: upstream.files,
      mobileFiles: mobile.files,
      upstreamReferencedKeyCount: upstream.referencedKeys.length,
      mobileReferencedKeyCount: mobile.referencedKeys.length,
      upstreamDirectKeyCount: upstream.directKeys.length,
      mobileDirectKeyCount: mobile.directKeys.length,
      upstreamDynamicCallCount: upstream.dynamicCalls.length,
      mobileDynamicCallCount: mobile.dynamicCalls.length,
      templateParseWarningCount: upstream.templateParseWarnings.length + mobile.templateParseWarnings.length,
      candidateCount: candidates.length,
    },
    mirrorAdditions,
    mirrorObsolete,
    candidates,
    upstream,
    mobile,
  }
}

function printText(report) {
  console.log(`翻译覆盖只读审计\n${report.notice}\n`)
  console.log(`上游：${report.scope.upstreamDictionary}\n镜像：${report.scope.mirrorDictionary}`)
  for (const [name, value] of Object.entries(report.summary)) console.log(`${name}: ${value}`)
  const list = (title, items) => {
    console.log(`\n${title}（${items.length}）：`)
    console.log(items.length ? items.map((item) => `  ${item}`).join('\n') : '  无')
  }
  list('mirror 新增待同步 key（上游有、镜像无）', report.mirrorAdditions)
  list('mirror 过期 key（镜像有、上游无）', report.mirrorObsolete)
  list('上游有静态引用线索、移动端未发现引用的 key：仅候选，非功能缺失', report.candidates.map(({ key, upstreamEvidence }) => `${key} [${upstreamEvidence.some((item) => item.kind === 'direct') ? 'direct' : 'literal'}] ${upstreamEvidence[0].location}`))
  for (const name of ['upstream', 'mobile']) {
    list(`${name} 动态/间接翻译调用（需人工核查）`, report[name].dynamicCalls.map((item) => `${item.location} ${item.expression.replace(/\s+/g, ' ')}`))
    list(`${name} Vue 模板解析告警`, report[name].templateParseWarnings.map((item) => `${item.location} ${item.expression.replace(/\s+/g, ' ')}`))
  }
  list('统计口径与边界（--json 包含完整引用证据）', report.methodology)
}

try {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--json') || args.length > 1) throw new Error('用法：node scripts/audit-upstream-i18n.mjs [--json]')
  const report = audit()
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else printText(report)
} catch (error) {
  console.error(`翻译审计失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
