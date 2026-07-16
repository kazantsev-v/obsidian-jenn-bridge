import {
  App,
  TFile,
  TFolder,
  normalizePath,
  Notice,
} from 'obsidian'
import type {
  VaultFileEntry,
  WriteNotePayload,
  AppendNotePayload,
  SearchNotesPayload,
} from './types'

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export class JennVault {
  constructor(private app: App) {}

  get vaultName(): string {
    return this.app.vault.getName()
  }

  async writeNote(payload: WriteNotePayload): Promise<{
    path: string
    url: string
    file_created: boolean
    iteration?: number
  }> {
    const title = this.sanitizeName(payload.title)
    const folder = payload.folder ? normalizePath(payload.folder) : ''
    const basePath = folder
      ? normalizePath(`${folder}/${title}.md`)
      : normalizePath(`${title}.md`)

    const { path, iteration } = await this.resolvePath(basePath)
    const content = this.buildContent(payload, iteration)

    await this.ensureFolder(normalizePath(folder || '.'))
    await this.app.vault.create(path, content)

    return {
      path,
      url: this.obsidianUri(path),
      file_created: true,
      iteration,
    }
  }

  async appendNote(payload: AppendNotePayload): Promise<{
    path: string
    url: string
    total_lines: number
  }> {
    const path = normalizePath(payload.path)
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`)
    }

    let existing = await this.app.vault.read(file)
    const sep = existing.endsWith('\n') ? '' : '\n'
    const section = payload.as_section
      ? `\n\n## ${payload.as_section}\n\n`
      : '\n\n---\n\n'
    const append = payload.as_section
      ? `${section}${payload.content}`
      : `${section}${payload.content}`

    await this.app.vault.modify(file, existing + append)

    const lines = (existing + append).split('\n').length
    return { path, url: this.obsidianUri(path), total_lines: lines }
  }

  async getVaultTree(): Promise<{ tree: VaultFileEntry[] }> {
    const root = this.app.vault.getRoot()
    const tree = await this.buildTree(root)
    return { tree: tree.folders || [] }
  }

  async describeFolder(path: string): Promise<{
    path: string
    type: string
    files: VaultFileEntry[]
    folders: VaultFileEntry[]
    file_count: number
    name: string
  }> {
    const folderPath = normalizePath(path || '.')
    const folder = this.app.vault.getAbstractFileByPath(folderPath)
    if (!(folder instanceof TFolder)) {
      throw new Error(`Folder not found: ${folderPath}`)
    }

    const entries: VaultFileEntry[] = []
    for (const child of folder.children) {
      if (child instanceof TFile) {
        const stat = await this.app.vault.adapter.stat(child.path)
        entries.push({
          name: child.name,
          path: child.path,
          type: 'file',
          created: stat?.ctime ? new Date(stat.ctime).toISOString() : undefined,
          modified: stat?.mtime ? new Date(stat.mtime).toISOString() : undefined,
        })
      }
    }

    const subfolders: VaultFileEntry[] = []
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        const fc = child.children.filter(c => c instanceof TFile).length
        subfolders.push({
          name: child.name,
          path: child.path,
          type: 'folder',
          file_count: fc,
        })
      }
    }

    return {
      path: folderPath,
      type: 'folder',
      name: folder.name,
      files: entries,
      folders: subfolders,
      file_count: entries.length,
    }
  }

  async searchNotes(payload: SearchNotesPayload): Promise<{
    results: Array<{ path: string; title: string; snippet: string }>
  }> {
    const { query, folder, limit = 20 } = payload
    const q = query.toLowerCase()

    let files = this.app.vault.getMarkdownFiles()
    if (folder) {
      const folderPath = normalizePath(folder) + '/'
      files = files.filter(f => f.path.startsWith(folderPath))
    }

    const results: Array<{ path: string; title: string; snippet: string }> = []
    for (const file of files) {
      if (results.length >= limit) break
      const title = file.name.replace(/\.md$/, '')
      if (title.toLowerCase().includes(q)) {
        results.push({ path: file.path, title, snippet: title })
        continue
      }
      try {
        const content = await this.app.vault.read(file)
        const idx = content.toLowerCase().indexOf(q)
        if (idx !== -1) {
          const start = Math.max(0, idx - 60)
          const end = Math.min(content.length, idx + q.length + 60)
          const snippet = (start > 0 ? '…' : '') +
            content.slice(start, end).replace(/\n/g, ' ') +
            (end < content.length ? '…' : '')
          results.push({ path: file.path, title, snippet })
        }
      } catch {
        // skip unreadable files
      }
    }

    return { results }
  }

  async listDestinations(): Promise<{
    destinations: VaultFileEntry[]
  }> {
    const root = this.app.vault.getRoot()
    const folders: VaultFileEntry[] = []
    for (const child of root.children) {
      if (child instanceof TFolder) {
        const fc = child.children.filter(c => c instanceof TFile).length
        folders.push({
          name: child.name,
          path: child.path,
          type: 'folder',
          file_count: fc,
        })
      }
    }
    return { destinations: folders }
  }

  private async buildTree(folder: TFolder): Promise<VaultFileEntry> {
    const children: VaultFileEntry[] = []
    for (const child of folder.children) {
      if (child instanceof TFile) {
        children.push({
          name: child.name,
          path: child.path,
          type: 'file',
        })
      } else if (child instanceof TFolder) {
        const sub = await this.buildTree(child)
        children.push(sub)
      }
    }

    return {
      name: folder.name,
      path: folder.path,
      type: 'folder',
      file_count: children.filter(c => c.type === 'file').length,
      files: children.filter(c => c.type === 'file'),
      folders: children.filter(c => c.type === 'folder'),
    }
  }

  private async resolvePath(basePath: string): Promise<{ path: string; iteration?: number }> {
    if (!this.app.vault.getAbstractFileByPath(basePath)) {
      return { path: basePath }
    }

    const dir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : ''
    const base = basePath.replace(/\.md$/, '')
    let i = 1
    while (i < 100) {
      const candidate = dir
        ? normalizePath(`${dir}/${base.split('/').pop()} (${i}).md`)
        : normalizePath(`${base} (${i}).md`)
      if (!this.app.vault.getAbstractFileByPath(candidate)) {
        return { path: candidate, iteration: i }
      }
      i++
    }
    throw new Error(`Could not resolve unique path for: ${basePath}`)
  }

  private buildContent(payload: WriteNotePayload, iteration?: number): string {
    const frontmatter: Record<string, unknown> = {
      jenn_id: uuid(),
      created: new Date().toISOString(),
    }

    if (payload.tags && payload.tags.length > 0) {
      frontmatter.tags = payload.tags
    }
    if (payload.date) {
      frontmatter.date = payload.date
    }
    if (payload.source) {
      frontmatter.source = payload.source
    }

    const fmLines = ['---']
    for (const [key, val] of Object.entries(frontmatter)) {
      if (Array.isArray(val)) {
        fmLines.push(`${key}: [${val.map(v => `"${v}"`).join(', ')}]`)
      } else if (typeof val === 'string') {
        fmLines.push(`${key}: "${val}"`)
      } else {
        fmLines.push(`${key}: ${val}`)
      }
    }
    fmLines.push('---')

    const titleLine = `# ${payload.title}`
    const body = payload.content || ''

    return fmLines.join('\n') + '\n' + titleLine + '\n\n' + body
  }

  private async ensureFolder(path: string): Promise<void> {
    if (path === '.') return
    try {
      if (!this.app.vault.getAbstractFileByPath(path)) {
        await this.app.vault.createFolder(path)
      }
    } catch {
      // folder may already exist
    }
  }

  private sanitizeName(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'untitled'
  }

  private obsidianUri(path: string): string {
    const vault = encodeURIComponent(this.app.vault.getName())
    const file = encodeURIComponent(path)
    return `obsidian://open?vault=${vault}&file=${file}`
  }
}
