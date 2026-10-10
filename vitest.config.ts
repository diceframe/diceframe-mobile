import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      // App 里 .sql 迁移由 babel inline-import 内联成字符串；测试里用同样的语义加载，
      // 让测试跑的正是打进包里的那份 migrations.js
      name: 'sql-as-text',
      transform(code: string, id: string) {
        return id.endsWith('.sql') ? { code: `export default ${JSON.stringify(code)}`, map: null } : null
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // expo-crypto 走原生模块，node 里换成 Web Crypto 实现（见 stub 注释）
      'expo-crypto': path.resolve(__dirname, 'src/test/expo-crypto-stub.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
