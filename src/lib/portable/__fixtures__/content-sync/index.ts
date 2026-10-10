/**
 * 服务端发布的内容同步金样本与 JSON Schema，原样拷贝自
 * diceframe/diceframe@aa460848（main；docs/content-sync 最近一次改动为 #502 的 da0d2be5）的
 * docs/content-sync/{fixtures,schemas}。
 * 服务端测试同样消费这两份目录，双方因此不会漂移；服务端更新时整目录重拷并改下面的提交号。
 */
import cardCoc from './fixtures/card-coc.chara_card_v3.json'
import cardDnd2024 from './fixtures/card-dnd2024.chara_card_v3.json'
import cardFreeform from './fixtures/card-freeform.chara_card_v3.json'
import cardWithBook from './fixtures/card-with-book.chara_card_v3.json'
import lorebook from './fixtures/lorebook.lorebook_v3.json'
import cardBodySchema from './schemas/card-body.schema.json'
import charaCardV3Schema from './schemas/chara-card-v3.schema.json'
import lorebookV3Schema from './schemas/lorebook-v3.schema.json'

export const FIXTURE_SOURCE = 'diceframe/diceframe@aa460848f23f41251ff68d0236d672d26f87bdeb docs/content-sync (da0d2be5)'

export const fixtures = { cardCoc, cardDnd2024, cardFreeform, cardWithBook, lorebook }
export const schemas = { cardBodySchema, charaCardV3Schema, lorebookV3Schema }
