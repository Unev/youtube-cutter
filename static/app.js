const $ = (id) => document.getElementById(id);

const urlInput      = $("url-input");
const fetchBtn      = $("fetch-btn");
const infoCard      = $("info-card");
const previewCard   = $("preview-card");
const optionsCard   = $("options-card");
const errorCard     = $("error-card");
const qualitySelect = $("quality-select");
const cutGroup      = $("cut-group");
const downloadBtn   = $("download-btn");

let videoInfo = null;

// ── Utilities ────────────────────────────────────────────────────────────────

function show(el) { el.classList.remove("hidden"); el.style.display = ""; }
function hide(el) { el.classList.add("hidden"); }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  return (bytes / 1e3).toFixed(0) + " KB";
}

function parseTime(t) {
  if (!t || !t.trim()) return 0;
  const parts = t.trim().split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}

function secondsToHMS(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ── Theme ────────────────────────────────────────────────────────────────────

const THEME_KEY = "yt-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("theme-toggle").textContent = theme === "light" ? "🌙" : "☀️";
  localStorage.setItem(THEME_KEY, theme);
}

applyTheme(localStorage.getItem(THEME_KEY) || "dark");

$("theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

// ── URL History ──────────────────────────────────────────────────────────────

const URL_HISTORY_KEY = "yt-history";

function loadUrlHistory() {
  try { return JSON.parse(localStorage.getItem(URL_HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveUrlHistory(url) {
  const h = loadUrlHistory().filter(u => u !== url);
  h.unshift(url);
  localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(h.slice(0, 15)));
  renderUrlHistory();
}

function renderUrlHistory() {
  const list = $("url-history");
  list.innerHTML = "";
  for (const url of loadUrlHistory()) {
    const opt = document.createElement("option");
    opt.value = url;
    list.appendChild(opt);
  }
}

renderUrlHistory();

$("clear-history-btn").addEventListener("click", () => {
  localStorage.removeItem(URL_HISTORY_KEY);
  renderUrlHistory();
});

// ── Auto-fill ?t= from URL ───────────────────────────────────────────────────

function extractTimestampFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const t = u.searchParams.get("t");
    if (!t) return null;
    if (/^\d+$/.test(t)) return secondsToHMS(parseInt(t, 10));
    const match = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!match) return null;
    const secs = (parseInt(match[1] || 0) * 3600)
               + (parseInt(match[2] || 0) * 60)
               + parseInt(match[3] || 0);
    return secs > 0 ? secondsToHMS(secs) : null;
  } catch { return null; }
}

// ── YouTube preview ──────────────────────────────────────────────────────────

function getVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
  } catch {}
  return null;
}

let previewTimer = null;

function updatePreview() {
  const videoId = getVideoId(urlInput.value.trim());
  if (!videoId) { hide(previewCard); return; }

  const startSecs = Math.floor(parseTime($("start-time").value.trim()));
  const endSecs   = Math.floor(parseTime($("end-time").value.trim()));
  let src = `https://www.youtube.com/embed/${videoId}?rel=0&start=${startSecs}`;
  if (endSecs > startSecs) src += `&end=${endSecs}`;

  $("preview-iframe").src = src;
  show(previewCard);
}

function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 700);
}

// ── Scrubber ─────────────────────────────────────────────────────────────────

function initScrubber() {
  const dur = videoInfo.duration;
  const sStart = $("scrubber-start");
  const sEnd   = $("scrubber-end");

  sStart.max = 1000; sStart.value = 0;
  sEnd.max   = 1000; sEnd.value   = 1000;
  updateScrubberTrack();

  sStart.addEventListener("input", () => {
    if (Number(sStart.value) >= Number(sEnd.value))
      sStart.value = Number(sEnd.value) - 1;
    const secs = Number(sStart.value) / 1000 * dur;
    $("start-time").value = secs > 0 ? secondsToHMS(secs) : "";
    updateScrubberTrack();
    updateSizeHint();
    schedulePreviewUpdate();
  });

  sEnd.addEventListener("input", () => {
    if (Number(sEnd.value) <= Number(sStart.value))
      sEnd.value = Number(sStart.value) + 1;
    const secs = Number(sEnd.value) / 1000 * dur;
    $("end-time").value = secs < dur ? secondsToHMS(secs) : "";
    updateScrubberTrack();
    updateSizeHint();
    schedulePreviewUpdate();
  });
}

