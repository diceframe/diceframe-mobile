const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const createApiProxyMiddleware = require('./scripts/dev-api-proxy.cjs')

const config = getDefaultConfig(__dirname)

// 本机内容库的 Drizzle 迁移是 .sql 文件，由 babel-plugin-inline-import 内联成字符串
// （见 babel.config.js），Metro 需要把 .sql 当作源码扩展名才会交给 Babel。
config.resolver.sourceExts.push('sql')

// Web 联调：/api 与 /v2-assets 反向代理到 DiceFrame 后端（消除浏览器跨域），
// 仅 Metro dev server 生效，原生 App 与 expo export 不受影响。
const apiProxy = createApiProxyMiddleware()
const baseEnhanceMiddleware = config.server && config.server.enhanceMiddleware
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    apiProxy(req, res, () => {
      if (baseEnhanceMiddleware) baseEnhanceMiddleware(middleware)(req, res, next)
      else middleware(req, res, next)
    })
  },
}

module.exports = withNativeWind(config, { input: './src/global.css', inlineRem: 16 })
