# Scratch Nano


A super minimal, offline-first markdown note-taking app for macOS, Windows, and Linux.


[Releases](https://github.com/hetima/scratch-nano/releases)

## Features

- **Offline-first** - No cloud, no account, no internet required
- **Markdown-based** - Notes stored as plain `.md` files you own
- **Preview mode** - Preview `.md` file
- **Markdown source mode** - Toggle to view and edit raw markdown (`Cmd+U`)
- **Syntax highlighting** - 20 languages with GitHub-inspired color scheme
- **Mermaid diagrams** - Render flowcharts, sequence diagrams, and more in fenced code blocks
- **Focus mode** - Distraction-free writing with animated sidebar/toolbar fade (`Cmd+Shift+Enter`)
- **Folders** - Opt-in collapsible folder tree with drag-and-drop to organize notes
- **Multiple folders** - Manage notes across multiple root folders with a quick-switch menu
- **Full-text search** - Fast search powered by Tantivy; create a new note by name directly from the search field
- **Pin notes** - Pin frequently used notes to the top of the list
- **Code copy button** - One-click copy button on fenced code blocks
- **Auto-save** - Notes are saved automatically when switching between them
- **Customizable** - Theme, typography, page width, and RTL text direction
- **Lightweight** - 5-10x smaller than Obsidian or Notion

## Screenshot


## Installation

### Windows

Download the latest `.exe` installer from [Releases](https://github.com/hetima/scratch-nano/releases) and run it. WebView2 will be downloaded automatically if needed.

### macOS (but not tested)

1. Download the latest `.dmg` from [Releases](https://github.com/hetima/scratch-nano/releases)
2. Open the DMG and drag Scratch to Applications
3. Open Scratch from Applications

### Linux (but not tested)

Download the latest `.AppImage` or `.deb` from [Releases](https://github.com/hetima/scratch-nano/releases).

### From Source

**Prerequisites:** Node.js 18+, Rust 1.70+

**macOS:** Xcode Command Line Tools · **Windows:** WebView2 Runtime (pre-installed on Windows 11)

```bash
git clone https://github.com/hetima/scratch-nano.git
cd scratch
pnpm install
pnpm tauri dev      # Development
pnpm tauri build    # Production build
```

## Keyboard Shortcuts

Scratch is designed to be usable without a mouse. Here are the essentials to get started:

| Shortcut          | Action                 |
| ----------------- | ---------------------- |
| `Cmd+N`           | New note               |
| `Cmd+D`           | Duplicate note         |
| `Delete`          | Delete note            |
| `Cmd+Backspace`   | Delete note            |
| `Cmd+P`           | Command palette        |
| `Cmd+K`           | Add/edit link          |
| `Cmd+F`           | Find in note           |
| `Cmd+Shift+C`     | Copy & Export menu     |
| `Cmd+U`           | Toggle Markdown source |
| `Cmd+Shift+Enter` | Toggle Focus mode      |
| `Cmd+Shift+F`     | Search notes           |
| `Cmd+R`           | Reload current note    |
| `Cmd+,`           | Open settings          |
| `Cmd+\`           | Toggle sidebar         |
| `Cmd+B/I`         | Bold/Italic            |
| `Cmd+=/-/0`       | Zoom in/out/reset      |
| `↑/↓`             | Navigate notes         |

**Note:** On Windows, use `Ctrl` instead of `Cmd` for all shortcuts.

Many more shortcuts and features are available in the app—explore via the command palette (`Cmd+P` / `Ctrl+P`) or view the full reference in Settings → Shortcuts.

## License

Forked from: [erictli/scratch](https://github.com/erictli/scratch)

MIT
