/**
 * FlowState — Unit Tests for Quality Scoring Engine v2.0
 * Run with: node tests/quality.test.js
 *
 * These tests validate the scoring engine against known scenarios
 * to prevent false positives and false negatives.
 */

// ── Minimal test harness (no dependencies) ─────────────────────────────────

let passed = 0, failed = 0;

function assert(condition, name) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function assertRange(value, min, max, name) {
  assert(value >= min && value <= max, `${name} → ${value} (expected ${min}-${max})`);
}

function suite(name, fn) {
  console.log(`\n── ${name} ──`);
  fn();
}

// ── Load the engine ─────────────────────────────────────────────────────────

const path = require("path");
const FlowStateQuality = require(path.join(__dirname, "..", "quality.js"));

// ── Test data ───────────────────────────────────────────────────────────────

const CODING_PROMPT = "Help me build a REST API using Express.js with authentication and PostgreSQL";

const SHARP_RESPONSE = `Here's how to set up your Express.js REST API with authentication and PostgreSQL:

\`\`\`javascript
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (!user.rows[0]) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET);
  res.json({ token });
});
\`\`\`

This sets up the core authentication endpoint. The PostgreSQL pool handles connection management automatically.`;

const FILLER_RESPONSE = `Certainly! That's a great question. I'd be happy to help you with that.
Building a REST API is a wonderful endeavor. There are many approaches you could take,
and various considerations to keep in mind. Let me know if you need any further assistance.
I hope this helps! Feel free to ask if you have any other questions.
As I mentioned, there are several factors to consider.`;

const HEDGING_RESPONSE = `It depends on your specific use case. Generally speaking, there are many ways
to approach this. Typically, developers might use Express.js, but it could be
that another framework suits your needs better. In some cases, you might want
to consider alternatives. It's hard to say without more context. More or less,
the approach would depend on various factors.`;

const DEGRADED_RESPONSE = `Sure! As I mentioned earlier, the approach would involve setting up the server.
As we discussed, you'd want to think about various aspects of the architecture.
To recap what I said before, the solution involves several key elements.
As previously stated, the method would depend on various factors and considerations.`;

const SHORT_CODE_RESPONSE = `Here's the fix:

\`\`\`javascript
app.use(cors({ origin: process.env.CLIENT_URL }));
\`\`\``;

// ── Tests ───────────────────────────────────────────────────────────────────

suite("Initialization", () => {
  FlowStateQuality.init(CODING_PROMPT, "ChatGPT");
  assert(FlowStateQuality.getModel() === "ChatGPT", "Model set to ChatGPT");
  assert(FlowStateQuality.getStatus(8.0) === "sharp", "8.0 is sharp");
  assert(FlowStateQuality.getStatus(6.0) === "slipping", "6.0 is slipping");
  assert(FlowStateQuality.getStatus(3.0) === "broken", "3.0 is broken");
});

suite("Gemini Thresholds", () => {
  FlowStateQuality.init(CODING_PROMPT, "Gemini");
  assert(FlowStateQuality.getStatus(7.5) === "sharp", "7.5 is sharp on Gemini");
  assert(FlowStateQuality.getStatus(6.5) === "slipping", "6.5 is slipping on Gemini");
  assert(FlowStateQuality.getStatus(4.0) === "broken", "4.0 is broken on Gemini");
  FlowStateQuality.init(CODING_PROMPT, "ChatGPT"); // reset
});

suite("Sharp Response Scores High", () => {
  FlowStateQuality.init(CODING_PROMPT, "ChatGPT");
  const result = FlowStateQuality.score(SHARP_RESPONSE);
  assertRange(result.total, 7.0, 10, "Total score");
  assertRange(result.spec, 6.0, 10, "Specificity not penalized for code");
  assertRange(result.len, 7.0, 10, "Length is adequate");
  assert(!result.gated, "Not gated");
});

suite("Filler-Heavy Response Scores Low on Specificity", () => {
  FlowStateQuality.init(CODING_PROMPT, "ChatGPT");
  FlowStateQuality.score(SHARP_RESPONSE); // set baseline
  const result = FlowStateQuality.score(FILLER_RESPONSE);
  assertRange(result.spec, 0, 6.0, "Specificity penalized for fillers");
});

suite("Hedging Response Gets Penalized", () => {
  FlowStateQuality.init(CODING_PROMPT, "ChatGPT");
  FlowStateQuality.score(SHARP_RESPONSE); // baseline
  const result = FlowStateQuality.score(HEDGING_RESPONSE);
  assertRange(result.spec, 0, 7.0, "Specificity penalized for hedging");
});

suite("Degraded/Repetitive Response Scores Low", () => {
  FlowStateQuality.init(CODING_PROMPT, "ChatGPT");
  FlowStateQuality.score(SHARP_RESPONSE);   // msg 1
  FlowStateQuality.score(SHARP_RESPONSE);   // msg 2 — exact copy stored
  // msg 3 — exact same response again, should detect heavy repetition
  const result = FlowStateQuality.score(SHARP_RESPONSE);
  assertRange(result.rep, 0, 5.0, "Repetition detected on exact repeat");
});

suite("Short Code Response Not Penalized (Confidence Gate)", () => {
  FlowStateQuality.init(CODING_PROMPT, "ChatGPT");
  const result = FlowStateQuality.score(SHORT_CODE_RESPONSE);
  // Should either be gated (score 10) or score reasonably
  assert(result.total >= 7.0 || result.gated, "Short code not unfairly penalized");
});

suite("Empty/Tiny Prompt Doesn't Crash", () => {
  FlowStateQuality.init("hey", "ChatGPT");
  const result = FlowStateQuality.score("Hello! How can I help you today?");
  assert(typeof result.total === "number", "Returns numeric score");
  assertRange(result.total, 5.0, 10, "Doesn't tank score on vague prompt");
});

suite("Evolving Context", () => {
  FlowStateQuality.init("Help me with my project", "ChatGPT");
  FlowStateQuality.addUserMessage("I'm building a React dashboard with charts");
  FlowStateQuality.addUserMessage("Add a bar chart component using recharts");

  const onTopic = FlowStateQuality.score(
    "Here's your bar chart component using recharts with customizable colors and responsive layout."
  );
  assertRange(onTopic.rel, 5.0, 10, "On-topic response after context evolution");
});

suite("Reset Clears Everything", () => {
  FlowStateQuality.init(CODING_PROMPT, "ChatGPT");
  FlowStateQuality.score(SHARP_RESPONSE);
  FlowStateQuality.score(SHARP_RESPONSE);
  FlowStateQuality.reset();

  // After reset, scoring should work fresh
  FlowStateQuality.init("Write a Python script", "Gemini");
  const result = FlowStateQuality.score(
    "Here's a Python script that processes CSV files using pandas."
  );
  assert(typeof result.total === "number", "Scoring works after reset");
  assert(FlowStateQuality.getModel() === "Gemini", "Model updated after reset");
});

suite("Sensitivity Adjustment", () => {
  FlowStateQuality.setSensitivity(0.5);
  assert(FlowStateQuality.getSensitivity() === 0.5, "Sensitivity set to 0.5");
  FlowStateQuality.setSensitivity(1.0); // reset

  FlowStateQuality.setSensitivity(0.1);
  assert(FlowStateQuality.getSensitivity() === 0.3, "Clamped to minimum 0.3");

  FlowStateQuality.setSensitivity(5.0);
  assert(FlowStateQuality.getSensitivity() === 2.0, "Clamped to maximum 2.0");

  FlowStateQuality.setSensitivity(1.0); // reset
});

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
