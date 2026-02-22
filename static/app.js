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
    qualitySelect.appendChild(opt);
  }

  // Show/hide cut section based on audio-only
  qualitySelect.addEventListener("change", updateCutVisibility);
  updateCutVisibility();

  show(infoCard);
  show(optionsCard);
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
      setProgress(pct, `Downloading… ${pct}%`, `${d.speed}  ETA ${d.eta}`);
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
