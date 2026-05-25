# Scratch Nano - Development Guide

## Project Overview

Scratch Nano is a cross-platform markdown note-taking app for macOS, Windows, and Linux, built with Tauri v2 (Rust backend) + React/TypeScript/Tailwind (frontend) + marked (read-only markdown preview) + Tantivy (full-text search).

## Commands

```bash
pnpm dev              # Start Vite dev server only
pnpm build            # Build frontend (tsc + vite)
pnpm tauri dev        # Run full app in development mode
pnpm tauri build      # Build production app
```

## CI

Runs on every push to `main` and on PRs. Validates frontend build (`tsc` + Vite) and Rust compilation (`cargo check` + `cargo clippy`) on an Ubuntu runner.

## Key Patterns

- All backend operations go through Tauri commands in `src-tauri/src/lib.rs`. Frontend calls them via `invoke()` from `@tauri-apps/api/core`.
- `NotesContext` uses a dual context pattern (data/actions separated) for performance.
- Settings live in two places: app config at `{APP_DATA}/config.json`, per-folder settings at `{NOTES_FOLDER}/.scratch/settings.json`.
- Tauri v2 permissions go in `src-tauri/capabilities/default.json`.

## Editor Architecture (marked Preview)

- The editor is a **read-only markdown preview** using `marked` (v18+) with GFM and breaks enabled. No editing or saving functionality exists in the editor component.
- Markdown content is rendered via `marked.parse(content)` and displayed with `dangerouslySetInnerHTML` inside a `<div className="prose markdown-preview">`.
- Source mode shows the raw markdown in a **readonly textarea**.
- Font settings from `ThemeContext` are applied via CSS variables (`--editor-font-family`, `--editor-base-font-size`, `--editor-line-height`) as inline styles on the preview container.
- Link handling: Cmd+Click on `<a>` tags in the preview opens external URLs via `@tauri-apps/plugin-opener`.
- Note content is read only from `currentNote.content` (via `NotesContext` or `PreviewModeData`). The editor never writes back or saves.
- `PreviewModeData` interface (in `Editor.tsx`) provides data for preview windows — no `save` callback.
- CSS class `.markdown-preview` replaces the former `.ProseMirror` for layout (max-width) and print styles in `App.css`.

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
2. Commit to `main`, then tag and push: `git tag v0.5.0 && git push origin v0.5.0`
3. The release workflow builds all platforms and creates a draft GitHub release
4. Update the description in `latest.json` from GitHub after the action finishes
5. Review, edit notes, and publish