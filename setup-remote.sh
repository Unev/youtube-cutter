#!/bin/bash
# Remote installer for YT Cutter
# Usage: curl -fsSL https://raw.githubusercontent.com/Unev/youtube-cutter/master/setup-remote.sh | bash

set -e

ZIP="https://github.com/Unev/youtube-cutter/archive/refs/heads/master.zip"
INSTALL_DIR="$HOME/Applications/YT Cutter"

clear
echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║      YT Cutter — Downloading     ║"
echo "  ╚══════════════════════════════════╝"
echo ""
echo "  Installing to: $INSTALL_DIR"
echo ""

# ── Download & extract ─────────────────────────────────────────────────────────
TMP=$(mktemp -d)
echo "  ▸ Downloading YT Cutter..."
curl -fsSL "$ZIP" -o "$TMP/ytcutter.zip"
unzip -q "$TMP/ytcutter.zip" -d "$TMP"
rm -f "$TMP/ytcutter.zip"

mkdir -p "$INSTALL_DIR"
cp -r "$TMP/youtube-cutter-master/." "$INSTALL_DIR/"
rm -rf "$TMP"
echo "  ✓ Downloaded"
echo ""

# ── Run setup ─────────────────────────────────────────────────────────────────
bash "$INSTALL_DIR/setup.sh"