function updateScrubberTrack() {
  const s = Number($("scrubber-start").value) / 10;   // 0–100%
  const e = Number($("scrubber-end").value)   / 10;
  const range = $("timeline-range");
  range.style.left  = s + "%";
  range.style.width = (e - s) + "%";
}

function syncScrubberFromInputs() {
  if (!videoInfo) return;
  const dur = videoInfo.duration;
  const startSecs = parseTime($("start-time").value.trim());
  const endSecs   = parseTime($("end-time").value.trim()) || dur;
  $("scrubber-start").value = Math.round(startSecs / dur * 1000);
  $("scrubber-end").value   = Math.round(endSecs   / dur * 1000);
  updateScrubberTrack();
}

// ── Size hint ────────────────────────────────────────────────────────────────

function updateSizeHint() {
  const selected = qualitySelect.selectedOptions[0];
  const filesize  = Number(selected?.dataset.filesize) || 0;
  if (!filesize || !videoInfo) { $("size-hint").textContent = ""; return; }

  const dur   = videoInfo.duration;
  const start = parseTime($("start-time").value.trim());
  const end   = parseTime($("end-time").value.trim());

  let clipDuration = dur;
  if (end > 0 && end > start) clipDuration = end - start;
  else if (start > 0 && end === 0) clipDuration = dur - start;

  const ratio = Math.min(clipDuration / dur, 1);
  $("size-hint").textContent = `~${formatBytes(filesize * ratio)}`;
}

// ── Time input spinners ──────────────────────────────────────────────────────

// Track which segment the cursor is in per input (for button clicks)
const lastSegment = { "start-time": -1, "end-time": -1 };

function getActiveSegment(inputId) {
  const input = $(inputId);
  const val   = input.value || "";
  const pos   = lastSegment[inputId] >= 0 ? lastSegment[inputId] : input.selectionStart;
  const colonsBefore = (val.slice(0, pos).match(/:/g) || []).length;
  return colonsBefore; // 0=hrs-or-mins, 1=mins-or-secs, 2=secs
}

function getStepForSegment(inputId) {
  const val         = $(inputId).value || "";
  const totalColons = (val.match(/:/g) || []).length;
  const segment     = getActiveSegment(inputId);
  if (totalColons >= 2) {
    return [3600, 60, 1][segment] ?? 1;   // HH:MM:SS
  }
  return [60, 1][segment] ?? 1;            // MM:SS
}

function getSegmentBounds(val, segment) {
  const parts = val.split(":");
  let start = 0;
  for (let i = 0; i < segment; i++) start += (parts[i]?.length ?? 0) + 1;
  return { start, end: start + (parts[segment]?.length ?? 0) };
}

function adjustTime(inputId, direction) {
  const input    = $(inputId);
  const segment  = getActiveSegment(inputId);
  const step     = getStepForSegment(inputId) * direction;
  const current  = parseTime(input.value.trim());
  const duration = videoInfo?.duration || Infinity;
  const newVal   = Math.max(0, Math.min(current + step, duration));
  input.value = secondsToHMS(newVal);
  input.dispatchEvent(new Event("input"));

  // Restore cursor to same segment after value updates
  const { start, end } = getSegmentBounds(input.value, segment);
  setTimeout(() => input.setSelectionRange(start, end), 0);
}

// Track cursor segment on every interaction
["start-time", "end-time"].forEach(id => {
  const input = $(id);
  ["mouseup", "keyup", "focus", "click"].forEach(evt => {
    input.addEventListener(evt, () => { lastSegment[id] = input.selectionStart; });
  });
});

// Hold-to-repeat: start slow, speed up after 400ms
let spinInterval = null;
let spinTimeout  = null;

