/**
 * Metro dev server 的 API 反向代理（Web 联调用）。
 *
 * Expo Web 页面与 DiceFrame 后端不同源，浏览器按 CORS 拦截；在 Metro 内把
 * /api 与 /v2-assets 反向代理到后端后，Web 端登录页服务器地址留空即走同源
 * 相对路径，不再产生跨域请求。原生 App 的 baseUrl 指向后端本体，不会请求
 * Metro 的这些路径，不受影响。
 *
 * 目标后端：环境变量 DICEFRAME_API_TARGET，默认 http://127.0.0.1:18000
 * （与 frontend-v2 的 Vite dev proxy 同一目标）。
 */
const http = require('node:http')
const https = require('node:https')
const { URL } = require('node:url')

const PROXIED_PREFIXES = ['/api', '/v2-assets']

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/** RFC 7230：Connection 头里点名的头也属于逐跳头，需要一并剔除 */
function hopByHopTokens(headerValue) {
  return String(headerValue || '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function filterHeaders(headers) {
  const dropped = new Set(HOP_BY_HOP_HEADERS)
  for (const token of hopByHopTokens(headers['connection'])) dropped.add(token)
  const filtered = {}
  for (const [name, value] of Object.entries(headers)) {
    if (!dropped.has(name.toLowerCase())) filtered[name] = value
  }
  return filtered
}

function shouldProxy(url) {
  const path = (url || '').split('?')[0]
  return PROXIED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}

module.exports = function createApiProxyMiddleware() {
  const target = new URL(process.env.DICEFRAME_API_TARGET || 'http://127.0.0.1:18000')
  const transport = target.protocol === 'https:' ? https : http
  const baseHeaders = filterHeaders({ host: target.host })

  console.log(`[dev-api-proxy] /api & /v2-assets -> ${target.origin}`)

  return function apiProxy(req, res, next) {
    if (!shouldProxy(req.url)) {
      next()
      return
    }

    const upstream = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: req.url,
        method: req.method,
        headers: { ...baseHeaders, ...filterHeaders(req.headers), host: target.host },
      },
      (upstreamRes) => {
        // 直接 pipe 流式转发（SSE 依赖），不做任何缓冲
        res.writeHead(upstreamRes.statusCode || 502, filterHeaders(upstreamRes.headers))
        upstreamRes.pipe(res)
      },
    )

    upstream.on('error', (error) => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `dev api proxy: ${String(error)}` }))
    })

    // 客户端断开时同步中断上游，避免 SSE 等长连接悬挂
    res.on('close', () => upstream.destroy())

    req.pipe(upstream)
  }
}
