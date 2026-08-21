# ToolBox Handoff

## Objective

Restore the macOS menu bar tray icon, preserve click-to-toggle behavior, and make saved service notes visible and editable in the ToolBox popup.

## Tasks

- [x] Inspect the tray image and tray creation lifecycle.
- [x] Implement the smallest reliable macOS tray icon fix.
- [x] Build and verify the Electron tray surface.
- [x] Verify ToolBox becomes visible after Hidden Bar was terminated at the user's request.
- [x] Show saved notes on service cards.
- [x] Add an Edit flow for URL, name, category, and notes.
- [x] Fix Add so it captures fields before clearing the form.
- [x] Verify note persistence and restore the user's data after QA.
- [x] Pull back internal sidebar logo scale to `scale(1.15)` so the wrench head is fully visible.
- [x] Scale up menu bar tray icon in `assets/trayTemplate.png` to fill 40px height and 42px width centered in 44x44 canvas.
- [x] Add A–Z / Z–A alphabetical sorting toggle button to topbar with persistent user preference.
- [x] Implement Archive / Restore and permanent Delete actions for entries in backend and UI.
- [x] Bump version to v0.1.9, stage, commit, and push to `origin/main`.
- [x] Fix modal container layout & button overflow, bump version to v0.1.10, stage, commit, tag, push, and publish GitHub Release.
- [x] Fix the "damaged and can't be opened" macOS bundle (v0.1.12): set `bundle.macOS.signingIdentity` so the bundle is sealed.
- [x] Fix generic globe favicons by moving icon resolution into the Rust backend.
- [x] Add `scripts/release-macos.sh`; ship, tag, release v0.1.12, and update the Homebrew cask.
- [x] Ship a styled DMG install window with a versioned volume name (v0.1.13).
- [x] Configure `tauri build` to produce a Universal macOS binary (Apple Silicon + Intel).

## Release invariants (do not regress)

- **`bundle.macOS.signingIdentity: "-"` must stay set.** Tauri skips `codesign`
  entirely without it, shipping a bundle with only the linker's ad-hoc signature
  and no `_CodeSignature/CodeResources`. Strict verification then fails with
  *"code has no resources but signature indicates they must be present"*, which
  macOS reports as **damaged**. This shipped in every release through 0.1.11.
  It is a structural defect, not quarantine — `xattr -cr`, right-click > Open,
  and Gatekeeper bypass cannot clear it.
- **Release via `./scripts/release-macos.sh`, never bare `tauri build`.** Both
  failure modes here are silent; the bundler prints "Finished 2 bundles" either
  way. The script gates on `codesign --verify --strict`, `syspolicy_check`, the
  shipped volume name, and version agreement across the four version files.
- **`spctl` returning `rejected` is correct** — the app is ad-hoc signed, not
  notarized. The regression to watch for is the *structural* resources error.
  Removing the first-launch prompt entirely needs a paid Developer ID; the
  script already accepts one via the `APPLE_*` env vars.
- **The DMG background fails silently in two ways, both gated in the release
  script.** On Apple Silicon `hdiutil` cannot create HFS+, so the `.DS_Store`
  background reference is an alias that does not resolve and Finder falls back to
  a plain grey window — no error, and a `.DS_Store` that inspects as perfect.
  Renaming the volume to carry the version invalidates the alias too, so
  `scripts/fix-dmg-background.sh` must run **after** the rename. A Finder-written
  alias is ~780 bytes against a generated ~410; that size is the cheap proof.
  Regenerate artwork with `scripts/dmg-background.py` — never hand-edit the PNG,
  and keep it exactly 540x380 or Finder pads the window with white.
- **The shelf band must stay at 0.60-0.75 luminance.** Finder draws icon labels
  in the system label colour and the artwork cannot override it. Currently ~0.69.
- **Never point an `<img>` at a favicon service.** Google's S2 answers unknown
  domains with HTTP 404 and a generic globe body; browsers render it, so
  `onload` fires and `onerror` never does. An `<img>` cannot see HTTP status or
  Content-Type, so no front-end fallback can catch it. Resolution lives in
  `backend.rs::resolve_favicon` and validates status, Content-Type, and magic
  bytes. Two earlier front-end-only attempts failed for this reason.

## Known context

- **Release Policy:** Changes are batched into grouped feature releases rather than running version bumps/Homebrew releases for single micro-edits. Commits are made locally to `main` as work progresses, and release artifacts are published only when a milestone batch is complete.
- Electron runs as an accessory app without a Dock icon.
- Tray creation succeeds, but Hidden Bar moves new status items offscreen.
- The current icon is `assets/trayTemplate.png`.
- The PNG decodes correctly and contains 285 opaque pixels; the reported zero height came from `Tray.getBounds()`, not `NativeImage.getSize()`.
- An isolated native-image test produced a healthy 40x40 image and attached 108x39 status item, but `Tray.getBounds()` reported `x: -3853`, confirming offscreen placement rather than an Electron rendering failure.
- `/Applications/Hidden Bar.app` was confirmed running as a background process, but no Hidden Bar control was identifiable in the user's screenshot. At the user's explicit request, PID 1219 was terminated cleanly with `SIGTERM`; the user plans to delete the app.
- The user confirmed the ToolBox icon appeared immediately afterward, establishing Hidden Bar as the blocker.
- ToolBox uses a 16x16 template image for automatic light/dark menu-bar contrast.
- ToolBox now has a stable tray GUID so macOS and Hidden Bar can retain its placement across development launches.
- On macOS, left-click toggles the popup and right-click opens the context menu; attaching the context menu directly would let it consume normal clicks.
- Login-item registration now runs only in packaged builds, avoiding registration of the generic development `Electron.app`; `openAsHidden` was removed because it is unavailable on modern macOS.
- Service cards show a two-line notes preview and an explicit Edit action.
- Add and Edit share one form; Edit opens prefilled and notes use a multiline textarea.
- The old Add handler cleared the modal before reading Name, Category, and Notes, so those values could be discarded. The submit handler now captures the full payload first.

## Verification

- `npm run typecheck` passes.
- `npm run build` passes.
- An isolated Electron status item reported non-empty image data, `40x40` image size, and `108x39` attached bounds; its `x: -3853` position identified Hidden Bar as the visibility blocker.
- The final app is running from `npm start` for live menu-bar verification.
- Live menu-bar verification passed after terminating Hidden Bar: the ToolBox icon is visible and accessible.
- Live Electron QA passed for Edit -> save note -> visible card preview -> reopen prefilled -> clear note.
- `~/.toolbox/toolbox.json` returned to its exact pre-QA SHA-256 (`2609867e02b5703c125256b14bf041178d726f0fa6049d5d995040439f011d7f`); no test note remains.
- Temporary QA-only show/log instrumentation was removed, the final build passes, and the normal app is running from `npm start`.
