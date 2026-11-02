/**
 * 冒险面板（Adventure v2）的契约解析与界面推导，对齐上游 components/play/AdventurePanel.vue
 * 与 features/adventures/AdventureNodeActions.vue。
 *
 * GET  /games/{key}/adventure —— 服务端按观看者投影：玩家只拿到可见节点、自己的路线提议；
 *      GM 额外拿到 AI 完成建议。客户端只用服务端给的 active_nodes 判断可推进节点，
 *      不从 transitions 自行推导。
 * POST /games/{key}/intents   —— 冒险指令：
 *   - adventure.node.complete { node_id, choice_id? }：仅 GM，确认节点完成；
 *   - adventure.choice.request { node_id, choice_id }：玩家为「多选一」节点提出路线；
 *   - adventure.completion_suggestion.dismiss { proposal_id }：仅 GM，忽略 AI 完成建议。
 *
 * 「多选一」（choice_mode = exclusive）节点必须显式带 choice_id 才能完成，服务端的自动推进
 * 不会替人选；所以没有这个面板，绑定冒险包的局会卡在抉择节点上。
 */

export interface AdventureTransition {
  to: string
  choice_id?: string
  choice_label?: string
}

export interface AdventureNode {
  id: string
  type: string
  chapter_id?: string | null
  name?: string
  description?: string
  scene_ref?: string | null
  encounter_ref?: string | null
  choice_mode?: string
  transitions: AdventureTransition[]
}

export interface AdventureChoiceRequest {
  node_id: string
  choice_id: string
  actor_uid: string
}

export interface AdventureCompletionSuggestion {
  proposal_id: string
  node_id: string
  reason: string
  evidence_rounds: number[]
}

export interface AdventureProgress {
  active_nodes: string[]
  selected_choices: Record<string, string>
  choice_requests: AdventureChoiceRequest[]
  completion_suggestions: AdventureCompletionSuggestion[]
  /** 冒险已抵达结局（所有人都知道）；结局节点对观看者不可见时不给 ending_node_id */
  ended: boolean
  ending_node_id?: string
}

export interface AdventureLink {
  id: string
  name?: string
  node_ids: string[]
}

export interface AdventureGraph {
  chapters: { id: string; name?: string }[]
  nodes: AdventureNode[]
  objectives: AdventureLink[]
  milestones: AdventureLink[]
  progress: AdventureProgress
}

export interface AdventureBinding {
  adventure_id?: string
  version?: string
}

export type AdventureView =
  | { kind: 'none' }
  | { kind: 'unavailable'; reason: string; binding: AdventureBinding }
  | { kind: 'legacy'; binding: AdventureBinding }
  | { kind: 'graph'; binding: AdventureBinding; graph: AdventureGraph }

export type AdventureIntent =
  | { type: 'adventure.node.complete'; node_id: string; choice_id?: string }
  | { type: 'adventure.choice.request'; node_id: string; choice_id: string }
  | { type: 'adventure.completion_suggestion.dismiss'; proposal_id: string }

type Json = Record<string, unknown>

