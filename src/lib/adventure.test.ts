import { describe, expect, it } from 'vitest'

import {
  adventureAttention,
  adventureNodeActions,
  adventureNodeIntent,
  adventureSections,
  parseAdventure,
  type AdventureGraph,
} from './adventure'

/** 灯塔之夏式的最小图：普通场景 → 告白（多选一）→ 两个结局 */
function sample(progress: Record<string, unknown> = {}) {
  return {
    ok: true,
    adventure: {
      binding: { adventure_id: 'lighthouse-summer', version: '1.0.0', format: 'diceframe:adventure-graph-v2' },
      available: true,
      format: 'diceframe:adventure-graph-v2',
      projection: {
        chapters: [{ id: 'c1', name: '第一章' }, { id: 'empty', name: '空章节' }],
        nodes: [
          { id: 'n_arrival', type: 'scene', chapter_id: 'c1', name: '抵达灯塔', transitions: [{ to: 'n_confession' }] },
          {
            id: 'n_confession',
            type: 'decision',
            chapter_id: 'c1',
            name: '告白',
            choice_mode: 'exclusive',
            transitions: [
              { to: 'n_end_a', choice_id: 'accept', choice_label: '接受' },
              { to: 'n_end_b', choice_id: 'decline', choice_label: '婉拒' },
            ],
          },
          { id: 'n_end_a', type: 'milestone', name: '夏日约定' },
          { type: 'scene', name: '没有 id' },
          'garbage',
        ],
        objectives: [{ id: 'o1', name: '找到灯塔', node_ids: ['n_arrival'] }],
        milestones: [],
        progress,
      },
    },
  }
}

function graphOf(raw: unknown): AdventureGraph {
  const view = parseAdventure(raw)
  if (view.kind !== 'graph') throw new Error(`expected graph, got ${view.kind}`)
  return view.graph
}

describe('冒险面板契约解析', () => {
  it('未绑定、不可用、旧版冒险分别给出对应状态', () => {
    expect(parseAdventure({ ok: true, adventure: null })).toEqual({ kind: 'none' })
    expect(parseAdventure(null)).toEqual({ kind: 'none' })
    expect(parseAdventure({ adventure: { binding: { adventure_id: 'a', version: '2' }, available: false, reason: 'binding_changed' } }))
      .toEqual({ kind: 'unavailable', reason: 'binding_changed', binding: { adventure_id: 'a', version: '2' } })
    expect(parseAdventure({ adventure: { available: false } })).toMatchObject({ kind: 'unavailable', reason: 'package_unavailable' })
    expect(parseAdventure({ adventure: { binding: {}, available: true, projection: null } })).toMatchObject({ kind: 'legacy' })
  })

  it('解析图与进度；丢弃缺 id 的节点和形状不对的进度条目', () => {
    const graph = graphOf(sample({
      active_nodes: ['n_confession', 7],
      selected_choices: { n_confession: 'accept', bad: 1 },
      choice_requests: [{ node_id: 'n_confession', choice_id: 'decline', actor_uid: 'u2' }, { node_id: 'x' }],
      completion_suggestions: [
        { proposal_id: 'p1', node_id: 'n_arrival', reason: '已到达', evidence_rounds: [3, 'x', 4.5] },
        { proposal_id: 'p2', node_id: 'n_arrival' },
      ],
      ended: true,
      ending_node_id: 'n_end_a',
    }))
    expect(graph.nodes.map((node) => node.id)).toEqual(['n_arrival', 'n_confession', 'n_end_a'])
    expect(graph.progress).toEqual({
      active_nodes: ['n_confession'],
      selected_choices: { n_confession: 'accept' },
      choice_requests: [{ node_id: 'n_confession', choice_id: 'decline', actor_uid: 'u2' }],
      completion_suggestions: [{ proposal_id: 'p1', node_id: 'n_arrival', reason: '已到达', evidence_rounds: [3] }],
      ended: true,
      ending_node_id: 'n_end_a',
    })
  })

  it('缺进度时按空进度处理，不当作已结局', () => {
    const graph = graphOf(sample(undefined))
    expect(graph.progress).toEqual({ active_nodes: [], selected_choices: {}, choice_requests: [], completion_suggestions: [], ended: false })
  })
})

describe('冒险面板推导', () => {
  it('按章节分组，空章节不显示，未归章节点放最后', () => {
    const sections = adventureSections(graphOf(sample()))
    expect(sections.map((section) => [section.id, section.nodes.map((node) => node.id)])).toEqual([
      ['c1', ['n_arrival', 'n_confession']],
      [null, ['n_end_a']],
    ])
  })

  it('多选一节点：激活时列出路线，GM 看到全部提议；未激活只显示已确认的路线', () => {
    const graph = graphOf(sample({
      active_nodes: ['n_confession'],
      choice_requests: [{ node_id: 'n_confession', choice_id: 'decline', actor_uid: 'u2' }],
    }))
    const confession = graph.nodes[1]
    expect(adventureNodeActions(graph, confession, true)).toEqual({
      active: true,
      exclusive: true,
      choices: [{ choiceId: 'accept', label: '接受' }, { choiceId: 'decline', label: '婉拒' }],
      canComplete: false,
      requests: [{ actorUid: 'u2', label: '婉拒' }],
    })

    const done = graphOf(sample({ active_nodes: ['n_end_a'], selected_choices: { n_confession: 'accept' } }))
    expect(adventureNodeActions(done, done.nodes[1], false)).toEqual({
      active: false, exclusive: true, selectedLabel: '接受', choices: [], canComplete: false, requests: [],
    })
  })

  it('普通节点只有 GM 能在激活时直接完成', () => {
    const graph = graphOf(sample({ active_nodes: ['n_arrival'] }))
    expect(adventureNodeActions(graph, graph.nodes[0], true).canComplete).toBe(true)
    expect(adventureNodeActions(graph, graph.nodes[0], false).canComplete).toBe(false)
    expect(adventureNodeActions(graph, graph.nodes[2], true).canComplete).toBe(false)
  })

  it('节点指令：GM 完成（可带路线），玩家只能提出路线', () => {
    expect(adventureNodeIntent('n_arrival', true)).toEqual({ type: 'adventure.node.complete', node_id: 'n_arrival' })
    expect(adventureNodeIntent('n_confession', true, 'accept')).toEqual({ type: 'adventure.node.complete', node_id: 'n_confession', choice_id: 'accept' })
    expect(adventureNodeIntent('n_confession', false, 'decline')).toEqual({ type: 'adventure.choice.request', node_id: 'n_confession', choice_id: 'decline' })
    expect(adventureNodeIntent('n_arrival', false)).toBeNull()
  })

  it('入口提示：GM 计待处理的建议与提议，玩家只看自己的提议', () => {
    const view = parseAdventure(sample({
      active_nodes: ['n_confession'],
      choice_requests: [{ node_id: 'n_confession', choice_id: 'accept', actor_uid: 'u1' }],
      completion_suggestions: [{ proposal_id: 'p1', node_id: 'n_confession', reason: 'r', evidence_rounds: [1] }],
    }))
    expect(adventureAttention(view, true)).toEqual({ count: 2, ownPending: false, ended: false })
    expect(adventureAttention(view, false)).toEqual({ count: 0, ownPending: true, ended: false })
    expect(adventureAttention({ kind: 'none' }, true)).toEqual({ count: 0, ownPending: false, ended: false })
  })
})
