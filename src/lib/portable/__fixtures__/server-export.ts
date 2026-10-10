/**
 * 服务端 /api/content/export 输出的文档样本（按 upstream main 95042a2f 的
 * write_card_v3 / export_lorebook_v3 / _v3_entry 逐字段构造）。
 * 服务端发布正式金样本后（内容同步跟进 PR），换成直接引用那份文件。
 */

export const serverEntry = {
  id: 'entry-aaaa',
  name: '旧城',
  content: '旧城的城墙在夜里会低语。',
  keys: ['旧城', '城墙'],
  secondary_keys: [],
  enabled: true,
  constant: false,
  insertion_order: 100,
  priority: 0,
  selective: true,
  selective_logic: 'and_any',
  use_regex: false,
  case_sensitive: false,
  match_whole_words: false,
  scan_depth: 0,
  probability: 100,
  groups: [],
  group_weight: 1,
  prioritize_inclusion: false,
  group_scoring: '',
  sticky: 0,
  cooldown: 0,
  delay: 0,
  vector_activation: 'hybrid',
  prompt_slot: '',
  non_recursable: false,
  prevent_further_recursion: false,
  delay_until_recursion: false,
  recursion_level: 0,
  provenance: { source_kind: 'device', external_id: 'entry-aaaa' },
  extensions: {
    diceframe: {
      type: 'location', tier: 'background', unreliable: false, sync_on_enter: false,
      visible_to: [], connected_to: [], triggers_recursive: [], match_mode: 'any', regex_executable: true,
    },
  },
}

export const serverBook = {
  name: '米拉的回忆',
  description: '随卡附带的设定',
  scan_depth: 4,
  token_budget: 1024,
  recursive_scanning: false,
  entries: [serverEntry, { ...serverEntry, id: 'lb_entry_server_made', name: '服务端新建' }],
}

export const serverLorebookDocument = { spec: 'lorebook_v3', data: { lorebook: serverBook } }

export const serverCardBody = {
  schema_version: 2,
  character_name: 'Mira',
  race: '人类',
  class: '调查员',
  background: '出身旧城的记者。',
  rule_id: 'coc7',
  rule_name: 'CoC 7th',
  attributes: { str: 50, dex: 60 },
  skills: [{ name: '侦查', value: 60, effect: '擅长发现线索' }],
  gold: 25,
  portrait: { kind: 'builtin', id: 'coc/realistic-3' },
  custom_future_field: { nested: [1, 2, 3] },
}

export const serverCardDocument = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: 'Mira',
    description: '出身旧城的记者。',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    group_only_greetings: [],
    tags: [],
    creator: '',
    character_version: '',
    extensions: { diceframe: serverCardBody },
    character_book: serverBook,
  },
}
