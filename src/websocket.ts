import { Notice } from 'obsidian'
import type {
  AppendNotePayload,
  DescribeFolderPayload,
  JennPluginSettings,
  SearchNotesPayload,
  WriteNotePayload,
} from './types'
import { JennVault } from './vault'

type RpcType =
  | 'write_note'
  | 'append_note'
  | 'get_vault_tree'
  | 'describe_folder'
  | 'search_notes'
  | 'list_destinations'
  | 'ping'

type StatusCallback = (status: 'connected' | 'disconnected' | 'connecting') => void

interface IncomingMsg {
  id: string
  status?: 'ok' | 'error'
  type?: RpcType
  payload?: unknown
  result?: unknown
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseWriteNotePayload(value: unknown): WriteNotePayload {
  if (!isRecord(value) || typeof value.title !== 'string' || typeof value.content !== 'string') {
    throw new Error('invalid write_note payload')
  }
  if (value.folder !== undefined && typeof value.folder !== 'string') {
    throw new Error('invalid write_note payload')
  }
  if (value.tags !== undefined && !isStringArray(value.tags)) {
    throw new Error('invalid write_note payload')
  }
  if (value.date !== undefined && value.date !== null && typeof value.date !== 'string') {
    throw new Error('invalid write_note payload')
  }
  if (value.source !== undefined && value.source !== null && typeof value.source !== 'string') {
    throw new Error('invalid write_note payload')
  }

  return value as unknown as WriteNotePayload
}

function parseAppendNotePayload(value: unknown): AppendNotePayload {
  if (!isRecord(value) || typeof value.path !== 'string' || typeof value.content !== 'string') {
    throw new Error('invalid append_note payload')
  }
  if (value.as_section !== undefined && value.as_section !== null && typeof value.as_section !== 'string') {
    throw new Error('invalid append_note payload')
  }

  return value as unknown as AppendNotePayload
}

function parseDescribeFolderPayload(value: unknown): DescribeFolderPayload {
  if (!isRecord(value) || typeof value.path !== 'string') {
    throw new Error('invalid describe_folder payload')
  }

  return value as unknown as DescribeFolderPayload
}

function parseSearchNotesPayload(value: unknown): SearchNotesPayload {
  if (!isRecord(value) || typeof value.query !== 'string') {
    throw new Error('invalid search_notes payload')
  }
  if (value.folder !== undefined && value.folder !== null && typeof value.folder !== 'string') {
    throw new Error('invalid search_notes payload')
  }
  if (value.limit !== undefined && typeof value.limit !== 'number') {
    throw new Error('invalid search_notes payload')
  }

  return value as unknown as SearchNotesPayload
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export class JennWebSocket {
  private socket: WebSocket | null = null
  private wantOpen = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<Window['setTimeout']> | null = null
  private vault: JennVault
  private authed = false

  constructor(
    private settings: JennPluginSettings,
    app: any,
    private onStatusChange?: StatusCallback,
  ) {
    this.vault = new JennVault(app)
  }

  updateSettings(settings: JennPluginSettings): void {
    const needReconnect = this.wantOpen && (
      settings.serverUrl !== this.settings.serverUrl ||
      settings.apiKey !== this.settings.apiKey
    )
    this.settings = settings
    if (needReconnect) {
      this.close()
      this.open()
    }
  }

  open(): void {
    this.wantOpen = true
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return
    this.connect()
  }

  close(): void {
    this.wantOpen = false
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.authed = false
  }

  private emitStatus(s: 'connected' | 'disconnected' | 'connecting'): void {
    this.onStatusChange?.(s)
  }

  private connect(): void {
    const base = this.settings.serverUrl.replace(/\/+$/, '')
    if (!base || !this.settings.apiKey) {
      new Notice('Jenn: укажите server URL и API Key в настройках')
      return
    }

    this.emitStatus('connecting')
    this.authed = false

    try {
      this.socket = new WebSocket(base)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      new Notice(`Jenn: connection to ${base} failed — ${msg}`)
      this.scheduleReconnect()
      return
    }

    let authId: string | null = null
    let authTimer: ReturnType<Window['setTimeout']> | null = null

    this.socket.addEventListener('open', () => {
      this.reconnectAttempt = 0

      authId = uuid()
      const authMsg = {
        type: 'auth',
        id: authId,
        payload: { key: this.settings.apiKey },
      }
      this.socket?.send(JSON.stringify(authMsg))

      authTimer = window.setTimeout(() => {
        if (!this.authed) {
          new Notice('Jenn: auth timeout — проверьте API Key')
          this.wantOpen = false
          this.socket?.close()
        }
      }, 5000)
    })

    this.socket.addEventListener('message', async (evt) => {
      let msg: IncomingMsg
      try {
        const parsed: unknown = JSON.parse(typeof evt.data === 'string' ? evt.data : String(evt.data))
        if (!isRecord(parsed) || typeof parsed.id !== 'string') return
        msg = parsed as unknown as IncomingMsg
      } catch {
        return
      }

      if (!msg.id) return

      if (!this.authed) {
        if (msg.id === authId && msg.status === 'ok') {
          this.authed = true
          if (authTimer) { window.clearTimeout(authTimer); authTimer = null }
          this.emitStatus('connected')
          return
        }
        if (msg.id === authId && msg.status === 'error') {
          new Notice(`Jenn: auth rejected — ${msg.error || 'Invalid key'}`)
          this.wantOpen = false
          this.socket?.close()
          return
        }
        return
      }

      // authenticated RPC
      if (!msg.type) return

      try {
        const result = await this.route(msg)
        this.socket?.send(JSON.stringify({ id: msg.id, status: 'ok', result }))
      } catch (err: unknown) {
        const message = getErrorMessage(err)
        new Notice(`Jenn: ошибка при ${msg.type} — ${message}`)
        this.socket?.send(JSON.stringify({ id: msg.id, status: 'error', error: message || 'handler error' }))
      }
    })

    this.socket.addEventListener('close', (evt: CloseEvent) => {
      const prevAuthed = this.authed
      this.socket = null
      this.authed = false
      if (authTimer) { window.clearTimeout(authTimer); authTimer = null }
      this.emitStatus('disconnected')

      if (evt.code !== 1000 && prevAuthed && this.wantOpen) {
        new Notice(`Jenn: соединение потеряно (code ${evt.code})`)
      }

      if (this.wantOpen) this.scheduleReconnect()
    })

    this.socket.addEventListener('error', () => {
      // close event always follows error; reconnect handled there
    })
  }

  private scheduleReconnect(): void {
    if (!this.wantOpen || this.reconnectTimer !== null) return
    if (!this.settings.reconnect) return

    const delays = [1000, 2000, 4000, 8000, 15000, 30000]
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)]
    this.reconnectAttempt++
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.emitStatus('connecting')
      this.connect()
    }, delay)
  }

  private async route(msg: IncomingMsg): Promise<unknown> {
    switch (msg.type) {
      case 'write_note':
        return this.vault.writeNote(parseWriteNotePayload(msg.payload))
      case 'append_note':
        return this.vault.appendNote(parseAppendNotePayload(msg.payload))
      case 'get_vault_tree':
        return this.vault.getVaultTree()
      case 'describe_folder':
        return this.vault.describeFolder(parseDescribeFolderPayload(msg.payload).path)
      case 'search_notes':
        return this.vault.searchNotes(parseSearchNotesPayload(msg.payload))
      case 'list_destinations':
        return this.vault.listDestinations()
      case 'ping':
        return { status: 'ok', vault: this.vault.vaultName }
      default:
        throw new Error(`unknown command: ${msg.type}`)
    }
  }
}
