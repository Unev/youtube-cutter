# YT Cutter

A local web app to download and clip YouTube videos — no ads, no sign-up, runs entirely on your machine.

![Dark mode UI](https://img.shields.io/badge/UI-Dark%20%2F%20Light-333)
![Platform](https://img.shields.io/badge/platform-macOS-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)

---

## Features

- **Download** YouTube videos in any available quality (up to 4K)
- **Clip** — set start/end times to download only the part you want (video and audio)
- **Audio only** — extract as MP3 with optional clip range
- **Live size estimate** — shows approximate file size before downloading, updates as you adjust clip times
- **Visual timeline scrubber** — drag handles to set clip range
- **Time spinners** — ▲/▼ buttons and keyboard arrow keys step by hours/minutes/seconds based on cursor position
- **YouTube preview** — embedded player updates live with your clip times
- **Download queue** — start multiple downloads simultaneously
- **Filename editor** — rename the file before saving
- **URL history** — remembers recently used YouTube URLs
- **Download history** — re-download or reuse URLs from past sessions
- **Dark / Light mode** — toggle in the header, persisted across sessions
- **Browser notifications** — get notified when a download finishes
- **Menu bar app** — launch from Finder, no Terminal needed

---

## Requirements

- macOS
- [Homebrew](https://brew.sh) *(setup script installs it automatically if missing)*

Everything else (Python, ffmpeg, dependencies) is handled by the setup script.

---

## Setup

Open **Terminal** (press `⌘ Space`, type `Terminal`, press Enter) and paste this one line:

```bash
curl -fsSL https://raw.githubusercontent.com/Unev/youtube-cutter/master/setup-remote.sh | bash
```

That's it. It downloads the project, installs everything (Homebrew, Python, ffmpeg, packages), and builds `YT Cutter.app`. When done, Finder opens showing the app.

> Drag `YT Cutter.app` to `/Applications` for easy access from Spotlight.

---

## Running

**Double-click `YT Cutter.app`** — the server starts automatically and the browser opens.

The menu bar icon (▶) lets you:
| Action | Description |
|---|---|
| Open YT Cutter | Opens the app in your browser |
| Stop / Start Server | Toggle the server on/off |
| Quit | Cleanly shuts everything down |

### Alternative (Terminal)
```bash
./start.sh
```

---

## Usage

1. Paste a YouTube URL and click **Fetch Info**
2. Choose quality (size estimate shown automatically)
3. Optionally set a clip range using the scrubber or time inputs
4. Click **Download** — progress appears in the queue below
5. Edit the filename if needed, then click **Save file**

### Time input tips
- Click inside **hours**, **minutes**, or **seconds** — ▲/▼ buttons and ↑/↓ keys step by that unit
- **↑/↓** arrow keys when the input is focused
- Scrubber handles sync live with the time inputs

---

## Project structure

```
youtube-cutter/
├── app.py            # Flask backend
├── menubar.py        # macOS menu bar app (rumps)
├── create_app.sh     # Builds YT Cutter.app
├── setup.sh          # Local setup script
├── setup-remote.sh   # curl one-line installer
├── start.sh          # Terminal launcher
├── requirements.txt
├── static/
│   ├── app.js
│   └── style.css
└── templates/
    └── index.html
```

---

## Tech stack

| | |
|---|---|
| Backend | Python / Flask |
| Downloader | yt-dlp |
| Media processing | ffmpeg |
| Menu bar | rumps |
| Frontend | Vanilla JS, CSS custom properties |
