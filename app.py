import json
import os
import queue
import subprocess
import threading
import uuid
from pathlib import Path

import yt_dlp
from flask import Flask, Response, jsonify, render_template, request, send_from_directory

app = Flask(__name__)

DOWNLOADS_DIR = Path(__file__).parent / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)

# Per-job progress queues
_progress_queues: dict[str, queue.Queue] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _push(job_id: str, data: dict):
    """Push a progress event to the job's SSE queue."""
    q = _progress_queues.get(job_id)
    if q:
        q.put(data)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _seconds_to_hms(s: float) -> str:
    s = int(s)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{sec:02d}" if h else f"{m:02d}:{sec:02d}"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/info", methods=["POST"])
def video_info():
    url = request.json.get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    duration = info.get("duration", 0)

    # Collect unique resolutions (video+audio formats)
    formats = []
    seen = set()
    for f in info.get("formats", []):
        height = f.get("height")
        vcodec = f.get("vcodec", "none")
        acodec = f.get("acodec", "none")
        if height and vcodec != "none" and height not in seen:
            seen.add(height)
            formats.append({"label": f"{height}p", "height": height})
    formats.sort(key=lambda x: x["height"], reverse=True)

    # Always add audio-only option
    formats.append({"label": "Audio only (MP3)", "height": 0})

    return jsonify({
        "title": info.get("title", "Unknown"),
        "thumbnail": info.get("thumbnail", ""),
        "duration": duration,
        "duration_str": _seconds_to_hms(duration),
        "channel": info.get("uploader", ""),
        "formats": formats,
    })


@app.route("/download", methods=["POST"])
def download():
    data = request.json
    url = data.get("url", "").strip()
    height = int(data.get("height", 720))
    start = data.get("start", "").strip()   # "MM:SS" or "HH:MM:SS" or empty
    end = data.get("end", "").strip()
    job_id = str(uuid.uuid4())

    _progress_queues[job_id] = queue.Queue()

    thread = threading.Thread(
        target=_run_download,
        args=(job_id, url, height, start, end),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id})


@app.route("/progress/<job_id>")
def progress(job_id: str):
    q = _progress_queues.get(job_id)
    if not q:
        return "Not found", 404

    def generate():
        while True:
            try:
                event = q.get(timeout=60)
                yield _sse(event)
                if event.get("status") in ("done", "error"):
                    break
            except queue.Empty:
                yield _sse({"status": "ping"})

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/downloads/<filename>")
def serve_file(filename: str):
    return send_from_directory(DOWNLOADS_DIR, filename, as_attachment=True)


# ---------------------------------------------------------------------------
# Background download worker
# ---------------------------------------------------------------------------

def _parse_time(t: str) -> float:
    """Convert HH:MM:SS or MM:SS to seconds."""
    parts = t.strip().split(":")
    parts = [float(p) for p in parts]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return float(parts[0])


def _run_download(job_id: str, url: str, height: int, start: str, end: str):
    audio_only = height == 0
    tmp_id = str(uuid.uuid4())
    tmp_path = DOWNLOADS_DIR / f"tmp_{tmp_id}.%(ext)s"

    def progress_hook(d):
        if d["status"] == "downloading":
            pct = d.get("_percent_str", "0%").strip().replace("%", "")
            try:
                pct = float(pct)
            except ValueError:
                pct = 0
            speed = d.get("_speed_str", "").strip()
            eta = d.get("_eta_str", "").strip()
            _push(job_id, {"status": "downloading", "pct": pct, "speed": speed, "eta": eta})
        elif d["status"] == "finished":
            _push(job_id, {"status": "processing", "pct": 100})

    if audio_only:
        fmt = "bestaudio/best"
        ydl_opts = {
            "format": fmt,
            "outtmpl": str(tmp_path),
            "progress_hooks": [progress_hook],
            "quiet": True,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        }
    else:
        fmt = f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={height}]+bestaudio/best[height<={height}]"
        ydl_opts = {
            "format": fmt,
            "outtmpl": str(tmp_path),
            "progress_hooks": [progress_hook],
            "quiet": True,
            "merge_output_format": "mp4",
        }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "video")

        # Find the downloaded file
        ext = "mp3" if audio_only else "mp4"
        downloaded = next(DOWNLOADS_DIR.glob(f"tmp_{tmp_id}*.{ext}"), None)
        if not downloaded:
            # Try any extension
            downloaded = next(DOWNLOADS_DIR.glob(f"tmp_{tmp_id}*"), None)
        if not downloaded:
            raise FileNotFoundError("Downloaded file not found")

        # Safe output filename
        safe_title = "".join(c for c in title if c.isalnum() or c in " -_").strip()[:60]
        out_name = f"{safe_title}.{ext}"
        out_path = DOWNLOADS_DIR / out_name

        # Cut if start/end provided and we have video
        if not audio_only and (start or end):
            _push(job_id, {"status": "cutting"})
            cut_path = DOWNLOADS_DIR / f"cut_{tmp_id}.mp4"
            cmd = ["ffmpeg", "-y", "-i", str(downloaded)]
            if start:
                cmd += ["-ss", str(_parse_time(start))]
            if end:
                cmd += ["-to", str(_parse_time(end))]
            cmd += ["-c", "copy", str(cut_path)]
            subprocess.run(cmd, check=True, capture_output=True)
            downloaded.unlink(missing_ok=True)
            cut_path.rename(out_path)
        else:
            downloaded.rename(out_path)

        _push(job_id, {"status": "done", "filename": out_name, "title": title})

    except Exception as e:
        _push(job_id, {"status": "error", "message": str(e)})
    finally:
        # Cleanup any leftover tmp files
        for f in DOWNLOADS_DIR.glob(f"tmp_{tmp_id}*"):
            f.unlink(missing_ok=True)
        _progress_queues.pop(job_id, None)


if __name__ == "__main__":
    app.run(debug=True, port=5050, threaded=True)
