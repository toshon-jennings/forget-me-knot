# Spec: ToolBox — Personal Service Dashboard

> **Status:** Draft
> **Author:** Toshon
> **Created:** 2026-08-08

## Problem

Tools and subscriptions accumulate invisibly. You sign up for Jules one week,
CommandCode the next, a GitHub Pro plan the month after — and because each
lives in a different bookmark folder, note, or inbox tab, you lose track of
what you actually have. The result: forgotten subscriptions you're still
paying for, rediscovering tools months later ("oh right, I had a login for
that"), and no single place to glance at your current toolkit.

## Goal

A lightweight, local-first **ToolBox** — a single dashboard + terminal
interface that shows you every service you use, with favicons for instant
recognition. Fast to add to, fast to browse, fast to prune. Grows and
shrinks as your toolkit evolves.

## Non-Goals

- Not a password manager (no credentials stored).
- Not a bookmark manager for general URLs — only services you actively use/pay for.
- Not a cross-device sync solution (local-first, single machine).
- Not a cost tracker with invoicing (subscription *awareness*, not billing).

---

## User Stories

1. As a user, I want to `tb add https://jules.google` and have it auto-capture
   name + favicon, so I don't have to type metadata.
2. As a user, I want `tb list` to show every service with one-line summaries,
   so I can audit my toolkit in under 10 seconds.
3. As a user, I want a visual dashboard grid of favicons I can scan with my
   eyes, so I recognize tools by sight.
4. As a user, I want to tag/categorize services ("ai", "dev", "media"),
   so I can filter by area.
5. As a user, I want to mark a service as `archived` instead of deleting it,
   so I keep history of what I've used.
6. As a user, I want to attach a short note ("$20/mo, renews Jan"),
   so I remember context without leaving the terminal.
7. As a user, I want `tb open jules` to launch the service in my browser,
   so I can go from "what was that called?" to using it in one command.

---

## Data Model

Single JSON file at `~/.toolbox/toolbox.json`:

```jsonc
{
  "services": [
    {
      "id": "uuid-v4",
      "name": "Jules",
      "url": "https://jules.google",
      "favicon": "https://jules.google/favicon.ico",
      "category": "ai",
      "notes": "Google's coding agent. $20/mo.",
      "addedAt": "2026-07-12",
      "lastUsedAt": "2026-08-07",
      "status": "active" // "active" | "archived"
    }
  ],
  "categories": [
    { "id": "ai",        "label": "AI & Agents" },
    { "id": "dev",       "label": "Developer Tools" },
    { "id": "media",     "label": "Media & Design" },
    { "id": "infra",     "label": "Infra & Cloud" },
    { "id": "productivity", "label": "Productivity" }
  ]
}
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `id` | Auto | UUID v4, generated on add |
| `name` | Auto | Derived from `<title>` or URL host if not given |
| `url` | Yes | The service's main URL |
| `favicon` | Auto | Best-effort fetch; falls back to `domain/favicon.ico` |
| `category` | No | Free string or one of predefined |
| `notes` | No | Free text, 1–3 lines typical |
| `addedAt` | Auto | ISO date on creation |
| `lastUsedAt` | Auto | Updated on `tb open` or `tb touch` |
| `status` | Auto | `active` (default) or `archived` |

---

## CLI Specification

Binary: `tb` (alias for `toolbox`)

```
tb                           # Open dashboard (default behavior)
tb list                      # List all active services
tb list --all                # Include archived
tb list --category ai        # Filter by category
tb list --search "agent"     # Fuzzy search name/notes/url
tb add <url> [--name "X"] [--category ai] [--notes "..."]
tb remove <id-or-name>       # Soft-delete (marks archived)
tb open <id-or-name>         # Open in browser + bump lastUsedAt
tb edit <id-or-name> [--name] [--url] [--category] [--notes] [--status]
tb touch <id-or-name>        # Bump lastUsedAt without opening
tb categories                # List defined categories
tb export [--format json|csv]
tb import <file>
tb doctor                    # Validate store, fix broken favicons
```

### Output format for `tb list`

```
  42 services (3 archived)                        [tb list]

  ● Jules             ai           jules.google
    $20/mo · last used yesterday
  ● CommandCode       dev          commandcode.io
    IDE subscription · last used 2 weeks ago
  ● GitHub Copilot    ai           github.com
    $10/mo · last used today
  …
```

- Active items: `●`
- Archived items: `○` (only shown with `--all`)
- Name, category, domain on line 1.
- Notes snippet + relative `lastUsedAt` on line 2 (if present).

---

## Dashboard UI

A single-page local web view (served by the CLI via `tb dashboard` or
launched by default). Reads/writes the same `toolbox.json`.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  ToolBox                                    [+ Add] [≡] │
├───────────────┬─────────────────────────────────────────┤
│               │                                         │
│  Categories   │    ┌─────┐  ┌─────┐  ┌─────┐           │
│  ─────────    │    │ 🧠  │  │ ⌨️  │  │ 🤖  │           │
│  All (42)     │    │Jules│  │ CC  │  │Copil│           │
│  AI (8)       │    └─────┘  └─────┘  └─────┘           │
│  Dev (12)     │                                         │
│  Media (5)    │    ┌─────┐  ┌─────┐  ┌─────┐           │
│  Infra (10)   │    │     │  │     │  │     │           │
│  Prod (7)     │    │     │  │     │  │     │           │
│               │    └─────┘  └─────┘  └─────┘           │
│  ─────────    │                                         │
│  Archived (3) │                                         │
│               │                                         │
└───────────────┴─────────────────────────────────────────┘
```

### Behaviors

- **Grid view**: Favicons as cards (name below). Click to open + bump `lastUsedAt`.
- **Sidebar**: Category filter with counts. "Archived" section at bottom.
- **Add modal**: Paste URL → auto-fetch title + favicon → confirm/edit → save.
- **Search**: Top bar fuzzy-filters across name, URL, notes.
- **Edit**: Click card → inline edit of notes, category, status.
- **Empty state**: Friendly prompt to add your first service.
- **Theme**: Respect system light/dark via `prefers-color-scheme`.

### Favicon Strategy

1. On `tb add <url>`, fetch the page and look for `<link rel="icon">` /
   `<link rel="apple-touch-icon">` / `<link rel="shortcut icon">`.
2. Fall back to `/favicon.ico` at the site root.
3. Cache favicons locally at `~/.toolbox/favicons/<id>.png` so the dashboard
   works offline and loads instantly.
4. `tb doctor` re-checks and repairs broken favicon links.

---

## Technical Architecture

### Stack

- **Language:** TypeScript
- **Runtime:** Node.js (CLI) + static HTML/CSS/JS (dashboard)
- **Storage:** Single JSON file, no DB
- **Favicon fetch:** `fetch` + basic HTML parsing (regex on `<link>` tags)

### Project structure

```
toolbox/
├── src/
│   ├── cli.ts            # Entry point, command routing
│   ├── store.ts          # Read/write toolbox.json
│   ├── favicon.ts        # Fetch + cache favicons
│   ├── types.ts          # Service, Category, ToolBox types
│   └── dashboard/
│       ├── server.ts     # Serve static dashboard on localhost
│       ├── index.html
│       ├── app.js        # Vanilla JS, no framework
│       └── styles.css
├── data/
│   └── toolbox.json      # Created at runtime (~/.toolbox/)
├── favicons/             # Created at runtime (~/.toolbox/favicons/)
├── package.json
└── tsconfig.json
```

### Commands (dev)

```
Dev:    npm run dev          # Watch mode
Build:  npm run build        # tsc → dist/
Test:    npm test             # vitest
Lint:    npm run lint         # eslint
Start:  npm start            # → dist/cli.js
```

---

## Boundaries

- **Always do:** Validate URLs before saving; use HTTPS for favicon fetches;
  atomic writes to `toolbox.json` (write temp + rename); respect XDG paths.
- **Ask first:** Changing the data model after first migration; adding network
  features beyond favicon fetch; adding auth.
- **Never do:** Store credentials, tokens, or secrets. Transmit data off-machine.
  Run a background daemon. Modify other apps' config files.

---

## Success Criteria

- [ ] `tb add <url>` creates a complete entry with auto-fetched name + favicon in < 5s.
- [ ] `tb list` prints all services with category + relative last-used time.
- [ ] `tb open <name>` resolves fuzzy name → opens browser → bumps `lastUsedAt`.
- [ ] Dashboard renders all favicons in a responsive grid, filterable by category.
- [ ] Dashboard works fully offline after initial favicon cache.
- [ ] `tb doctor` detects and reports broken favicons and stale URLs.
- [ ] Data survives `tb` upgrades — JSON schema is forward-compatible.

---

## Open Questions

1. **Integrate into Perci or standalone?** The repo context is an Electron app
   (Perci). Options:
   - **(A)** Standalone CLI tool, separate repo or `toolbox/` subdir.
   - **(B)** Integrated as a Perci window (webview) — lives inside the app.
   - Start standalone; integrate later if it earns its place.
2. **Favicon UI fallback:** If a service has no favicon, use a generated
   initial-letter avatar (like GitHub's default avatars)? Recommended: yes.
3. **Relative time formatting:** "2 weeks ago" vs ISO dates? Recommended:
   relative for `lastUsedAt`, ISO in JSON only.
4. **Import sources:** Should we support importing from browser bookmarks
   or a Raindrop/Pocket export later? Not in v1, but design `tb import` to
   be extensible.

---

## Future (Not Now)

- **Usage stats:** Count opens per service; highlight "haven't used in 60 days."
- **Cost awareness:** Parse `$X/mo` from notes; show monthly total.
- **CLI within dashboard:** Embedded xterm.js for `tb` commands without leaving
  the browser.
- **Snapshot/history:** See what your toolkit looked like 3 months ago.
