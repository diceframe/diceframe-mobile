import { useState, useEffect } from 'react';
import { Character, Npc } from '@/types';

export const useCharacters = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [npcs, setNpcs] = useState<Npc[]>([]);

  useEffect(() => {
    // 模拟获取角色列表
    const mockCharacters: Character[] = [
      { id: '1', name: '勇者', description: '来自异世界的勇者', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const mockNpcs: Npc[] = [
      { id: '1', name: '村长', description: '新手村的引导NPC', createdAt: new Date().toISOString() },
    ];
    setCharacters(mockCharacters);
    setNpcs(mockNpcs);
  }, []);

  const addCharacter = async (data: { name: string; description?: string; avatar?: string }) => {
    const newCharacter: Character = {
      id: Date.now().toString(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCharacters(prev => [...prev, newCharacter]);
  };

  const updateCharacter = async (id: string, data: { name: string; description?: string; avatar?: string }) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c));
  };

  const deleteCharacter = async (id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
  };

  const addNpc = async (data: { name: string; description?: string }) => {
    const newNpc: Npc = {
      id: Date.now().toString(),
      ...data,
      createdAt: new Date().toISOString(),
    };
    setNpcs(prev => [...prev, newNpc]);
  };

  return { characters, npcs, addCharacter, updateCharacter, deleteCharacter, addNpc };
};
