#!/bin/bash
# Remote installer for YT Cutter
# Usage: curl -fsSL https://raw.githubusercontent.com/Unev/youtube-cutter/master/setup-remote.sh | bash

set -e

REPO="https://github.com/Unev/youtube-cutter"
ZIP="https://github.com/Unev/youtube-cutter/archive/refs/heads/master.zip"
INSTALL_DIR="$HOME/Applications/YT Cutter"

clear
echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║      YT Cutter — Setup           ║"
echo "  ╚══════════════════════════════════╝"
echo ""
echo "  Installing to: $INSTALL_DIR"
echo ""

# ── Download & extract ─────────────────────────────────────────────────────────
TMP=$(mktemp -d)
echo "  ▸ Downloading YT Cutter..."
curl -fsSL "$ZIP" -o "$TMP/ytcutter.zip"
unzip -q "$TMP/ytcutter.zip" -d "$TMP"
rm -rf "$TMP/ytcutter.zip"

mkdir -p "$INSTALL_DIR"
# unzip creates youtube-cutter-master/ subfolder
cp -r "$TMP/youtube-cutter-master/." "$INSTALL_DIR/"
rm -rf "$TMP"
echo "  ✓ Downloaded"

# ── Run the setup script ───────────────────────────────────────────────────────
bash "$INSTALL_DIR/Setup YT Cutter.command"
