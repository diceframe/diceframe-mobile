import { describe, expect, it } from 'vitest'

import {
  activeRuleIdOf,
  buildCreateRequest,
  sanitizeLoreChoice,
  type CreateFormState,
} from './payload'

function baseState(overrides: Partial<CreateFormState> = {}): CreateFormState {
  return {
    seed: '',
    gameLanguage: 'zh-CN',
    mode: 'template',
    worldId: 'default_fantasy',
    worldName: '经典幻想',
    ruleId: 'freeform_fantasy',
    name: '',
    customName: '',
    customDesc: '',
    aiPrompt: '',
    aiRuleId: '',
    aiAutoRule: false,
    aiGeneratedRuleId: '',
    aiWorldId: '',
    aiWorldName: '',
    description: '',
    loreChoice: '__builtin__',
    adventureId: '',
    showAdventurePackages: false,
    solo: true,
    difficulty: '标准',
    narrativePerspective: 'immersive',
    supportsAdvancementPolicy: false,
    advancementMode: 'milestone',
    advancementAuthority: 'ai_gm',
    roomPassword: '',
    openRoom: false,
    players: [{ character_name: '冒险者', background: '', identity: {}, attributes: {}, skills: [] }],
    ...overrides,
  }
}

describe('activeRuleIdOf', () => {
  it('AI 模式优先用生成出的专属规则，未生成时回退母版规则', () => {
    expect(activeRuleIdOf({ mode: 'ai', aiGeneratedRuleId: 'gen_1', aiRuleId: 'coc7', ruleId: 'x' })).toBe('gen_1')
    expect(activeRuleIdOf({ mode: 'ai', aiGeneratedRuleId: '', aiRuleId: 'coc7', ruleId: 'x' })).toBe('coc7')
  })

  it('非 AI 模式固定用所选规则', () => {
    expect(activeRuleIdOf({ mode: 'template', aiGeneratedRuleId: 'gen_1', aiRuleId: 'coc7', ruleId: 'dnd5e' })).toBe('dnd5e')
  })
})

