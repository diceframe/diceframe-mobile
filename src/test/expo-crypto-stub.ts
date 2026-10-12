/**
 * vitest 专用：expo-crypto 依赖原生模块（requireNativeModule），node 环境加载不了。
 * 测试里换成 Node 自带的 Web Crypto，语义与 expo-crypto.getRandomValues 一致
 * （同样是密码学安全随机源），只在 vitest.config.ts 的 alias 里引用。
 */
export function getRandomValues<T extends Uint8Array<ArrayBuffer>>(typedArray: T): T {
  globalThis.crypto.getRandomValues(typedArray)
  return typedArray
}
