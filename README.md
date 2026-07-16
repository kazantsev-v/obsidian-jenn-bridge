# Jenn Bridge

**Obsidian plugin — WebSocket endpoint for [Jenn Core]**

Acts as an output destination in Jenn's data routing system. Receives notes, appends content, searches the vault — all over a secure WebSocket connection.

---

## Features

- **Write notes** — create markdown notes from Jenn with title, content, tags, folder
- **Append content** — add content to existing notes (with optional section heading)
- **Search vault** — full-text search across your vault
- **Browse folders** — list files and folders, get vault tree
- **Status indicator** — color-coded connection dot in the status bar
- **Auto-reconnect** — resilient connection with exponential backoff

## Quick start

1. Install via **BRAT** or copy to `.obsidian/plugins/obsidian-jenn-bridge/`
2. Open plugin settings
3. Set **Server URL** (from Jenn Core output config, e.g. `ws://localhost:11235`)
4. Set **API Key** (copy from Jenn config)
5. Click **Connect**

## Commands

| Command | Description |
|---------|-------------|
| `Jenn: Показать статус` | Show current connection status |
| `Jenn: Вкл/Выкл соединение` | Toggle WebSocket connection |
| `Jenn: Открыть настройки` | Open plugin settings |

## Connection status

- 🟢 Connected — ready to receive data
- 🟡 Connecting — handshake in progress
- 🔴 Disconnected — check settings or Server URL

## RPC API (WebSocket methods)

| Method | Description |
|--------|-------------|
| `write_note` | Create a new note |
| `append_note` | Append content to an existing note |
| `search_notes` | Full-text search across vault |
| `describe_folder` | List files in a folder |
| `get_vault_tree` | Get full vault directory tree |
| `list_destinations` | List top-level folders |
| `ping` | Health check (returns vault name) |

---

# Jenn Bridge

**Плагин Obsidian — WebSocket-приёмник для [Jenn Core](https://jenn.dev).**

Используется как конечная точка маршрутизации данных в системе Jenn. Принимает заметки, дополняет существующие, ищет по хранилищу — всё через защищённое WebSocket-соединение.

## Возможности

- **Создание заметок** — из Jenn с заголовком, содержимым, тегами и папкой
- **Дополнение** — добавление контента в существующие заметки (с опциональным заголовком секции)
- **Поиск** — полнотекстовый поиск по хранилищу
- **Навигация** — просмотр файлов и папок, получение дерева хранилища
- **Индикатор** — цветная точка статуса в строке состояния
- **Автопереподключение** — устойчивое соединение с экспоненциальной задержкой

## Быстрый старт

1. Установите через **BRAT** или скопируйте в `.obsidian/plugins/obsidian-jenn-bridge/`
2. Откройте настройки плагина
3. Укажите **Server URL** (из конфига Jenn Core, например `ws://localhost:11235`)
4. Укажите **API Key** (из конфига Jenn)
5. Нажмите **Подключиться**

## Команды

| Команда | Описание |
|---------|----------|
| `Jenn: Показать статус` | Показать статус соединения |
| `Jenn: Вкл/Выкл соединение` | Включить/отключить WebSocket |
| `Jenn: Открыть настройки` | Открыть настройки плагина |

## Статус соединения

- 🟢 Подключено — готов к приёму данных
- 🟡 Подключаюсь… — выполняется рукопожатие
- 🔴 Отключено — проверьте настройки или Server URL

## RPC API (методы WebSocket)

| Метод | Описание |
|-------|----------|
| `write_note` | Создать новую заметку |
| `append_note` | Дополнить существующую заметку |
| `search_notes` | Полнотекстовый поиск по хранилищу |
| `describe_folder` | Список файлов в папке |
| `get_vault_tree` | Полное дерево папок хранилища |
| `list_destinations` | Список корневых папок |
| `ping` | Проверка соединения (возвращает имя хранилища) |
