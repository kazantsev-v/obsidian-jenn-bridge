import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian'
import type JennPlugin from './main'

export class JennSettingTab extends PluginSettingTab {
  plugin: JennPlugin

  constructor(app: App, plugin: JennPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [{
      type: 'group',
      heading: 'Подключение',
      items: [
        {
          name: 'Статус',
          desc: this.getStatusText(),
          render: (setting) => {
            setting
              .setDesc(this.getStatusText())
              .addButton(btn => btn
                .setButtonText(this.plugin.wsStatus === 'connected' ? 'Отключиться' : 'Подключиться')
                .onClick(() => {
                  if (this.plugin.wsStatus === 'connected') {
                    this.plugin.ws.close()
                  } else {
                    this.plugin.ws.open()
                  }
                })
              )
          },
        },
        {
          name: 'Сервер',
          desc: 'Адрес Jenn Core (скопировать из конфига output)',
          control: {
            type: 'text',
            key: 'serverUrl',
            placeholder: 'ws://localhost:11235',
          },
        },
        {
          name: 'API Key',
          desc: 'Токен для подключения к Jenn Core',
          control: {
            type: 'text',
            key: 'apiKey',
            placeholder: 'uuid',
          },
        },
        {
          name: 'Папка по умолчанию',
          desc: 'Папка для новых заметок (пусто = корень vault)',
          control: {
            type: 'text',
            key: 'defaultFolder',
            placeholder: 'Jenn Inbox',
          },
        },
        {
          name: 'Автопереподключение',
          desc: 'Автоматически переподключаться при разрыве',
          control: {
            type: 'toggle',
            key: 'reconnect',
          },
        },
      ],
    }]
  }

  private getStatusText(): string {
    return this.plugin.wsStatus === 'connected' ? '🟢 Подключено' :
      this.plugin.wsStatus === 'connecting' ? '🟡 Подключаюсь…' : '🔴 Отключено'
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl)
      .setName('Подключение')
      .setHeading()

    const status = this.plugin.wsStatus === 'connected' ? '🟢 Подключено' :
      this.plugin.wsStatus === 'connecting' ? '🟡 Подключаюсь…' : '🔴 Отключено'

    new Setting(containerEl)
      .setName('Статус')
      .setDesc(status)
      .addButton(btn => btn
        .setButtonText(this.plugin.wsStatus === 'connected' ? 'Отключиться' : 'Подключиться')
        .onClick(() => {
          if (this.plugin.wsStatus === 'connected') {
            this.plugin.ws.close()
          } else {
            this.plugin.ws.open()
          }
        })
      )

    new Setting(containerEl)
      .setName('Сервер')
      .setDesc('Адрес Jenn Core (скопировать из конфига output)')
      .addText(text => text
        .setPlaceholder('ws://localhost:11235')
        .setValue(this.plugin.settings.serverUrl)
        .onChange(async val => {
          this.plugin.settings.serverUrl = val
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Токен для подключения к Jenn Core')
      .addText(text => text
        .setPlaceholder('uuid')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async val => {
          this.plugin.settings.apiKey = val
          await this.plugin.saveSettings()
        })
      )


    new Setting(containerEl)
      .setName('Папка по умолчанию')
      .setDesc('Папка для новых заметок (пусто = корень vault)')
      .addText(text => text
        .setPlaceholder('Jenn Inbox')
        .setValue(this.plugin.settings.defaultFolder)
        .onChange(async val => {
          this.plugin.settings.defaultFolder = val
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Автопереподключение')
      .setDesc('Автоматически переподключаться при разрыве')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.reconnect)
        .onChange(async val => {
          this.plugin.settings.reconnect = val
          await this.plugin.saveSettings()
        })
      )
  }
}
