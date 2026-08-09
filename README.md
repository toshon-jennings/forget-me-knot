# Forget-Me-Knot ToolBox

Stop losing track of your subscriptions and web tools. FMK ToolBox is a lightweight, local-first menu bar app for macOS that gives you a single, visual dashboard of your entire manually added active toolkit.

## Features

- **Menu Bar Access**: Quickly view your dashboard from anywhere on your Mac.
- **Local-First Storage**: Your data never leaves your machine. No passwords or credentials are stored.
- **Favicon Auto-Fetching**: Simply add a URL and ToolBox grabs the site's favicon for instant visual recognition.
- **Categories & Notes**: Organize your tools into areas (e.g., AI, Dev, Productivity) and add quick notes like renewal dates or pricing.
- **Quick Launch**: Open any service straight from your dashboard in one click.

## Getting Started

### Prerequisites

- Node.js (v20+)
- npm
- Rust & Cargo (`rustup`)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/toshon-jennings/forget-me-knot.git toolbox
   cd toolbox
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Run on Startup

ToolBox uses a Tauri plugin to automatically start itself when you log in. Once you package the app and drag it to `/Applications`, it will seamlessly launch on startup.

Alternatively, you can manually register it from the terminal via:
```bash
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/ToolBox.app", hidden:false}'
```

### Development

Run the app in development mode (which watches for changes in both Rust and JS):
```bash
npm run tauri dev
```

Build the `.app` and `.dmg` bundle for distribution:
```bash
npm run tauri build
```
