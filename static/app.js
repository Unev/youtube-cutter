const $ = (id) => document.getElementById(id);

const urlInput    = $("url-input");
const fetchBtn    = $("fetch-btn");
const infoCard    = $("info-card");
const optionsCard = $("options-card");
const progressCard= $("progress-card");
const resultCard  = $("result-card");
const errorCard   = $("error-card");
const qualitySelect = $("quality-select");
const cutGroup    = $("cut-group");
const downloadBtn = $("download-btn");

let videoInfo = null;

// ── URL History ──────────────────────────────────────────────────────────────

const HISTORY_KEY = "yt-history";

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveToHistory(url) {
  const history = loadHistory().filter(u => u !== url);
  history.unshift(url);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 15)));
  renderHistory();
}

function renderHistory() {
  const list = $("url-history");
  list.innerHTML = "";
  for (const url of loadHistory()) {
    const opt = document.createElement("option");
    opt.value = url;
    list.appendChild(opt);
  }
}

renderHistory();

$("clear-history-btn").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

// ── Fetch video info ────────────────────────────────────────────────────────

fetchBtn.addEventListener("click", fetchInfo);
urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") fetchInfo(); });

async function fetchInfo() {
  const url = urlInput.value.trim();
  if (!url) return;

  setLoading(fetchBtn, true);
  hideAll();

  try {
    const res = await fetch("/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    videoInfo = data;
    saveToHistory(url);
    showInfo(data);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(fetchBtn, false);
  }
}

function showInfo(data) {
  $("thumb").src = data.thumbnail;
  $("vid-title").textContent = data.title;
  $("vid-channel").textContent = data.channel;
  $("vid-duration").textContent = "Duration: " + data.duration_str;

  // Populate quality select
  qualitySelect.innerHTML = "";
  for (const fmt of data.formats) {
    const opt = document.createElement("option");
    opt.value = fmt.height;
    opt.textContent = fmt.label;
    opt.dataset.filesize = fmt.filesize ?? "";
    qualitySelect.appendChild(opt);
  }

  // Update on quality or time change
  qualitySelect.addEventListener("change", updateSizeHint);
  $("start-time").addEventListener("input", updateSizeHint);
  $("end-time").addEventListener("input", updateSizeHint);
  qualitySelect.addEventListener("change", updateCutVisibility);
  updateCutVisibility();
  updateSizeHint();

  show(infoCard);
  show(optionsCard);
}

// ── Size hint ────────────────────────────────────────────────────────────────

function parseTime(t) {
  if (!t) return 0;
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  return (bytes / 1e3).toFixed(0) + " KB";
}

function updateSizeHint() {
  const selected = qualitySelect.selectedOptions[0];
  const filesize = Number(selected?.dataset.filesize) || 0;

  if (!filesize || !videoInfo) {
    $("size-hint").textContent = "";
    return;
  }

  const duration = videoInfo.duration;
  const start = parseTime($("start-time").value.trim());
  const end   = parseTime($("end-time").value.trim());

  let clipDuration = duration;
  if (end > 0 && end > start) {
    clipDuration = end - start;
  } else if (start > 0 && end === 0) {
    clipDuration = duration - start;
  }

  const ratio = Math.min(clipDuration / duration, 1);
  $("size-hint").textContent = `~${formatBytes(filesize * ratio)}`;
}

function updateCutVisibility() {
  const isAudio = parseInt(qualitySelect.value) === 0;
  cutGroup.style.display = isAudio ? "none" : "flex";
}

// ── Download ────────────────────────────────────────────────────────────────

downloadBtn.addEventListener("click", startDownload);

async function startDownload() {
  if (!videoInfo) return;

  const url    = urlInput.value.trim();
  const height = parseInt(qualitySelect.value);
  const start  = $("start-time").value.trim();
  const end    = $("end-time").value.trim();

  hide(optionsCard);
  hide(infoCard);
  show(progressCard);
  setProgress(0, "Starting download…", "");

  try {
    const res = await fetch("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, height, start, end }),
    });
    const { job_id } = await res.json();
    listenProgress(job_id);
  } catch (err) {
    showError(err.message);
  }
}

function listenProgress(jobId) {
  const es = new EventSource(`/progress/${jobId}`);

  es.onmessage = (e) => {
    const d = JSON.parse(e.data);

    if (d.status === "downloading") {
      const pct = Math.round(d.pct || 0);
      const sizeInfo = d.total
        ? `${formatBytes(d.downloaded)} / ${formatBytes(d.total)}`
        : formatBytes(d.downloaded);
      setProgress(pct, `Downloading… ${pct}%`, `${sizeInfo}  ${d.speed}  ETA ${d.eta}`);
    } else if (d.status === "processing") {
      setProgress(100, "Processing…", "Merging audio & video");
    } else if (d.status === "cutting") {
      setProgress(100, "Cutting video…", "");
    } else if (d.status === "done") {
      es.close();
      showResult(d.filename, d.title);
    } else if (d.status === "error") {
      es.close();
      showError(d.message);
    }
  };

  es.onerror = () => {
    es.close();
    showError("Connection lost. Check the server.");
  };
}

// ── UI helpers ──────────────────────────────────────────────────────────────

function setProgress(pct, label, meta) {
  $("progress-bar").style.width = pct + "%";
  $("progress-label").textContent = label;
  $("progress-meta").textContent = meta;
}

function showResult(filename, title) {
  hide(progressCard);
  $("result-title").textContent = title;
  const link = $("result-link");
  link.href = `/downloads/${encodeURIComponent(filename)}`;
  link.download = filename;
  show(resultCard);
}

function showError(msg) {
  hideAll();
  $("error-msg").textContent = msg;
  show(errorCard);
}

function hideAll() {
  [infoCard, optionsCard, progressCard, resultCard, errorCard].forEach(hide);
}
function show(el) { el.classList.remove("hidden"); el.style.display = ""; }
function hide(el) { el.classList.add("hidden"); }

function setLoading(btn, loading) {
  btn.textContent = loading ? "Fetching…" : "Fetch Info";
  btn.classList.toggle("loading", loading);
}

// ── Reset buttons ───────────────────────────────────────────────────────────

$("new-btn").addEventListener("click", () => {
  hideAll();
  urlInput.value = "";
  videoInfo = null;
});

$("retry-btn").addEventListener("click", () => {
  hideAll();
  show(infoCard);
  show(optionsCard);
});
