/**
 * FlowState — Quality Scoring Engine v2.0
 * Production-grade. Runs entirely in the browser. No API key. No server.
 *
 * Scoring Signals:
 *   Relevance   — TF-IDF cosine similarity against evolving user context
 *   Specificity — code-aware filler/hedge detection on prose only
 *   Depth       — adaptive rolling baseline with code-block bonus
 *   Repetition  — n-gram Jaccard similarity (catches paraphrasing)
 *
 * Each model gets its own weight profile and thresholds.
 */

const FlowStateQuality = (() => {

  // ── Phrase lists ──────────────────────────────────────────────────────────

  const FILLERS = [
    "certainly", "of course", "great question", "absolutely",
    "sure thing", "happy to help", "as i mentioned", "as mentioned",
    "as we discussed", "building on that", "furthermore", "additionally",
    "to summarize", "in conclusion", "let me know if", "feel free to",
    "i hope this helps", "does that make sense", "to recap",
    "as previously", "like i said", "as stated", "needless to say",
    "without further ado", "having said that", "that's a great point",
    "you're absolutely right", "that said", "it's worth noting",
    "it's important to note", "as you know", "as you can see"
  ];

  const HEDGE_PHRASES = [
    "it depends", "generally speaking", "in general", "typically",
    "usually", "might be", "could be", "tend to", "there are many",
    "it's hard to say", "hard to say", "difficult to say",
    "depends on", "in some cases", "in many cases", "more or less",
    "to some extent", "it varies", "not necessarily", "broadly speaking",
    "it really depends", "there's no one-size-fits-all",
    "results may vary", "your mileage may vary"
  ];

  // ── Per-model configuration ───────────────────────────────────────────────

  const MODEL_CONFIG = {
    ChatGPT: {
      weights   : { rel: 0.30, spec: 0.25, len: 0.20, rep: 0.25 },
      thresholds: { sharp: 7.5, slipping: 5.0 }
    },
    Gemini: {
      weights   : { rel: 0.35, spec: 0.25, len: 0.10, rep: 0.30 },
      thresholds: { sharp: 7.0, slipping: 4.5 }
    },
    // Claude has strong context handling early but degrades sharply under
    // heavy repetition — weight rep higher and be strict on specificity.
    Claude: {
      weights   : { rel: 0.30, spec: 0.20, len: 0.15, rep: 0.35 },
      thresholds: { sharp: 7.5, slipping: 5.0 }
    }
  };

  // ── State ─────────────────────────────────────────────────────────────────

  let currentModel       = "ChatGPT";
  let contextTfIdf       = {};    // evolving TF-IDF vector from all user msgs
  let idfCorpus          = {};    // document frequency counts
  let docCount           = 0;     // how many user messages we've seen
  let baselineWordCount  = null;
  let recentLengths      = [];
  let messageHistory     = [];    // stores {prose, bigrams} for repetition
  let userSensitivity    = 1.0;   // 0.5 = lenient, 1.0 = default, 1.5 = strict

  // ── Text utilities ────────────────────────────────────────────────────────

  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  function getStopWords() {
    return new Set([
      "the","a","an","and","or","but","in","on","at","to","for","of",
      "with","by","from","up","about","into","through","i","me","my",
      "we","you","your","it","is","are","was","were","be","been",
      "being","have","has","had","do","does","did","will","would",
      "could","should","may","might","can","this","that","these",
      "those","what","how","when","where","why","who","its","so",
      "if","then","than","no","not","more","also","just","very",
      "all","any","each","every","both","few","most","other","some",
      "such","only","own","same","too","out","over","here","there",
      "again","once","edit","copy","paste","save","regenerate",
      "listen","aloud","stop","share","like","dislike"
    ]);
  }

  function contentWords(text) {
    const stops = getStopWords();
    return tokenize(text).filter(w => w.length > 2 && !stops.has(w));
  }

  // ── Code detection ────────────────────────────────────────────────────────

  function separateCodeAndProse(text) {
    // Split on fenced code blocks (```...```)
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = text.match(codeBlockRegex) || [];
    const prose = text.replace(codeBlockRegex, " __CODE_BLOCK__ ").trim();

    // Also detect inline code patterns and indented code
    const inlineCodeRegex = /`[^`]+`/g;
    const cleanProse = prose.replace(inlineCodeRegex, " ");

    const codeLineCount = codeBlocks.reduce((sum, block) => {
      return sum + block.split("\n").length;
    }, 0);

    return {
      prose: cleanProse,
      codeBlocks,
      codeLineCount,
      hasCode: codeBlocks.length > 0,
      codeRatio: codeLineCount / Math.max(text.split("\n").length, 1)
    };
  }

  // ── TF-IDF ────────────────────────────────────────────────────────────────

  function buildTfVector(words) {
    const tf = {};
    words.forEach(w => { tf[w] = (tf[w] || 0) + 1; });
    // Normalize by document length
    const len = words.length || 1;
    for (const w in tf) tf[w] /= len;
    return tf;
  }

  function updateIdf(words) {
    const seen = new Set(words);
    docCount++;
    seen.forEach(w => { idfCorpus[w] = (idfCorpus[w] || 0) + 1; });
  }

  function getIdf(word) {
    const df = idfCorpus[word] || 0;
    if (df === 0) return 0;
    return Math.log((docCount + 1) / (df + 1)) + 1;
  }

  function tfidfVector(tf) {
    const vec = {};
    for (const w in tf) {
      vec[w] = tf[w] * getIdf(w);
    }
    return vec;
  }

  function cosineSimilarity(vecA, vecB) {
    let dot = 0, magA = 0, magB = 0;
    const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    allKeys.forEach(k => {
      const a = vecA[k] || 0;
      const b = vecB[k] || 0;
      dot  += a * b;
      magA += a * a;
      magB += b * b;
    });
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  // ── N-gram generation ─────────────────────────────────────────────────────

  function getBigrams(words) {
    const bigrams = new Set();
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.add(words[i] + " " + words[i + 1]);
    }
    return bigrams;
  }

  function getTrigrams(words) {
    const trigrams = new Set();
    for (let i = 0; i < words.length - 2; i++) {
      trigrams.add(words[i] + " " + words[i + 1] + " " + words[i + 2]);
    }
    return trigrams;
  }

  function jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 0;
    let intersection = 0;
    setA.forEach(item => { if (setB.has(item)) intersection++; });
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  // ── Scoring functions ─────────────────────────────────────────────────────

  function scoreRelevance(text) {
    // No context yet → assume perfect relevance
    if (Object.keys(contextTfIdf).length === 0) return 10;

    const words = contentWords(text);
    if (words.length < 3) return 10; // Too short to judge

    const responseTf    = buildTfVector(words);
    const responseTfIdf = tfidfVector(responseTf);
    const sim           = cosineSimilarity(contextTfIdf, responseTfIdf);

    // Map cosine similarity [0,1] to score [0,10]
    // sim > 0.15 is usually on-topic for TF-IDF
    // sim > 0.35 is strongly on-topic
    const score = Math.min(10, (sim / 0.30) * 10);
    return Math.round(Math.max(0, score) * 10) / 10;
  }

  function scoreSpecificity(text) {
    const { prose, hasCode, codeRatio } = separateCodeAndProse(text);
    const lower = prose.toLowerCase();
    const words = tokenize(lower);

    if (words.length < 5) return 10; // Too short to judge

    const uniqueRate = new Set(words).size / Math.max(words.length, 1);

    // Count fillers — but only in prose, not code
    let fillerHits = 0;
    FILLERS.forEach(f => { if (lower.includes(f)) fillerHits++; });

    // Hedging detection — context-aware
    let hedgeHits = 0;
    HEDGE_PHRASES.forEach(h => {
      if (lower.includes(h)) {
        // Don't penalize hedging that's followed by specific content
        const idx = lower.indexOf(h);
        const after = lower.slice(idx + h.length, idx + h.length + 80);
        const hasSpecifics = /\d|```|code|function|class|const |let |var |import |def |return /.test(after);
        if (!hasSpecifics) hedgeHits++;
      }
    });

    // Base score from lexical diversity
    const base = Math.min(10, uniqueRate * 12);

    // Scale penalties by sensitivity
    const penalty = Math.min(6,
      (fillerHits * 0.7 + hedgeHits * 0.5) * userSensitivity
    );

    // Bonus for code-heavy responses — code IS specific
    const codeBonus = hasCode ? Math.min(2, codeRatio * 4) : 0;

    return Math.min(10, Math.max(0, Math.round((base - penalty + codeBonus) * 10) / 10));
  }

  function scoreLength(text) {
    const { prose, codeLineCount } = separateCodeAndProse(text);
    const proseWords = tokenize(prose).length;
    // Count code lines as equivalent to prose words (1 line ≈ 5 words of value)
    const effectiveLength = proseWords + (codeLineCount * 5);

    recentLengths.push(effectiveLength);

    // First response sets initial baseline
    if (baselineWordCount === null) {
      baselineWordCount = effectiveLength;
      return 10;
    }

    // Adaptive rolling baseline from last 3 messages
    let baseline;
    if (recentLengths.length >= 4) {
      const prev = recentLengths.slice(-4, -1);
      baseline = prev.reduce((a, b) => a + b, 0) / prev.length;
    } else {
      baseline = baselineWordCount;
    }

    const ratio = effectiveLength / Math.max(baseline, 20);

    // More forgiving curve: ratio 0.6 → score 7, ratio 0.3 → score 4
    const raw = ratio * 10;
    return Math.min(10, Math.max(0, Math.round(raw * 10) / 10));
  }

  function scoreRepetition(text) {
    if (messageHistory.length < 1) return 10;

    // Use tokenize (not contentWords) to keep more signal for n-gram overlap
    const words = tokenize(text.toLowerCase());
    if (words.length < 5) return 10;

    const currentBigrams  = getBigrams(words);
    const currentTrigrams = getTrigrams(words);

    // Compare against each of the last 6 messages
    let maxBigramSim  = 0;
    let avgBigramSim  = 0;
    let maxTrigramSim = 0;
    const recent = messageHistory.slice(-6);

    recent.forEach(prev => {
      const biSim  = jaccardSimilarity(currentBigrams, prev.bigrams);
      const triSim = jaccardSimilarity(currentTrigrams, prev.trigrams);
      maxBigramSim  = Math.max(maxBigramSim, biSim);
      maxTrigramSim = Math.max(maxTrigramSim, triSim);
      avgBigramSim += biSim;
    });

    avgBigramSim /= Math.max(recent.length, 1);

    // Weighted: trigrams are stronger signal of actual repetition
    const repetitionScore = maxTrigramSim * 0.6 + maxBigramSim * 0.3 + avgBigramSim * 0.1;

    // Map: 0 similarity → 10, 0.3+ similarity → 0
    const score = 10 - (repetitionScore / 0.25) * 10;
    return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
  }

  function overallScore(rel, spec, len, rep) {
    const w = (MODEL_CONFIG[currentModel] || MODEL_CONFIG.ChatGPT).weights;
    const raw = rel * w.rel + spec * w.spec + len * w.len + rep * w.rep;
    return Math.min(10, Math.round(raw * 10) / 10);
  }

  // ── Confidence gate ───────────────────────────────────────────────────────
  // Don't score responses that are too short to meaningfully evaluate

  function isScoreable(text) {
    const words = text.split(/\s+/).length;
    return words >= 8;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {

    /**
     * Initialize with the first user message and detected model.
     */
    init(firstUserMessage, model = "ChatGPT") {
      currentModel      = MODEL_CONFIG[model] ? model : "ChatGPT";
      baselineWordCount = null;
      recentLengths     = [];
      messageHistory    = [];
      contextTfIdf      = {};
      idfCorpus         = {};
      docCount          = 0;

      // Seed context with first user message
      this.addUserMessage(firstUserMessage);
    },

    /**
     * Add a user message to the evolving context.
     * Call this for EVERY user message, not just the first.
     */
    addUserMessage(text) {
      const words = contentWords(text);
      if (words.length < 2) return; // Throwaway message like "hey"

      updateIdf(words);
      const tf = buildTfVector(words);

      // Merge into context with recency weighting
      // Newer messages get higher weight (exponential decay)
      const weight = Math.pow(0.85, Math.max(0, docCount - 1));
      for (const w in tf) {
        contextTfIdf[w] = ((contextTfIdf[w] || 0) * weight + tf[w]) / (1 + weight);
      }

      // Recompute TF-IDF with updated IDF
      const updatedContext = {};
      for (const w in contextTfIdf) {
        updatedContext[w] = contextTfIdf[w] * getIdf(w);
      }
      contextTfIdf = updatedContext;
    },

    reset() {
      baselineWordCount = null;
      recentLengths     = [];
      messageHistory    = [];
      contextTfIdf      = {};
      idfCorpus         = {};
      docCount          = 0;
    },

    /**
     * Score an AI response. Returns breakdown + overall.
     */
    score(responseText) {
      // Confidence gate
      if (!isScoreable(responseText)) {
        return {
          total: 10, rel: 10, spec: 10, len: 10, rep: 10,
          wordCount: responseText.split(/\s+/).length,
          gated: true
        };
      }

      const rel   = scoreRelevance(responseText);
      const spec  = scoreSpecificity(responseText);
      const len   = scoreLength(responseText);
      const rep   = scoreRepetition(responseText);
      const total = overallScore(rel, spec, len, rep);

      // Store for repetition comparison (use tokenize to match scoreRepetition)
      const words = tokenize(responseText.toLowerCase());
      messageHistory.push({
        bigrams:  getBigrams(words),
        trigrams: getTrigrams(words)
      });
      if (messageHistory.length > 10) messageHistory.shift();

      return {
        total, rel, spec, len, rep,
        wordCount: responseText.split(/\s+/).length,
        gated: false
      };
    },

    getStatus(score) {
      const t = (MODEL_CONFIG[currentModel] || MODEL_CONFIG.ChatGPT).thresholds;
      if (score >= t.sharp)    return "sharp";
      if (score >= t.slipping) return "slipping";
      return "broken";
    },

    getSlippingThreshold() {
      return (MODEL_CONFIG[currentModel] || MODEL_CONFIG.ChatGPT).thresholds.slipping;
    },

    getModel() { return currentModel; },

    setSensitivity(val) {
      userSensitivity = Math.max(0.3, Math.min(2.0, val));
    },

    getSensitivity() { return userSensitivity; }

  };

})();

// Node.js compatibility for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = FlowStateQuality;
}
