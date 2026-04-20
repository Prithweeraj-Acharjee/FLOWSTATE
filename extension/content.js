/**
 * FlowState — Content Script v2.1
 * Production-grade. Runs on ChatGPT, Gemini, and Claude.ai.
 * Multi-selector resilience, error boundaries, evolving context,
 * selector diagnostics for surviving UI updates.
 */

(() => {
  // ── State ─────────────────────────────────────────────────────────────────
  let messageCount     = 0;
  let scores           = [];
  let initialized      = false;
  let lastResponseText = "";
  let lastUserCount    = 0;     // track user messages for evolving context
  let observer         = null;
  let meterEl          = null;
  let warningShown     = false;
  let debounceTimer    = null;

  // ── Site detection with fallback selectors ────────────────────────────────
  const SITE = (() => {
    const host = location.hostname;

    if (host === "gemini.google.com") {
      return {
        name         : "Gemini",
        selResponses : [
          "model-response .markdown",
          "model-response .response-content",
          "model-response .model-response-text",
          ".response-container .markdown",
          "message-content .markdown",
          ".model-response-text"
        ],
        selUsers     : [
          "user-query .query-text",
          "user-query .query-content",
          ".user-query-text",
          "user-query-content"
        ],
        newChatUrl   : "https://gemini.google.com/"
      };
    }

    if (host === "claude.ai") {
      return {
        name         : "Claude",
        selResponses : [
          '[data-testid="assistant-message"]',
          ".font-claude-message",
          '[data-is-streaming="false"] .prose',
          ".prose.max-w-none",
          ".whitespace-pre-wrap"
        ],
        selUsers     : [
          '[data-testid="user-message"]',
          ".font-human-message",
          '[data-human-turn] p',
          ".human-turn"
        ],
        newChatUrl   : "https://claude.ai/new"
      };
    }

    // Default: ChatGPT (chatgpt.com, chat.openai.com)
    return {
      name         : "ChatGPT",
      selResponses : [
        '[data-message-author-role="assistant"]',
        ".agent-turn .markdown",
        ".message.bot .markdown",
        '[class*="assistant"] .markdown',
        '[data-testid="conversation-turn-assistant"]',
        ".markdown.prose"
      ],
      selUsers     : [
        '[data-message-author-role="user"]',
        ".human-turn",
        ".message.user",
        '[class*="user-message"]',
        '[data-testid="conversation-turn-user"]'
      ],
      newChatUrl   : "https://chatgpt.com/"
    };
  })();

  // ── Selector diagnostics ──────────────────────────────────────────────────
  // Logs which selector matched on first successful read.
  // When the site ships a UI update and selectors break, this tells you exactly
  // which one was working before and which list to update.

  function queryAllWithDiag(selectorList, diagRef) {
    for (const sel of selectorList) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          if (diagRef.val !== sel) {
            diagRef.val = sel;
            console.log(`[FlowState] ${SITE.name} response selector active: "${sel}"`);
          }
          return Array.from(els);
        }
      } catch (_) { /* invalid selector */ }
    }
    // All selectors failed — warn once so it's obvious in DevTools
    if (!diagRef.warned) {
      diagRef.warned = true;
      console.warn(
        `[FlowState] No response selectors matched on ${SITE.name}. ` +
        `The site may have updated its DOM. Tried: ${selectorList.join(", ")}`
      );
    }
    return [];
  }

  const _responseDiag = { val: null, warned: false };
  const _userDiag     = { val: null, warned: false };

  // ── Chrome API safety check ──────────────────────────────────────────────
  function hasChromeAPIs() {
    return typeof chrome !== "undefined" &&
           typeof chrome.storage !== "undefined" &&
           typeof chrome.storage.local !== "undefined";
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    try {
      injectMeter();
      startObserver();
      console.log(`[FlowState] Active on ${SITE.name}`);
    } catch (err) {
      console.error("[FlowState] Init failed:", err);
    }
  }

  // ── HTML escaping ─────────────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Resilient DOM queries ─────────────────────────────────────────────────

  function queryAll(selectorList) {
    return queryAllWithDiag(selectorList, _responseDiag);
  }

  function queryFirst(selectorList) {
    for (const sel of selectorList) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) { /* selector may be invalid */ }
    }
    return null;
  }

  // ── Clean text extraction ─────────────────────────────────────────────────
  function cleanText(el) {
    try {
      const clone = el.cloneNode(true);
      clone.querySelectorAll(
        'button, [role="button"], [role="toolbar"], .copy-button, ' +
        '.code-header, [aria-label], .response-actions, .toolbar, ' +
        '.action-bar, .message-actions, .feedback-buttons, ' +
        'svg, .icon, [class*="action"], [class*="btn"]'
      ).forEach(n => n.remove());
      return clone.textContent.trim();
    } catch (_) {
      return el.textContent ? el.textContent.trim() : "";
    }
  }

  // ── Read messages ─────────────────────────────────────────────────────────

  function getAllResponses() {
    return queryAll(SITE.selResponses)
      .map(el => cleanText(el))
      .filter(t => t.length > 20);
  }

  function getAllUserMessages() {
    const els = (() => {
      for (const sel of SITE.selUsers) {
        try {
          const found = document.querySelectorAll(sel);
          if (found.length > 0) {
            if (_userDiag.val !== sel) {
              _userDiag.val = sel;
              console.log(`[FlowState] ${SITE.name} user selector active: "${sel}"`);
            }
            return Array.from(found);
          }
        } catch (_) {}
      }
      if (!_userDiag.warned) {
        _userDiag.warned = true;
        console.warn(
          `[FlowState] No user selectors matched on ${SITE.name}. ` +
          `Tried: ${SITE.selUsers.join(", ")}`
        );
      }
      return [];
    })();
    return els.map(el => cleanText(el)).filter(t => t.length > 0);
  }

  function getFirstUserMessage() {
    const el = queryFirst(SITE.selUsers);
    return el ? cleanText(el) : "";
  }

  // ── Trajectory prediction ─────────────────────────────────────────────────
  function getTrajectory() {
    if (scores.length < 3) return null;
    const last3 = scores.slice(-3);
    const slope = (last3[2] - last3[0]) / 2;
    if (slope >= -0.3) return null;

    const threshold = FlowStateQuality.getSlippingThreshold();
    const current   = last3[2];
    if (current <= threshold) return 0;

    const msgsLeft = Math.ceil((threshold - current) / slope);
    return msgsLeft > 0 ? msgsLeft : 0;
  }

  // ── Evolving context: feed new user messages to the engine ────────────────
  function updateUserContext() {
    try {
      const userMsgs = getAllUserMessages();
      if (userMsgs.length > lastUserCount) {
        for (let i = lastUserCount; i < userMsgs.length; i++) {
          FlowStateQuality.addUserMessage(userMsgs[i]);
        }
        lastUserCount = userMsgs.length;
      }
    } catch (err) {
      console.warn("[FlowState] Context update failed:", err);
    }
  }

  // ── Process new response ──────────────────────────────────────────────────
  function processLatestResponse() {
    try {
      injectMeter();

      const responses = getAllResponses();
      if (!responses.length) return;

      const latest = responses[responses.length - 1];
      if (latest === lastResponseText) return;
      lastResponseText = latest;

      if (!initialized) {
        const firstUser = getFirstUserMessage();
        if (firstUser) {
          FlowStateQuality.init(firstUser, SITE.name);
          initialized  = true;
          lastUserCount = 1;
        } else {
          return;
        }
      }

      updateUserContext();

      messageCount++;
      const result = FlowStateQuality.score(latest);

      if (!result.gated) {
        scores.push(result.total);
        if (scores.length > 60) scores.shift();
      }

      updateMeter(result);
      saveToStorage(result);

      const status = FlowStateQuality.getStatus(result.total);
      if (status !== "sharp" && !warningShown && !result.gated) {
        showWarning(result.total);
        warningShown = true;
      }
      if (status === "sharp") warningShown = false;

    } catch (err) {
      console.error("[FlowState] Score processing failed:", err);
    }
  }

  // ── MutationObserver ──────────────────────────────────────────────────────
  function startObserver() {
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(processLatestResponse, 1200);
    });

    observer.observe(document.body, {
      childList    : true,
      subtree      : true,
      characterData: true
    });

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onNewChat();
      }
    }, 1000);
  }

  // ── New chat detected ─────────────────────────────────────────────────────
  function onNewChat() {
    messageCount      = 0;
    scores            = [];
    initialized       = false;
    lastResponseText  = "";
    lastUserCount     = 0;
    warningShown      = false;
    _responseDiag.warned = false;
    _userDiag.warned     = false;
    FlowStateQuality.reset();
    resetMeter();
    console.log("[FlowState] New chat — reset");
  }

  // ── Inject floating meter ─────────────────────────────────────────────────
  function injectMeter() {
    if (document.getElementById("fs-meter")) return;

    meterEl = document.createElement("div");
    meterEl.id = "fs-meter";
    meterEl.innerHTML = `
      <div id="fs-header">
        <span id="fs-logo">⚡ FlowState</span>
        <div id="fs-header-right">
          <span id="fs-mini-score"></span>
          <span id="fs-model-badge">${escapeHtml(SITE.name)}</span>
          <span id="fs-toggle" title="Minimize">−</span>
        </div>
      </div>
      <div id="fs-body">
        <div id="fs-status-row">
          <span id="fs-label">Waiting...</span>
          <span id="fs-score">—</span>
        </div>
        <div id="fs-bar-wrap">
          <div id="fs-bar"></div>
        </div>
        <div id="fs-metrics">
          <div class="fs-metric">
            <span class="fs-metric-label">Relevance</span>
            <span class="fs-metric-val" id="fs-rel">—</span>
          </div>
          <div class="fs-metric">
            <span class="fs-metric-label">Specificity</span>
            <span class="fs-metric-val" id="fs-spec">—</span>
          </div>
          <div class="fs-metric">
            <span class="fs-metric-label">Depth</span>
            <span class="fs-metric-val" id="fs-len">—</span>
          </div>
          <div class="fs-metric">
            <span class="fs-metric-label">Repetition</span>
            <span class="fs-metric-val" id="fs-rep">—</span>
          </div>
        </div>
        <div id="fs-msg-count">Messages: <span id="fs-count">0</span></div>
        <div id="fs-trajectory"></div>
        <button id="fs-reset-btn">Smart Reset</button>
        <div id="fs-reset-hint">Summarizes context and opens a fresh chat</div>
      </div>
    `;

    document.documentElement.appendChild(meterEl);

    let minimized = false;
    document.getElementById("fs-toggle").addEventListener("click", () => {
      minimized = !minimized;
      document.getElementById("fs-body").style.display       = minimized ? "none" : "block";
      document.getElementById("fs-toggle").textContent       = minimized ? "+" : "−";
      document.getElementById("fs-mini-score").style.display = minimized ? "inline" : "none";
    });

    document.getElementById("fs-reset-btn").addEventListener("click", smartReset);
    makeDraggable(meterEl);
  }

  // ── Update meter UI ───────────────────────────────────────────────────────
  function updateMeter(result) {
    try {
      const score  = result.total;
      const status = FlowStateQuality.getStatus(score);

      const colors = {
        sharp    : { bar: "#00e676", label: "#00e676", text: "Sharp" },
        slipping : { bar: "#ff8800", label: "#ff8800", text: "Slipping" },
        broken   : { bar: "#ff4444", label: "#ff4444", text: "Degraded" }
      };
      const c = colors[status];

      document.getElementById("fs-label").textContent    = c.text;
      document.getElementById("fs-label").style.color    = c.label;
      document.getElementById("fs-score").textContent    = `${score}/10`;
      document.getElementById("fs-score").style.color    = c.label;
      document.getElementById("fs-bar").style.width      = `${score * 10}%`;
      document.getElementById("fs-bar").style.background = c.bar;
      document.getElementById("fs-count").textContent    = messageCount;

      document.getElementById("fs-rel").textContent  = result.rel;
      document.getElementById("fs-spec").textContent = result.spec;
      document.getElementById("fs-len").textContent  = result.len;
      document.getElementById("fs-rep").textContent  = result.rep;

      const miniScore = document.getElementById("fs-mini-score");
      miniScore.textContent = `${score}`;
      miniScore.style.color = c.label;

      const trajEl   = document.getElementById("fs-trajectory");
      const msgsLeft = getTrajectory();
      if (msgsLeft !== null && status === "sharp") {
        trajEl.textContent   = `⚠ ~${msgsLeft} msg${msgsLeft === 1 ? "" : "s"} to warning`;
        trajEl.style.display = "block";
      } else {
        trajEl.style.display = "none";
      }

      if (status !== "sharp") {
        meterEl.classList.add("fs-pulse");
        setTimeout(() => meterEl.classList.remove("fs-pulse"), 1000);
      }

      document.getElementById("fs-reset-btn").style.display  =
        status !== "sharp" ? "block" : "none";
      document.getElementById("fs-reset-hint").style.display =
        status !== "sharp" ? "block" : "none";

    } catch (err) {
      console.warn("[FlowState] Meter update failed:", err);
    }
  }

  function resetMeter() {
    try {
      if (!document.getElementById("fs-meter")) return;

      document.getElementById("fs-label").textContent          = "Waiting...";
      document.getElementById("fs-label").style.color          = "#888";
      document.getElementById("fs-score").textContent          = "—";
      document.getElementById("fs-bar").style.width            = "0%";
      document.getElementById("fs-count").textContent          = "0";
      document.getElementById("fs-trajectory").style.display   = "none";
      document.getElementById("fs-mini-score").textContent     = "";
      ["fs-rel","fs-spec","fs-len","fs-rep"].forEach(id => {
        document.getElementById(id).textContent = "—";
      });
      document.getElementById("fs-reset-btn").style.display  = "none";
      document.getElementById("fs-reset-hint").style.display = "none";
    } catch (err) {
      console.warn("[FlowState] Meter reset failed:", err);
    }
  }

  // ── Smart Reset ───────────────────────────────────────────────────────────
  function smartReset() {
    const responses = getAllResponses();
    const firstUser = getFirstUserMessage();
    if (!responses.length) return;

    const summary = buildSummary(firstUser, responses);
    navigator.clipboard.writeText(summary).then(() => {
      showResetOverlay(summary);
    }).catch(() => {
      showResetOverlay(summary);
      console.warn("[FlowState] Clipboard write failed.");
    });
  }

  function buildSummary(originalTask, responses) {
    const lastThree = responses.slice(-3).join("\n\n---\n\n");
    return `[FlowState Context Reset]

Original task:
${originalTask}

Summary of progress so far:
${lastThree.slice(0, 1500)}

---
Please continue from where we left off, keeping the same context and goals in mind.`;
  }

  function showResetOverlay(summary) {
    const existing = document.getElementById("fs-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "fs-overlay";
    const safePreview = escapeHtml(summary.slice(0, 300));
    overlay.innerHTML = `
      <div id="fs-overlay-box">
        <div id="fs-overlay-title">Context Copied</div>
        <div id="fs-overlay-sub">
          Your conversation context has been summarized and copied to clipboard.
          <br><br>
          Open a new ${escapeHtml(SITE.name)} chat, paste it, and continue where you left off.
          <br><br>
          <strong>Your AI will be sharp again from message 1.</strong>
        </div>
        <div id="fs-overlay-actions">
          <button id="fs-open-new">Open New Chat</button>
          <button id="fs-overlay-close">Close</button>
        </div>
        <div id="fs-overlay-preview">${safePreview}...</div>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    document.getElementById("fs-open-new").addEventListener("click", () => {
      window.open(SITE.newChatUrl, "_blank");
      overlay.remove();
    });
    document.getElementById("fs-overlay-close").addEventListener("click", () => {
      overlay.remove();
    });
  }

  // ── Save to storage ──────────────────────────────────────────────────────
  function saveToStorage(result) {
    if (!hasChromeAPIs()) return;
    try {
      chrome.storage.local.get("fsHistory", (data) => {
        if (chrome.runtime.lastError) return;
        const history = data.fsHistory || [];
        history.push({
          msg   : messageCount,
          score : result.total,
          ts    : Date.now()
        });
        if (history.length > 60) history.shift();
        chrome.storage.local.set({
          fsHistory : history,
          fsLatest  : result,
          fsModel   : SITE.name
        });
      });
    } catch (err) {
      console.warn("[FlowState] Storage write failed:", err);
    }
  }

  // ── Draggable meter ───────────────────────────────────────────────────────
  function makeDraggable(el) {
    let isDragging = false, startX, startY, origX, origY;

    document.getElementById("fs-header").addEventListener("mousedown", (e) => {
      if (e.target.id === "fs-toggle") return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.left   = `${origX + e.clientX - startX}px`;
      el.style.top    = `${origY + e.clientY - startY}px`;
      el.style.right  = "auto";
      el.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => { isDragging = false; });
  }

  // ── Warning toast ─────────────────────────────────────────────────────────
  function showWarning(score) {
    const existing = document.getElementById("fs-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "fs-toast";
    toast.innerHTML = `
      <strong>FlowState Warning</strong><br>
      Quality dropped to ${score}/10 on ${escapeHtml(SITE.name)}. Your AI is starting to lose context.<br>
      Consider a Smart Reset to restore performance.
    `;
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
