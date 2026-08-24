import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localEnvPath = resolve(projectRoot, '.env.local')

function readLocalEnv(filePath) {
  if (!existsSync(filePath)) return {}
  const values = {}
  for (const rawLine of readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
    values[match[1]] = value
  }
  return values
}

const localEnv = readLocalEnv(localEnvPath)
const proxyUrl =
  process.env.EXPO_PACKAGER_PROXY_URL ||
  process.env.DICEFRAME_EXPO_PROXY_URL ||
  localEnv.DICEFRAME_EXPO_PROXY_URL

if (!proxyUrl) {
  console.error('缺少 DICEFRAME_EXPO_PROXY_URL，请写入 mobile/.env.local。')
  process.exit(1)
}

try {
  const parsedProxyUrl = new URL(proxyUrl)
  if (!['http:', 'https:'].includes(parsedProxyUrl.protocol)) {
    throw new Error('代理地址必须使用 http 或 https')
  }
} catch (error) {
  console.error(`DICEFRAME_EXPO_PROXY_URL 无效：${error instanceof Error ? error.message : error}`)
  process.exit(1)
}

const expoCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(
  expoCommand,
  ['expo', 'start', '--port', '8081', ...process.argv.slice(2)],
  {
    cwd: projectRoot,
    env: { ...process.env, EXPO_PACKAGER_PROXY_URL: proxyUrl },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