function startSpin(targetId, direction) {
  adjustTime(targetId, direction);
  spinTimeout = setTimeout(() => {
    spinInterval = setInterval(() => adjustTime(targetId, direction), 80);
  }, 400);
}

function stopSpin() {
  clearTimeout(spinTimeout);
  clearInterval(spinInterval);
  spinInterval = null;
  spinTimeout  = null;
}

document.querySelectorAll(".time-spin-btn").forEach(btn => {
  const targetId  = btn.dataset.target;
  const direction = Number(btn.dataset.delta); // +1 or -1
  btn.addEventListener("mousedown",  (e) => { e.preventDefault(); startSpin(targetId, direction); });
  btn.addEventListener("touchstart", (e) => { e.preventDefault(); startSpin(targetId, direction); }, { passive: false });
});
document.addEventListener("mouseup",  stopSpin);
document.addEventListener("touchend", stopSpin);

// Keyboard: ↑↓ steps by the segment unit (hours/mins/secs based on cursor)
["start-time", "end-time"].forEach(id => {
  $(id).addEventListener("keydown", (e) => {
    if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    lastSegment[id] = $(id).selectionStart;
    adjustTime(id, e.key === "ArrowUp" ? 1 : -1);
  });
});

// ── Fetch video info ─────────────────────────────────────────────────────────

fetchBtn.addEventListener("click", fetchInfo);
urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") fetchInfo(); });

async function fetchInfo() {
  const url = urlInput.value.trim();
  if (!url) return;

  fetchBtn.textContent = "Fetching…";
  fetchBtn.classList.add("loading");
  hide(infoCard); hide(optionsCard); hide(previewCard); hide(errorCard);

  try {
    const res  = await fetch("/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    videoInfo = data;
    saveUrlHistory(url);
    showInfo(data);

    // Auto-fill ?t= timestamp
    const ts = extractTimestampFromUrl(url);
    if (ts) {
      $("start-time").value = ts;
      syncScrubberFromInputs();
      updateSizeHint();
    }

    updatePreview();
  } catch (err) {
    $("error-msg").textContent = err.message;
    show(errorCard);
  } finally {
    fetchBtn.textContent = "Fetch Info";
    fetchBtn.classList.remove("loading");
  }
}

function showInfo(data) {
  $("thumb").src        = data.thumbnail;
  $("vid-title").textContent   = data.title;
  $("vid-channel").textContent = data.channel;
  $("vid-duration").textContent = "Duration: " + data.duration_str;

  // Populate quality
  qualitySelect.innerHTML = "";
  for (const fmt of data.formats) {
    const opt = document.createElement("option");
    opt.value = fmt.height;
    opt.textContent = fmt.label;
    opt.dataset.filesize = fmt.filesize ?? "";
    qualitySelect.appendChild(opt);
  }

  qualitySelect.onchange = updateSizeHint;
  $("start-time").oninput = () => { updateSizeHint(); syncScrubberFromInputs(); schedulePreviewUpdate(); };
  $("end-time").oninput   = () => { updateSizeHint(); syncScrubberFromInputs(); schedulePreviewUpdate(); };

  updateSizeHint();
  initScrubber();

  show(infoCard);
  show(optionsCard);
}

$("retry-btn").addEventListener("click", () => {
  hide(errorCard);
  if (videoInfo) { show(infoCard); show(optionsCard); }
});

// ── Notifications ────────────────────────────────────────────────────────────

async function requestNotifyPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
}

function sendNotification(title, body) {
  if (Notification.permission !== "granted") return;
  const n = new Notification(title, { body });
  setTimeout(() => n.close(), 6000);
}

// ── Download queue ───────────────────────────────────────────────────────────

const jobs = new Map();  // jobId -> { url, es }

function ensureQueueVisible() {
  show($("queue-section"));
}

