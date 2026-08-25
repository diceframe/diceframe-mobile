import { useState, useEffect } from 'react';
import { LorebookEntry } from '@/types';

export const useLorebook = () => {
  const [entries, setEntries] = useState<LorebookEntry[]>([]);

  useEffect(() => {
    // 模拟获取设定列表
    const mockEntries: LorebookEntry[] = [
      { 
        id: '1', 
        title: '世界观设定', 
        content: '这是一个剑与魔法的奇幻世界', 
        category: '世界观', 
        isPublic: true,
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString() 
      },
    ];
    setEntries(mockEntries);
  }, []);

  const addEntry = async (data: { title: string; content: string; category: string; isPublic: boolean }) => {
    const newEntry: LorebookEntry = {
      id: Date.now().toString(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEntries(prev => [...prev, newEntry]);
  };

  const updateEntry = async (id: string, data: { title: string; content: string; category: string; isPublic: boolean }) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...data, updatedAt: new Date().toISOString() } : e));
  };

  const deleteEntry = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  return { entries, addEntry, updateEntry, deleteEntry };
};
