import { Plugin, Notice } from 'obsidian'
import { DEFAULT_SETTINGS, type JennPluginSettings } from './types'
import { JennWebSocket } from './websocket'
import { JennSettingTab } from './settings'

export default class JennPlugin extends Plugin {
  settings!: JennPluginSettings
  ws!: JennWebSocket
  wsStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected'
  private statusBarEl: HTMLElement | null = null
  private statusDot: HTMLElement | null = null

  async onload() {
    await this.loadSettings()

    this.ws = new JennWebSocket(this.settings, this.app, (status) => {
      this.wsStatus = status
      this.updateStatusBar()
    })

    this.addSettingTab(new JennSettingTab(this.app, this))

    this.addCommand({
      id: 'jenn-show-status',
      name: 'Показать статус',
      callback: () => {
        const s = this.wsStatus
        const msg = s === 'connected' ? '🟢 Подключено' :
          s === 'connecting' ? '🟡 Подключаюсь…' : '🔴 Отключено'
        new Notice(`${msg} (${this.settings.serverUrl})`)
      },
    })

    this.addCommand({
      id: 'jenn-toggle-connection',
      name: 'Вкл/Выкл соединение',
      callback: () => {
        if (this.wsStatus === 'connected') {
          this.ws.close()
          new Notice('🔴 Отключено')
        } else {
          this.ws.open()
          new Notice('🟡 Подключаюсь…')
        }
      },
    })

    this.addCommand({
      id: 'jenn-open-settings',
      name: 'Открыть настройки',
      callback: () => {
        const setting = (this.app as any).setting
        if (setting?.openTabById) {
          setting.openTabById('obsidian-jenn-bridge')
        } else if (setting?.containerEl) {
          setting.open()
          new Notice('Откройте вкладку Jenn Bridge в настройках')
        }
      },
    })

    this.statusBarEl = this.addStatusBarItem()
    this.statusBarEl.addClass('jenn-bridge-status')
    this.statusDot = this.statusBarEl.createSpan({ cls: 'jenn-bridge-status-dot disconnected' })
    this.statusBarEl.createSpan({ text: 'Jenn' })

    if (this.settings.apiKey) {
      this.ws.open()
    }
  }

  onunload() {
    this.ws.close()
  }

  async loadSettings() {
    const data = await this.loadData()
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data as Partial<JennPluginSettings>)
  }

  async saveSettings() {
    this.ws.updateSettings(this.settings)
    await this.saveData(this.settings)
  }

  private updateStatusBar() {
    if (!this.statusDot) return
    this.statusDot.removeClass('connected', 'disconnected', 'connecting')
    this.statusDot.addClass(this.wsStatus)
  }
}
