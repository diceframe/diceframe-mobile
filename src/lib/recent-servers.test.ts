import { describe, expect, it } from 'vitest'

import { updateRecentServers } from './recent-servers'

describe('updateRecentServers', () => {
  it('标准化、去重并按最近使用排序', () => {
    expect(updateRecentServers(
      ['http://a:18000', 'http://b:18000/'],
      'b:18000',
      'http://c:18000/',
    )).toEqual([
      'http://b:18000',
      'http://c:18000',
      'http://a:18000',
    ])
  })

  it('不保存地址栏中的明文凭据', () => {
    expect(updateRecentServers([], 'http://user:secret@example.com:18000')).toEqual([
      'http://example.com:18000',
    ])
  })

  it('忽略空地址且不静默淘汰旧服务器', () => {
    expect(updateRecentServers(
      ['http://b', 'http://c', 'http://d', 'http://e', 'http://f'],
      '',
      undefined,
      'http://a',
    )).toEqual(['http://a', 'http://b', 'http://c', 'http://d', 'http://e', 'http://f'])
  })
})
