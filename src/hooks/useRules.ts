import * as React from 'react'

import { errorMessage } from '@/api/client'
import { createCustomRule, deleteCustomRule, fetchRuleLibrary } from '@/api/library'
import type { RuleSummary } from '@/api/types'

export function useRules() {
  const [rules, setRules] = React.useState<RuleSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    try { const result = await fetchRuleLibrary(); setRules(result.rules ?? []); setError('') }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { queueMicrotask(() => void load()) }, [load])

  async function addRule(payload: { source_rule_id: string; rule_id: string; rule_name: string; description: string }) {
    const result = await createCustomRule(payload)
    if (result.ok === false) throw new Error(result.error || '创建规则失败')
    await load()
  }

  async function deleteRule(ruleId: string) {
    const result = await deleteCustomRule(ruleId)
    if (result.ok === false) throw new Error(result.error || '删除规则失败')
    await load()
  }

  return { rules, loading, error, refresh: load, addRule, deleteRule }
}
