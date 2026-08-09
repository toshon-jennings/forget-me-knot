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
3. Start the application:
   ```bash
   npm start
   ```

### Run on Startup

To launch ToolBox automatically when you log into your Mac, you need to package it as a standalone application. ToolBox is programmed to automatically register itself as a startup item when run as a packaged app.

Build the `.app` bundle:
```bash
npx electron-builder --mac
```
Once the build completes, drag `release/mac-arm64/ToolBox.app` into your `Applications` folder and launch it once. It will start automatically on future logins.

### Development

Run the app in development mode (which watches for changes):
```bash
npm run dev
```

Build the static assets:
```bash
npm run build
```
