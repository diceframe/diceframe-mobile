// @ts-check
const { defineConfig, globalIgnores } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')
const hooksPlugin = require('eslint-plugin-react-hooks')

module.exports = defineConfig([
  expoConfig,
  {
    name: 'react-hooks (含 react-compiler 规则，编译器自动记忆化的前提)',
    plugins: { 'react-hooks': hooksPlugin },
    rules: {
      ...hooksPlugin.configs.recommended.rules,
      ...hooksPlugin.configs['recommended-latest'].rules,
      // React Compiler 会自动记忆化组件内函数/值，其依赖身份是稳定的；
      // exhaustive-deps 在此只会持续误报（编译器采用团队的通行做法是关闭）。
      // 其余 compiler 规则（refs、set-state-in-effect 等）保持开启。
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    name: 'api/types.ts 上游镜像特例',
    files: ['src/api/types.ts'],
    rules: {
      // 镜像段与移动端扩展段靠 declaration merging 合并同名接口，
      // import/export 规则不识别合法合并会误报；本文件须与上游逐字一致，
      // 上游的 Array<T> 写法也不改，否则每次同步都会产生无意义 diff。
      'import/export': 'off',
      '@typescript-eslint/array-type': 'off',
    },
  },
  globalIgnores(['dist/*', '.expo/*']),
])
