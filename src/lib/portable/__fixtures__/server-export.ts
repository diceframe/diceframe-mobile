/**
 * 测试用的服务端文档：取自服务端发布的金样本（content-sync/index.ts 记录来源提交），
 * 不再手工构造。样本里的 equipment 等是字符串数组，比移动端镜像类型宽，这里统一按
 * 可移植文档类型暴露给测试。
 */
import type { CardBody, CardV3Document } from '../card-v3'
import type { LorebookBook, LorebookDocument, LorebookEntry } from '../lorebook-v3'
import { fixtures } from './content-sync'

/** 带内嵌书的自由规则卡（服务端导出形状） */
export const serverCardDocument = fixtures.cardWithBook as unknown as CardV3Document
export const serverCardBody = fixtures.cardWithBook.data.extensions.diceframe as unknown as CardBody
export const serverBook = fixtures.cardWithBook.data.character_book as unknown as LorebookBook

/** 独立书 */
export const serverLorebookDocument = fixtures.lorebook as unknown as LorebookDocument
export const serverLorebookBook = fixtures.lorebook.data.lorebook as unknown as LorebookBook
export const serverEntry = fixtures.lorebook.data.lorebook.entries[0] as unknown as LorebookEntry
