# Scratch Nano - Development Guide

## Project Overview

Scratch Nano is a cross-platform markdown note-taking app for macOS, Windows, and Linux, built with Tauri v2 (Rust backend) + React 19/TypeScript/Tailwind CSS 4 (frontend) + CodeMirror 6 (edit mode) + marked v18 (preview mode) + Tantivy (full-text search).

**Version:** 0.10.1

## Commands

```bash
pnpm dev              # Start Vite dev server only
pnpm build            # Build frontend (tsc + vite)
pnpm tauri dev        # Run full app in development mode
pnpm tauri build      # Build production app
```

## CI

Triggered manually via `workflow_dispatch`. Validates frontend build (`tsc` + Vite) and Rust compilation (`cargo check` + `cargo clippy`) on Ubuntu 22.04.

## Architecture

### Frontend

- **React 19** + TypeScript + Tailwind CSS 4 + Radix UI primitives
- **State:** Two contexts — `NotesContext` (dual-context pattern) and `ThemeContext`
- **Services:** `src/services/` wraps all Tauri commands (`notes.ts`, `files.ts`, `cli.ts`, `pdf.ts`)
- **Types:** `src/types/note.ts` defines `NoteMetadata`, `Note`, `Settings`, `SearchResult`, `FolderNode`, etc.

### Backend (src-tauri/src/lib.rs, ~3200 lines)

39 Tauri commands grouped by domain:

| Domain | Commands |
|--------|----------|
| Notes | `list_notes`, `read_note`, `save_note`, `create_note`, `delete_note`, `get_notes_folder`, `set_notes_folder` |
| Folders | `list_folders`, `create_folder`, `delete_folder`, `rename_folder`, `move_folder` |
| Note movement | `move_note` |
| Pins | `get_pinned_notes`, `update_pinned_notes`, `pin_note`, `unpin_note` |
| Settings | `get_settings`, `update_settings` |
| Search | `search_notes`, `rebuild_search_index` |
| File ops | `write_file`, `read_file_direct`, `save_file_direct`, `import_file_to_folder` |
| System | `copy_to_clipboard`, `save_clipboard_image`, `copy_image_to_assets`, `open_folder_dialog`, `open_in_file_manager`, `open_url_safe`, `open_file_preview`, `preview_note_name`, `set_title_bar_theme` |
| File watcher | `start_file_watcher` |
| CLI | `get_cli_status`, `install_cli`, `uninstall_cli` |
| Utility | `get_default_ignored_patterns` |

## Key Patterns

- All backend operations go through Tauri commands in `src-tauri/src/lib.rs`. Frontend calls them via `invoke()` from `@tauri-apps/api/core`.
- `NotesContext` uses a dual context pattern (`NotesDataContext` / `NotesActionsContext`) to prevent excessive re-renders. Data and actions are separated.
- Settings persist to `{APP_DATA}/settings.json` via Tauri commands.
- Tauri v2 permissions go in `src-tauri/capabilities/default.json`.
- The file watcher uses `notify` crate; own saves are suppressed via `recentlySavedRef`.
- Stale async requests are prevented with `selectRequestIdRef` / `pendingNewNoteIdRef` refs in `NotesContext`.

## Editor Architecture

The editor has two modes:

**Edit mode** (`CodeMirrorEditor.tsx`)
- Full CodeMirror 6 instance with markdown syntax support.
- Slash commands (`/`) trigger quick-insert suggestions via `SlashCommand.tsx`.
- Find/replace toolbar via `SearchToolbar.tsx`.
- Math blocks rendered inline with KaTeX; diagrams rendered with Mermaid.
- Link editing via `LinkEditor.tsx` modal.

**Preview mode** (read-only)
- `marked` v18 with GFM and breaks enabled.
- Rendered via `marked.parse(content)` + `dangerouslySetInnerHTML` inside `<div className="prose markdown-preview">`.
- Cmd+Click on links opens URLs via `@tauri-apps/plugin-opener`.
- Code blocks have a copy button (`CodeCopyButton.tsx`).

**Common:**
- Font settings from `ThemeContext` apply via CSS variables (`--editor-font-family`, `--editor-base-font-size`, `--editor-line-height`).
- `PreviewModeData` interface (in `Editor.tsx`) serves preview windows opened via drag-and-drop or "Open With".
- `.markdown-preview` class handles max-width and print styles in `App.css`.

## Key Components

| Component | Purpose |
|-----------|---------|
| `Sidebar.tsx` | Note list, folder tree, search input |
| `NoteList.tsx` | Scrollable, filterable note list with pinning |
| `FolderTreeView.tsx` | Hierarchical folder tree with drag-and-drop (@dnd-kit) and context menu |
| `CommandPalette.tsx` | Cmd+P command/action search |
| `SettingsPage.tsx` | Tabbed settings UI (General, Editor, Tools, Shortcuts, About) |
| `PreviewApp.tsx` | Standalone preview window (separate window mode) |
| `KeyboardShortcutsModal.tsx` | Cmd+/ reference modal |

## Coding Conventions

- Clean, minimal code with low technical debt
- Proper React patterns (contexts, hooks, memoization)
- Type-safe with TypeScript throughout
- No commented-out code or TODOs in production code
- Use `React.memo` for expensive list-item components
- Use `useCallback`/`useMemo` for performance-critical paths
- Debounce user-triggered operations (search 150ms, file watcher 500ms)
- All operations should be non-blocking (async)
- Error handling with user-friendly messages

## Releasing

1. Bump version in `package.json` and `src-tauri/Cargo.toml`
2. Commit to `main`, then tag and push: `git tag v0.10.1 && git push origin v0.10.1`
3. The release workflow (`release.yml`) builds on macOS, Ubuntu, and Windows and creates a draft GitHub release
4. Update the description in `latest.json` from GitHub after the action finishes
5. Review, edit notes, and publish
