import { Notice } from 'obsidian'
import type { JennPluginSettings } from './types'
import { JennVault } from './vault'

type StatusCallback = (status: 'connected' | 'disconnected' | 'connecting') => void

interface IncomingMsg {
  id: string
  status?: string
  type?: string
  payload?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: string
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
        msg = JSON.parse(typeof evt.data === 'string' ? evt.data : String(evt.data))
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
      } catch (err: any) {
        new Notice(`Jenn: ошибка при ${msg.type} — ${err.message}`)
        this.socket?.send(JSON.stringify({ id: msg.id, status: 'error', error: err.message || 'handler error' }))
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

  private async route(msg: IncomingMsg): Promise<Record<string, unknown>> {
    switch (msg.type) {
      case 'write_note':
        return (await this.vault.writeNote(msg.payload as any)) as any
      case 'append_note':
        return (await this.vault.appendNote(msg.payload as any)) as any
      case 'get_vault_tree':
        return (await this.vault.getVaultTree()) as any
      case 'describe_folder':
        return (await this.vault.describeFolder((msg.payload as any)?.path || '')) as any
      case 'search_notes':
        return (await this.vault.searchNotes(msg.payload as any)) as any
      case 'list_destinations':
        return (await this.vault.listDestinations()) as any
      case 'ping':
        return { status: 'ok', vault: this.vault.vaultName }
      default:
        throw new Error(`unknown command: ${msg.type}`)
    }
  }
}
