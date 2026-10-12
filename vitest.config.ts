import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
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
