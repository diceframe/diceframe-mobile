import { useState, useEffect } from 'react';
import { MemoryItem } from '@/types';

export const useMemory = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);

  useEffect(() => {
    // 模拟获取记忆列表
    const mockMemories: MemoryItem[] = [
      { id: '1', content: '勇者来自异世界，擅长剑术', weight: 3, createdAt: new Date().toISOString() },
    ];
    setMemories(mockMemories);
  }, []);

  const addMemory = async (data: { content: string; weight: number }) => {
    const newMemory: MemoryItem = {
      id: Date.now().toString(),
      ...data,
      createdAt: new Date().toISOString(),
    };
    setMemories(prev => [...prev, newMemory]);
  };

  const deleteMemory = async (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const searchMemories = async (query: string) => {
    // 模拟搜索记忆
    const mockResults: MemoryItem[] = [
      { id: '1', content: `包含"${query}"的记忆内容`, weight: 3, similarity: 0.85, createdAt: new Date().toISOString() },
    ];
    setMemories(mockResults);
  };

  const refreshMemories = async () => {
    // 模拟刷新记忆列表
    const mockMemories: MemoryItem[] = [
      { id: '1', content: '勇者来自异世界，擅长剑术', weight: 3, createdAt: new Date().toISOString() },
    ];
    setMemories(mockMemories);
  };

  return { memories, addMemory, deleteMemory, searchMemories, refreshMemories };
};
