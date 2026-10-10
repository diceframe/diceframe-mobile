// .sql 迁移文件经 babel-plugin-inline-import（App）/ vitest 的 sql-as-text 插件（测试）以字符串导入
declare module '*.sql' {
  const content: string
  export default content
}
