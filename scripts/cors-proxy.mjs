/**
 * 临时联调代理：给本机 DiceFrame 服务端加 CORS 头，供 Expo Web 构建
 * （localhost:8090 → 127.0.0.1:18001 → 127.0.0.1:18000）测试用。
 * 原生 App 不需要它（RN fetch 无同源限制）。
 */
import http from 'node:http'

const TARGET = '127.0.0.1'
const TARGET_PORT = 18000
const PORT = 18001

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
    'Access-Control-Expose-Headers': 'Content-Type, X-DiceFrame-TTS-Cache',
    'Access-Control-Allow-Credentials': 'true',
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }

  const upstream = http.request(
    { host: TARGET, port: TARGET_PORT, path: req.url, method: req.method, headers: req.headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, { ...cors, ...upstreamRes.headers })
      upstreamRes.pipe(res)
    },
  )
  upstream.on('error', (error) => {
    res.writeHead(502, cors)
    res.end(JSON.stringify({ error: String(error) }))
  })
  req.pipe(upstream)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`cors proxy listening on 127.0.0.1:${PORT} -> ${TARGET}:${TARGET_PORT}`)
})
