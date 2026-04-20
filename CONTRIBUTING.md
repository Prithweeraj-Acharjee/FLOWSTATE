# Contributing to FlowState

Thanks for taking the time to contribute.

**Small focused change > big rewrite.** If you're planning something large, open an issue first so we can align before you write code.

---

## Getting Started

```bash
git clone https://github.com/Prithweeraj-Acharjee/FlowState.git
cd FlowState/extension
node tests/quality.test.js   # make sure tests pass before you start
```

Load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder

---

## How to Contribute

### Reporting a bug

1. Check [existing issues](https://github.com/Prithweeraj-Acharjee/FlowState/issues) first
2. Open a new issue using the **Bug Report** template
3. Include: browser + version, which AI site, what you expected, what happened

### Suggesting a feature

Open an issue using the **Feature Request** template. Describe the problem you're solving, not just the solution.

### Submitting a PR

1. Fork the repo and create a branch: `git checkout -b fix/selector-update`
2. Make your change
3. Run tests: `node tests/quality.test.js`
4. Open a PR using the template — include a Before/After description

---

## What Makes a Good PR

- **One thing per PR.** A selector fix and a new feature are two PRs.
- **Tests pass.** `node tests/quality.test.js` must exit 0.
- **No new dependencies.** The extension runs with zero npm dependencies by design — everything is vanilla JS.
- **No regressions.** Test on both ChatGPT and Gemini if touching `content.js` or `quality.js`.

---

## Project Structure

```
extension/
  quality.js      — scoring engine (no DOM, no Chrome APIs — pure logic)
  content.js      — DOM injection, MutationObserver, event wiring
  popup.js        — popup rendering + chart
  popup.html      — popup markup + styles
  background.js   — service worker
  styles.css      — floating meter styles
  tests/
    quality.test.js   — unit tests for the scoring engine

detector.py       — runs real GPT conversation and measures quality
simulate.py       — generates realistic data without an API key
visualize.py      — produces the quality-over-time graph
results.json      — committed benchmark data (do not regenerate in CI)
```

**Single source of truth:** `quality.js` owns all scoring logic. `content.js` and `popup.js` call it — they do not duplicate scoring.

---

## Commit Style

```
fix: update ChatGPT assistant selector for new UI
feat: add Claude.ai support
test: add regression for short code response gating
docs: update install steps for Edge
```

---

## License

By contributing, you agree your contributions are licensed under the project's [MIT License](LICENSE).
