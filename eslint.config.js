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
  globalIgnores(['dist/*', '.expo/*']),
])
