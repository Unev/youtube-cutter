#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="YT Cutter"
APP_PATH="$SCRIPT_DIR/$APP_NAME.app"

echo "Building $APP_NAME.app..."

# Remove old bundle if exists
rm -rf "$APP_PATH"

# Create bundle structure
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Launcher — embeds absolute paths so the .app can be moved to /Applications
cat > "$APP_PATH/Contents/MacOS/$APP_NAME" << LAUNCHER
#!/bin/bash
"$SCRIPT_DIR/venv/bin/python" "$SCRIPT_DIR/menubar.py"
LAUNCHER
chmod +x "$APP_PATH/Contents/MacOS/$APP_NAME"

# Info.plist — LSUIElement keeps it out of the Dock (menu bar only)
cat > "$APP_PATH/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>         <string>YT Cutter</string>
  <key>CFBundleIdentifier</key>   <string>com.local.ytcutter</string>
  <key>CFBundleVersion</key>      <string>1.0</string>
  <key>CFBundleExecutable</key>   <string>YT Cutter</string>
  <key>LSUIElement</key>          <true/>
  <key>NSHighResolutionCapable</key> <true/>
</dict>
</plist>
PLIST

echo ""
echo "✓ Created: $APP_PATH"
echo ""
echo "  Double-click 'YT Cutter.app' in Finder to launch."
echo "  You can also drag it to /Applications."
echo ""
