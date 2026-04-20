"""
FlowState — Viral Graph Generator
Produces the graph that makes people stop scrolling.
"""

import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from matplotlib.gridspec import GridSpec
import numpy as np

# ── Load Data ─────────────────────────────────────────────────────────────────
with open("results.json") as f:
    data = json.load(f)

messages     = [d["message"]     for d in data]
overall      = [d["overall"]     for d in data]
relevance    = [d["relevance"]   for d in data]
specificity  = [d["specificity"] for d in data]
repetition   = [d["repetition"]  for d in data]
word_count   = [d["word_count"]  for d in data]

# smooth overall line
def smooth(y, w=3):
    return np.convolve(y, np.ones(w)/w, mode='same')

overall_smooth = smooth(overall)

# ── Style ──────────────────────────────────────────────────────────────────────
BG        = "#0d0d0d"
CARD      = "#141414"
RED       = "#ff4444"
ORANGE    = "#ff8800"
YELLOW    = "#ffd700"
GREEN     = "#00e676"
BLUE      = "#448aff"
PURPLE    = "#b388ff"
TEXT      = "#ffffff"
SUBTEXT   = "#888888"
GRID      = "#1f1f1f"

plt.rcParams.update({
    "font.family"       : "monospace",
    "text.color"        : TEXT,
    "axes.labelcolor"   : TEXT,
    "xtick.color"       : SUBTEXT,
    "ytick.color"       : SUBTEXT,
})

# ── Figure ─────────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(14, 10), facecolor=BG)
gs  = GridSpec(3, 2, figure=fig, hspace=0.45, wspace=0.3,
               left=0.07, right=0.97, top=0.88, bottom=0.08)

# ── Main Chart ────────────────────────────────────────────────────────────────
ax_main = fig.add_subplot(gs[0:2, :])
ax_main.set_facecolor(CARD)

# danger zone fill
ax_main.axhspan(0, 4,   alpha=0.08, color=RED)
ax_main.axhspan(4, 6.5, alpha=0.05, color=ORANGE)
ax_main.axhspan(6.5, 10, alpha=0.04, color=GREEN)

# collapse point marker
collapse_msg = next((d["message"] for d in data if d["overall"] < 6), None)
if collapse_msg:
    ax_main.axvline(x=collapse_msg, color=RED, linestyle="--", alpha=0.5, linewidth=1.2)
    ax_main.text(collapse_msg + 0.3, 9.3,
                 f"⚠ Quality collapse\n  starts here (msg {collapse_msg})",
                 color=RED, fontsize=8.5, va="top")

# sub metrics
ax_main.plot(messages, relevance,   color=BLUE,   alpha=0.4, linewidth=1,   linestyle="--", label="Relevance")
ax_main.plot(messages, specificity, color=PURPLE, alpha=0.4, linewidth=1,   linestyle="--", label="Specificity")
ax_main.plot(messages, repetition,  color=ORANGE, alpha=0.4, linewidth=1,   linestyle="--", label="Repetition")

# main overall line
ax_main.fill_between(messages, overall_smooth, alpha=0.12, color=RED)
ax_main.plot(messages, overall_smooth, color=RED, linewidth=2.5, label="Overall Quality", zorder=5)
ax_main.scatter(messages, overall, color=RED, s=18, zorder=6, alpha=0.7)

# quality zones
ax_main.text(38.5, 9.0,  "SHARP",   color=GREEN,  fontsize=7, ha="right", alpha=0.7)
ax_main.text(38.5, 5.2,  "SLIPPING",color=ORANGE, fontsize=7, ha="right", alpha=0.7)
ax_main.text(38.5, 1.8,  "BROKEN",  color=RED,    fontsize=7, ha="right", alpha=0.7)

ax_main.set_xlim(1, len(messages))
ax_main.set_ylim(0, 10.2)
ax_main.set_xlabel("Message Number in Conversation", fontsize=10, labelpad=8)
ax_main.set_ylabel("Quality Score  (0–10)", fontsize=10, labelpad=8)
ax_main.set_title("GPT Response Quality Degrades Over a Single Conversation",
                  fontsize=13, fontweight="bold", color=TEXT, pad=14)
ax_main.grid(True, color=GRID, linewidth=0.6)
ax_main.spines[:].set_visible(False)
ax_main.legend(loc="upper right", framealpha=0.1, fontsize=8.5,
               labelcolor=TEXT, edgecolor=GRID)

# ── Word Count Chart ──────────────────────────────────────────────────────────
ax_wc = fig.add_subplot(gs[2, 0])
ax_wc.set_facecolor(CARD)
ax_wc.bar(messages, word_count, color=BLUE, alpha=0.6, width=0.7)
ax_wc.plot(messages, smooth(word_count, 5), color=YELLOW, linewidth=1.8)
ax_wc.set_title("Response Length Shrinks Over Time", fontsize=10,
                fontweight="bold", color=TEXT, pad=10)
ax_wc.set_xlabel("Message Number", fontsize=8)
ax_wc.set_ylabel("Word Count", fontsize=8)
ax_wc.grid(True, color=GRID, linewidth=0.5)
ax_wc.spines[:].set_visible(False)

# ── Score Summary ─────────────────────────────────────────────────────────────
ax_sum = fig.add_subplot(gs[2, 1])
ax_sum.set_facecolor(CARD)
ax_sum.set_axis_off()

first5_avg  = round(sum(overall[:5])  / 5,  1)
last5_avg   = round(sum(overall[-5:]) / 5,  1)
drop        = round(first5_avg - last5_avg, 1)
drop_pct    = round(drop / first5_avg * 100)

summary_lines = [
    ("First 5 messages avg",  f"{first5_avg}/10",  GREEN),
    ("Last 5 messages avg",   f"{last5_avg}/10",   RED),
    ("Quality drop",          f"−{drop} pts",      RED),
    ("Drop percentage",       f"−{drop_pct}%",     RED),
    ("Collapse starts at",    f"msg {collapse_msg}" if collapse_msg else "N/A", ORANGE),
]

ax_sum.text(0.05, 0.95, "Summary", fontsize=11, fontweight="bold",
            color=TEXT, transform=ax_sum.transAxes, va="top")

for idx, (label, value, color) in enumerate(summary_lines):
    y = 0.80 - idx * 0.155
    ax_sum.text(0.05, y, label, fontsize=9,  color=SUBTEXT, transform=ax_sum.transAxes)
    ax_sum.text(0.95, y, value, fontsize=10, color=color,   transform=ax_sum.transAxes,
                ha="right", fontweight="bold")

# ── Header ────────────────────────────────────────────────────────────────────
fig.text(0.07, 0.965, "FlowState",
         fontsize=17, fontweight="bold", color=TEXT, va="top")
fig.text(0.07, 0.945,
         "Your AI isn't getting dumber. It's forgetting.  |  github.com/Prithweeraj-Acharjee/FlowState",
         fontsize=9, color=SUBTEXT, va="top")

# ── Save ──────────────────────────────────────────────────────────────────────
plt.savefig("flowstate_graph.png", dpi=180, bbox_inches="tight", facecolor=BG)
print("Done. Graph saved -> flowstate_graph.png")
print("This is your viral image. Post it.")
