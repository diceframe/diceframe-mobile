import * as React from 'react'

import { createCharacterCard, deleteCharacterCard, fetchCharacterCards, updateCharacterCard } from '@/api/library'
import { errorMessage } from '@/api/client'
import type { CharacterCard } from '@/api/types'

export function useCharacters() {
  const [cards, setCards] = React.useState<CharacterCard[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  async function load() {
    setLoading(true)
    try {
      const result = await fetchCharacterCards()
      setCards((result.cards ?? []).filter((card) => Boolean(card.card_id || card.id)))
      setError('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { queueMicrotask(() => void load()) }, [])

  async function addCard(card: CharacterCard) {
    const result = await createCharacterCard({ ...card, source: card.source || '移动端角色名册' })
    if (result.ok === false) throw new Error(result.error || '保存角色失败')
    await load()
  }

  async function updateCard(cardId: string, patch: Partial<CharacterCard>) {
    const result = await updateCharacterCard(cardId, patch)
    if (result.ok === false) throw new Error(result.error || '更新角色失败')
    await load()
  }

  async function deleteCard(cardId: string) {
    const result = await deleteCharacterCard(cardId)
    if (result.ok === false) throw new Error(result.error || '删除角色失败')
    await load()
  }

  return { cards, loading, error, refresh: load, addCard, updateCard, deleteCard }
}
