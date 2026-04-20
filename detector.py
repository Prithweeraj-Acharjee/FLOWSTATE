"""
FlowState — AI Quality Degradation Detector
Measures how GPT and Gemini response quality collapses over a long conversation.
github.com/Prithweeraj-Acharjee
"""

import os
import json
import time
import re
from openai import OpenAI

# ── Config ────────────────────────────────────────────────────────────────────
API_KEY        = os.getenv("OPENAI_API_KEY", "your-api-key-here")
MODEL          = "gpt-4o"
TASK           = "Help me build a secure FastAPI authentication system with JWT tokens."
FOLLOWUP       = "Continue building on what we have so far. What's next?"
TOTAL_MESSAGES = 40          # how many exchanges to run
SAVE_FILE      = "results.json"

client = OpenAI(api_key=API_KEY)

# ── Quality Metrics ───────────────────────────────────────────────────────────

TASK_KEYWORDS = [
    "fastapi", "jwt", "token", "auth", "authentication",
    "secure", "endpoint", "header", "bearer", "password",
    "hash", "login", "user", "route", "middleware"
]

GENERIC_FILLERS = [
    "certainly", "of course", "great question", "absolutely",
    "sure", "happy to help", "let me", "as mentioned",
    "as i said", "as we discussed", "building on", "furthermore",
    "additionally", "in conclusion", "to summarize"
]


def relevance_score(text: str) -> float:
    """How much does the response still relate to the original task?"""
    text_lower = text.lower()
    hits = sum(1 for kw in TASK_KEYWORDS if kw in text_lower)
    return round(hits / len(TASK_KEYWORDS) * 10, 2)


def specificity_score(text: str) -> float:
    """Are answers getting more generic and filler-heavy?"""
    words      = text.lower().split()
    filler_count = sum(1 for f in GENERIC_FILLERS if f in text.lower())
    penalty    = min(filler_count * 0.8, 4)
    base       = min(len(set(words)) / max(len(words), 1) * 14, 10)
    return round(max(base - penalty, 0), 2)


def length_score(text: str, baseline_len: int) -> float:
    """Is response length dropping vs the first answer?"""
    ratio = len(text.split()) / max(baseline_len, 1)
    return round(min(ratio * 10, 10), 2)


def repetition_score(text: str, history: list) -> float:
    """Is it repeating sentences from earlier in the conversation?"""
    if not history:
        return 10.0
    sentences   = re.split(r'[.!?]', text)
    sentences   = [s.strip().lower() for s in sentences if len(s.strip()) > 20]
    past_text   = " ".join(history).lower()
    repeat_hits = sum(1 for s in sentences if s and s in past_text)
    penalty     = min(repeat_hits * 1.5, 6)
    return round(max(10 - penalty, 0), 2)


def overall_score(rel, spec, length, rep) -> float:
    return round((rel * 0.35 + spec * 0.25 + length * 0.2 + rep * 0.2), 2)


# ── Main Loop ─────────────────────────────────────────────────────────────────

def run():
    print(f"\n{'='*60}")
    print(f"  FlowState — Quality Detector")
    print(f"  Model : {MODEL}")
    print(f"  Rounds: {TOTAL_MESSAGES}")
    print(f"{'='*60}\n")

    messages      = [{"role": "user", "content": TASK}]
    history       = []
    baseline_len  = None
    results       = []

    for i in range(1, TOTAL_MESSAGES + 1):
        print(f"Message {i}/{TOTAL_MESSAGES} ...", end=" ", flush=True)

        try:
            response = client.chat.completions.create(
                model    = MODEL,
                messages = messages,
            )
            reply = response.choices[0].message.content
        except Exception as e:
            print(f"ERROR: {e}")
            break

        # baseline length from first response
        if baseline_len is None:
            baseline_len = len(reply.split())

        # score it
        rel    = relevance_score(reply)
        spec   = specificity_score(reply)
        leng   = length_score(reply, baseline_len)
        rep    = repetition_score(reply, history)
        total  = overall_score(rel, spec, leng, rep)

        results.append({
            "message"     : i,
            "relevance"   : rel,
            "specificity" : spec,
            "length"      : leng,
            "repetition"  : rep,
            "overall"     : total,
            "word_count"  : len(reply.split()),
        })

        print(f"Quality: {total}/10  (rel={rel} spec={spec} len={leng} rep={rep})")

        # add to conversation
        messages.append({"role": "assistant", "content": reply})
        messages.append({"role": "user",      "content": FOLLOWUP})
        history.append(reply[:500])

        time.sleep(0.5)

    # save results
    with open(SAVE_FILE, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n✓ Results saved to {SAVE_FILE}")
    print("  Run visualize.py to generate the graph.\n")


if __name__ == "__main__":
    run()
