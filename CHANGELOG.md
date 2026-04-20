# Changelog

All notable changes to FlowState are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.1.0] — 2026-04-20

### Added
- **Claude.ai support** — FlowState now runs on `claude.ai` with tuned weight profile (repetition-heavy: 35%, to match Claude's degradation pattern) and 5 fallback selectors
- **Selector diagnostics** — on first successful DOM read, logs which selector matched (`[FlowState] ChatGPT response selector active: "..."`); warns in DevTools when all selectors fail with the full tried list — makes UI update breakages immediately diagnosable
- **Popup idle-state launch links** — when not on a supported site, popup shows one-click buttons to open ChatGPT, Gemini, or Claude
- **Popup GitHub + Report Issue footer links**
- **Duplicate overlay guard** — Smart Reset overlay now removes any existing overlay before injecting a new one; same for warning toast

### Fixed
- `currentTabId` undeclared global variable — was silently writing to `window.currentTabId` in strict-mode-adjacent content script context; removed dead code path entirely
- Removed two leftover unused variable declarations (`_diagResponseSel`, `_diagUserSel`) from diagnostic refactor
- `resetMeter()` now checks `getElementById("fs-meter")` exists before accessing children — prevents silent errors on very fast new-chat transitions

### Changed
- Manifest version bumped to `2.1.0`
- Popup version badge updated to `v2.1`
- Extended ChatGPT fallback selectors: added `[data-testid="conversation-turn-assistant"]` and `.markdown.prose`
- Extended Gemini fallback selectors: added `message-content .markdown` and `.model-response-text`

All notable changes to FlowState are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.0.0] — 2025-04-20

### Added
- **TF-IDF Relevance scoring** — cosine similarity against evolving user context; context updates with every new user message (recency-weighted)
- **Code-aware Specificity scoring** — filler and hedge detection runs on prose only, not code blocks; code-heavy responses get a bonus
- **Adaptive Depth scoring** — rolling 3-message baseline replaces fixed first-message baseline; code lines counted as `lines × 5` prose words
- **N-gram Repetition scoring** — bigram + trigram Jaccard similarity against last 6 messages catches paraphrasing, not just exact repeats
- **Per-model weight profiles** — separate tuned weights and thresholds for ChatGPT and Gemini
- **Trajectory prediction** — estimates messages remaining before warning threshold based on 3-message slope
- **Smart Reset** — builds a structured context summary from conversation history, copies to clipboard, opens a new chat
- **Sensitivity slider** — user-adjustable scoring strictness (0.3× to 2.0×) in the popup
- **Confidence gate** — responses under 8 words are not scored (avoids penalizing short acknowledgements)
- **Draggable floating meter** — position it anywhere on screen
- **Minimizable meter** — collapses to header-only with score badge
- **Multi-selector DOM resilience** — tries 4 selectors per site before giving up; survives ChatGPT/Gemini UI updates
- **URL-change detection** — resets state automatically when a new chat is started
- **Manifest v3** — compatible with Chrome, Edge, Brave

### Changed
- Scoring engine rewritten from v1 keyword matching to full TF-IDF + n-gram pipeline
- Popup chart redrawn with gradient fill, threshold grid line, and per-point color coding
- Popup stats row now shows peak quality and total quality drop across the conversation

### Fixed
- ES module compatibility: hooks isolated as CommonJS to prevent failures in ESM environments
- Chrome storage errors no longer surface as uncaught exceptions (all paths have `lastError` guards)
- Clipboard write failure no longer blocks Smart Reset overlay from showing

---

## [1.0.0] — 2025-03-15

Initial release.

- Keyword-based relevance scoring
- Basic filler detection
- Length ratio scoring
- Sentence-overlap repetition detection
- Floating meter on ChatGPT
