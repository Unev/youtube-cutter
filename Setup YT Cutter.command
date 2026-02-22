#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

clear
echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║      YT Cutter — Setup           ║"
echo "  ╚══════════════════════════════════╝"
echo ""
echo "  This will set up everything you need."
echo "  It may take a few minutes the first time."
echo ""

# ── Homebrew ──────────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  echo "  ▸ Installing Homebrew (you may be asked for your Mac password)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon Macs
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || true)"
  echo "  ✓ Homebrew installed"
else
  echo "  ✓ Homebrew"
fi

# ── Python 3 ──────────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "  ▸ Installing Python..."
  brew install python
  echo "  ✓ Python installed"
else
  echo "  ✓ Python $(python3 --version | awk '{print $2}')"
fi

# ── ffmpeg ────────────────────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "  ▸ Installing ffmpeg (this might take a moment)..."
  brew install ffmpeg
  echo "  ✓ ffmpeg installed"
else
  echo "  ✓ ffmpeg"
fi

# ── Virtual environment ───────────────────────────────────────────────────────
if [ ! -d "$DIR/venv" ]; then
  echo "  ▸ Setting up Python environment..."
  python3 -m venv "$DIR/venv"
  echo "  ✓ Environment ready"
else
  echo "  ✓ Python environment"
fi

# ── Python packages ───────────────────────────────────────────────────────────
echo "  ▸ Installing packages..."
"$DIR/venv/bin/pip" install -q --upgrade pip
"$DIR/venv/bin/pip" install -q -r "$DIR/requirements.txt"
echo "  ✓ Packages installed"

# ── Build the .app ────────────────────────────────────────────────────────────
echo "  ▸ Building YT Cutter.app..."
bash "$DIR/create_app.sh" > /dev/null
echo "  ✓ App created"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║   ✓  Setup complete!             ║"
echo "  ╚══════════════════════════════════╝"
echo ""
echo "  Finder is opening — look for 'YT Cutter.app'."
echo "  Double-click it to launch. You can also drag"
echo "  it to your Applications folder."
echo ""
echo "  You can close this window now."
echo ""

open "$DIR"
