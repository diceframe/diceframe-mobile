const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const createApiProxyMiddleware = require('./scripts/dev-api-proxy.cjs')

const config = getDefaultConfig(__dirname)

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
