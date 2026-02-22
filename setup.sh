#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "  YT Cutter — Setup"
echo "  ────────────────────────────────"
echo ""

# ── Homebrew ─────────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  echo "▸ Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  echo "✓ Homebrew"
fi

# ── Python 3 ─────────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "▸ Installing Python..."
  brew install python
else
  echo "✓ Python $(python3 --version | awk '{print $2}')"
fi

# ── ffmpeg ───────────────────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "▸ Installing ffmpeg..."
  brew install ffmpeg
else
  echo "✓ ffmpeg"
fi

# ── Virtual environment ───────────────────────────────────────────────────────
if [ ! -d "$DIR/venv" ]; then
  echo "▸ Creating virtual environment..."
  python3 -m venv "$DIR/venv"
else
  echo "✓ venv exists"
fi

# ── Python dependencies ───────────────────────────────────────────────────────
echo "▸ Installing Python packages..."
"$DIR/venv/bin/pip" install -q --upgrade pip
"$DIR/venv/bin/pip" install -q -r "$DIR/requirements.txt"
echo "✓ Packages installed"

# ── Build the .app bundle ────────────────────────────────────────────────────
echo "▸ Building YT Cutter.app..."
bash "$DIR/create_app.sh"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "  ✓ Setup complete!"
echo ""
echo "  Double-click 'YT Cutter.app' to launch — no Terminal needed."
echo "  Or drag it to /Applications for easy access."
echo ""

# Open Finder at the project folder so the user can see the .app
open "$DIR"
