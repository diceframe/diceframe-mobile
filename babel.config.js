// nativewind/babel 在 v4.2.x 导出的是 preset 形状（返回 { plugins: [...] }），
// 必须作为 preset 使用而非 plugin，否则 Babel 报 ".plugins is not a valid Plugin property"。
// presets 按数组逆序执行：nativewind 的 JSX 重定向先于 babel-preset-expo 应用，
// 保证 className 走 react-native-css-interop 的 jsx-runtime。
// React Compiler 由 babel-preset-expo 在 experiments.reactCompiler 开启时自动注入。
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  }
}