describe('buildCreateRequest /games/create', () => {
  const NOW = 1756600000000

  it('模板模式：名称兜底链 名称 → 世界名；自带世界书显式声明 create_lorebook=false', () => {
    const { endpoint, body } = buildCreateRequest(baseState(), NOW)
    expect(endpoint).toBe('create')
    expect(body.world_id).toBe('default_fantasy')
    expect(body.game_name).toBe('经典幻想')
    expect(body.create_lorebook).toBe(false)
    expect(body.difficulty).toBe('标准')
    expect(body.language).toBe('zh-CN')
    expect(body.players).toHaveLength(1)
  })

  it('显式名称优先于世界名；英文名称兜底按游戏语言取对', () => {
    expect(buildCreateRequest(baseState({ name: ' 龙之远征 ' })).body.game_name).toBe('龙之远征')
    const en = buildCreateRequest(baseState({ gameLanguage: 'en', worldName: '' }))
    expect(en.body.game_name).toBe('New Adventure')
  })

  it('多人留空密码 → room_password=null（服务端自动生成）；开放房 → 空串；自定义密码去空格', () => {
    expect(buildCreateRequest(baseState({ solo: false })).body.room_password).toBeNull()
    expect(buildCreateRequest(baseState({ solo: false, openRoom: true })).body.room_password).toBe('')
    expect(buildCreateRequest(baseState({ solo: false, roomPassword: ' ab12 ' })).body.room_password).toBe('ab12')
  })

  it('未开启升级政策的规则 → 升级字段强制回默认值', () => {
    const body = buildCreateRequest(baseState({ supportsAdvancementPolicy: false, advancementMode: 'xp', advancementAuthority: 'gm' })).body
    expect(body.advancement_mode).toBe('milestone')
    expect(body.advancement_authority).toBe('ai_gm')
    const dnd = buildCreateRequest(baseState({ supportsAdvancementPolicy: true, advancementMode: 'xp', advancementAuthority: 'gm' })).body
    expect(dnd.advancement_mode).toBe('xp')
    expect(dnd.advancement_authority).toBe('gm')
  })

  it('冒险包仅在向导展示该区块时透传，否则为空串', () => {
    const hidden = buildCreateRequest(baseState({ showAdventurePackages: false, adventureId: 'adv_1' }))
    expect(hidden.body.adventure_id).toBe('')
    const shown = buildCreateRequest(baseState({ showAdventurePackages: true, adventureId: 'adv_1' }))
    expect(shown.body.adventure_id).toBe('adv_1')
  })

  it('空白世界书：派生 _blank_ world_id、名称加后缀、置 blank 标记', () => {
    const { body } = buildCreateRequest(baseState({ name: '龙之远征', loreChoice: '__blank__' }), NOW)
    expect(body.world_id).toBe(`default_fantasy_blank_${NOW}`)
    expect(body.source_world_id).toBe('default_fantasy')
    expect(body.game_name).toBe('龙之远征（空白世界书）')
    expect(body.create_lorebook).toBe(true)
    expect(body.blank_lorebook).toBe(true)
  })

  it('复制世界书：派生 _copy_ world_id 并携带来源 lorebook_world_id', () => {
    const { body } = buildCreateRequest(baseState({ loreChoice: 'copy:my_world' }), NOW)
    expect(body.world_id).toBe(`default_fantasy_copy_${NOW}`)
    expect(body.lorebook_world_id).toBe('my_world')
    expect(body.game_name).toBe('经典幻想（复制世界书）')
  })

  it('自定义模式：custom_ 时间戳 world_id、custom_world 标记、描述被世界描述取代', () => {
    const { body } = buildCreateRequest(baseState({
      mode: 'custom',
      customName: ' 唐代仙侠 ',
      customDesc: '一个修真世界',
      description: '这段应被覆盖',
    }), NOW)
    expect(body.world_id).toBe(`custom_${NOW}`)
    expect(body.custom_world).toBe(true)
    expect(body.world_name).toBe('唐代仙侠')
    expect(body.description).toBe('一个修真世界')
    expect(body.game_name).toBeUndefined()
  })

  it('AI 模式：使用生成世界 id 与生成规则 id', () => {
    const { body } = buildCreateRequest(baseState({
      mode: 'ai',
      aiPrompt: '蒸汽朋克城市',
      aiRuleId: 'coc7',
      aiGeneratedRuleId: 'gen_rule_9',
      aiWorldId: 'gen_world_7',
      aiWorldName: '雾都齿轮',
    }), NOW)
    expect(body.world_id).toBe('gen_world_7')
    expect(body.rule_id).toBe('gen_rule_9')
    expect(body.game_name).toBe('雾都齿轮')
  })

  it('场景图与地图后台仅在设置过时携带', () => {
    const bare = buildCreateRequest(baseState())
    expect('scene_image' in bare.body).toBe(false)
    expect('map_background' in bare.body).toBe(false)
    const full = buildCreateRequest(baseState({
      sceneImage: { kind: 'upload', asset_id: 'a1' },
      mapBackground: { kind: 'builtin', id: 'fantasy-region-v1' },
    }))
    expect(full.body.scene_image).toEqual({ kind: 'upload', asset_id: 'a1' })
    expect(full.body.map_background).toEqual({ kind: 'builtin', id: 'fantasy-region-v1' })
  })
})

describe('sanitizeLoreChoice', () => {
  const worlds = [
    { worldId: 'my_fantasy', language: 'zh-CN' },
    { worldId: 'my_horror', language: 'en' },
  ]

  it('复制源存在且语言匹配时保留', () => {
    expect(sanitizeLoreChoice('copy:my_fantasy', worlds, 'zh-CN')).toBe('copy:my_fantasy')
    expect(sanitizeLoreChoice('copy:my_horror', worlds, 'en')).toBe('copy:my_horror')
  })

  it('复制源缺失或语言不匹配时回退模板自带', () => {
    expect(sanitizeLoreChoice('copy:gone_world', worlds, 'zh-CN')).toBe('__builtin__')
    expect(sanitizeLoreChoice('copy:my_horror', worlds, 'zh-CN')).toBe('__builtin__')
  })

  it('非复制选项原样返回', () => {
    expect(sanitizeLoreChoice('__builtin__', worlds, 'zh-CN')).toBe('__builtin__')
    expect(sanitizeLoreChoice('__blank__', worlds, 'zh-CN')).toBe('__blank__')
  })
})

describe('buildCreateRequest /games/create-from-seed', () => {
  it('种子恢复：只带种子码与对局级设置，不带世界/规则/难度', () => {
    const { endpoint, body } = buildCreateRequest(baseState({
      seed: ' SEED-1234 ',
      solo: false,
      difficulty: '硬核',
      narrativePerspective: 'third_person',
      sceneImage: { kind: 'builtin', id: 'ruins' },
    }))
    expect(endpoint).toBe('create-from-seed')
    expect(body).toEqual({
      seed_code: 'SEED-1234',
      solo: false,
      language: 'zh-CN',
      narrative_perspective: 'third_person',
      scene_image: { kind: 'builtin', id: 'ruins' },
      players: expect.any(Array),
    })
    expect('world_id' in body).toBe(false)
    expect('difficulty' in body).toBe(false)
  })
})
