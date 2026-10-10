import { defineConfig } from 'drizzle-kit'

/**
 * 本机内容库的迁移生成配置（npx drizzle-kit generate）。
 * driver 'expo' 会额外生成 migrations.js，把各 .sql 以 inline-import 打进 App 包
 * （babel.config.js 的 inline-import 插件 + metro.config.js 的 sourceExts 'sql'）。
 * 生成的 SQL 与 meta/_journal.json 一并提交；不要手改已发布的迁移。
 */
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/lib/local-library/schema.ts',
  out: './src/lib/local-library/migrations',
})
