# HITL — Human-in-the-Loop Ledger (ToolBox)

Project-specific rulings for **Forget-Me-Knot ToolBox**.

## Rulings

### 2026-08-10 — Batch and Group Releases

- **Group changes into feature batches:** Do NOT bump version numbers, tag GitHub releases, update Homebrew casks, or build DMG installers for every micro-edit or single feature change.
- **Local Commits:** Stage and commit code changes to `main` as work progresses during active development.
- **Milestone Releases:** Only bump versions (`package.json`, `Cargo.toml`, `tauri.conf.json`, `index.html`), create GitHub releases, and update the Homebrew cask when a complete feature batch / milestone is verified and ready for release.
