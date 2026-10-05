# Coopverse

**A game-like 3D office for AI agents running on [Paperclip](https://github.com/paperclipai/paperclip).**
Walk around the office and watch your agents type away while they work, grab coffee when idle, and clutch their heads when something fails. Walk up to a desk and press **E** to chat with the agent or watch its CLI live.

[Tiếng Việt](README.md)

> **This is the `pixel` branch: a 2D, Stardew Valley-style pixel version**, drawn with PixiJS and [LimeZu](https://limezu.itch.io)'s pixel art packs.
> The office, agents, chat, CLI, ticket board, EXP… work the same as the 3D version on `main`; only the graphics differ.
> The art packs are licensed and **not included in this repo**: to run this branch you need to buy two LimeZu packs yourself (see [step 4](#4-install-coopverse)).
> Screenshots in this README show the 3D version.

![Coopverse office](docs/images/office.png)

- **Real agents, live**: agents, tickets and runs come from Paperclip over WebSocket. Every Paperclip company gets its own office.
- **Chat with each agent** (Paperclip Agent Chat) right at its desk.
- **Live CLI view**: run logs rendered like Claude Code, with Wake / Pause / Resume / Comment buttons, each behind a confirmation dialog.
- **Kanban board** on the wall, a wardrobe to restyle characters, day/night cycle (Vietnam time), generative lofi music.
- **A "Coopverse" button inside Paperclip** (bundled plugin) that opens the office of the company you are viewing.
- All geometry and sound are generated in code; no downloaded assets.

> The app UI is in Vietnamese. Screenshots below use the built-in demo data.

| Chat with an agent | Agent CLI view |
|---|---|
| ![Chat](docs/images/chat.png) | ![CLI](docs/images/cli-log.png) |
| **Ticket board** | **Wardrobe** |
| ![Kanban](docs/images/kanban.png) | ![Wardrobe](docs/images/wardrobe.png) |

---

## Contents

1. [Requirements](#1-requirements)
2. [Install Paperclip](#2-install-paperclip)
3. [Create a company and agents, enable Agent Chat](#3-create-a-company-and-agents-enable-agent-chat)
4. [Install Coopverse](#4-install-coopverse)
5. [Add the Coopverse button to Paperclip](#5-add-the-coopverse-button-to-paperclip)
6. [Usage](#6-usage)
7. [Configuration](#7-configuration)
8. [Troubleshooting](#8-troubleshooting)
9. [Security](#9-security)
10. [Development](#10-development)

---

## 1. Requirements

| What | Notes |
|---|---|
| **Node.js 24.11+** | Required by Paperclip. Coopverse itself runs on Node 22.12+. Get it from [nodejs.org](https://nodejs.org). |
| **Git** | To clone the code. |
| **Chrome or Edge** | WebGL is required (PixiJS). |
| **LimeZu art packs** | Modern Interiors and Modern Office, bought on itch.io. See [step 4](#4-install-coopverse). |
| **An agent runtime** | Paperclip agents run on Claude Code, Codex, Gemini… For Claude Code, install `claude` and log in first. |
| **Windows** | Run Paperclip inside **WSL2** (Ubuntu) and Coopverse on Windows. This is the best-tested setup. |

Tested with Paperclip **2026.916.1**.

## 2. Install Paperclip

In a terminal (inside WSL on Windows):

```bash
npx paperclipai@latest onboard --yes
```

This creates the config and the database (embedded PostgreSQL, nothing else to install) and starts Paperclip at **http://localhost:3100**.

For a permanent `paperclipai` command (recommended):

```bash
npx paperclipai@latest install --yes
```

Afterwards, start Paperclip with:

```bash
paperclipai run
```

> Paperclip's own docs: <https://github.com/paperclipai/paperclip>

## 3. Create a company and agents, enable Agent Chat

1. Open http://localhost:3100. On first run Paperclip walks you through creating a **company**.
2. Add agents under **Agents** (name, role, adapter such as Claude Code).
   - Coopverse seats agents by the org chart. An agent that others **report to** (*Reports to* field) is a **Lead** and sits in the glass office. Everyone else sits in the open space, grouped by Lead.
   - An office has up to 26 desks (2 Leads + 24 members).
3. **Enable Agent Chat** to chat from Coopverse: **Settings → Experimental → Agent Chat**. It is instance-wide, not per company.

![Enable Agent Chat](docs/images/paperclip-agent-chat.png)

## 4. Install Coopverse

### Quick way: Windows app

Download `Coopverse-Setup-<version>.exe` from [Releases](https://github.com/minhle2112/coopverse/releases) and install it like any other program. It runs in its own window, adds Desktop and Start menu shortcuts, and can be uninstalled from Windows Settings. The app's interface is in Vietnamese.

- **"Windows protected your PC"**: the installer isn't code-signed yet. Click **More info → Run anyway**.
- **Smart App Control is on** (Windows 11): it may block an unsigned installer outright, with no "Run anyway" button. In that case, download **`Coopverse-<version>-win-x64.zip`** from the same page:
  1. Right-click → **Extract All** into a permanent folder, e.g. `C:\Coopverse`.
  2. Open `Coopverse.exe` inside it. For a shortcut, right-click `Coopverse.exe` → **Show more options → Send to → Desktop**.
  3. The zip build needs no install and has no entry in Settings: delete the folder to remove it. The app's settings live in `%APPDATA%\Coopverse` and are shared with the installed build, so switching between them loses nothing.
- **On first launch** the app looks for Paperclip on your machine (a running one, or the `paperclipai` command). It then shows a **Kết nối Paperclip** (Connect Paperclip) screen for you to check:
  - **Paperclip address**: filled in if it was found.
  - **When Paperclip isn't running**: start `paperclipai` (installed with npm), start it from a **separate install folder** (one that contains `node_modules\paperclipai`), start it inside **WSL**, or don't start it at all.
  - **Paperclip data folder**: the folder you normally pass with `-d`. Leave it empty for the default `~\.paperclip`. Once you pick it, the app reads Paperclip's port from it.
- **No Paperclip yet**: click **Cài Paperclip** (Install Paperclip). The app runs `npm install -g paperclipai`, which needs [Node.js](https://nodejs.org) 24.11 or newer.
- **Pixel art**: the download already includes the LimeZu images the app uses, for use within Coopverse only (see License). If you own the LimeZu packs, you can still point the app to your own copy in **Settings → Ứng dụng → Thư mục gói hình…**.
- **Your data is safe**: the app doesn't ship its own Paperclip and never touches Paperclip's data. It only starts the Paperclip you already have, with your own data folder, so two different versions can never migrate the same database.
- **Closing the app** also stops Paperclip, but only if the app started it. If agents are working, the app asks first. Shutdown is graceful, like pressing Ctrl+C in the Paperclip window: running work stops, then the database is closed. A Paperclip you started yourself keeps running.
- To change the connection or art folder, import EXP from the browser version (its `.coopverse` folder), or check for updates, go to **Settings ⚙️ → Ứng dụng** (App). The app tells you when a new version exists and opens the download page; it never installs updates by itself. **F11** toggles full screen.

### Install from source (runs in the browser)

On the machine where you use the browser (on Windows: PowerShell or Git Bash, **not** WSL):

```bash
git clone -b pixel https://github.com/minhle2112/coopverse.git coopverse-pixel
cd coopverse-pixel
npm install
```

**Add the pixel art packs (required for this branch).** The pixel version uses two LimeZu packs, 16×16 version:

- **Modern Interiors**: <https://limezu.itch.io/moderninteriors>
- **Modern Office**: <https://limezu.itch.io/modernoffice>

Buy and download them, then unzip like this (by default Coopverse looks in `coopverse-assets/limezu` **next to** the project folder):

```
coopverse-assets/limezu/
  1_Interiors/ 2_Characters/ 4_User_Interface_Elements/ …   ← contents of Modern Interiors
  Modern_Office/
    Modern_Office_16x16.png …                                 ← contents of Modern Office
```

Somewhere else? Set `COOPVERSE_ASSETS=<path to the limezu folder>` in `.env`. If a pack is missing, the office shows a "Chưa có gói hình pixel" (pixel art missing) message with these instructions.
The images are only served to your own machine (`127.0.0.1`) while Coopverse runs. Do not commit or share the image files: LimeZu's license does not allow redistribution.

Then run:

```bash
npm run dev
```

Open **http://127.0.0.1:5179** (the 3D version uses port 5177, so both can run side by side). Coopverse finds Paperclip at `127.0.0.1:3100` and opens the first company.

**On Windows** just double-click `start-coopverse.cmd`. It:

1. Checks whether Paperclip is running.
2. If not, starts it in a minimized "Paperclip" window:
   - Paperclip in WSL: add `PAPERCLIP_WSL_DISTRO=Ubuntu` (your distro name, see `wsl -l`) to `.env`.
   - Paperclip installed on Windows: the script uses `paperclipai` if it is on the PATH.
3. Installs dependencies on first run, starts Coopverse and opens the browser.

To try it without Paperclip, open **http://127.0.0.1:5179/?demo** (fake data).

## 5. Add the Coopverse button to Paperclip

[`paperclip-plugin/`](paperclip-plugin) is a Paperclip plugin. It adds a **Coopverse ↗** item to the left sidebar and a **Coopverse** button at the top right of every page. Clicking it opens Coopverse for the company you are viewing, reusing one tab.

![Coopverse button in Paperclip](docs/images/paperclip-button.png)

The plugin is prebuilt in `paperclip-plugin/dist`. Run this **on the machine running Paperclip**:

```bash
paperclipai plugin install --local /path/to/coopverse/paperclip-plugin
```

(No `paperclipai` command yet? Use `npx paperclipai@latest plugin install --local …`.)

The path must be visible to Paperclip:

- **Linux / macOS**: e.g. `~/coopverse/paperclip-plugin`.
- **Windows + WSL**: drive C is at `/mnt/c/`, e.g. `/mnt/c/Users/you/coopverse/paperclip-plugin`. If your WSL has Windows drive access disabled, copy the folder into WSL first:

  ```bash
  mkdir -p ~/paperclip-plugins
  cp -r /mnt/c/Users/you/coopverse/paperclip-plugin ~/paperclip-plugins/coopverse
  paperclipai plugin install --local ~/paperclip-plugins/coopverse
  ```

Reload Paperclip and the button appears. **Settings → Plugins** should list Coopverse as `ready`.

![Installed plugin](docs/images/paperclip-plugins.png)

**The pixel version runs on port 5179**, while the Paperclip button opens `http://127.0.0.1:5177` (the 3D version) by default. To make the button open the pixel version, or if Coopverse runs elsewhere, go to **Settings → Plugins → Coopverse → Configure**, change **Coopverse URL** and click **Save Configuration**.

![Plugin settings](docs/images/paperclip-plugin-settings.png)

Other commands:

```bash
paperclipai plugin list                          # list installed plugins
paperclipai plugin disable coopverse.launcher    # hide the button
paperclipai plugin enable coopverse.launcher     # show it again
paperclipai plugin uninstall coopverse.launcher  # remove
```

To update after `git pull`: `uninstall`, then run the `install` command again.

## 6. Usage

### Controls

| Key | Action |
|---|---|
| W A S D / arrows | Walk |
| Shift | Run |
| Settings ⚙️ → Zoom ("Thu phóng") | Two levels: **Near** (default) and **Farthest**. The browser remembers your choice |
| Hover an agent | Show a full card: name, level, title, current task (no need to walk over) |
| **Click** | Click an agent: open its screen (CLI). Click a lobby candidate: open the hiring form. Click the ticket board: view it full size. Click yourself: wardrobe. No need to walk over |
| Click a name in the Staff list | Open that agent's screen (demo: right-click to change its status) |
| **E** | Near an agent: open its screen (**Chat** and **Log** tabs). In front of the ticket board: view it full size. Press E again to step back |
| C | Wardrobe: restyle yourself or the nearby agent |
| B | Cleaning: pay Xu to clean dirty spots (see below) |
| T | Decorating: shop, place / move items, build walls, move desks (see below). While decorating: **R** rotates, **Enter** buys, **Esc** cancels |
| Q | Things waiting for your approval / answer |
| M | Toggle lofi music |
| Esc | Close whatever screen is open |
| 🔊 🎵 🎨 🧹 🛋️ ⚙️ under the logo | Sound, music, wardrobe, cleaning, decorating, settings (volume, time preview) |

### Xu and cleaning the office

- The office starts as one big empty room with only the agents' desks, the ticket board and windows. Everything is dusty: stains, cobwebs, old cardboard boxes, loose paper, rats.
- **Xu** is the office's shared money (shown under the logo). Each ticket an agent finishes on the board adds Xu: low 10, medium 15, high 25, critical 40 priority; higher-level agents earn more (+10% per level). Tickets finished before this feature count too.
- Press **B** (or 🧹): every dirty spot shows its price. The floor is split into 5 × 3 patches, farther from the door costs more; the north wall, each window and the ticket board are cleaned separately. Click a spot, then **Dọn** (Clean) in the left panel.
- Xu and cleaned spots are stored by Coopverse on this machine (the `.coopverse` folder, or the desktop app's data folder), nothing is sent to Paperclip. The demo stores them in the browser and has a "Làm bẩn lại" (make dirty again) button.

### Decorating the office

- Press **T** (or 🛋️): the shop opens on the left with about 50 items in 5 groups: plants and small items (pots, lamps, bookshelves, rugs…), wall items (paintings, clock, TV, **fame board**), lounge and kitchen (sofa, armchairs, coffee table, kitchen counters, coffee bar…), fun (arcade machines, ping-pong, pool table, an office cat), and walls.
- Pick an item and a ghost follows the mouse. A green box means it fits; a red box shows why not. Click to place a preview, then **✓ Mua** (Buy) or Enter; no Xu is spent until you confirm. **R** rotates: the sofa and armchairs turn all 4 ways, other items mirror.
- Items go only on cleaned floor patches; wall items need the north wall cleaned. The entrance and the candidates' lobby always stay free (tinted red). Nothing may wall off the path to a desk or the ticket board.
- Click a placed item to rotate it, move it (free), put it in storage (free, place it again any time) or sell it back for half price.
- Click a desk to rotate or move it. Every agent's desk is free; the agent walks to the new spot.
- 🧱 tab: hold the mouse and drag a straight line to build a wall, release, then ✓. Low and glass walls never hide anyone; tall walls look like real walls and fade when someone stands behind them. Buy a **glass door** and fit it into 2 adjacent wall cells (it opens when someone comes near). **Dỡ vách** (remove walls) refunds half.
- The EXP ranking is shown on the fame board: buy it, hang it on the wall, then click it (or stand in front and press E).
- Items, walls and desk spots are stored with the Xu (the Coopverse server re-checks the balance and placement). Coming next: agents using items (sitting on the sofa, making coffee…) and items on desks.

### Chatting with an agent

![Chat](docs/images/chat.png)

- Walk to the agent's desk, press **E**, choose the **Chat** tab. Type and press **Enter** (Shift+Enter for a new line).
- **Every message wakes the agent for one run to answer**: 20 seconds to a few minutes, and it uses the agent's quota (e.g. your Claude usage). Coopverse asks for confirmation the first time.
- While the agent answers, the **Log** tab shows what it is doing.
- Type `/new` or click **Phiên mới** (New session) to start a fresh session; history is kept.
- Questions or plan approvals from the agent show up as cards; answer them in Paperclip ("Trả lời trong Paperclip").
- If you are elsewhere in the office when the agent replies, you get a notification and the agent says the first line in a speech bubble.
- Conversations are stored in Paperclip and visible on the Paperclip web UI too.

### CLI view (Log tab)

![CLI](docs/images/cli-log.png)

- Shows the current run, or the latest one if the agent is idle, Claude Code style: thinking, tool calls, results, errors, cost.
- Buttons depend on agent state: **Wake**, **Pause**, **Resume**, **Comment** on the ticket. Each has a confirmation dialog.

### Ticket board

A kanban board hangs on the wall. Press **E** in front of it to view it full size; click a ticket to open it in Paperclip.

### Multiple companies

Each Paperclip company is an office. With several companies, a picker under the Coopverse logo switches between them, and Coopverse remembers your last choice. Open one directly with `http://127.0.0.1:5179/?company=<company id>` (this is what the Paperclip button does).

### Day and night

The light follows Vietnam time: bright noon, orange sunrise and sunset. At night the office turns dark blue and ceiling lights, desk lamps, floor lamps and monitors glow. Preview other times with the slider in Settings or `?hour=21.5` in the URL.

![Night (3D version)](docs/images/office-night.png)

## 7. Configuration

Copy `.env.example` to `.env` (optional):

| Variable | Default | Meaning |
|---|---|---|
| `VITE_PAPERCLIP_URL` | `http://127.0.0.1:3100` | Paperclip address |
| `VITE_COMPANY_ID` | (empty) | Company to open when none was chosen before |
| `PAPERCLIP_WSL_DISTRO` | (empty) | Only for `start-coopverse.cmd`: WSL distro running Paperclip |
| `COOPVERSE_ASSETS` | `../coopverse-assets/limezu` | Folder with the LimeZu art packs (pixel version) |

In-app settings (volume, time preview…) and character looks are stored in the browser; nothing changes in Paperclip.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| "Chưa kết nối được Paperclip" (cannot reach Paperclip) | Start Paperclip (`paperclipai run`); Coopverse reconnects by itself. If Paperclip is elsewhere, set `VITE_PAPERCLIP_URL` in `.env` and restart `npm run dev`. |
| Chat tab says Agent Chat is off | Enable **Settings → Experimental → Agent Chat** in Paperclip. |
| Agent does not answer | It may be paused, failing, or out of quota. Check the Log tab or the agent page in Paperclip. |
| No Coopverse button in Paperclip | Reload. `paperclipai plugin list` should show `coopverse.launcher … ready`; otherwise redo step 5. |
| The button opens an error page | Coopverse is not running (`npm run dev` / `start-coopverse.cmd`), or the plugin's **Coopverse URL** is wrong. |
| `plugin install` says "path does not exist" | The path is not visible to the machine running Paperclip. With WSL, copy the plugin folder into WSL (step 5). |
| "Chưa có gói hình pixel" (pixel art missing) | The LimeZu packs are not in the right place. See [step 4](#4-install-coopverse): you need both `1_Interiors/…` (Modern Interiors) and `Modern_Office/Modern_Office_16x16.png`. Restart `npm run dev` afterwards. |
| No agents | The company has no agents yet, or you are viewing another company; switch under the logo. |

## 9. Security

- Coopverse listens on `127.0.0.1` only; other machines on the network cannot open it.
- The browser never talks to Paperclip directly. All calls go through Coopverse's proxy, which has an **allow-list** (`vite.config.ts`): read agents, tickets, runs, logs, Agent Chat, plus a few commands (Wake / Pause / Resume / Comment / chat message). Write calls must come from the Coopverse page itself (`Origin` and `x-coopverse` header checks). Anything else gets 403.
- Every command sent to an agent has a confirmation dialog.
- The plugin only adds a link; it does not read or write any Paperclip data.

## 10. Development

```
src/
  data/        types, Paperclip adapter (paperclip.ts), realtime sync, chat, log parsing, demo data
  pixel/       pixel version (PixiJS): office built from LimeZu sprites, Character Generator characters, bubbles, day/night, level-up effect, wardrobe
  world/       shared office layout, collisions, time/light tables (time.ts); the old 3D parts still live here
  audio/       synthesized sound effects and generative lofi (voice.ts: mic/TTS, currently disabled)
  characters/  blocky chibi characters + animation
  agents/      3D agent behaviour
  life/        shared office life: the agent "brain" (brain.ts: walking, sitting, avoidance), lines, greetings, emotes
  player/      movement, camera, controls
  ui/          HUD, minimap, CLI + Chat (Terminal), ticket board, wardrobe, settings
  dev/         dev-only hooks (window.__coop)
server/
  guard.ts     allow-list of Paperclip endpoints (shared by Vite and the desktop app)
  coopData.ts  per-company EXP ledger and office state (cleaned spots, Xu spent) (/coop/)
  limezu.ts    serves the LimeZu images from COOPVERSE_ASSETS at /limezu/ (127.0.0.1 only)
desktop/       Windows app (Electron): main.ts, local server (server.ts), starting/stopping Paperclip
               (paperclip.ts, pc-hook.cjs), connect screen (setup/), hand-drawn icon (icon/make-icon.py)
paperclip-plugin/
  src/         manifest, worker, UI (sidebar item + top bar button)
  dist/        prebuilt output (committed)
```

- Stack: Vite, React 19, PixiJS 8, zustand, TypeScript. Pixel font: VT323 (OFL, includes Vietnamese).
- Sprite coordinates inside the LimeZu packs live in `src/pixel/atlas.json` (coordinates only, no images).
- Every Paperclip call lives in `src/data/paperclip.ts`.
- Type-check and build: `npm run build` (including the desktop code: `npm run typecheck`).
- Release files are built on a machine that has the art packs: `npm run dist:win:art` (images come from `COOPVERSE_ASSETS` or `../coopverse-assets/limezu`; only the images the app uses are copied into the app). Then upload the 2 files in `release/` to the Releases page. The images never go into the repo. GitHub Actions (`.github/workflows/desktop-release.yml`) only test-builds a version without art when a tag is pushed. On a machine with Smart App Control on, the NSIS step can fail with `spawn UNKNOWN`, because Windows blocks running unsigned files.
- Desktop app: `npm run desktop` runs it from source; `npm run dist:win` builds the installer `release/Coopverse-Setup-<version>.exe`. To try it without touching your real settings, set the environment variable `COOPVERSE_USER_DATA=<temp folder>`.
- Plugin changes: `cd paperclip-plugin && npm install && npm run build`, then reinstall the plugin.
- Dev hooks on `window.__coop`: `store.getState().openFocus(agentId)`, `inject(...)` for fake realtime events, `settings.getState().set({ hour: 21 })`. The pixel version adds `step(seconds)` to simulate while the tab is hidden, `resume()`, `go(x, z, 'near' | 'far')` to jump elsewhere, and `grant(agentId, exp)` to test level-ups.

## License

Code: [MIT](LICENSE).

Pixel art: **LimeZu**, [Modern Interiors](https://limezu.itch.io/moderninteriors) and [Modern Office](https://limezu.itch.io/modernoffice). The art is not in this repo and is not covered by the MIT license. The downloads on the Releases page include the images the app uses, only to run Coopverse: don't extract, reuse or share them. To use the art for anything else (or to run from source), buy the packs from LimeZu. Thanks, LimeZu!
