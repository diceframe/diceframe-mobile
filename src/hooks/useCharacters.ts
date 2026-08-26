import * as React from 'react'

import { createCharacterCard, deleteCharacterCard, fetchCharacterCards, updateCharacterCard } from '@/api/library'
import { errorMessage } from '@/api/client'
import type { Character } from '@/types'

export function useCharacters() {
  const [characters, setCharacters] = React.useState<Character[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchCharacterCards()
      setCharacters((result.cards ?? []).map((card) => ({
        id: String(card.id || card.card_id || ''),
        name: String(card.character_name || '未命名角色'),
        description: String(card.background || [card.race, card.class].filter(Boolean).join(' · ')),
        avatar: '',
        createdAt: '',
        updatedAt: '',
      })).filter((card) => card.id))
      setError('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { queueMicrotask(() => void load()) }, [load])

  async function addCharacter(data: { name: string; description?: string; avatar?: string }) {
    const result = await createCharacterCard({
      character_name: data.name,
      background: data.description || '',
      race: '人类',
      class: '冒险者',
      source: '移动端角色名册',
    })
    if (result.ok === false) throw new Error(result.error || '保存角色失败')
    await load()
  }

  async function updateCharacter(id: string, data: { name: string; description?: string; avatar?: string }) {
    const result = await updateCharacterCard(id, {
      character_name: data.name,
      background: data.description || '',
    })
    if (result.ok === false) throw new Error(result.error || '更新角色失败')
    await load()
  }

  async function removeCharacter(id: string) {
    const result = await deleteCharacterCard(id)
    if (result.ok === false) throw new Error(result.error || '删除角色失败')
    await load()
  }

  return { characters, loading, error, refresh: load, addCharacter, updateCharacter, deleteCharacter: removeCharacter }
}