function createJobCard(jobId, label) {
  const div = document.createElement("div");
  div.className = "queue-item";
  div.id = `job-${jobId}`;
  div.innerHTML = `
    <div class="queue-item-header">
      <span class="queue-item-title">${escapeHtml(label)}</span>
      <span class="queue-badge queue-badge-downloading" id="badge-${jobId}">Starting</span>
    </div>
    <div class="progress-bar-wrap" id="pbwrap-${jobId}">
      <div class="progress-bar" id="pb-${jobId}" style="width:0%"></div>
    </div>
    <div class="queue-item-meta" id="pmeta-${jobId}"></div>
    <div class="queue-item-actions" id="actions-${jobId}">
      <button class="btn btn-ghost btn-sm" onclick="cancelJob('${jobId}')">Cancel</button>
    </div>
  `;
  $("queue-list").prepend(div);
}

function updateJobBadge(jobId, text, cls) {
  const badge = $(`badge-${jobId}`);
  if (badge) { badge.textContent = text; badge.className = `queue-badge ${cls}`; }
}

function updateJobProgress(jobId, pct, metaText) {
  const pb   = $(`pb-${jobId}`);
  const meta = $(`pmeta-${jobId}`);
  if (pb)   pb.style.width = pct + "%";
  if (meta) meta.textContent = metaText;
}

function markJobDone(jobId, filename, title) {
  const dotIdx  = filename.lastIndexOf(".");
  const baseName = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  const ext      = dotIdx > 0 ? filename.slice(dotIdx) : "";

  const pbWrap = $(`pbwrap-${jobId}`);
  if (pbWrap) pbWrap.style.display = "none";
  $(`pmeta-${jobId}`).textContent = "";
  updateJobBadge(jobId, "Done", "queue-badge queue-badge-done");

  const actions = $(`actions-${jobId}`);
  if (actions) {
    actions.innerHTML = `
      <div class="filename-row">
        <input class="filename-input" id="fn-${jobId}" type="text"
               value="${escapeHtml(baseName)}" spellcheck="false" />
        <span class="filename-ext">${escapeHtml(ext)}</span>
      </div>
      <a id="dl-${jobId}" class="btn btn-primary btn-sm"
         href="/downloads/${encodeURIComponent(filename)}"
         download="${escapeHtml(filename)}">Save file</a>
      <button class="btn btn-ghost btn-sm" onclick="dismissJob('${jobId}')">Dismiss</button>
    `;
    $(`fn-${jobId}`).addEventListener("input", () => {
      $(`dl-${jobId}`).download = $(`fn-${jobId}`).value + ext;
    });
  }

  saveDownloadHistory({ filename, title, url: jobs.get(jobId)?.url, date: new Date().toISOString() });
  sendNotification("Download complete", title || filename);
}

function markJobError(jobId, message) {
  updateJobBadge(jobId, "Error", "queue-badge queue-badge-error");
  const meta = $(`pmeta-${jobId}`);
  if (meta) meta.textContent = message;
  const actions = $(`actions-${jobId}`);
  if (actions) actions.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="dismissJob('${jobId}')">Dismiss</button>`;
}

function markJobCancelled(jobId) {
  updateJobBadge(jobId, "Cancelled", "queue-badge queue-badge-cancelled");
  const meta = $(`pmeta-${jobId}`);
  if (meta) meta.textContent = "";
  const actions = $(`actions-${jobId}`);
  if (actions) actions.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="dismissJob('${jobId}')">Dismiss</button>`;
}

function dismissJob(jobId) {
  const el = $(`job-${jobId}`);
  if (el) el.remove();
  jobs.delete(jobId);
  if ($("queue-list").children.length === 0) hide($("queue-section"));
}

async function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (job?.es) job.es.close();
  await fetch(`/cancel/${jobId}`, { method: "POST" });
  markJobCancelled(jobId);
}

// Clear done items
$("clear-done-btn").addEventListener("click", () => {
  for (const [jobId] of [...jobs]) {
    const badge = $(`badge-${jobId}`);
    if (badge && ["Done", "Cancelled", "Error"].includes(badge.textContent)) {
      dismissJob(jobId);
    }
  }
  // Also remove items not tracked in jobs (e.g. refreshed page)
  document.querySelectorAll(".queue-item").forEach(item => {
    const badge = item.querySelector(".queue-badge");
    if (badge && ["Done", "Cancelled", "Error"].includes(badge.textContent)) {
      item.remove();
    }
  });
  if ($("queue-list").children.length === 0) hide($("queue-section"));
});