function record(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseLink(value: unknown): AdventureLink | null {
  const item = record(value)
  const id = str(item?.id)
  if (!item || !id) return null
  return { id, name: str(item.name), node_ids: strings(item.node_ids) }
}

function parseNode(value: unknown): AdventureNode | null {
  const item = record(value)
  const id = str(item?.id)
  if (!item || !id) return null
  const transitions: AdventureTransition[] = []
  for (const raw of Array.isArray(item.transitions) ? item.transitions : []) {
    const transition = record(raw)
    const to = str(transition?.to)
    if (!transition || !to) continue
    transitions.push({ to, choice_id: str(transition.choice_id), choice_label: str(transition.choice_label) })
  }
  return {
    id,
    type: str(item.type) ?? '',
    chapter_id: str(item.chapter_id) ?? null,
    name: str(item.name),
    description: str(item.description),
    scene_ref: str(item.scene_ref) ?? null,
    encounter_ref: str(item.encounter_ref) ?? null,
    choice_mode: str(item.choice_mode),
    transitions,
  }
}

function parseProgress(value: unknown): AdventureProgress {
  const item = record(value) ?? {}
  const selected: Record<string, string> = {}
  for (const [nodeId, choiceId] of Object.entries(record(item.selected_choices) ?? {})) {
    if (typeof choiceId === 'string') selected[nodeId] = choiceId
  }
  const requests: AdventureChoiceRequest[] = []
  for (const raw of Array.isArray(item.choice_requests) ? item.choice_requests : []) {
    const row = record(raw)
    const node_id = str(row?.node_id), choice_id = str(row?.choice_id), actor_uid = str(row?.actor_uid)
    if (node_id && choice_id && actor_uid) requests.push({ node_id, choice_id, actor_uid })
  }
  const suggestions: AdventureCompletionSuggestion[] = []
  for (const raw of Array.isArray(item.completion_suggestions) ? item.completion_suggestions : []) {
    const row = record(raw)
    const proposal_id = str(row?.proposal_id), node_id = str(row?.node_id), reason = str(row?.reason)
    if (!proposal_id || !node_id || !reason) continue
    const evidence_rounds = Array.isArray(row?.evidence_rounds)
      ? row.evidence_rounds.filter((round): round is number => typeof round === 'number' && Number.isInteger(round))
      : []
    suggestions.push({ proposal_id, node_id, reason, evidence_rounds })
  }
  const ending = str(item.ending_node_id)
  return {
    active_nodes: strings(item.active_nodes),
    selected_choices: selected,
    choice_requests: requests,
    completion_suggestions: suggestions,
    ended: item.ended === true,
    ...(ending ? { ending_node_id: ending } : {}),
  }
}

/** GET /games/{key}/adventure 的响应 → 面板要显示的状态（字段缺失或类型不对时按缺省处理，不抛错） */
export function parseAdventure(raw: unknown): AdventureView {
  const adventure = record(record(raw)?.adventure)
  if (!adventure) return { kind: 'none' }
  const bindingRaw = record(adventure.binding) ?? {}
  const binding: AdventureBinding = { adventure_id: str(bindingRaw.adventure_id), version: str(bindingRaw.version) }
  if (adventure.available !== true) {
    return { kind: 'unavailable', reason: str(adventure.reason) ?? 'package_unavailable', binding }
  }
  const projection = record(adventure.projection)
  if (!projection) return { kind: 'legacy', binding }
  const chapters: AdventureGraph['chapters'] = []
  for (const raw of Array.isArray(projection.chapters) ? projection.chapters : []) {
    const chapter = record(raw)
    const id = str(chapter?.id)
    if (id) chapters.push({ id, name: str(chapter?.name) })
  }
  const nodes = (Array.isArray(projection.nodes) ? projection.nodes : []).map(parseNode).filter((node): node is AdventureNode => !!node)
  const links = (value: unknown) => (Array.isArray(value) ? value : []).map(parseLink).filter((link): link is AdventureLink => !!link)
  return {
    kind: 'graph',
    binding,
    graph: {
      chapters,
      nodes,
      objectives: links(projection.objectives),
      milestones: links(projection.milestones),
      progress: parseProgress(projection.progress),
    },
  }
}

export interface AdventureSection {
  /** 章节 id；未归章的节点为 null */
  id: string | null
  name?: string
  nodes: AdventureNode[]
}

/** 按章节分组；未归章（或章节不存在）的节点归到末尾一组，与上游「其他节点」一致 */
export function adventureSections(graph: AdventureGraph): AdventureSection[] {
  const known = new Set(graph.chapters.map((chapter) => chapter.id))
  const sections: AdventureSection[] = graph.chapters
    .map((chapter) => ({ id: chapter.id, name: chapter.name, nodes: graph.nodes.filter((node) => node.chapter_id === chapter.id) }))
    .filter((section) => section.nodes.length > 0)
  const ungrouped = graph.nodes.filter((node) => !node.chapter_id || !known.has(node.chapter_id))
  if (ungrouped.length) sections.push({ id: null, nodes: ungrouped })
  return sections
}

export function adventureNodeLabel(graph: AdventureGraph, nodeId: string): string {
  return graph.nodes.find((node) => node.id === nodeId)?.name || nodeId
}

export interface AdventureNodeActions {
  active: boolean
  exclusive: boolean
  /** 已确认的路线（多选一节点） */
  selectedLabel?: string
  /** 可点的路线选项：GM 是「确认队伍选择」，玩家是「提出路线选择」；节点未激活时为空 */
  choices: { choiceId: string; label: string }[]
  /** GM 可直接完成的普通节点 */
  canComplete: boolean
  /** 本节点上的路线提议（服务端已按观看者过滤：玩家只看到自己的） */
  requests: { actorUid: string; label: string }[]
}

export function adventureNodeActions(graph: AdventureGraph, node: AdventureNode, isGm: boolean): AdventureNodeActions {
  const active = graph.progress.active_nodes.includes(node.id)
  const exclusive = node.choice_mode === 'exclusive'
  const labelOf = (choiceId: string) =>
    node.transitions.find((transition) => transition.choice_id === choiceId)?.choice_label || choiceId
  const selected = graph.progress.selected_choices[node.id]
  const choices = exclusive && active
    ? node.transitions
      .filter((transition): transition is AdventureTransition & { choice_id: string } => !!transition.choice_id)
      .map((transition) => ({ choiceId: transition.choice_id, label: transition.choice_label || transition.choice_id }))
    : []
  const requests = exclusive && active
    ? graph.progress.choice_requests
      .filter((request) => request.node_id === node.id)
      .map((request) => ({ actorUid: request.actor_uid, label: labelOf(request.choice_id) }))
    : []
  return {
    active,
    exclusive,
    ...(exclusive && selected ? { selectedLabel: labelOf(selected) } : {}),
    choices,
    canComplete: isGm && active && !exclusive,
    requests,
  }
}

/** 节点操作对应的指令：GM 直接完成，玩家只能为多选一节点提出路线（不带 choice_id 的玩家操作无效） */
export function adventureNodeIntent(nodeId: string, isGm: boolean, choiceId?: string): AdventureIntent | null {
  if (isGm) return { type: 'adventure.node.complete', node_id: nodeId, ...(choiceId ? { choice_id: choiceId } : {}) }
  return choiceId ? { type: 'adventure.choice.request', node_id: nodeId, choice_id: choiceId } : null
}

/**
 * 面板入口的提示：GM 看待处理数（AI 完成建议 + 玩家路线提议），玩家看自己是否有待确认的提议。
 * 服务端只给 GM 投影建议，玩家拿到的 choice_requests 也只有自己的。
 */
export function adventureAttention(view: AdventureView, isGm: boolean): { count: number; ownPending: boolean; ended: boolean } {
  if (view.kind !== 'graph') return { count: 0, ownPending: false, ended: false }
  const { progress } = view.graph
  return {
    count: isGm ? progress.completion_suggestions.length + progress.choice_requests.length : 0,
    ownPending: !isGm && progress.choice_requests.length > 0,
    ended: progress.ended,
  }
}
