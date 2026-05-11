# Scratch Nano - Copilot Instructions

## Version Management

- When updating the app version, update ALL of these files:
  1. `package.json` → `version` field (source of truth)
  2. `src-tauri/Cargo.toml` → `package.version` field
- `tauri.conf.json` does NOT need manual update — Tauri reads the version from `package.json` automatically.
- `package.json` is the source of truth for the version number.
