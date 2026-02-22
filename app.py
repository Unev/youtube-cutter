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

    # Find best audio format size
    best_audio_size = 0
    for f in info.get("formats", []):
        if f.get("vcodec") == "none" and f.get("acodec") != "none":
            s = f.get("filesize") or f.get("filesize_approx") or 0
            if s > best_audio_size:
                best_audio_size = s

    # Collect unique resolutions, tracking best filesize per height
    seen: dict[int, int] = {}
    for f in info.get("formats", []):
        height = f.get("height")
        vcodec = f.get("vcodec", "none")
        if height and vcodec != "none":
            s = f.get("filesize") or f.get("filesize_approx") or 0
            if height not in seen or s > seen[height]:
                seen[height] = s

    formats = []
    for height in sorted(seen, reverse=True):
        total = seen[height] + best_audio_size
        formats.append({
            "label": f"{height}p",
            "height": height,
            "filesize": total if total > 0 else None,
        })

    # Always add audio-only option
    formats.append({
        "label": "Audio only (MP3)",
        "height": 0,
        "filesize": best_audio_size if best_audio_size > 0 else None,
    })

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


def _safe_title(title: str) -> str:
    return "".join(c for c in title if c.isalnum() or c in " -_").strip()[:60]


def _ffmpeg_clip(job_id: str, url: str, height: int, start: str, end: str) -> tuple[str, str]:
    """Get stream URLs via yt-dlp then use ffmpeg to download only the clip range."""
    fmt = (f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]"
           f"/bestvideo[height<={height}]+bestaudio/best[height<={height}]")

    _push(job_id, {"status": "downloading", "pct": 0, "speed": "", "eta": "",
                   "downloaded": 0, "total": 0})

    with yt_dlp.YoutubeDL({"format": fmt, "quiet": True}) as ydl:
        info = ydl.extract_info(url, download=False)

    title = info.get("title", "video")
    duration = float(info.get("duration") or 0)
    req_fmts = info.get("requested_formats") or [info]

    start_secs = _parse_time(start) if start else 0.0
    end_secs = _parse_time(end) if end else duration
    clip_dur = max(end_secs - start_secs, 0.1)

    out_name = f"{_safe_title(title)}.mp4"
    out_path = DOWNLOADS_DIR / out_name

    ua = req_fmts[0].get("http_headers", {}).get("User-Agent", "")

    cmd = ["ffmpeg", "-y", "-hide_banner"]
    if ua:
        cmd += ["-user_agent", ua]
    cmd += ["-ss", str(start_secs), "-i", req_fmts[0]["url"]]
    if len(req_fmts) == 2:
        cmd += ["-ss", str(start_secs), "-i", req_fmts[1]["url"]]
    cmd += ["-t", str(clip_dur), "-c", "copy",
            "-progress", "pipe:1", "-nostats", str(out_path)]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    props: dict = {}
    for line in proc.stdout:
        line = line.strip()
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        props[k] = v
        if k == "progress":
            t_ms = int(props.get("out_time_ms", "0") or "0")
            size = int(props.get("total_size", "0") or "0")
            pct = min(t_ms / 1_000_000 / clip_dur * 100, 99) if clip_dur else 0
            _push(job_id, {"status": "downloading", "pct": round(pct, 1),
                           "speed": props.get("speed", ""), "eta": "",
                           "downloaded": size, "total": 0})
            props = {}

    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg failed to download/cut the clip")

    return out_name, title


def _run_download(job_id: str, url: str, height: int, start: str, end: str):
    audio_only = height == 0
    tmp_id = str(uuid.uuid4())
    tmp_path = DOWNLOADS_DIR / f"tmp_{tmp_id}.%(ext)s"

    try:
        # Clip download: use ffmpeg for true partial download
        if not audio_only and (start or end):
            out_name, title = _ffmpeg_clip(job_id, url, height, start, end)
            _push(job_id, {"status": "done", "filename": out_name, "title": title})
            return

        # Full video / audio: use yt-dlp normally
        def progress_hook(d):
            if d["status"] == "downloading":
                pct = d.get("_percent_str", "0%").strip().replace("%", "")
                try:
                    pct = float(pct)
                except ValueError:
                    pct = 0
                _push(job_id, {
                    "status": "downloading", "pct": pct,
                    "speed": d.get("_speed_str", "").strip(),
                    "eta": d.get("_eta_str", "").strip(),
                    "downloaded": d.get("downloaded_bytes") or 0,
                    "total": d.get("total_bytes") or d.get("total_bytes_estimate") or 0,
                })
            elif d["status"] == "finished":
                _push(job_id, {"status": "processing", "pct": 100})

        if audio_only:
            ydl_opts = {
                "format": "bestaudio/best",
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
            fmt = (f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]"
                   f"/bestvideo[height<={height}]+bestaudio/best[height<={height}]")
            ydl_opts = {
                "format": fmt,
                "outtmpl": str(tmp_path),
                "progress_hooks": [progress_hook],
                "quiet": True,
                "merge_output_format": "mp4",
            }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "video")

        ext = "mp3" if audio_only else "mp4"
        downloaded_file = (next(DOWNLOADS_DIR.glob(f"tmp_{tmp_id}*.{ext}"), None)
                           or next(DOWNLOADS_DIR.glob(f"tmp_{tmp_id}*"), None))
        if not downloaded_file:
            raise FileNotFoundError("Downloaded file not found")

        out_name = f"{_safe_title(title)}.{ext}"
        downloaded_file.rename(DOWNLOADS_DIR / out_name)
        _push(job_id, {"status": "done", "filename": out_name, "title": title})

    except Exception as e:
        _push(job_id, {"status": "error", "message": str(e)})
    finally:
        for f in DOWNLOADS_DIR.glob(f"tmp_{tmp_id}*"):
            f.unlink(missing_ok=True)
        _progress_queues.pop(job_id, None)


if __name__ == "__main__":
    app.run(debug=True, port=5050, threaded=True)
