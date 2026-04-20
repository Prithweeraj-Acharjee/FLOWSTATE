/**
 * FlowState — Popup Script v1.1
 * Reads quality data from storage and renders the popup UI + chart.
 * M1 fix: Reads fsModel from storage and applies per-model thresholds.
 */

const $ = id => document.getElementById(id);

// Per-model thresholds (must match quality.js MODEL_CONFIG)
const THRESHOLDS = {
  ChatGPT: { sharp: 7.5, slipping: 5.0 },
  Gemini:  { sharp: 7.0, slipping: 4.5 },
  Claude:  { sharp: 7.5, slipping: 5.0 }
};

let activeModel = "ChatGPT";

function getThresholds() {
  return THRESHOLDS[activeModel] || THRESHOLDS.ChatGPT;
}

function getStatusClass(score) {
  const t = getThresholds();
  if (score >= t.sharp)    return "";
  if (score >= t.slipping) return "warn";
  return "bad";
}

function getStatusText(score) {
  const t = getThresholds();
  if (score >= t.sharp)    return "Sharp";
  if (score >= t.slipping) return "Slipping";
  return "Degraded";
}

function getBarColor(score) {
  const t = getThresholds();
  if (score >= t.sharp)    return "#00e676";
  if (score >= t.slipping) return "#ff8800";
  return "#ff4444";
}

function render(latest, history) {
  if (!latest) return;

  $("idle-state").style.display   = "none";
  $("active-state").style.display = "block";

  const score = latest.total;
  const cls   = getStatusClass(score);

  // score + badge
  $("pop-score").textContent = score;
  $("pop-score").className   = `score-value ${cls}`;
  $("pop-badge").textContent = getStatusText(score);
  $("pop-badge").className   = `status-badge ${cls}`;

  // model indicator
  $("pop-model").textContent = activeModel;

  // bar
  $("pop-bar").style.width      = `${score * 10}%`;
  $("pop-bar").style.background = getBarColor(score);

  // metrics
  $("pop-rel").textContent  = latest.rel  ?? "—";
  $("pop-spec").textContent = latest.spec ?? "—";
  $("pop-len").textContent  = latest.len  ?? "—";
  $("pop-rep").textContent  = latest.rep  ?? "—";

  // stats
  const scores = history.map(h => h.score);
  const peak   = scores.length ? Math.max(...scores).toFixed(1) : "—";
  const drop   = scores.length > 1
    ? (scores[0] - scores[scores.length - 1]).toFixed(1)
    : "—";

  $("pop-msgs").textContent = history.length;
  $("pop-peak").textContent = peak;
  $("pop-drop").textContent = drop !== "—" && drop > 0 ? `-${drop}` : drop;

  // smart reset button — enable based on model-aware thresholds
  const resetBtn = $("pop-reset-btn");
  const t = getThresholds();
  if (score < t.slipping + 1.0) {
    resetBtn.disabled = false;
    resetBtn.style.color       = "#ff4444";
    resetBtn.style.borderColor = "#2a0000";
  } else {
    resetBtn.disabled = true;
  }

  // draw chart
  drawChart(history);
}

function drawChart(history) {
  const canvas = $("pop-chart");
  if (!canvas || !history.length) return;

  const ctx    = canvas.getContext("2d");
  const W      = canvas.offsetWidth  || 244;
  const H      = 70;
  canvas.width  = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  // background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const scores = history.map(h => h.score);
  const step   = W / Math.max(scores.length - 1, 1);

  // danger zone fill
  ctx.fillStyle = "rgba(255,68,68,0.06)";
  ctx.fillRect(0, H * 0.6, W, H * 0.4);

  // grid line at slipping threshold
  const t = getThresholds();
  const gridY = H - (t.slipping / 10) * H;
  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0,  gridY);
  ctx.lineTo(W,  gridY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (scores.length < 2) return;

  // area fill
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = i * step;
    const y = H - (s / 10) * H;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo((scores.length - 1) * step, H);
  ctx.lineTo(0, H);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   "rgba(0,230,118,0.2)");
  grad.addColorStop(0.5, "rgba(255,136,0,0.1)");
  grad.addColorStop(1,   "rgba(255,68,68,0.05)");
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = i * step;
    const y = H - (s / 10) * H;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
  lineGrad.addColorStop(0,   "#00e676");
  lineGrad.addColorStop(0.5, "#ff8800");
  lineGrad.addColorStop(1,   "#ff4444");

  ctx.strokeStyle = lineGrad;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // dots
  scores.forEach((s, i) => {
    const x   = i * step;
    const y   = H - (s / 10) * H;
    const col = s >= t.sharp ? "#00e676" : s >= t.slipping ? "#ff8800" : "#ff4444";
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });
}

// ── Smart Reset — sends message to content script ────────────────────────────
$("pop-reset-btn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.scripting.executeScript({
      target : { tabId: tabs[0].id },
      func   : () => {
        const btn = document.getElementById("fs-reset-btn");
        if (btn) btn.click();
      }
    });
    window.close();
  });
});

// ── Load data and render ──────────────────────────────────────────────────────
chrome.storage.local.get(["fsLatest", "fsHistory", "fsModel"], (data) => {
  const latest  = data.fsLatest  || null;
  const history = data.fsHistory || [];

  // M1: Set active model before rendering
  if (data.fsModel) activeModel = data.fsModel;

  if (latest) {
    render(latest, history);
  }
  // else idle state stays visible
});

// ── Sensitivity slider ───────────────────────────────────────────────────────
const sensitivitySlider = $("pop-sensitivity");
const sensitivityVal    = $("pop-sensitivity-val");

// Load saved sensitivity
chrome.storage.local.get("fsSensitivity", (data) => {
  const saved = data.fsSensitivity || 100;
  sensitivitySlider.value   = saved;
  sensitivityVal.textContent = (saved / 100).toFixed(1) + "×";
});

sensitivitySlider.addEventListener("input", () => {
  const raw = parseInt(sensitivitySlider.value, 10);
  const val = raw / 100;
  sensitivityVal.textContent = val.toFixed(1) + "×";
  chrome.storage.local.set({ fsSensitivity: raw });

  // Push to content script's quality engine
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.scripting.executeScript({
      target : { tabId: tabs[0].id },
      func   : (s) => {
        if (typeof FlowStateQuality !== "undefined") {
          FlowStateQuality.setSensitivity(s);
        }
      },
      args: [val]
    });
  });
});

// ── Live update every 2s while popup is open ──────────────────────────────────
setInterval(() => {
  chrome.storage.local.get(["fsLatest", "fsHistory", "fsModel"], (data) => {
    if (data.fsModel) activeModel = data.fsModel;
    if (data.fsLatest) render(data.fsLatest, data.fsHistory || []);
  });
}, 2000);