// ── Download ─────────────────────────────────────────────────────────────────

downloadBtn.addEventListener("click", startDownload);

async function startDownload() {
  if (!videoInfo) return;
  await requestNotifyPermission();

  const url    = urlInput.value.trim();
  const height = parseInt(qualitySelect.value);
  const start  = $("start-time").value.trim();
  const end    = $("end-time").value.trim();
  const label  = `${videoInfo.title} — ${qualitySelect.selectedOptions[0].textContent}`;

  try {
    const res = await fetch("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, height, start, end }),
    });
    const { job_id } = await res.json();

    jobs.set(job_id, { url, es: null });
    ensureQueueVisible();
    createJobCard(job_id, label);
    listenProgress(job_id);
  } catch (err) {
    $("error-msg").textContent = `Failed to start download: ${err.message}`;
    show(errorCard);
  }
}

function listenProgress(jobId) {
  const es = new EventSource(`/progress/${jobId}`);
  const job = jobs.get(jobId);
  if (job) job.es = es;

  es.onmessage = (e) => {
    const d = JSON.parse(e.data);

    if (d.status === "downloading") {
      const pct = Math.round(d.pct || 0);
      const sizeInfo = d.total
        ? `${formatBytes(d.downloaded)} / ${formatBytes(d.total)}`
        : formatBytes(d.downloaded);
      const speed = d.speed || "";
      const eta   = d.eta ? `ETA ${d.eta}` : "";
      const meta  = [sizeInfo, speed, eta].filter(Boolean).join("  ");
      updateJobProgress(jobId, pct, meta);
      updateJobBadge(jobId, `${pct}%`, "queue-badge queue-badge-downloading");
    } else if (d.status === "processing") {
      updateJobProgress(jobId, 100, "Merging audio & video…");
      updateJobBadge(jobId, "Processing", "queue-badge queue-badge-processing");
    } else if (d.status === "done") {
      es.close();
      markJobDone(jobId, d.filename, d.title);
    } else if (d.status === "error") {
      es.close();
      markJobError(jobId, d.message);
    } else if (d.status === "cancelled") {
      es.close();
      markJobCancelled(jobId);
    }
  };

  es.onerror = () => {
    es.close();
    markJobError(jobId, "Connection lost — check the server");
  };
}

// ── Download history ──────────────────────────────────────────────────────────

const DL_HISTORY_KEY = "yt-dl-history";

function loadDownloadHistory() {
  try { return JSON.parse(localStorage.getItem(DL_HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveDownloadHistory(entry) {
  const h = loadDownloadHistory().filter(x => x.filename !== entry.filename);
  h.unshift(entry);
  localStorage.setItem(DL_HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
  renderDownloadHistory();
}

function renderDownloadHistory() {
  const history = loadDownloadHistory();
  const list    = $("history-list");
  const section = $("history-section");
  list.innerHTML = "";

  if (history.length === 0) { hide(section); return; }
  show(section);

  for (const item of history) {
    const dateStr = new Date(item.date).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(item.title || item.filename)}</div>
        <div class="history-item-date">${dateStr}</div>
      </div>
      <div class="history-item-actions">
        <a class="btn btn-ghost btn-xs"
           href="/downloads/${encodeURIComponent(item.filename)}"
           download="${escapeHtml(item.filename)}">Re-download</a>
        ${item.url ? `<button class="btn btn-ghost btn-xs" onclick="reuseUrl('${escapeHtml(item.url)}')">Reuse URL</button>` : ""}
      </div>
    `;
    list.appendChild(div);
  }
}

function reuseUrl(url) {
  urlInput.value = url;
  window.scrollTo({ top: 0, behavior: "smooth" });
  fetchInfo();
}

$("clear-dl-history-btn").addEventListener("click", () => {
  localStorage.removeItem(DL_HISTORY_KEY);
  renderDownloadHistory();
});

renderDownloadHistory();
