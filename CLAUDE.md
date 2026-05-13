# Scratch Nano - Development Guide

## Project Overview

Scratch Nano is a cross-platform markdown note-taking app for macOS, Windows, and Linux, built with Tauri v2 (Rust backend) + React/TypeScript/Tailwind (frontend) + Milkdown Crepe (WYSIWYG editor) + Tantivy (full-text search).

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

## Editor Architecture (Milkdown Crepe)

- The WYSIWYG editor uses **Milkdown Crepe** (`@milkdown/crepe`), a high-level API that bundles toolbar, CodeMirror, table, list, link tooltip, latex, and slash command features by default.
- React integration via `@milkdown/react`: use `MilkdownProvider` + `useEditor` hook. Pattern: `useEditor((root) => new Crepe({ root, defaultValue }))`.
- **Critical**: Milkdown's `Editor` class does NOT expose `view` or `state` properties directly. Always access ProseMirror EditorView/State through the context pattern:
  ```ts
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const state = view.state;
  });
  ```
  Or from outside: `editor.ctx.get(editorViewCtx)`.
- Content replacement uses `editor.action((ctx) => { ... state.tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0)) })` with `parserCtx` and `editorViewCtx`.
- `Crepe` instance provides convenience methods: `crepe.getMarkdown()`, `crepe.editor` (the underlying Editor), `crepe.setReadonly(value)`.
- The `editorRef` passed to parent components holds a `Crepe` instance (not `Editor`). Use `editorRef.current?.editor` to get the `Editor`.
- CSS imports required: `@milkdown/crepe/theme/common/style.css` + `@milkdown/crepe/theme/nord.css`.
- **Deprecated files** (stubbed with `@ts-nocheck`, safe to delete): `CodeBlockView.tsx`, `Frontmatter.ts`, `lowlight.ts`, `MermaidRenderer.tsx`, `SlashCommand.tsx`, `SlashCommandList.tsx`, `SuggestionList.tsx`, `BlockMathEditor.tsx`, `MathExtensions.ts`. These were TipTap-specific and are replaced by Milkdown Crepe's built-in features.

## Coding Conventions

- Clean, minimal code with low technical debt
- Proper React patterns (contexts, hooks, memoization)
- Type-safe with TypeScript throughout
- No commented-out code or TODOs in production code
- Use `React.memo` for expensive list-item components
- Use `useCallback`/`useMemo` for performance-critical paths
- Debounce user-triggered operations (auto-save 300ms, search 150ms, file watcher 500ms)
- All operations should be non-blocking (async)
- Error handling with user-friendly messages

## Releasing

1. Bump version in `package.json` and `src-tauri/Cargo.toml`
2. Commit to `main`, then tag and push: `git tag v0.5.0 && git push origin v0.5.0`
3. The release workflow builds all platforms and creates a draft GitHub release
4. Update the description in `latest.json` from GitHub after the action finishes
5. Review, edit notes, and publish