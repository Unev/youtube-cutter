import threading
import time
import webbrowser
import subprocess
from pathlib import Path

import rumps

BASE_DIR = Path(__file__).parent
PYTHON   = BASE_DIR / "venv" / "bin" / "python"
APP_PY   = BASE_DIR / "app.py"
PORT     = 5050
URL      = f"http://localhost:{PORT}"


class YTCutterBar(rumps.App):
    def __init__(self):
        super().__init__("▶", quit_button=None)
        self._proc = None
        self._toggle_item = rumps.MenuItem("Stop Server", callback=self.toggle_server)
        self.menu = [
            rumps.MenuItem("Open YT Cutter", callback=self.open_browser),
            None,
            self._toggle_item,
            None,
            rumps.MenuItem("Quit", callback=self.quit_app),
        ]
        self._start_server()

    # ── Server management ────────────────────────────────────────────────────

    def _start_server(self):
        if self._proc and self._proc.poll() is None:
            return
        self._proc = subprocess.Popen(
            [str(PYTHON), str(APP_PY)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.title = "▶"
        self._toggle_item.title = "Stop Server"
        threading.Thread(target=self._open_after_ready, daemon=True).start()

    def _stop_server(self):
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            self._proc = None
        self.title = "⏸"
        self._toggle_item.title = "Start Server"

    def _open_after_ready(self):
        """Wait for the server to be up, then open the browser."""
        import urllib.request
        for _ in range(20):
            try:
                urllib.request.urlopen(URL, timeout=1)
                webbrowser.open(URL)
                return
            except Exception:
                time.sleep(0.5)
        # Fallback
        webbrowser.open(URL)

    # ── Menu actions ─────────────────────────────────────────────────────────

    def open_browser(self, _):
        webbrowser.open(URL)

    def toggle_server(self, _):
        if self._proc and self._proc.poll() is None:
            self._stop_server()
        else:
            self._start_server()

    def quit_app(self, _):
        self._stop_server()
        rumps.quit_application()


if __name__ == "__main__":
    YTCutterBar().run()
