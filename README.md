# Snapport

**Capture. Report. Instantly.**

Snapport is a lightweight cross-platform desktop app for capturing your screen. Hit a shortcut, draw over the problem, add a note — and your  report lands exactly where your webhook is setup. No tabs, no copy-pasting, no friction.

---

## What works today

- **Global shortcut** — `Ctrl+Shift+F` (or `Cmd+Shift+F` on macOS) captures the screen and opens the annotation overlay from anywhere
- **Screenshot background** — the live screenshot is shown behind the canvas so you can draw directly on what you see
- **Annotation tools** — freehand pen, rectangle, and arrow; each renders a live preview while dragging
- **Region selection** — draw a selection box to crop the report to a specific area; annotations are constrained to that region
- **Color picker** — five preset colors for annotations
- **Brush size** — slider to control stroke width
- **Undo** — `Ctrl+Z` or toolbar button steps back one stroke at a time
- **Clear** — wipes all annotations in one click (undoable)
- **Composite export** — screenshot and annotations are merged at native resolution before sending; region crops are applied at the screenshot's true pixel dimensions
- **Generic webhook delivery** — POSTs a JSON payload (screenshot as base64, comment, timestamp, platform) to any URL
- **Discord webhook delivery** — auto-detected from the URL; sends the screenshot as an attached file with a rich embed (title, comment, platform footer, timestamp)
- **Webhook URL persistence** — saved in `localStorage` so you only type it once
- **Tray icon** — runs silently in the background with a context menu (Open / Quit)
- **Keyboard shortcuts** — `P`, `R`, `A` to switch tools; `Esc` to close (or cancel region selection)
- **TypeScript + Electron** — main process, preload bridge, and renderer are all typed; separate `tsconfig` per target

---

## Download (End Users)

Head to the [Releases page](../../releases/latest) and download the installer for your OS:

| OS | File | Install |
|----|------|---------|
| **Windows** | `Snapport-Setup-x.x.x.exe` | Double-click → follow the wizard → launch from Start menu |
| **macOS** | `Snapport-x.x.x.dmg` | Double-click → drag Snapport to Applications → launch from Launchpad |
| **Linux** | `Snapport-x.x.x.AppImage` | `chmod +x Snapport-*.AppImage` → double-click or run from terminal |

That's it — no Node.js, no terminal, no code required.

---

## Build from Source (Developers)

### Prerequisites (all platforms)

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 18+ (includes npm)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/Snapport.git
cd Snapport
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm start        # build once & launch
npm run dev      # watch mode — auto-rebuilds on changes
```

### 4. Build an installer for your platform

<details>
<summary><strong>Windows</strong></summary>

```bash
npm run dist:win
```

Output: `release/Snapport-Setup-x.x.x.exe`

Double-click the installer → Snapport appears in your Start menu.

**Requirements:** None beyond Node.js — electron-builder handles everything.

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
npm run dist:mac
```

Output: `release/Snapport-x.x.x.dmg`

Open the DMG → drag to Applications → launch from Launchpad or Spotlight.

**Note:** If you get a "damaged app" warning, run:
```bash
xattr -cr release/Snapport-x.x.x.dmg
```
This happens because the app is not code-signed. For distribution, set up an [Apple Developer certificate](https://www.electron.build/code-signing).

</details>

<details>
<summary><strong>Linux</strong></summary>

```bash
npm run dist:linux
```

Output: `release/Snapport-x.x.x.AppImage`

Make it executable and run:
```bash
chmod +x release/Snapport-*.AppImage
./release/Snapport-*.AppImage
```

**Optional — desktop integration:**
```bash
mv release/Snapport-*.AppImage ~/.local/bin/Snapport.AppImage

cat > ~/.local/share/applications/snapport.desktop << 'EOF'
[Desktop Entry]
Name=Snapport
Exec=$HOME/.local/bin/Snapport.AppImage
Icon=snapport
Type=Application
Categories=Utility;Development;
EOF
```

Snapport will now show up in your application launcher.

</details>

### 5. Build for all platforms at once

To build for **all** platforms automatically, push a version tag — GitHub Actions handles the rest (see below).

---

## Automated Releases (CI/CD)

This repo includes a GitHub Actions workflow that builds installers for all three platforms whenever you push a version tag.

### How to create a release

```bash
# 1. Bump the version in package.json
npm version patch    # or: npm version minor / npm version major

# 2. Push the commit and tag
git push && git push --tags
```

GitHub Actions will:
1. Spin up Windows, macOS, and Linux build machines
2. Build platform-specific installers on each
3. Create a GitHub Release with all three installers attached

Check progress at **Actions** tab → **Build & Release** workflow.

---

## Webhook payload

### Generic webhook

POSTs JSON to your configured URL:

```json
{
  "source": "snapport",
  "comment": "The login button is misaligned on mobile",
  "screenshot": "data:image/png;base64,…",
  "timestamp": "2026-03-23T10:00:00.000Z",
  "platform": "win32"
}
```

Compatible with Slack, Linear, Jira, or any custom backend.

### Discord webhook

Detected automatically when the URL matches `discord.com/api/webhooks/…`. Sends a rich embed with the screenshot attached as a file (not base64 inline):

- Embed title: **Bug Report**
- Embed description: your comment
- Attached image: `screenshot.png`
- Footer: `Snapport · <platform>`

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+F` | Open overlay / capture screen |
| `Esc` | Close overlay (or cancel region selection) |
| `P` | Pen tool |
| `R` | Rectangle tool |
| `A` | Arrow tool |
| `Ctrl+Z` | Undo last stroke |

---

## Project structure

```
Snapport/
├── src/
│   ├── main/
│   │   ├── main.ts              # Electron main process (shortcut, tray, IPC, webhook)
│   │   └── webhooks/
│   │       └── discord.ts       # Discord multipart/form-data sender
│   ├── preload/
│   │   └── preload.ts           # contextBridge IPC API exposed to renderer
│   └── renderer/
│       ├── index.html           # Overlay UI
│       ├── styles.css           # Overlay styles
│       └── renderer.ts          # Canvas drawing, region selection, toolbar, report logic
├── assets/                      # App icons (.ico, .icns, .png)
├── .github/workflows/           # CI/CD build pipeline
├── release/                     # Built installers (git-ignored)
└── dist/                        # Compiled TypeScript (git-ignored)
```

---

## License

MIT
