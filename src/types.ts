export interface JennPluginSettings {
  serverUrl: string;
  apiKey: string;
  defaultFolder: string;
  reconnect: boolean;
}

export const DEFAULT_SETTINGS: JennPluginSettings = {
  serverUrl: 'ws://localhost:11235',
  apiKey: '',
  defaultFolder: '',
  reconnect: true,
}

export interface WriteNotePayload {
  title: string
  content: string
  folder?: string
  tags?: string[]
  date?: string | null
  source?: string | null
}

export interface AppendNotePayload {
  path: string
  content: string
  as_section?: string | null
}

export interface DescribeFolderPayload {
  path: string
}

export interface SearchNotesPayload {
  query: string
  folder?: string | null
  limit?: number
}

export interface VaultFileEntry {
  name: string
  path: string
  type: 'file' | 'folder'
  tags?: string[]
  created?: string
  modified?: string
  file_count?: number
  folders?: VaultFileEntry[]
  files?: VaultFileEntry[]
}


