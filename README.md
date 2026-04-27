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
| **Windows** | `Snapport.Setup.x.x.x.exe` | Double-click → follow the wizard → launch from Start menu |
| **macOS (Apple Silicon)** | `Snapport-x.x.x-arm64.dmg` | Open DMG → drag to Applications (M1/M2/M3/M4 Macs) |
| **macOS (Intel)** | `Snapport-x.x.x-x64.dmg` | Open DMG → drag to Applications (pre-2020 Macs) |
| **Linux (Debian/Ubuntu)** | `snapport_x.x.x_amd64.deb` | `sudo dpkg -i snapport_*.deb` |
| **Linux (any distro)** | `Snapport-x.x.x.AppImage` | `chmod +x Snapport-*.AppImage` → double-click or run from terminal |

That's it — no Node.js, no terminal, no code required.

### macOS: "app is damaged" or "unidentified developer" warning

Snapport is not yet code-signed. macOS Gatekeeper will block it on first launch. To open it:

1. Open **System Settings** → **Privacy & Security**
2. Scroll down — you'll see a message about Snapport being blocked
3. Click **Open Anyway**

Or from the terminal:
```bash
xattr -cr /Applications/Snapport.app
```

### Linux: notes

- **Debian/Ubuntu** — the `.deb` installs Snapport system-wide. Launch from your app menu or run `snapport` in terminal.
- **Other distros** — use the `.AppImage`. No installation needed — just make it executable and run.

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

Output: `release/Snapport-x.x.x-arm64.dmg` and `release/Snapport-x.x.x-x64.dmg`

Open the DMG for your architecture → drag to Applications → launch from Launchpad or Spotlight.

**Note:** If you get a "damaged app" warning, run:
```bash
xattr -cr /Applications/Snapport.app
```
This happens because the app is not code-signed. For distribution, set up an [Apple Developer certificate](https://www.electron.build/code-signing).

</details>

<details>
<summary><strong>Linux</strong></summary>

```bash
npm run dist:linux
```

Output: `release/snapport_x.x.x_amd64.deb` and `release/Snapport-x.x.x.AppImage`

**Debian/Ubuntu:**
```bash
sudo dpkg -i release/snapport_*.deb
```

**Any distro (AppImage):**
```bash
chmod +x release/Snapport-*.AppImage
./release/Snapport-*.AppImage
```

</details>

### 5. Build for all platforms at once

To build for **all** platforms automatically, push a version tag — GitHub Actions handles the rest (see below).

---

## Automated Releases (CI/CD)

This repo includes a GitHub Actions workflow that builds installers for all platforms on every push to `main`.

### How to create a release

1. Bump the `version` in `package.json` (so the release gets a new tag)
2. Commit and push to `main`

GitHub Actions will:
1. Build on Windows, macOS, and Linux runners in parallel
2. macOS builds both Intel (x64) and Apple Silicon (arm64) DMGs
3. Linux builds both `.deb` and `.AppImage`
4. Create a GitHub Release with all installers attached

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
