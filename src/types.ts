export interface Character {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Npc {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface LorebookEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  weight: number;
  similarity?: number;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  module?: string;
  data?: any;
  timestamp: string;
}

export interface Rule {
  id: string;
  name: string;
  content: string;
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Plugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  isInstalled: boolean;
  isEnabled: boolean;
}

export interface Peer {
  id: string;
  name: string;
  connected: boolean;
  lastSeen: string;
}

export interface Settings {
  apiKey?: string;
  apiEndpoint?: string;
  model?: string;
  theme?: string;
  language?: string;
  enableNotifications?: boolean;
  enableTTS?: boolean;
  enableAutoSave?: boolean;
  accessCode?: string;
  enablePublicAccess?: boolean;
}
